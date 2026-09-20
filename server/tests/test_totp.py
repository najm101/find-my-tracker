"""The authenticator-code maths, without a database or an HTTP client."""

from __future__ import annotations

import pyotp
import pytest

from find_my_tracker.features.auth import totp

NOW = 1_758_300_000
STEP = NOW // totp.STEP_SECONDS


@pytest.fixture
def secret() -> str:
    return totp.new_secret()


def code_at(secret: str, step: int) -> str:
    return pyotp.TOTP(secret).at(step * totp.STEP_SECONDS)


def test_the_current_code_is_accepted(secret: str) -> None:
    assert totp.verify_code(secret, code_at(secret, STEP), now=NOW, last_step=None) == STEP


def test_a_wrong_code_is_refused(secret: str) -> None:
    assert totp.verify_code(secret, "000000", now=NOW, last_step=None) is None


def test_spaces_and_dashes_are_forgiven(secret: str) -> None:
    typed = code_at(secret, STEP)
    assert totp.verify_code(secret, f"{typed[:3]} {typed[3:]}", now=NOW, last_step=None) == STEP


@pytest.mark.parametrize("offset", [-1, 1])
def test_a_slow_or_fast_phone_still_works(secret: str, offset: int) -> None:
    """One step of drift either way, so a phone clock a few seconds off is not a lockout."""
    step = STEP + offset
    assert totp.verify_code(secret, code_at(secret, step), now=NOW, last_step=None) == step


@pytest.mark.parametrize("offset", [-2, 2])
def test_further_drift_is_refused(secret: str, offset: int) -> None:
    assert totp.verify_code(secret, code_at(secret, STEP + offset), now=NOW, last_step=None) is None


def test_a_spent_step_is_never_accepted_again(secret: str) -> None:
    assert totp.verify_code(secret, code_at(secret, STEP), now=NOW, last_step=STEP) is None


def test_an_older_code_cannot_follow_a_newer_one(secret: str) -> None:
    """Accepting step N must retire N-1 as well, or a replay window reopens."""
    assert totp.verify_code(secret, code_at(secret, STEP - 1), now=NOW, last_step=STEP) is None


def test_the_next_code_still_works_after_one_is_spent(secret: str) -> None:
    later = NOW + totp.STEP_SECONDS
    step = STEP + 1
    assert totp.verify_code(secret, code_at(secret, step), now=later, last_step=STEP) == step


def test_secrets_are_unique() -> None:
    assert len({totp.new_secret() for _ in range(20)}) == 20


def test_recovery_codes_are_unique_and_readable() -> None:
    codes = totp.new_recovery_codes()
    assert len(set(codes)) == totp.RECOVERY_CODE_COUNT
    for code in codes:
        assert code.count("-") == 2
        # No characters that are easy to misread when copying off a screen.
        assert not set(code) & set("il1o0")


def test_recovery_codes_normalize_the_same_however_they_are_typed() -> None:
    assert (
        totp.normalize_recovery_code("ABcde-FGHij-KLMNP")
        == totp.normalize_recovery_code(" abcdefghij klmnp ")
        == "abcdefghijklmnp"
    )
