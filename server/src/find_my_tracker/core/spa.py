"""Serve the built React app (SPA mode) with an index.html fallback for client-side routes."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

#: Python's mimetypes module does not know these, and a wrong type means the browser ignores
#: the file: a manifest served as octet-stream is not read, so the app cannot be installed.
MEDIA_TYPES = {".webmanifest": "application/manifest+json", ".js": "text/javascript"}


def mount_spa(app: FastAPI, static_dir: Path) -> None:
    index = static_dir / "index.html"
    assets = static_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    root = static_dir.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = (static_dir / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            headers = None
            if candidate.name == "sw.js":
                # A cached service worker would outlive the deploy that replaced it.
                headers = {"cache-control": "no-cache"}
            return FileResponse(
                candidate, media_type=MEDIA_TYPES.get(candidate.suffix), headers=headers
            )
        return FileResponse(index)
