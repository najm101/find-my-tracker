"""Background clean-up: history past the retention period is deleted hourly, and on request."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Awaitable, Callable

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 60 * 60
STARTUP_DELAY_SECONDS = 60


class RetentionJob:
    def __init__(
        self,
        *,
        interval: float = INTERVAL_SECONDS,
        startup_delay: float = STARTUP_DELAY_SECONDS,
    ) -> None:
        self._interval = interval
        self._startup_delay = startup_delay
        self._wake = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self.running = False
        #: One clean-up in its own session. Set once the container exists (it needs it).
        self.clean: Callable[[], Awaitable[object]] | None = None

    def start(self) -> None:
        self._wake = asyncio.Event()  # the running loop's: an app can be started more than once
        self._task = asyncio.create_task(self._loop(), name="retention")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    def run_soon(self) -> None:
        """Clean up now, e.g. right after the period was shortened."""
        self._wake.set()

    async def _loop(self) -> None:
        await self._sleep(self._startup_delay)
        while True:
            await self._run()
            await self._sleep(self._interval)

    async def _sleep(self, seconds: float) -> None:
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(self._wake.wait(), timeout=seconds)
        self._wake.clear()

    async def _run(self) -> None:
        if self.clean is None:
            return
        self.running = True
        try:
            await self.clean()
        except Exception:
            logger.exception("Deleting old history failed; trying again later")
        finally:
            self.running = False
