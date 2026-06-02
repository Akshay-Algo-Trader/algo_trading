from app.extensions import db
from datetime import datetime, timezone
from cryptography.fernet import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import base64
import os
from flask import current_app


class KiteConfig(db.Model):
    """Zerodha Kite Connect credentials per user"""
    __tablename__ = 'kite_configs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True, index=True)
    api_key_encrypted = db.Column(db.String(255), nullable=False)
    api_secret_encrypted = db.Column(db.String(255), nullable=False)
    access_token_encrypted = db.Column(db.String(255), nullable=True)
    token_generated_at = db.Column(db.DateTime(timezone=True), nullable=True)
    static_ip = db.Column(db.String(45), nullable=True)  # IPv4 or IPv6
    is_connected = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    @staticmethod
    def _get_cipher():
        """Get cipher for encryption/decryption"""
        encryption_key = current_app.config.get('ENCRYPTION_KEY', '')
        if not encryption_key:
            raise ValueError('ENCRYPTION_KEY not configured')
        # Ensure key is 32 bytes (256 bits) for AES
        key = base64.b64encode(encryption_key.encode().ljust(32)[:32])
        return key
    
    @staticmethod
    def encrypt_field(value):
        """Encrypt a field value"""
        if not value:
            return None
        key = KiteConfig._get_cipher()
        cipher = Cipher(algorithms.AES(key), modes.EAX(), backend=default_backend())
        encryptor = cipher.encryptor()
        ciphertext = encryptor.update(value.encode()) + encryptor.finalize()
        return base64.b64encode(ciphertext + encryptor.tag).decode()
    
    @staticmethod
    def decrypt_field(encrypted_value):
        """Decrypt a field value"""
        if not encrypted_value:
            return None
        key = KiteConfig._get_cipher()
        encrypted_bytes = base64.b64decode(encrypted_value)
        ciphertext = encrypted_bytes[:-16]
        tag = encrypted_bytes[-16:]
        cipher = Cipher(algorithms.AES(key), modes.EAX(), backend=default_backend())
        decryptor = cipher.decryptor()
        plaintext = decryptor.update(ciphertext) + decryptor.finalize_with_tag(tag)
        return plaintext.decode()
    
    # Property setters for encrypted fields
    def set_api_key(self, value):
        self.api_key_encrypted = self.encrypt_field(value)
    
    def get_api_key(self):
        return self.decrypt_field(self.api_key_encrypted)
    
    def set_api_secret(self, value):
        self.api_secret_encrypted = self.encrypt_field(value)
    
    def get_api_secret(self):
        return self.decrypt_field(self.api_secret_encrypted)
    
    def set_access_token(self, value):
        self.access_token_encrypted = self.encrypt_field(value)
    
    def get_access_token(self):
        return self.decrypt_field(self.access_token_encrypted)
    
    # Create properties that work with the encrypted fields
    api_key = property(get_api_key, set_api_key)
    api_secret = property(get_api_secret, set_api_secret)
    access_token = property(get_access_token, set_access_token)
    
    def to_dict(self):
        """Convert to dictionary (without sensitive fields)"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'static_ip': self.static_ip,
            'is_connected': self.is_connected,
            'token_generated_at': self.token_generated_at.isoformat() if self.token_generated_at else None,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
    
    def __repr__(self):
        return f'<KiteConfig user_id={self.user_id}>'
