from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from find_my_tracker.core.config import Settings
from find_my_tracker.main import create_app


def test_health(client: TestClient) -> None:
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_spa_fallback_and_api_404(settings: Settings, tmp_path: Path) -> None:
    static = tmp_path / "static"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<html>app</html>")
    (static / "favicon.ico").write_bytes(b"ico")
    settings.static_dir = static

    with TestClient(create_app(settings)) as c:
        assert c.get("/beacons/42").text == "<html>app</html>"  # client-side route
        assert c.get("/favicon.ico").content == b"ico"
        assert c.get("/../../etc/passwd").text == "<html>app</html>"  # no traversal
        assert c.get("/api/does-not-exist").status_code == 404
