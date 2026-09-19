"""FastAPI dependencies shared by every feature router."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated, cast

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.core.container import Container


def get_container(request: Request) -> Container:
    return cast("Container", request.app.state.container)


ContainerDep = Annotated[Container, Depends(get_container)]


async def get_session(container: ContainerDep) -> AsyncIterator[AsyncSession]:
    async with container.db.session() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]
