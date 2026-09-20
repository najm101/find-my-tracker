from __future__ import annotations

import time

import pyotp
from fastapi.testclient import TestClient
from pydantic import SecretStr

from find_my_tracker.core.container import Container
from find_my_tracker.features.auth import totp
from tests.conftest import ADMIN_PASSWORD

NEW_PASSWORD = "a-much-longer-password"


def next_code(secret: str) -> str:
    """A code for the step after this one.

    Confirming the setup spends the current step, so the very same digits cannot then be used
    to sign in. That is the replay guard doing its job, not a quirk of the test.
    """
    return pyotp.TOTP(secret).at(int(time.time()) + totp.STEP_SECONDS)


def enable_totp(admin: TestClient) -> tuple[str, list[str]]:
    """Turn on two-factor the way the UI does, and hand back the secret and recovery codes."""
    setup = admin.post("/api/auth/totp/setup")
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    res = admin.post("/api/auth/totp/confirm", json={"code": pyotp.TOTP(secret).now()})
    assert res.status_code == 200, res.text
    return secret, res.json()["codes"]


# ---- the basics ----


def test_api_requires_login(client: TestClient) -> None:
    res = client.get("/api/beacons")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "not_authenticated"


def test_login_logout(client: TestClient) -> None:
    assert client.post("/api/auth/login", json={"password": "nope"}).status_code == 401
    res = client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    assert res.status_code == 200
    assert res.json() == {"mfa_required": False}
    assert client.get("/api/auth/me").json() == {"authenticated": True}
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_login_rate_limited(client: TestClient) -> None:
    for _ in range(5):
        client.post("/api/auth/login", json={"password": "nope"})
    res = client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    assert res.status_code == 429


def test_forged_cookie_rejected(client: TestClient) -> None:
    client.cookies.set("fmt_session", "forged.token.value")
    assert client.get("/api/auth/me").status_code == 401


def test_session_cookie_is_httponly_and_same_site(client: TestClient) -> None:
    res = client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    cookie = res.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=strict" in cookie
    assert "Path=/" in cookie


def test_password_is_not_stored_in_the_clear(admin: TestClient, container: Container) -> None:
    """The database holds an argon2 hash, never the password itself."""
    import asyncio

    from find_my_tracker.features.auth.repository import AuthRepository

    async def read() -> str:
        async with container.db.session() as session:
            credential = await AuthRepository(session).credential()
            assert credential is not None
            return credential.password_hash

    stored = asyncio.run(read())
    assert stored.startswith("$argon2id$")
    assert ADMIN_PASSWORD not in stored


def test_an_existing_short_password_still_boots(settings, apple) -> None:
    """Upgrading must never lock a self-hoster out over a password that already worked."""
    from find_my_tracker.main import build_container, create_app

    legacy = settings.model_copy(update={"admin_password": SecretStr("short123")})
    container = build_container(legacy, apple=apple, poller_startup_delay=3600)
    with TestClient(create_app(legacy, container)) as c:
        assert c.post("/api/auth/login", json={"password": "short123"}).status_code == 200


def test_the_minimum_still_applies_to_a_new_password(admin: TestClient) -> None:
    res = admin.post(
        "/api/auth/password",
        json={"current_password": ADMIN_PASSWORD, "new_password": "short123"},
    )
    assert res.status_code == 422


# ---- the second factor is optional ----


def test_two_factor_is_off_until_it_is_turned_on(admin: TestClient) -> None:
    status = admin.get("/api/auth/security").json()
    assert status["totp_enabled"] is False
    assert status["recovery_codes_remaining"] == 0


def test_login_needs_no_code_while_two_factor_is_off(client: TestClient) -> None:
    res = client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    assert res.json()["mfa_required"] is False
    assert client.get("/api/auth/me").status_code == 200


def test_setup_returns_a_scannable_secret(admin: TestClient) -> None:
    body = admin.post("/api/auth/totp/setup").json()
    assert body["uri"].startswith("otpauth://totp/Find%20My%20Tracker:admin")
    assert body["qr_data_uri"].startswith("data:image/svg+xml;base64,")
    # Unconfirmed: a wrong code must not switch it on.
    assert admin.post("/api/auth/totp/confirm", json={"code": "000000"}).status_code == 400
    assert admin.get("/api/auth/security").json()["totp_enabled"] is False


def test_turning_it_on_then_signing_in_with_a_code(client: TestClient) -> None:
    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    secret, codes = enable_totp(client)
    assert len(codes) == totp.RECOVERY_CODE_COUNT
    client.post("/api/auth/logout")

    res = client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    assert res.json() == {"mfa_required": True}
    assert client.get("/api/auth/me").status_code == 401  # the password alone is not enough

    assert client.post("/api/auth/mfa", json={"code": next_code(secret)}).status_code == 204
    assert client.get("/api/auth/me").status_code == 200


def test_a_wrong_code_does_not_sign_in(client: TestClient) -> None:
    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    enable_totp(client)
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    res = client.post("/api/auth/mfa", json={"code": "000000"})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "wrong_code"
    assert client.get("/api/auth/me").status_code == 401


