"""Encryption at rest for beacon keys and the Apple session, and key separation.

Everything hangs off `SECRET_KEY`, but nothing uses it raw: each purpose gets its own key
through HKDF. That keeps the session-signing key independent of the data key, so signing can
be rotated (to log every browser out) without making stored Apple credentials unreadable.
"""

from __future__ import annotations

import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.hmac import HMAC
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

_NONCE_SIZE = 12
_VERSION = b"\x01"

SECRETS_PURPOSE = b"fmt-secrets-v1"
SESSION_PURPOSE = b"fmt-session-v1"
RECOVERY_PURPOSE = b"fmt-recovery-v1"


def derive_key(secret_key: str, purpose: bytes, *, length: int = 32) -> bytes:
    """A key for one purpose only. Different purposes never share key material."""
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=None, info=purpose).derive(
        secret_key.encode()
    )


def keyed_digest(key: bytes, message: bytes) -> str:
    """HMAC-SHA256 as hex. For values we look up by hash and must not store in the clear."""
    mac = HMAC(key, hashes.SHA256())
    mac.update(message)
    return mac.finalize().hex()


class SecretBoxError(Exception):
    """Raised when a blob cannot be decrypted, usually because SECRET_KEY changed."""


class SecretBox:
    """AES-256-GCM with a key derived from SECRET_KEY. Blob layout: version | nonce | ciphertext."""

    def __init__(self, secret_key: str, *, purpose: bytes = SECRETS_PURPOSE) -> None:
        self._aead = AESGCM(derive_key(secret_key, purpose))

    def seal(self, plaintext: bytes) -> bytes:
        nonce = os.urandom(_NONCE_SIZE)
        return _VERSION + nonce + self._aead.encrypt(nonce, plaintext, _VERSION)

    def open(self, blob: bytes) -> bytes:
        if blob[:1] != _VERSION:
            msg = "Unknown secret format."
            raise SecretBoxError(msg)
        nonce, ciphertext = blob[1 : 1 + _NONCE_SIZE], blob[1 + _NONCE_SIZE :]
        try:
            return self._aead.decrypt(nonce, ciphertext, _VERSION)
        except InvalidTag as e:
            msg = "Could not decrypt stored secret. Did SECRET_KEY change?"
            raise SecretBoxError(msg) from e
