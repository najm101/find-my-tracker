from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.core.clock import Clock, to_datetime
from find_my_tracker.core.crypto import SecretBox
from find_my_tracker.core.errors import NotFound
from find_my_tracker.features.beacons.models import Beacon
from find_my_tracker.features.beacons.repository import BeaconRepository
from find_my_tracker.features.beacons.schemas import (
    Battery,
    BeaconOut,
    BeaconUpdate,
    LatestLocation,
)
from find_my_tracker.features.locations.service import LocationService
from find_my_tracker.integrations.apple.types import AccessoryInfo, BeaconKind

# Distinct on light and dark maps; assigned in import order, then cycled.
PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#db2777", "#65a30d"]
_BATTERY_KINDS = {BeaconKind.AIRTAG, BeaconKind.OTHER}


class BeaconService:
    def __init__(self, session: AsyncSession, secrets: SecretBox, clock: Clock) -> None:
        self._session = session
        self._repo = BeaconRepository(session)
        self._locations = LocationService(session)
        self._secrets = secrets
        self._clock = clock

    async def list(self) -> list[BeaconOut]:
        beacons = await self._repo.list()
        ids = [b.id for b in beacons]
        latest = await self._locations.latest_by_beacon(ids)
        counts = await self._locations.count_by_beacon(ids)
        return [self._to_out(b, latest.get(b.id), counts.get(b.id, 0)) for b in beacons]

    async def update(self, beacon_id: int, patch: BeaconUpdate) -> BeaconOut:
        beacon = await self._get(beacon_id)
        changes = patch.model_dump(exclude_unset=True)
        if "enabled" in changes:
            beacon.enabled = bool(changes.pop("enabled"))
        for field, value in changes.items():  # empty string clears an override
            setattr(beacon, field, value or None)
        beacon.updated_at = self._clock.timestamp()
        await self._session.commit()
        latest = (await self._locations.latest_by_beacon([beacon.id])).get(beacon.id)
        count = (await self._locations.count_by_beacon([beacon.id])).get(beacon.id, 0)
        return self._to_out(beacon, latest, count)

    async def delete(self, beacon_id: int) -> None:
        await self._repo.delete(await self._get(beacon_id))
        await self._session.commit()

    async def delete_all(self) -> None:
        """Every beacon and all of its history. Does not commit."""
        await self._repo.delete_all()

    async def import_from_apple(self, account_id: int, accessories: Sequence[AccessoryInfo]) -> int:
        """Insert new beacons and refresh existing ones (keys, Apple name). Does not commit."""
        now = self._clock.timestamp()
        existing = await self._repo.by_identifier()
        for i, acc in enumerate(accessories):
            blob = self._secrets.seal(json.dumps(acc.key_material).encode())
            paired = int(acc.paired_at.timestamp()) if acc.paired_at else None
            name = acc.name or acc.model or "Unnamed beacon"
            beacon = existing.get(acc.identifier)
            if beacon is None:
                self._repo.add(
                    Beacon(
                        apple_account_id=account_id,
                        apple_identifier=acc.identifier,
                        name=name,
                        kind=acc.kind.value,
                        model=acc.model or None,
                        color=PALETTE[(len(existing) + i) % len(PALETTE)],
                        key_blob=blob,
                        paired_at=paired,
                        enabled=True,
                        created_at=now,
                        updated_at=now,
                    )
                )
            else:
                beacon.apple_account_id = account_id
                beacon.name = name
                beacon.kind = acc.kind.value
                beacon.model = acc.model or None
                beacon.key_blob = blob
                beacon.enabled = True
                beacon.updated_at = now
        return len(accessories)

    async def names(self) -> dict[int, str]:
        return {b.id: b.display_name or b.name for b in await self._repo.list()}

    async def tracked_identifiers(self) -> set[str]:
        return set(await self._repo.by_identifier())

    async def enabled_with_keys(self) -> list[tuple[Beacon, dict[str, Any]]]:
        return [
            (b, json.loads(self._secrets.open(b.key_blob)))
            for b in await self._repo.list(enabled_only=True)
        ]

    def store_keys(self, beacon: Beacon, key_material: dict[str, Any]) -> None:
        beacon.key_blob = self._secrets.seal(json.dumps(key_material).encode())

    async def _get(self, beacon_id: int) -> Beacon:
        beacon = await self._repo.get(beacon_id)
        if beacon is None:
            msg = "Beacon not found."
            raise NotFound(msg)
        return beacon

    @staticmethod
    def _to_out(beacon: Beacon, latest: Any, count: int) -> BeaconOut:
        kind = BeaconKind(beacon.kind)
        return BeaconOut(
            id=beacon.id,
            name=beacon.display_name or beacon.name,
            apple_name=beacon.name,
            kind=kind,
            model=beacon.model,
            emoji=beacon.emoji,
            color=beacon.color,
            enabled=beacon.enabled,
            paired_at=to_datetime(beacon.paired_at),
            location_count=count,
            latest=LatestLocation(
                observed_at=to_datetime(latest.observed_at),  # pyright: ignore[reportArgumentType]
                latitude=latest.latitude,
                longitude=latest.longitude,
                accuracy_m=latest.accuracy_m,
            )
            if latest
            else None,
            battery=Battery.from_status(latest.status_byte)
            if latest and kind in _BATTERY_KINDS
            else None,
        )
