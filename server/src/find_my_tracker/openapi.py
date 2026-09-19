"""Print the OpenAPI schema: `python -m find_my_tracker.openapi > openapi.json`.

The web app generates its TypeScript API types from this file (see web/package.json).
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from find_my_tracker.core.config import Settings
from find_my_tracker.main import create_app


def main() -> None:
    settings = Settings(
        secret_key="openapi-export-" + "x" * 32,  # pyright: ignore[reportArgumentType]
        admin_password="openapi-export",  # noqa: S106 # pyright: ignore[reportArgumentType]
        data_dir=Path(tempfile.mkdtemp()),
    )
    json.dump(create_app(settings).openapi(), sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
