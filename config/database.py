import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Detectar entorno
# Considerar producción si la variable RENDER está presente y no vacía
IS_PRODUCTION = bool(os.environ.get('RENDER'))

# Configuración de base de datos híbrida
if IS_PRODUCTION:
    # PostgreSQL en Render
    DATABASE_URL = os.environ.get('DATABASE_URL', '')
    # Render usa postgres:// pero SQLAlchemy necesita postgresql://
    if DATABASE_URL.startswith('postgres://'):
        DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

    # Si está instalado psycopg (psycopg v3), preferir el dialecto 'psycopg'
    # para evitar dependencias con psycopg2 C-extensions.
    try:
        import importlib
        if DATABASE_URL.startswith('postgresql://') and importlib.util.find_spec('psycopg'):
            # Cambiar a postgresql+psycopg:// para que SQLAlchemy use psycopg (v3)
            DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+psycopg://', 1)
    except Exception:
        pass
else:
    # SQLite para desarrollo local
    DATABASE_URL = 'sqlite:///turnero.db'

# Configurar argumentos de conexión según entorno
if IS_PRODUCTION:
    # En producción (Render) forzamos SSL para PostgreSQL
    # Algunos entornos requieren `sslmode=require` para evitar errores TLS
    connect_args = {
        # Pasar `sslmode` al driver (psycopg/psycopg2).
        'sslmode': os.environ.get('PGSSLMODE', 'require')
    }
else:
    # SQLite local: permitir check_same_thread
    connect_args = {'check_same_thread': False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """Obtener sesión de base de datos"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Inicializar la base de datos"""
    # ✅ CORREGIDO: Eliminar Notification, solo importar los modelos que existen
    from models.models import (
        User, 
        Doctor, 
        Patient, 
        Screen, 
        Multimedia,
        Message,
        PasswordResetToken
    )
    Base.metadata.create_all(bind=engine)
    print("✓ Base de datos inicializada")