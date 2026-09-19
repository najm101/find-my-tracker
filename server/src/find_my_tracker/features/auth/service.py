"""Single-admin dashboard authentication: password from env, signed session cookie."""

from __future__ import annotations

import hmac
import time
from collections import defaultdict, deque

from itsdangerous import BadSignature, URLSafeTimedSerializer

SESSION_COOKIE = "fmt_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days


class AdminAuth:
    def __init__(self, *, password: str, secret_key: str) -> None:
        self._password = password.encode()
        self._signer = URLSafeTimedSerializer(secret_key, salt="fmt-admin-session")

    def check_password(self, candidate: str) -> bool:
        return hmac.compare_digest(candidate.encode(), self._password)

    def issue_token(self) -> str:
        return self._signer.dumps({"sub": "admin"})

    def verify_token(self, token: str | None) -> bool:
        if not token:
            return False
        try:
            data = self._signer.loads(token, max_age=SESSION_MAX_AGE)
        except BadSignature:
            return False
        return isinstance(data, dict) and data.get("sub") == "admin"


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
