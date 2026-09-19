from __future__ import annotations

import pytest

from find_my_tracker.core.crypto import SecretBox, SecretBoxError
from find_my_tracker.integrations.apple.types import BeaconKind, classify_model


def test_secretbox_round_trip() -> None:
    box = SecretBox("k" * 32)
    blob = box.seal(b"beacon keys")
    assert blob != box.seal(b"beacon keys")  # random nonce
    assert box.open(blob) == b"beacon keys"


def test_secretbox_rejects_other_key() -> None:
    blob = SecretBox("a" * 32).seal(b"secret")
    with pytest.raises(SecretBoxError):
        SecretBox("b" * 32).open(blob)


@pytest.mark.parametrize(
    ("model", "kind"),
    [
        ("", BeaconKind.AIRTAG),
        (None, BeaconKind.AIRTAG),
        ("iPhone15,2", BeaconKind.IPHONE),
        ("Mac16,10", BeaconKind.MAC),
        ("MacBookPro18,1", BeaconKind.MAC),
        ("iPad13,1", BeaconKind.IPAD),
        ("AirPods 4", BeaconKind.AIRPODS),
        ("Chipolo ONE Spot", BeaconKind.OTHER),
    ],
)
def test_classify_model(model: str | None, kind: BeaconKind) -> None:
    assert classify_model(model) is kind