def test_a_code_cannot_be_replayed(client: TestClient) -> None:
    """A stolen code is useless even inside its own 30-second window."""
    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    secret, _ = enable_totp(client)
    client.post("/api/auth/logout")

    code = next_code(secret)
    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    assert client.post("/api/auth/mfa", json={"code": code}).status_code == 204
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    assert client.post("/api/auth/mfa", json={"code": code}).status_code == 401


def test_mfa_needs_the_password_first(client: TestClient) -> None:
    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    secret, _ = enable_totp(client)
    client.post("/api/auth/logout")

    # No ticket cookie: a code on its own gets nowhere.
    res = client.post("/api/auth/mfa", json={"code": next_code(secret)})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "mfa_expired"


def test_a_recovery_code_works_once(client: TestClient) -> None:
    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    _, codes = enable_totp(client)
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    assert client.post("/api/auth/mfa", json={"code": codes[0]}).status_code == 204
    assert client.get("/api/auth/me").status_code == 200
    assert client.get("/api/auth/security").json()["recovery_codes_remaining"] == len(codes) - 1
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    assert client.post("/api/auth/mfa", json={"code": codes[0]}).status_code == 401


def test_recovery_codes_are_not_stored_in_the_clear(
    client: TestClient, container: Container
) -> None:
    import asyncio

    from sqlalchemy import select

    from find_my_tracker.features.auth.models import RecoveryCode

    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    _, codes = enable_totp(client)

    async def digests() -> list[str]:
        async with container.db.session() as session:
            rows = await session.scalars(select(RecoveryCode))
            return [row.code_digest for row in rows]

    stored = asyncio.run(digests())
    assert len(stored) == len(codes)
    for code in codes:
        assert code not in stored
        assert totp.normalize_recovery_code(code) not in stored


def test_turning_it_off_needs_the_password(client: TestClient) -> None:
    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    enable_totp(client)
    assert client.post("/api/auth/totp/disable", json={"password": "nope"}).status_code == 401
    assert (
        client.post("/api/auth/totp/disable", json={"password": ADMIN_PASSWORD}).status_code == 204
    )
    status = client.get("/api/auth/security").json()
    assert status["totp_enabled"] is False
    assert status["recovery_codes_remaining"] == 0

    client.post("/api/auth/logout")
    res = client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    assert res.json()["mfa_required"] is False


def test_recovery_codes_can_be_replaced(client: TestClient) -> None:
    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    _, old = enable_totp(client)
    fresh = client.post("/api/auth/recovery-codes", json={"password": ADMIN_PASSWORD})
    assert fresh.status_code == 200
    assert set(fresh.json()["codes"]).isdisjoint(old)
    client.post("/api/auth/logout")

    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    assert client.post("/api/auth/mfa", json={"code": old[0]}).status_code == 401


# ---- password changes and revoking sessions ----


def test_changing_the_password(admin: TestClient) -> None:
    res = admin.post(
        "/api/auth/password",
        json={"current_password": "nope", "new_password": NEW_PASSWORD},
    )
    assert res.status_code == 401

    res = admin.post(
        "/api/auth/password",
        json={"current_password": ADMIN_PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert res.status_code == 204
    assert admin.get("/api/auth/me").status_code == 200  # this browser stays signed in

    admin.post("/api/auth/logout")
    assert admin.post("/api/auth/login", json={"password": ADMIN_PASSWORD}).status_code == 401
    assert admin.post("/api/auth/login", json={"password": NEW_PASSWORD}).status_code == 200


def test_short_passwords_are_refused(admin: TestClient) -> None:
    res = admin.post(
        "/api/auth/password", json={"current_password": ADMIN_PASSWORD, "new_password": "short"}
    )
    assert res.status_code == 422


def test_revoking_sessions_invalidates_other_cookies(
    client: TestClient, settings, container: Container
) -> None:
    """A second browser's cookie stops working the moment sessions are revoked."""
    from find_my_tracker.main import create_app

    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    stolen = client.cookies.get("fmt_session")

    with TestClient(create_app(settings, container)) as other:
        other.cookies.set("fmt_session", stolen or "")
        assert other.get("/api/auth/me").status_code == 200

        client.post("/api/auth/sessions/revoke")

        other.cookies.set("fmt_session", stolen or "")
        assert other.get("/api/auth/me").status_code == 401


def test_changing_the_password_revokes_other_sessions(
    client: TestClient, settings, container: Container
) -> None:
    from find_my_tracker.main import create_app

    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    stolen = client.cookies.get("fmt_session")
    client.post(
        "/api/auth/password",
        json={"current_password": ADMIN_PASSWORD, "new_password": NEW_PASSWORD},
    )

    with TestClient(create_app(settings, container)) as other:
        other.cookies.set("fmt_session", stolen or "")
        assert other.get("/api/auth/me").status_code == 401


# ---- the audit trail ----


def test_attempts_are_recorded(client: TestClient) -> None:
    client.post("/api/auth/login", json={"password": "nope"})
    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    outcomes = [a["outcome"] for a in client.get("/api/auth/security").json()["recent_attempts"]]
    assert outcomes[:2] == ["success", "wrong_password"]
