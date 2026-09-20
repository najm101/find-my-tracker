"""Headers and settings that only matter once the dashboard is reachable from the internet."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from find_my_tracker.core.config import Settings
from find_my_tracker.core.security import (
    ContentSecurityPolicy,
    build_csp,
    inline_script_hashes,
)
from find_my_tracker.integrations.apple.fake import FakeAppleClientFactory
from find_my_tracker.main import build_container, create_app


def app_with(settings: Settings, apple: FakeAppleClientFactory) -> Iterator[TestClient]:
    container = build_container(settings, apple=apple, poller_startup_delay=3600)
    with TestClient(create_app(settings, container)) as c:
        yield c


def test_security_headers_are_present(client: TestClient) -> None:
    headers = client.get("/api/health").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["referrer-policy"] == "no-referrer"
    assert headers["cross-origin-opener-policy"] == "same-origin"
    assert "geolocation=(self)" in headers["permissions-policy"]
    assert "frame-ancestors 'none'" in headers["content-security-policy"]


def test_api_responses_are_not_cached(client: TestClient) -> None:
    """Location history must never sit in a shared cache."""
    assert client.get("/api/health").headers["cache-control"] == "no-store"


def test_no_hsts_until_https_is_forced(client: TestClient) -> None:
    assert "strict-transport-security" not in client.get("/api/health").headers


def test_hsts_when_https_is_forced(settings: Settings, apple: FakeAppleClientFactory) -> None:
    secured = settings.model_copy(update={"force_https": True})
    for c in app_with(secured, apple):
        assert c.get("/api/health").headers["strict-transport-security"].startswith("max-age=")


def test_cookie_is_secure_when_https_is_forced(
    settings: Settings, apple: FakeAppleClientFactory
) -> None:
    """Behind a TLS proxy the app sees plain HTTP, so the flag cannot come from the scheme."""
    from tests.conftest import ADMIN_PASSWORD

    secured = settings.model_copy(update={"force_https": True})
    for c in app_with(secured, apple):
        res = c.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
        assert "Secure" in res.headers["set-cookie"]


def test_unknown_host_is_rejected_when_an_allowlist_is_set(
    settings: Settings, apple: FakeAppleClientFactory
) -> None:
    guarded = settings.model_copy(update={"allowed_hosts": "tracker.example.com"})
    for c in app_with(guarded, apple):
        assert c.get("/api/health", headers={"host": "evil.example.com"}).status_code == 400
        assert c.get("/api/health", headers={"host": "tracker.example.com"}).status_code == 200


def test_an_allowlist_still_answers_the_container_healthcheck(
    settings: Settings, apple: FakeAppleClientFactory
) -> None:
    """The Docker healthcheck calls 127.0.0.1, which is never the public host name."""
    guarded = settings.model_copy(update={"allowed_hosts": "tracker.example.com"})
    for c in app_with(guarded, apple):
        assert c.get("/api/health", headers={"host": "127.0.0.1:8080"}).status_code == 200
        assert c.get("/api/health", headers={"host": "localhost:8080"}).status_code == 200


def test_health_hides_the_version_from_strangers(client: TestClient) -> None:
    assert client.get("/api/health").json()["version"] is None


def test_health_shows_the_version_to_an_admin(admin: TestClient) -> None:
    assert admin.get("/api/health").json()["version"]


# ---- the content security policy ----


def test_csp_allows_the_map_tiles_but_nothing_else(tmp_path: Path) -> None:
    csp = build_csp(script_hashes=[], extra_sources=[])
    assert "connect-src 'self' https://tiles.openfreemap.org https://server.arcgisonline.com" in csp
    assert "script-src 'self';" in csp  # no 'unsafe-inline' for scripts
    assert "worker-src 'self' blob:" in csp  # the MapLibre worker


def test_csp_carries_extra_sources() -> None:
    csp = build_csp(script_hashes=[], extra_sources=["https://tiles.example.com"])
    assert "https://tiles.example.com" in csp


def test_inline_scripts_are_hashed_not_waved_through(tmp_path: Path) -> None:
    index = tmp_path / "index.html"
    index.write_text(
        '<html><script>console.log(1)</script><script src="/assets/app.js"></script></html>',
        encoding="utf-8",
    )
    hashes = inline_script_hashes(index)
    assert len(hashes) == 1  # the external one needs no hash
    assert hashes[0].startswith("'sha256-")
    assert hashes[0] in build_csp(script_hashes=hashes, extra_sources=[])


def test_missing_build_yields_no_hashes(tmp_path: Path) -> None:
    assert inline_script_hashes(tmp_path / "nothing.html") == []


def test_the_policy_follows_a_rebuilt_front_end(tmp_path: Path) -> None:
    """A stale hash blocks the hydration script, which is a blank page, not a degraded one."""
    index = tmp_path / "index.html"
    index.write_text("<script>first()</script>", encoding="utf-8")
    policy = ContentSecurityPolicy(index, extra_sources=[])

    before = policy()
    assert inline_script_hashes(index)[0] in before

    # A rebuild changes the inline script, so the hash it needs changes with it.
    index.write_text("<script>second()</script>", encoding="utf-8")
    after = policy()
    assert after != before
    assert inline_script_hashes(index)[0] in after


def test_the_policy_survives_a_missing_index(tmp_path: Path) -> None:
    policy = ContentSecurityPolicy(tmp_path / "gone.html", extra_sources=[])
    assert "default-src 'self'" in policy()


def test_the_served_page_carries_hashes_for_its_own_scripts(
    settings: Settings, apple: FakeAppleClientFactory
) -> None:
    """End to end: whatever index.html the server hands out, its scripts are allowed."""
    static = settings.data_dir / "static"
    static.mkdir(parents=True, exist_ok=True)
    (static / "index.html").write_text(
        "<html><script>bootstrap()</script></html>", encoding="utf-8"
    )
    served = settings.model_copy(update={"static_dir": static})
    for c in app_with(served, apple):
        expected = inline_script_hashes(static / "index.html")[0]
        assert expected in c.get("/").headers["content-security-policy"]

        (static / "index.html").write_text(
            "<html><script>rebuilt()</script></html>", encoding="utf-8"
        )
        fresh = inline_script_hashes(static / "index.html")[0]
        assert fresh in c.get("/").headers["content-security-policy"]


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_api_docs_are_off_by_default(client: TestClient, path: str) -> None:
    assert client.get(path).status_code == 404


@pytest.mark.parametrize("path", ["/docs", "/openapi.json"])
def test_api_docs_can_be_turned_on(
    settings: Settings, apple: FakeAppleClientFactory, path: str
) -> None:
    opened = settings.model_copy(update={"expose_api_docs": True})
    for c in app_with(opened, apple):
        assert c.get(path).status_code == 200
