from __future__ import annotations

from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.features.auth.models import AdminCredential, LoginAttempt, RecoveryCode

#: Keep the audit trail useful without letting it grow forever.
ATTEMPT_HISTORY = 200


class AuthRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def credential(self) -> AdminCredential | None:
        return await self._session.scalar(select(AdminCredential).limit(1))

    def add_credential(self, credential: AdminCredential) -> None:
        self._session.add(credential)

    # ---- recovery codes ----

    async def unused_recovery(self, digest: str) -> RecoveryCode | None:
        return await self._session.scalar(
            select(RecoveryCode).where(
                RecoveryCode.code_digest == digest, RecoveryCode.used_at.is_(None)
            )
        )

    async def recovery_remaining(self) -> int:
        codes = await self._session.scalars(
            select(RecoveryCode).where(RecoveryCode.used_at.is_(None))
        )
        return len(list(codes))

    async def replace_recovery(self, digests: list[str], *, now: int) -> None:
        await self._session.execute(delete(RecoveryCode))
        self._session.add_all(
            [RecoveryCode(code_digest=digest, created_at=now) for digest in digests]
        )

    async def clear_recovery(self) -> None:
        await self._session.execute(delete(RecoveryCode))

    # ---- audit ----

    async def record_attempt(self, attempt: LoginAttempt) -> None:
        self._session.add(attempt)
        await self._session.flush()
        await self._prune_attempts()

    async def recent_attempts(self, limit: int) -> list[LoginAttempt]:
        rows = await self._session.scalars(
            select(LoginAttempt).order_by(desc(LoginAttempt.at), desc(LoginAttempt.id)).limit(limit)
        )
        return list(rows)

    async def _prune_attempts(self) -> None:
        keep = await self._session.scalars(
            select(LoginAttempt.id)
            .order_by(desc(LoginAttempt.at), desc(LoginAttempt.id))
            .limit(ATTEMPT_HISTORY)
        )
        await self._session.execute(delete(LoginAttempt).where(LoginAttempt.id.not_in(list(keep))))
