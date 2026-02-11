#!/usr/bin/env python3
"""
Script de inicialización del sistema de Turnero Médico
Este script ayuda a configurar el proyecto por primera vez
"""

import os
import sys
import secrets

def generate_secret_key():
    """Genera una clave secreta segura"""
    return secrets.token_urlsafe(32)

def create_env_file():
    """Crea el archivo .env con configuración básica"""
    if os.path.exists('.env'):
        response = input('.env ya existe. ¿Sobrescribir? (s/N): ')
        if response.lower() != 's':
            print('Manteniendo .env existente')
            return
    
    secret_key = generate_secret_key()
    
    env_content = f"""# Configuración del Turnero Médico
# Generado automáticamente

# Seguridad
SECRET_KEY={secret_key}

# Modo de desarrollo
FLASK_ENV=development
DEBUG=True

# Base de datos (SQLite por defecto para desarrollo local)
# DATABASE_URL=sqlite:///turnero.db

# Configuración de correo (opcional para desarrollo)
# Descomenta y configura si quieres enviar correos reales
# MAIL_SERVER=smtp.gmail.com
# MAIL_PORT=587
# MAIL_USE_TLS=True
# MAIL_USERNAME=tu-correo@gmail.com
# MAIL_PASSWORD=tu-contraseña-de-aplicación

# Puerto
PORT=5000
"""
    
    with open('.env', 'w') as f:
        f.write(env_content)
    
    print('✓ Archivo .env creado exitosamente')

def install_dependencies():
    """Instala las dependencias del proyecto"""
    print('\nInstalando dependencias...')
    os.system(f'{sys.executable} -m pip install -r requirements.txt')
    print('✓ Dependencias instaladas')

def init_database():
    """Inicializa la base de datos"""
    print('\nInicializando base de datos...')
    from config.database import init_db
    from app import create_app
    
    app = create_app()
    with app.app_context():
        init_db()
    
    print('✓ Base de datos inicializada')
    print('\nCredenciales de administrador por defecto:')
    print('  Email: admin@turnero.com')
    print('  Password: admin123')

def main():
    """Función principal"""
    print('=' * 60)
    print('  SISTEMA DE TURNERO MÉDICO - INICIALIZACIÓN')
    print('=' * 60)
    print()
    
    print('Este script configurará el proyecto para su primer uso.\n')
    
    # Paso 1: Crear .env
    print('[1/3] Creando archivo de configuración (.env)...')
    create_env_file()
    
    # Paso 2: Instalar dependencias
    print('\n[2/3] Instalando dependencias...')
    response = input('¿Deseas instalar las dependencias ahora? (S/n): ')
    if response.lower() != 'n':
        install_dependencies()
    else:
        print('Saltando instalación de dependencias')
        print('Recuerda ejecutar: pip install -r requirements.txt')
    
    # Paso 3: Inicializar BD
    print('\n[3/3] Inicializando base de datos...')
    response = input('¿Deseas inicializar la base de datos ahora? (S/n): ')
    if response.lower() != 'n':
        try:
            init_database()
        except Exception as e:
            print(f'Error inicializando base de datos: {e}')
            print('Intenta ejecutar manualmente: python app.py')
    else:
        print('Saltando inicialización de base de datos')
    
    print('\n' + '=' * 60)
    print('  CONFIGURACIÓN COMPLETADA')
    print('=' * 60)
    print('\nPara iniciar el servidor, ejecuta:')
    print('  python app.py')
    print('\nLuego visita: http://localhost:5000')
    print()

if __name__ == '__main__':
    main()
