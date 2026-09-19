"""Encryption at rest for beacon keys and the Apple session."""

from __future__ import annotations

import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

_NONCE_SIZE = 12
_VERSION = b"\x01"


class SecretBoxError(Exception):
    """Raised when a blob cannot be decrypted, usually because SECRET_KEY changed."""


class SecretBox:
    """AES-256-GCM with a key derived from SECRET_KEY. Blob layout: version | nonce | ciphertext."""

    def __init__(self, secret_key: str, *, purpose: bytes = b"fmt-secrets-v1") -> None:
        key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=purpose).derive(
            secret_key.encode()
        )
        self._aead = AESGCM(key)

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
