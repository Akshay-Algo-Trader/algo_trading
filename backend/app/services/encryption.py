import os
import base64
from cryptography.fernet import Fernet


def _get_fernet() -> Fernet:
    key = os.getenv('ENCRYPTION_KEY', '')
    if not key:
        raise ValueError('ENCRYPTION_KEY environment variable not set')
    raw = key.encode()[:32].ljust(32, b'0')
    return Fernet(base64.urlsafe_b64encode(raw))


def encrypt(value: str) -> str:
    if not value:
        return ''
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    if not token:
        return ''
    return _get_fernet().decrypt(token.encode()).decode()
