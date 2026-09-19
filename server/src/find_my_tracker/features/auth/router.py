from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from find_my_tracker.core.deps import ContainerDep
from find_my_tracker.core.errors import NotAuthenticated, TooManyRequests
from find_my_tracker.features.auth.dependencies import AdminDep
from find_my_tracker.features.auth.schemas import LoginRequest, MeResponse
from find_my_tracker.features.auth.service import SESSION_COOKIE, SESSION_MAX_AGE

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", status_code=status.HTTP_204_NO_CONTENT)
async def login(
    body: LoginRequest, request: Request, response: Response, container: ContainerDep
) -> None:
    client = request.client.host if request.client else "unknown"
    wait = container.login_limiter.retry_after(client)
    if wait:
        msg = f"Too many failed attempts. Try again in {wait // 60 + 1} min."
        raise TooManyRequests(msg)
    if not container.auth.check_password(body.password):
        container.login_limiter.record_failure(client)
        msg = "Wrong password."
        raise NotAuthenticated(msg, code="wrong_password")

    container.login_limiter.reset(client)
    response.set_cookie(
        SESSION_COOKIE,
        container.auth.issue_token(),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
        path="/",
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me")
async def me(_: AdminDep) -> MeResponse:
    return MeResponse(authenticated=True)
