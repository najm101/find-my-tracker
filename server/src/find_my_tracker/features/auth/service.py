"""Single-admin authentication: argon2 password, optional TOTP, signed session cookie.

The password and the second factor live in the database, not in the environment, so both can
be changed without a restart. Session cookies carry the credential's `session_epoch`; bumping
it invalidates every cookie ever issued, which is how "log out everywhere" works without
touching `SECRET_KEY` (that would make the stored Apple credentials unreadable).
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.core.clock import Clock, to_datetime
from find_my_tracker.core.crypto import (
    RECOVERY_PURPOSE,
    SESSION_PURPOSE,
    SecretBox,
    derive_key,
    keyed_digest,
)
from find_my_tracker.core.errors import Conflict, DomainError, NotAuthenticated
from find_my_tracker.features.auth import totp
from find_my_tracker.features.auth.models import AdminCredential, LoginAttempt
from find_my_tracker.features.auth.repository import AuthRepository
from find_my_tracker.features.auth.schemas import (
    MIN_PASSWORD_LENGTH,
    LoginAttemptOut,
    LoginOutcome,
    RecoveryCodes,
    SecurityStatus,
    TotpSetup,
)

SESSION_COOKIE = "fmt_session"
MFA_COOKIE = "fmt_mfa"
SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days
#: A half-finished login: password accepted, authenticator code still owed.
MFA_TICKET_MAX_AGE = 5 * 60

TOTP_ACCOUNT = "admin"
ATTEMPTS_SHOWN = 10

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ClientInfo:
    """Who is knocking. The IP is only as trustworthy as `TRUSTED_PROXIES` makes it."""

    ip: str
    user_agent: str | None = None


class AdminAuth:
    """Process-wide crypto for the admin session, plus the cached session epoch.

    One per process: `verify_session` runs on every request and must not touch the database.
    """

    def __init__(self, *, secret_key: str, secrets: SecretBox) -> None:
        self._hasher = PasswordHasher()
        signing_key = derive_key(secret_key, SESSION_PURPOSE).hex()
        self._sessions = URLSafeTimedSerializer(signing_key, salt="fmt-admin-session")
        self._tickets = URLSafeTimedSerializer(signing_key, salt="fmt-admin-mfa")
        self._recovery_key = derive_key(secret_key, RECOVERY_PURPOSE)
        self._secrets = secrets
        self._epoch = 0  # 0 until the credential is loaded: no cookie verifies before then

    # ---- passwords ----

    def hash_password(self, raw: str) -> str:
        return self._hasher.hash(raw)

    def verify_password(self, raw: str, stored: str) -> bool:
        try:
            self._hasher.verify(stored, raw)
        except (VerificationError, InvalidHashError):
            return False
        return True

    def rehashed(self, raw: str, stored: str) -> str | None:
        """A stronger hash when argon2's defaults have moved on since this one was written."""
        return self.hash_password(raw) if self._hasher.check_needs_rehash(stored) else None

    # ---- sessions ----

    @property
    def epoch(self) -> int:
        return self._epoch

    def remember_epoch(self, epoch: int) -> None:
        self._epoch = epoch

    def issue_session(self) -> str:
        return self._sessions.dumps({"sub": "admin", "epoch": self._epoch})

    def verify_session(self, token: str | None) -> bool:
        return self._verify(self._sessions, token, SESSION_MAX_AGE, "admin")

    def issue_ticket(self) -> str:
        return self._tickets.dumps({"sub": "mfa", "epoch": self._epoch})

    def verify_ticket(self, token: str | None) -> bool:
        return self._verify(self._tickets, token, MFA_TICKET_MAX_AGE, "mfa")

    def _verify(
        self, signer: URLSafeTimedSerializer, token: str | None, max_age: int, subject: str
    ) -> bool:
        if not token or not self._epoch:
            return False
        try:
            data = signer.loads(token, max_age=max_age)
        except BadSignature:
            return False
        return (
            isinstance(data, dict)
            and data.get("sub") == subject
            and data.get("epoch") == self._epoch
        )

    # ---- second factor ----

    def seal_totp_secret(self, secret: str) -> bytes:
        return self._secrets.seal(secret.encode())

    def open_totp_secret(self, blob: bytes) -> str:
        return self._secrets.open(blob).decode()

    def recovery_digest(self, code: str) -> str:
        """Recovery codes are stored as a keyed hash: the database alone is not a way in."""
        return keyed_digest(self._recovery_key, totp.normalize_recovery_code(code).encode())


