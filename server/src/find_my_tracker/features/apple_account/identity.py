"""
The installation's one Apple device identity: created on first start, kept forever.

It survives signing out and signing in with another Apple ID, so this server is always the
same single entry in the account's device list.
"""

from __future__ import annotations

import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.core.crypto import SecretBox
from find_my_tracker.core.database import Database
from find_my_tracker.features.apple_account.models import AppleAccount, InstallationValue
from find_my_tracker.integrations.apple.types import (
    AppleClient,
    AppleClientFactory,
    DeviceIdentity,
)

logger = logging.getLogger(__name__)

_KEY = "apple_device_identity"


class DeviceIdentityService:
    def __init__(self, db: Database, secrets: SecretBox, apple: AppleClientFactory) -> None:
        self._db = db
        self._secrets = secrets
        self._apple = apple
        self.identity: DeviceIdentity | None = None

    async def load(self) -> DeviceIdentity:
        """Load (or, the first time, create) the identity and hand it to the Apple factory."""
        async with self._db.session() as session:
            row = await session.get(InstallationValue, _KEY)
            if row is not None:
                identity = DeviceIdentity.from_json(json.loads(self._secrets.open(row.value)))
            else:
                identity = await self._adopt_existing(session) or DeviceIdentity.generate()
                session.add(InstallationValue(key=_KEY, value=self._seal(identity)))
                await session.commit()
                logger.info("Apple device identity created (serial %s)", identity.serial)
        self._use(identity)
        return identity

    async def capture(self, client: AppleClient) -> None:
        """
        Keep the anisette provisioning made during the first sign-in.

        Provisioning is what makes the anisette "machine"; reusing it is what keeps later
        sign-ins on the same device-list entry. Called after every sign-in attempt; a no-op
        once the state is stored.
        """
        if self.identity is None or self.identity.anisette:
            return
        try:
            seen = self._apple.identity_of(client.export_session())
        except Exception:  # an unfinished sign-in may not export; try again next time
            logger.debug("No session to capture the device identity from", exc_info=True)
            return
        if seen is None or not seen.anisette or seen.devid != self.identity.devid:
            return
        self.identity.anisette = seen.anisette
        async with self._db.session() as session:
            row = await session.get(InstallationValue, _KEY)
            if row is not None:
                row.value = self._seal(self.identity)
                await session.commit()
        self._use(self.identity)

    async def _adopt_existing(self, session: AsyncSession) -> DeviceIdentity | None:
        """Upgrading from a version without this table: keep the account's existing identity."""
        account = await session.scalar(select(AppleAccount).limit(1))
        if account is None:
            return None
        try:
            stored = json.loads(self._secrets.open(account.session_blob))
        except Exception:
            logger.warning("Could not read the stored Apple session; creating a new identity")
            return None
        return self._apple.identity_of(stored)

    def _use(self, identity: DeviceIdentity) -> None:
        self.identity = identity
        self._apple.set_identity(identity)

    def _seal(self, identity: DeviceIdentity) -> bytes:
        return self._secrets.seal(json.dumps(identity.to_json()).encode())
