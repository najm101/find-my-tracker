"""
Background scheduler: polls every `poll_interval_minutes`, or sooner when asked.

Runs as one asyncio task in the web process. A failed poll is recorded and retried at the next
interval; an exception here never reaches request handlers, and theirs never reach here.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import datetime

from find_my_tracker.core.clock import Clock, to_datetime
from find_my_tracker.core.database import Database
from find_my_tracker.core.errors import Conflict, TooManyRequests
from find_my_tracker.features.settings.service import SettingsService
from find_my_tracker.features.tracking.schemas import PollTrigger
from find_my_tracker.features.tracking.service import PollService

logger = logging.getLogger(__name__)

MANUAL_COOLDOWN_SECONDS = 60  # stops double-clicks from hammering Apple
IDLE_RECHECK_SECONDS = 60
STARTUP_DELAY_SECONDS = 5


class Poller:
    def __init__(
        self,
        service: PollService,
        db: Database,
        clock: Clock,
        *,
        manual_cooldown: int = MANUAL_COOLDOWN_SECONDS,
        startup_delay: float = STARTUP_DELAY_SECONDS,
    ) -> None:
        self._service = service
        self._db = db
        self._clock = clock
        self._cooldown = manual_cooldown
        self._startup_delay = startup_delay
        self._wake = asyncio.Event()
        self._forced: PollTrigger | None = None
        self._not_before = 0
        self._task: asyncio.Task[None] | None = None
        self.running = False
        self.next_run_at: datetime | None = None

    @property
    def service(self) -> PollService:
        return self._service

    # ---- lifecycle ----

    def start(self) -> None:
        self._task = asyncio.create_task(self._loop(), name="poller")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    # ---- commands ----

    def poll_soon(self, trigger: PollTrigger = PollTrigger.MANUAL) -> None:
        """Poll as soon as possible, bypassing the interval (e.g. right after sign-in)."""
        self._forced = trigger
        self._not_before = 0
        self._wake.set()

    def reschedule(self) -> None:
        """Recompute the next run (settings changed)."""
        self._not_before = 0
        self._wake.set()

    async def refresh(self) -> None:
        """User-requested poll, rate-limited to protect the Apple account."""
        if self.running:
            msg = "A poll is already running."
            raise Conflict(msg, code="poll_running")
        available = await self.refresh_available_at()
        if available and available > self._clock.now():
            wait = int((available - self._clock.now()).total_seconds()) // 60 + 1
            msg = f"Polled recently. You can refresh again in {wait} min."
            raise TooManyRequests(msg)
        self.poll_soon(PollTrigger.MANUAL)

    async def refresh_available_at(self) -> datetime | None:
        last = await self._service.latest()
        return to_datetime(last.started_at + self._cooldown) if last else None

    # ---- loop ----

    async def _loop(self) -> None:
        await asyncio.sleep(self._startup_delay)
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Poller tick failed; retrying shortly")
                await asyncio.sleep(IDLE_RECHECK_SECONDS)

    async def _tick(self) -> None:
        delay = 0.0 if self._forced else await self._seconds_until_due()
        if delay > 0:
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=delay)
            self._wake.clear()
            if not self._forced and await self._seconds_until_due() > 0:
                return

        trigger, self._forced = self._forced or PollTrigger.SCHEDULE, None
        self.running = True
        try:
            run = await self._service.run(trigger)
        finally:
            self.running = False
        if run is None:  # nothing to poll yet; don't spin
            self._not_before = self._clock.timestamp() + IDLE_RECHECK_SECONDS

    async def _seconds_until_due(self) -> float:
        async with self._db.session() as session:
            interval = (await SettingsService(session).get()).poll_interval_minutes * 60
        last = await self._service.latest()
        due = max((last.started_at + interval) if last else 0, self._not_before)
        now = self._clock.timestamp()
        self.next_run_at = to_datetime(max(due, now))
        return max(0.0, float(due - now))
