"""Process-wide singletons, built once in the app factory and reached through `app.state`."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from find_my_tracker.core.clock import Clock
from find_my_tracker.core.config import Settings
from find_my_tracker.core.crypto import SecretBox
from find_my_tracker.core.database import Database

if TYPE_CHECKING:
    from find_my_tracker.features.apple_account.identity import DeviceIdentityService
    from find_my_tracker.features.apple_account.wizard import WizardManager
    from find_my_tracker.features.auth.service import AdminAuth, LoginRateLimiter
    from find_my_tracker.features.tracking.poller import Poller
    from find_my_tracker.integrations.apple.types import AppleClientFactory


@dataclass
class Container:
    settings: Settings
    clock: Clock
    db: Database
    secrets: SecretBox
    apple: AppleClientFactory
    device_identity: DeviceIdentityService
    auth: AdminAuth
    login_limiter: LoginRateLimiter
    wizards: WizardManager
    poller: Poller
