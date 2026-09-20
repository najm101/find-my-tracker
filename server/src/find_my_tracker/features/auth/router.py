from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from find_my_tracker.core.config import Settings
from find_my_tracker.core.deps import ContainerDep, SessionDep
from find_my_tracker.core.errors import NotAuthenticated, TooManyRequests
from find_my_tracker.features.auth.dependencies import AdminDep
from find_my_tracker.features.auth.schemas import (
    LoginRequest,
    LoginResponse,
    MeResponse,
    MfaRequest,
    PasswordChange,
    PasswordConfirm,
    RecoveryCodes,
    SecurityStatus,
    TotpSetup,
)
from find_my_tracker.features.auth.service import (
    MFA_COOKIE,
    MFA_TICKET_MAX_AGE,
    SESSION_COOKIE,
    SESSION_MAX_AGE,
    AuthService,
    ClientInfo,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _service(session: SessionDep, container: ContainerDep) -> AuthService:
    return AuthService(session, container.auth, container.clock)


def _client(request: Request) -> ClientInfo:
    """The caller's address. Correct only when `TRUSTED_PROXIES` names your reverse proxy."""
    return ClientInfo(
        ip=request.client.host if request.client else "unknown",
        user_agent=request.headers.get("user-agent"),
    )


def _secure(request: Request, settings: Settings) -> bool:
    return settings.force_https or request.url.scheme == "https"


def _set_cookie(
    response: Response, request: Request, settings: Settings, name: str, value: str, max_age: int
) -> None:
    response.set_cookie(
        name,
        value,
        max_age=max_age,
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=_secure(request, settings),
        path="/",
    )


async def _guard_rate_limit(
    request: Request, container: ContainerDep, service: AuthService
) -> ClientInfo:
    client = _client(request)
    wait = container.login_limiter.retry_after(client.ip)
    if wait:
        await service.record_rate_limited(client)
        msg = f"Too many failed attempts. Try again in {wait // 60 + 1} min."
        raise TooManyRequests(msg)
    return client


@router.post("/login")
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    container: ContainerDep,
) -> LoginResponse:
    """Step one. With two-factor on, this only issues a short-lived ticket for `/auth/mfa`."""
    service = _service(session, container)
    client = await _guard_rate_limit(request, container, service)
    settings = container.settings
    try:
        mfa_required = await service.begin_login(body.password, client)
    except NotAuthenticated:
        container.login_limiter.record_failure(client.ip)
        raise

    if mfa_required:
        _set_cookie(
            response,
            request,
            settings,
            MFA_COOKIE,
            container.auth.issue_ticket(),
            MFA_TICKET_MAX_AGE,
        )
        return LoginResponse(mfa_required=True)

    container.login_limiter.reset(client.ip)
    _set_cookie(
        response, request, settings, SESSION_COOKIE, container.auth.issue_session(), SESSION_MAX_AGE
    )
    return LoginResponse(mfa_required=False)


@router.post("/mfa", status_code=status.HTTP_204_NO_CONTENT)
async def submit_mfa(
    body: MfaRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    container: ContainerDep,
) -> None:
    """Step two: a six-digit authenticator code, or one recovery code."""
    service = _service(session, container)
    client = await _guard_rate_limit(request, container, service)
    if not container.auth.verify_ticket(request.cookies.get(MFA_COOKIE)):
        msg = "That took too long. Enter your password again."
        raise NotAuthenticated(msg, code="mfa_expired")
    try:
        await service.complete_mfa(body.code, client)
    except NotAuthenticated:
        container.login_limiter.record_failure(client.ip)
        raise

    container.login_limiter.reset(client.ip)
    response.delete_cookie(MFA_COOKIE, path="/")
    _set_cookie(
        response,
        request,
        container.settings,
        SESSION_COOKIE,
        container.auth.issue_session(),
        SESSION_MAX_AGE,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(MFA_COOKIE, path="/")


@router.get("/me")
async def me(_: AdminDep) -> MeResponse:
    return MeResponse(authenticated=True)


# ---- managing the account ----


@router.get("/security")
async def security(_: AdminDep, session: SessionDep, container: ContainerDep) -> SecurityStatus:
    return await _service(session, container).status()


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: PasswordChange,
    request: Request,
    response: Response,
    _: AdminDep,
    session: SessionDep,
    container: ContainerDep,
) -> None:
    """Changing the password signs every other browser out. This one stays signed in."""
    await _service(session, container).change_password(body.current_password, body.new_password)
    _set_cookie(
        response,
        request,
        container.settings,
        SESSION_COOKIE,
        container.auth.issue_session(),
        SESSION_MAX_AGE,
    )


@router.post("/sessions/revoke", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_sessions(
    response: Response, _: AdminDep, session: SessionDep, container: ContainerDep
) -> None:
    """Log out everywhere, including here."""
    await _service(session, container).revoke_sessions()
    response.delete_cookie(SESSION_COOKIE, path="/")


# ---- second factor ----


@router.post("/totp/setup")
async def start_totp(_: AdminDep, session: SessionDep, container: ContainerDep) -> TotpSetup:
    """Mint a secret to scan. It does nothing until `/auth/totp/confirm` proves it arrived."""
    return await _service(session, container).start_totp()


@router.post("/totp/confirm")
async def confirm_totp(
    body: MfaRequest, _: AdminDep, session: SessionDep, container: ContainerDep
) -> RecoveryCodes:
    return await _service(session, container).confirm_totp(body.code)


@router.post("/totp/disable", status_code=status.HTTP_204_NO_CONTENT)
async def disable_totp(
    body: PasswordConfirm, _: AdminDep, session: SessionDep, container: ContainerDep
) -> None:
    await _service(session, container).disable_totp(body.password)


@router.post("/recovery-codes")
async def regenerate_recovery_codes(
    body: PasswordConfirm, _: AdminDep, session: SessionDep, container: ContainerDep
) -> RecoveryCodes:
    """Replace every unused recovery code with a fresh set."""
    return await _service(session, container).regenerate_recovery_codes(body.password)
