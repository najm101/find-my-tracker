"""Import every feature's models so `Base.metadata` is complete (Alembic, tests)."""

from find_my_tracker.features.apple_account.models import AppleAccount, InstallationValue
from find_my_tracker.features.auth.models import AdminCredential, LoginAttempt, RecoveryCode
from find_my_tracker.features.beacons.models import Beacon
from find_my_tracker.features.locations.models import Location
from find_my_tracker.features.routing.models import RouteCache
from find_my_tracker.features.settings.models import SettingRow
from find_my_tracker.features.tracking.models import PollRun

__all__ = [
    "AdminCredential",
    "AppleAccount",
    "Beacon",
    "InstallationValue",
    "Location",
    "LoginAttempt",
    "PollRun",
    "RecoveryCode",
    "RouteCache",
    "SettingRow",
]
