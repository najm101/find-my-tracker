"""
The Apple sign-in wizard: a small state machine held in memory between HTTP requests.

    CREDENTIALS ─┬─(2FA)→ TWO_FACTOR_METHOD → TWO_FACTOR_CODE ─┐
                 └─(none)───────────────────────────────────────┤
                                                                 ▼
                          DONE ← BEACONS ← DEVICE (choose device + screen-lock passcode)
                                    ▲          ▲
    resume (saved session) ─────────┴──────────┘  saved keychain keys work → BEACONS,
                                                  otherwise → DEVICE (passcode only)

It only talks to Apple. Persisting the result is `AppleAccountService`'s job.
"""

from __future__ import annotations

import asyncio
import logging
import time
from enum import StrEnum

from find_my_tracker.core.errors import Conflict
from find_my_tracker.integrations.apple.types import (
    AccessoryInfo,
    AppleAuthExpired,
    AppleClient,
    AppleError,
    ApplePasscodeRejected,
    RecoveryDevice,
    TwoFactorMethod,
)

logger = logging.getLogger(__name__)

PASSCODE_ATTEMPTS = 3
WIZARD_TTL_SECONDS = 15 * 60


class WizardStep(StrEnum):
    CREDENTIALS = "credentials"
    TWO_FACTOR_METHOD = "two_factor_method"
    TWO_FACTOR_CODE = "two_factor_code"
    DEVICE = "device"
    BEACONS = "beacons"
    DONE = "done"


class WizardExhausted(AppleError):
    """No passcode attempts left. The flow must start over."""


class SignInWizard:
    def __init__(self, client: AppleClient) -> None:
        self.client = client
        self.step = WizardStep.CREDENTIALS
        self.apple_id: str | None = None
        self.methods: list[TwoFactorMethod] = []
        self.chosen_method: int | None = None
        self.devices: list[RecoveryDevice] = []
        self.accessories: list[AccessoryInfo] = []
        self.passcode_attempts_left = PASSCODE_ATTEMPTS
        self.imported_count = 0
        self.resumed = False
        # Keychain keys to store with the account (set once the keychain is open).
        self.keychain: list[str] = []

    async def start(self, apple_id: str, password: str) -> None:
        self._expect(WizardStep.CREDENTIALS)
        needs_2fa = await self.client.login(apple_id, password)
        self.apple_id = apple_id
        if needs_2fa:
            self.methods = await self.client.two_factor_methods()
            self.step = WizardStep.TWO_FACTOR_METHOD
        else:
            await self._load_devices()

    async def resume(self, apple_id: str, keychain: list[str] | None) -> None:
        """
        Add beacons using the saved session (the client was restored, not signed in).

        Tries the keychain keys kept from the last unlock first, which needs nothing from the
        user. Keys go stale when Apple rotates the keychain; then only the passcode is asked.
        """
        self._expect(WizardStep.CREDENTIALS)
        self.apple_id = apple_id
        self.resumed = True
        if keychain:
            try:
                await self.client.use_keychain(keychain)
                self.accessories = await self.client.accessories()
            except AppleAuthExpired:
                raise
            except AppleError as e:
                logger.info("Saved keychain keys no longer work (%s); asking for a passcode", e)
            else:
                self.keychain = keychain
                self.step = WizardStep.BEACONS
                return
        await self._load_devices()

    async def request_code(self, method_id: int) -> None:
        """Send a code by the chosen method. Also used to resend from the code step."""
        self._expect(WizardStep.TWO_FACTOR_METHOD, WizardStep.TWO_FACTOR_CODE)
        await self.client.request_two_factor(method_id)
        self.chosen_method = method_id
        self.step = WizardStep.TWO_FACTOR_CODE

    async def submit_code(self, code: str) -> None:
        self._expect(WizardStep.TWO_FACTOR_CODE)
        assert self.chosen_method is not None
        await self.client.submit_two_factor(self.chosen_method, code.strip())
        await self._load_devices()

    async def unlock(self, device_id: str, passcode: str) -> None:
        self._expect(WizardStep.DEVICE)
        try:
            await self.client.unlock(device_id, passcode)
        except ApplePasscodeRejected as e:
            self.passcode_attempts_left -= 1
            if self.passcode_attempts_left <= 0:
                msg = f"{e.message} No attempts left. Start the sign-in again."
                raise WizardExhausted(msg) from e
            raise
        self.keychain = self.client.export_keychain()
        self.accessories = await self.client.accessories()
        self.step = WizardStep.BEACONS

    def selection(self, identifiers: list[str]) -> list[AccessoryInfo]:
        self._expect(WizardStep.BEACONS)
        wanted = set(identifiers)
        chosen = [a for a in self.accessories if a.identifier in wanted]
        if not chosen:
            msg = "Choose at least one beacon to track."
            raise Conflict(msg, code="nothing_selected")
        return chosen

    def complete(self, imported: int) -> None:
        self.step = WizardStep.DONE
        self.imported_count = imported

    async def _load_devices(self) -> None:
        self.devices = await self.client.recovery_devices()
        if not self.devices:
            msg = (
                "Apple reports no device on this account that can unlock the iCloud Keychain "
                "right now. This is often temporary; try again later."
            )
            raise AppleError(msg)
        self.step = WizardStep.DEVICE

    def _expect(self, *steps: WizardStep) -> None:
        if self.step not in steps:
            msg = "The sign-in has moved on from this step. Refresh to continue."
            raise Conflict(msg, code="wrong_step")


class WizardManager:
    """Holds at most one wizard. Steps are serialized; idle wizards expire and are closed."""

    def __init__(self, *, ttl_seconds: float = WIZARD_TTL_SECONDS) -> None:
        self._ttl = ttl_seconds
        self._wizard: SignInWizard | None = None
        self._touched = 0.0
        self.lock = asyncio.Lock()

    async def current(self) -> SignInWizard | None:
        if self._wizard and time.monotonic() - self._touched > self._ttl:
            logger.info("Sign-in wizard expired")
            await self.discard()
        if self._wizard:
            self._touched = time.monotonic()
        return self._wizard

    async def begin(self, client: AppleClient) -> SignInWizard:
        await self.discard()
        self._wizard = SignInWizard(client)
        self._touched = time.monotonic()
        return self._wizard

    async def discard(self) -> None:
        wizard, self._wizard = self._wizard, None
        if wizard:
            try:
                await wizard.client.close()
            except Exception:  # closing must never mask the real outcome
                logger.exception("Closing the wizard's Apple client failed")
