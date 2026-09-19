"""Entry point: `python -m find_my_tracker`."""

from __future__ import annotations

import uvicorn

from find_my_tracker.core.config import get_settings
from find_my_tracker.core.logging import configure_logging
from find_my_tracker.main import create_app


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    uvicorn.run(
        create_app(settings),
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
        proxy_headers=True,
    )


if __name__ == "__main__":
    main()
