"""Process-wide logging setup."""

from __future__ import annotations

import logging


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )
    # FindMy.py is chatty at INFO; its warnings still come through.
    logging.getLogger("findmy").setLevel(max(logging.getLevelName(level), logging.WARNING))
