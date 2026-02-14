# config.py - Configuración de la base de datos PostgreSQL

import os
from urllib.parse import quote_plus

class Config:
    """Configuración base"""
    
    # Secret Key para Flask
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'tu_clave_secreta_muy_segura_12345'
    
    # Configuración de PostgreSQL
    # Formato: postgresql://usuario:contraseña@host:puerto/nombre_db
    
    # Opción 1: Usando variables individuales (más limpio)
    DB_USER = os.environ.get('DB_USER', 'postgres')
    DB_PASSWORD = os.environ.get('DB_PASSWORD', 'tu_contraseña')
    DB_HOST = os.environ.get('DB_HOST', 'localhost')
    DB_PORT = os.environ.get('DB_PORT', '5432')
    DB_NAME = os.environ.get('DB_NAME', 'turnero_medico')
    
    # Construir URL de base de datos
    # quote_plus codifica caracteres especiales en la contraseña
    SQLALCHEMY_DATABASE_URI = (
        f"postgresql://{DB_USER}:{quote_plus(DB_PASSWORD)}"
        f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )
    
    # Opción 2: Usar DATABASE_URL directamente (útil para Render)
    # Si DATABASE_URL existe, úsala en lugar de construir manualmente
    DATABASE_URL = os.environ.get('DATABASE_URL')
    if DATABASE_URL:
        # Render usa postgres:// pero SQLAlchemy necesita postgresql://
        if DATABASE_URL.startswith('postgres://'):
            DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)
        SQLALCHEMY_DATABASE_URI = DATABASE_URL
    
    # Configuración de SQLAlchemy
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = os.environ.get('FLASK_ENV') == 'development'  # Log SQL queries en dev
    
    # Pool de conexiones
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_recycle': 3600,
        'pool_pre_ping': True,
        'max_overflow': 20
    }


class DevelopmentConfig(Config):
    """Configuración para desarrollo local"""
    DEBUG = True
    FLASK_ENV = 'development'
    
    # Base de datos local
    DB_HOST = 'localhost'
    DB_PORT = '5432'
    DB_NAME = 'turnero_medico_dev'


class ProductionConfig(Config):
    """Configuración para producción (Render)"""
    DEBUG = False
    FLASK_ENV = 'production'
    
    # En producción, usar DATABASE_URL de Render
    # Se configura automáticamente en Render


# Diccionario de configuraciones
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}