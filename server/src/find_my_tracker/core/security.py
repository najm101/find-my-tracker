"""Response headers that matter once the dashboard is reachable from the internet.

Rather than allowing inline scripts wholesale, the SPA's own inline scripts (the theme
bootstrap and React Router's hydration payload) are hashed out of `index.html`, so `script-src`
stays strict and an injected `<script>` still cannot run.

Those hashes must match the file actually being served, byte for byte. A stale hash is not a
degraded page, it is a blank one: the browser blocks the hydration script and nothing renders.
So the policy is rebuilt whenever `index.html` changes on disk rather than being frozen at
startup, and a rebuilt front end cannot take the dashboard down.
"""

from __future__ import annotations

import base64
import hashlib
import re
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Message, Receive, Scope, Send

#: Base maps and satellite imagery. Anything else a user configures is added from settings.
MAP_SOURCES = ("https://tiles.openfreemap.org", "https://server.arcgisonline.com")

HSTS = "max-age=31536000; includeSubDomains"

_INLINE_SCRIPT = re.compile(r"<script(?![^>]*\ssrc=)[^>]*>(.*?)</script>", re.DOTALL)


def inline_script_hashes(index: Path) -> list[str]:
    """`'sha256-...'` sources for every inline script in the built index.html."""
    try:
        html = index.read_text(encoding="utf-8")
    except OSError:  # pragma: no cover - no SPA build, e.g. the API-only test app
        return []
    return script_hashes(html)


def script_hashes(html: str) -> list[str]:
    """`'sha256-...'` sources for every inline script in a page."""
    return [
        f"'sha256-{base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()}'"
        for body in (m.group(1) for m in _INLINE_SCRIPT.finditer(html))
    ]


def page_csp(html: str) -> str:
    """The policy for a page the server renders itself (the API docs): its own inline scripts."""
    return build_csp(script_hashes=script_hashes(html), extra_sources=[])


def build_csp(*, script_hashes: Iterable[str], extra_sources: Iterable[str]) -> str:
    """One policy for the whole app. Map tiles are the only third-party origins."""
    remote = " ".join([*MAP_SOURCES, *extra_sources])
    scripts = " ".join(["'self'", *script_hashes])
    directives = {
        "default-src": "'self'",
        "base-uri": "'self'",
        "form-action": "'self'",
        "frame-ancestors": "'none'",
        "object-src": "'none'",
        "script-src": scripts,
        # MapLibre and React both set style attributes; there is no hashing them.
        "style-src": "'self' 'unsafe-inline'",
        "img-src": f"'self' data: blob: {remote}",
        "connect-src": f"'self' {remote}",
        # The MapLibre worker, which the bundle loads as a same-origin or blob URL.
        "worker-src": "'self' blob:",
        "child-src": "'self' blob:",
        "font-src": "'self' data:",
        "manifest-src": "'self'",
    }
    return "; ".join(f"{name} {value}" for name, value in directives.items())


class ContentSecurityPolicy:
    """The policy for the page as it is on disk right now.

    Cheap to ask: it only re-hashes when `index.html`'s size or modification time moves.
    """

    def __init__(self, index: Path | None, *, extra_sources: Iterable[str]) -> None:
        self._index = index
        self._extra = list(extra_sources)
        self._stamp: tuple[int, int] | None = None
        self._policy = build_csp(script_hashes=[], extra_sources=self._extra)

    def __call__(self) -> str:
        if self._index is None:
            return self._policy
        try:
            stat = self._index.stat()
            stamp = (stat.st_mtime_ns, stat.st_size)
        except OSError:  # pragma: no cover - the build went missing mid-flight
            return self._policy
        if stamp != self._stamp:
            self._stamp = stamp
            self._policy = build_csp(
                script_hashes=inline_script_hashes(self._index), extra_sources=self._extra
            )
        return self._policy


class SecurityHeadersMiddleware:
    """Adds the headers to every response, including static files and errors.

    Plain ASGI rather than `BaseHTTPMiddleware`: it only rewrites the response start message,
    so streaming responses (CSV and GeoJSON exports) are untouched.
    """

    def __init__(self, app: ASGIApp, *, csp: Callable[[], str], force_https: bool) -> None:
        self._app = app
        self._csp = csp
        self._common = [
            (b"x-content-type-options", b"nosniff"),
            (b"x-frame-options", b"DENY"),
            # URLs carry coordinates on /places; never leak them to a tile server.
            (b"referrer-policy", b"no-referrer"),
            (b"permissions-policy", b"geolocation=(self), camera=(), microphone=(), payment=()"),
            (b"cross-origin-opener-policy", b"same-origin"),
        ]
        if force_https:
            self._common.append((b"strict-transport-security", HSTS.encode()))

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        is_api = scope.get("path", "").startswith("/api/")

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers: list[tuple[bytes, bytes]] = message.setdefault("headers", [])
                present = {name.lower() for name, _ in headers}
                headers.extend((n, v) for n, v in self._common if n not in present)
                if b"content-security-policy" not in present:
                    headers.append((b"content-security-policy", self._csp().encode()))
                if is_api and b"cache-control" not in present:
                    # Location history must not sit in a shared cache.
                    headers.append((b"cache-control", b"no-store"))
            await send(message)

        await self._app(scope, receive, send_with_headers)