class LoginRateLimiter:
    """At most `max_failures` failed logins per client per `window` seconds."""

    def __init__(self, *, max_failures: int = 5, window: float = 300.0) -> None:
        self._max = max_failures
        self._window = window
        self._failures: dict[str, deque[float]] = defaultdict(deque)

    def retry_after(self, client: str) -> int:
        """Seconds until this client may try again; 0 when allowed."""
        q = self._prune(client)
        if len(q) < self._max:
            return 0
        return max(1, int(q[0] + self._window - time.monotonic()))

    def record_failure(self, client: str) -> None:
        self._prune(client).append(time.monotonic())

    def reset(self, client: str) -> None:
        self._failures.pop(client, None)

    def _prune(self, client: str) -> deque[float]:
        q = self._failures[client]
        cutoff = time.monotonic() - self._window
        while q and q[0] < cutoff:
            q.popleft()
        return q


class AuthService:
    """Everything that reads or writes the admin credential."""

    def __init__(self, session: AsyncSession, auth: AdminAuth, clock: Clock) -> None:
        self._session = session
        self._repo = AuthRepository(session)
        self._auth = auth
        self._clock = clock

    # ---- startup ----

    async def load(self, env_password: str | None, *, reset: bool = False) -> None:
        """Seed the credential from `ADMIN_PASSWORD` on first boot, then cache the epoch.

        After the first boot the environment is ignored: the password is changed in Settings.
        `ADMIN_PASSWORD_RESET=true` forces one re-seed, for an owner locked out of their own
        dashboard.
        """
        credential = await self._repo.credential()
        if credential is None:
            if not env_password:
                msg = "No admin password is set. Start once with ADMIN_PASSWORD in the environment."
                raise RuntimeError(msg)
            self._warn_if_weak(env_password)
            now = self._clock.timestamp()
            credential = AdminCredential(
                password_hash=self._auth.hash_password(env_password),
                session_epoch=1,
                created_at=now,
                updated_at=now,
            )
            self._repo.add_credential(credential)
            await self._session.commit()
        elif reset and env_password:
            self._warn_if_weak(env_password)
            credential.password_hash = self._auth.hash_password(env_password)
            credential.session_epoch += 1
            credential.updated_at = self._clock.timestamp()
            await self._session.commit()
        self._auth.remember_epoch(credential.session_epoch)

    @staticmethod
    def _warn_if_weak(password: str) -> None:
        if len(password) < MIN_PASSWORD_LENGTH:
            log.warning(
                "ADMIN_PASSWORD is %d characters. Use at least %d, especially if this server is "
                "reachable from the internet. Change it in Settings; no restart needed.",
                len(password),
                MIN_PASSWORD_LENGTH,
            )

    # ---- signing in ----

    async def _credential(self) -> AdminCredential:
        credential = await self._repo.credential()
        if credential is None:  # pragma: no cover - load() runs first, at startup
            msg = "The server has no admin password yet."
            raise DomainError(msg, code="not_configured")
        return credential

    async def begin_login(self, password: str, client: ClientInfo) -> bool:
        """Check the password. True when an authenticator code is still owed."""
        credential = await self._credential()
        if not self._auth.verify_password(password, credential.password_hash):
            await self._record(LoginOutcome.WRONG_PASSWORD, client)
            msg = "Wrong password."
            raise NotAuthenticated(msg, code="wrong_password")

        stronger = self._auth.rehashed(password, credential.password_hash)
        if stronger:
            credential.password_hash = stronger
        if credential.totp_enabled:
            await self._session.commit()
            return True
        await self._record(LoginOutcome.SUCCESS, client)
        return False

    async def complete_mfa(self, code: str, client: ClientInfo) -> None:
        """Finish a login with an authenticator code, or spend one recovery code."""
        credential = await self._credential()
        if not credential.totp_enabled or credential.totp_secret_blob is None:
            msg = "Two-factor authentication is not set up."
            raise Conflict(msg, code="totp_not_enabled")

        secret = self._auth.open_totp_secret(credential.totp_secret_blob)
        step = totp.verify_code(
            secret, code, now=self._clock.timestamp(), last_step=credential.totp_last_step
        )
        if step is not None:
            credential.totp_last_step = step
            credential.updated_at = self._clock.timestamp()
            await self._record(LoginOutcome.SUCCESS, client)
            return

        recovery = await self._repo.unused_recovery(self._auth.recovery_digest(code))
        if recovery is not None:
            recovery.used_at = self._clock.timestamp()
            await self._record(LoginOutcome.RECOVERY_USED, client)
            return

        await self._record(LoginOutcome.WRONG_CODE, client)
        msg = "That code is not right, or it has already been used."
        raise NotAuthenticated(msg, code="wrong_code")

    async def record_rate_limited(self, client: ClientInfo) -> None:
        await self._record(LoginOutcome.RATE_LIMITED, client)

    async def _record(self, outcome: LoginOutcome, client: ClientInfo) -> None:
        await self._repo.record_attempt(
            LoginAttempt(
                at=self._clock.timestamp(),
                client_ip=client.ip[:64],
                user_agent=(client.user_agent or None) and client.user_agent[:300],
                outcome=outcome.value,
            )
        )
        await self._session.commit()

    # ---- managing the account ----

    async def status(self) -> SecurityStatus:
        credential = await self._credential()
        attempts = await self._repo.recent_attempts(ATTEMPTS_SHOWN)
        return SecurityStatus(
            totp_enabled=credential.totp_enabled,
            recovery_codes_remaining=await self._repo.recovery_remaining(),
            password_changed_at=to_datetime(credential.updated_at),  # pyright: ignore[reportArgumentType]
            recent_attempts=[
                LoginAttemptOut(
                    at=to_datetime(a.at),  # pyright: ignore[reportArgumentType]
                    client_ip=a.client_ip,
                    user_agent=a.user_agent,
                    outcome=LoginOutcome(a.outcome),
                )
                for a in attempts
            ],
        )

    async def change_password(self, current: str, new: str) -> None:
        credential = await self._credential()
        if not self._auth.verify_password(current, credential.password_hash):
            msg = "That is not your current password."
            raise NotAuthenticated(msg, code="wrong_password")
        if len(new) < MIN_PASSWORD_LENGTH:
            msg = f"Use at least {MIN_PASSWORD_LENGTH} characters."
            raise DomainError(msg, code="weak_password")
        credential.password_hash = self._auth.hash_password(new)
        await self._bump(credential)

    async def revoke_sessions(self) -> None:
        """Log every browser out, including this one."""
        await self._bump(await self._credential())

    async def _bump(self, credential: AdminCredential) -> None:
        credential.session_epoch += 1
        credential.updated_at = self._clock.timestamp()
        await self._session.commit()
        self._auth.remember_epoch(credential.session_epoch)

    # ---- second factor ----

    async def start_totp(self) -> TotpSetup:
        """Mint a secret and hold it unconfirmed until a code from the app proves it arrived."""
        credential = await self._credential()
        if credential.totp_enabled:
            msg = "Two-factor authentication is already on. Turn it off first to start again."
            raise Conflict(msg, code="totp_enabled")
        secret = totp.new_secret()
        credential.totp_secret_blob = self._auth.seal_totp_secret(secret)
        credential.totp_last_step = None
        credential.updated_at = self._clock.timestamp()
        await self._session.commit()
        uri = totp.provisioning_uri(secret, account=TOTP_ACCOUNT)
        return TotpSetup(secret=secret, uri=uri, qr_data_uri=totp.qr_data_uri(uri))

    async def confirm_totp(self, code: str) -> RecoveryCodes:
        credential = await self._credential()
        if credential.totp_secret_blob is None:
            msg = "Start the two-factor setup first."
            raise Conflict(msg, code="totp_not_started")
        secret = self._auth.open_totp_secret(credential.totp_secret_blob)
        step = totp.verify_code(
            secret, code, now=self._clock.timestamp(), last_step=credential.totp_last_step
        )
        if step is None:
            msg = "That code is not right. Check your app and try the next one."
            raise DomainError(msg, code="wrong_code")
        credential.totp_enabled = True
        credential.totp_last_step = step
        credential.updated_at = self._clock.timestamp()
        return await self._issue_recovery_codes()

    async def disable_totp(self, password: str) -> None:
        credential = await self._credential()
        self._require_password(credential, password)
        credential.totp_enabled = False
        credential.totp_secret_blob = None
        credential.totp_last_step = None
        credential.updated_at = self._clock.timestamp()
        await self._repo.clear_recovery()
        await self._session.commit()

    async def regenerate_recovery_codes(self, password: str) -> RecoveryCodes:
        credential = await self._credential()
        self._require_password(credential, password)
        if not credential.totp_enabled:
            msg = "Turn on two-factor authentication first."
            raise Conflict(msg, code="totp_not_enabled")
        return await self._issue_recovery_codes()

    async def _issue_recovery_codes(self) -> RecoveryCodes:
        codes = totp.new_recovery_codes()
        await self._repo.replace_recovery(
            [self._auth.recovery_digest(code) for code in codes], now=self._clock.timestamp()
        )
        await self._session.commit()
        return RecoveryCodes(codes=codes)

    def _require_password(self, credential: AdminCredential, password: str) -> None:
        if not self._auth.verify_password(password, credential.password_hash):
            msg = "Wrong password."
            raise NotAuthenticated(msg, code="wrong_password")
