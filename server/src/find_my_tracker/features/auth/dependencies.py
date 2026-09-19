from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from find_my_tracker.core.deps import ContainerDep
from find_my_tracker.core.errors import NotAuthenticated
from find_my_tracker.features.auth.service import SESSION_COOKIE


def require_admin(request: Request, container: ContainerDep) -> None:
    if not container.auth.verify_token(request.cookies.get(SESSION_COOKIE)):
        msg = "Log in to continue."
        raise NotAuthenticated(msg)


AdminDep = Annotated[None, Depends(require_admin)]
