from __future__ import annotations

from fastapi import APIRouter, status

from find_my_tracker.core.deps import ContainerDep, SessionDep
from find_my_tracker.features.auth.dependencies import AdminDep
from find_my_tracker.features.beacons.schemas import BeaconOut, BeaconUpdate
from find_my_tracker.features.beacons.service import BeaconService

router = APIRouter(prefix="/beacons", tags=["beacons"])


def _service(session: SessionDep, container: ContainerDep) -> BeaconService:
    return BeaconService(session, container.secrets, container.clock)


@router.get("")
async def list_beacons(
    _: AdminDep, session: SessionDep, container: ContainerDep
) -> list[BeaconOut]:
    return await _service(session, container).list()


@router.patch("/{beacon_id}")
async def update_beacon(
    beacon_id: int, body: BeaconUpdate, _: AdminDep, session: SessionDep, container: ContainerDep
) -> BeaconOut:
    return await _service(session, container).update(beacon_id, body)


@router.delete("/{beacon_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_beacon(
    beacon_id: int, _: AdminDep, session: SessionDep, container: ContainerDep
) -> None:
    await _service(session, container).delete(beacon_id)
