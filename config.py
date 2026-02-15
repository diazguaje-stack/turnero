# config.py - Configuración híbrida: SQLite (localhost) + PostgreSQL (Render)

import os
from urllib.parse import quote_plus
from cryptography.fernet import Fernet

class Config:
    """Configuración base"""
    
    # Secret Key para Flask
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'tu_clave_secreta_muy_segura_12345'
    
    # Clave de encriptación Fernet para contraseñas
    # Genera una nueva clave con: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    PASSWORD_ENCRYPTION_KEY = os.environ.get('PASSWORD_ENCRYPTION_KEY') or b'K_m3xH9nP2vL5qQ8wR6tY9uO1iA4jB7cD0eF3gH6jK9lM2nN5pQ8sT1uV4wX7yZ0a'
    
    # Configuración de SQLAlchemy
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False
    
    # Pool de conexiones
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_recycle': 3600,
        'pool_pre_ping': True,
        'max_overflow': 20
    }


class DevelopmentConfig(Config):
    """Configuración para desarrollo local - Usa SQLite"""
    DEBUG = True
    FLASK_ENV = 'development'
    
    # Base de datos SQLite local (sin dependencias externas)
    DB_PATH = os.path.join(os.path.dirname(__file__), 'turnero_medico.db')
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{DB_PATH}'
    
    # SQLite no necesita pool config complejo
    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {'check_same_thread': False}
    }


class ProductionConfig(Config):
    """Configuración para producción (Render) - Usa PostgreSQL"""
    DEBUG = False
    FLASK_ENV = 'production'
    
    # En producción, usar DATABASE_URL de Render
    DATABASE_URL = os.environ.get('DATABASE_URL')
    
    if DATABASE_URL:
        # Render a veces usa postgres://, SQLAlchemy espera postgresql://
        if DATABASE_URL.startswith('postgres://'):
            DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)
        SQLALCHEMY_DATABASE_URI = DATABASE_URL
    else:
        # Fallback a PostgreSQL local si no hay DATABASE_URL
        DB_USER = os.environ.get('DB_USER', 'postgres')
        DB_PASSWORD = os.environ.get('DB_PASSWORD', 'tu_contraseña')
        DB_HOST = os.environ.get('DB_HOST', 'localhost')
        DB_PORT = os.environ.get('DB_PORT', '5432')
        DB_NAME = os.environ.get('DB_NAME', 'turnero_medico')
        
        SQLALCHEMY_DATABASE_URI = (
            f"postgresql://{DB_USER}:{quote_plus(DB_PASSWORD)}"
            f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
        )


# Diccionario de configuraciones
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}