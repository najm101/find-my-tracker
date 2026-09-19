"""One poll: fetch reports for every enabled beacon and store what's new."""

from __future__ import annotations

import logging

from find_my_tracker.core.clock import Clock, to_datetime
from find_my_tracker.core.crypto import SecretBox
from find_my_tracker.core.database import Database
from find_my_tracker.features.apple_account.schemas import AccountStatus
from find_my_tracker.features.apple_account.service import AppleAccountService
from find_my_tracker.features.beacons.service import BeaconService
from find_my_tracker.features.locations.service import LocationService
from find_my_tracker.features.tracking.models import PollRun
from find_my_tracker.features.tracking.repository import PollRunRepository
from find_my_tracker.features.tracking.schemas import PollOutcome, PollRunOut, PollTrigger
from find_my_tracker.integrations.apple.types import (
    AppleAuthExpired,
    AppleClient,
    AppleClientFactory,
    AppleError,
)

logger = logging.getLogger(__name__)


class PollService:
    def __init__(
        self, db: Database, apple: AppleClientFactory, secrets: SecretBox, clock: Clock
    ) -> None:
        self._db = db
        self._apple = apple
        self._secrets = secrets
        self._clock = clock

    async def run(self, trigger: PollTrigger) -> PollRun | None:
        """Poll once. Returns None when there is nothing to poll (no account, no beacons)."""
        async with self._db.session() as session:
            accounts = AppleAccountService(session, self._secrets, self._clock)
            beacons = BeaconService(session, self._secrets, self._clock)
            locations = LocationService(session)
            runs = PollRunRepository(session)

            active = await accounts.active_session()
            if active is None:
                return None
            account, stored_session = active
            targets = await beacons.enabled_with_keys()
            if not targets:
                return None

            run = await runs.start(trigger, self._clock.timestamp())
            run.beacons_polled = len(targets)
            await session.commit()
            logger.info("Poll %d (%s): %d beacon(s)", run.id, trigger, len(targets))

            client: AppleClient | None = None
            try:
                client = self._apple.restore(stored_session)
                result = await client.fetch_history(
                    {b.apple_identifier: keys for b, keys in targets}
                )
                fetched_at = self._clock.timestamp()
                for beacon, _ in targets:
                    reports = result.reports.get(beacon.apple_identifier, [])
                    run.reports_seen += len(reports)
                    run.new_locations += await locations.record(
                        beacon.id, reports, poll_run_id=run.id, fetched_at=fetched_at
                    )
                    updated = result.updated_key_material.get(beacon.apple_identifier)
                    if updated:
                        beacons.store_keys(beacon, updated)
                accounts.store_session(account, client.export_session())
                accounts.mark(account, AccountStatus.ACTIVE, None)
                run.outcome = PollOutcome.OK
            except AppleAuthExpired as e:
                logger.warning("Poll %d: Apple session expired", run.id)
                accounts.mark(account, AccountStatus.NEEDS_REAUTH, e.message)
                run.outcome, run.error = PollOutcome.AUTH_FAILED, e.message
            except AppleError as e:
                logger.warning("Poll %d: %s", run.id, e.message)
                accounts.mark(account, AccountStatus.ACTIVE, e.message)
                run.outcome, run.error = PollOutcome.APPLE_ERROR, e.message
            except Exception as e:
                logger.exception("Poll %d failed", run.id)
                await session.rollback()  # drop partial inserts; `run` was committed above
                run.outcome, run.error = PollOutcome.ERROR, f"{type(e).__name__}: {e}"
            finally:
                if client is not None:
                    try:
                        await client.close()
                    except Exception:
                        logger.exception("Closing the Apple client failed")

            run.finished_at = self._clock.timestamp()
            await session.commit()
            logger.info(
                "Poll %d: %s, %d report(s), %d new",
                run.id,
                run.outcome,
                run.reports_seen,
                run.new_locations,
            )
            return run

    async def latest(self) -> PollRun | None:
        async with self._db.session() as session:
            return await PollRunRepository(session).latest()

    async def recent(self, limit: int) -> list[PollRunOut]:
        async with self._db.session() as session:
            return [to_out(r) for r in await PollRunRepository(session).recent(limit)]


def to_out(run: PollRun) -> PollRunOut:
    return PollRunOut(
        id=run.id,
        trigger=PollTrigger(run.trigger),
        started_at=to_datetime(run.started_at),  # pyright: ignore[reportArgumentType]
        finished_at=to_datetime(run.finished_at),
        outcome=PollOutcome(run.outcome) if run.outcome else None,
        beacons_polled=run.beacons_polled,
        reports_seen=run.reports_seen,
        new_locations=run.new_locations,
        error=run.error,
    )
