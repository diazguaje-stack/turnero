# config.py - Configuración híbrida: SQLite (localhost) + PostgreSQL (Render)

import os
from urllib.parse import quote_plus
from cryptography.fernet import Fernet


class Config:
    """Configuración base"""

    SECRET_KEY = os.environ.get('SECRET_KEY') or 'tu_clave_secreta_muy_segura_12345'

    PASSWORD_ENCRYPTION_KEY = os.environ.get('PASSWORD_ENCRYPTION_KEY') or b'qa1mRq-ejpFmdh7iyIhxaVksNxiCJg1bdgjijfCzIyo='

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False

    # Pool de conexiones — sobreescrito por cada subclase
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,   # verifica conexión antes de usarla
        'pool_recycle':  1800,   # recicla conexiones cada 30 min
    }


class DevelopmentConfig(Config):
    """Desarrollo local — SQLite"""
    DEBUG = True

    DB_PATH = os.path.join(os.path.dirname(__file__), 'turnero_medico.db')
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{DB_PATH}'

    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {'check_same_thread': False}
    }


class ProductionConfig(Config):
    """Producción (Render) — PostgreSQL"""
    DEBUG = False

    # ── Leer y normalizar DATABASE_URL ──────────────────────
    # Render inyecta "postgres://" pero SQLAlchemy 1.4+ necesita "postgresql://"
    _db_url = os.environ.get('DATABASE_URL', '')
    if _db_url.startswith('postgres://'):
        _db_url = _db_url.replace('postgres://', 'postgresql://', 1)

    SQLALCHEMY_DATABASE_URI = _db_url or 'sqlite:///fallback.db'

    # ── Pool ajustado para Render Free (máx ~25 conexiones) ─
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size':     3,      # conexiones base
        'max_overflow':  7,      # conexiones extra temporales (total máx = 10)
        'pool_timeout':  30,     # segundos esperando una conexión libre
        'pool_recycle':  1800,   # recicla conexiones cada 30 min
        'pool_pre_ping': True,   # descarta conexiones muertas automáticamente
    }


# ── DEFAULT apunta a Production, no a Development ───────────
# Así si FLASK_ENV no llega por alguna razón, usa PostgreSQL igual
config = {
    'development': DevelopmentConfig,
    'production':  ProductionConfig,
    'default':     ProductionConfig,   # ← era DevelopmentConfig, ese era el bug
}