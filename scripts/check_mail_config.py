#!/usr/bin/env python3
"""
Script para diagnosticar la configuración de correo en Render.
Ejecuta esto en Render Shell si hay problemas con el envío de correos.

Uso:
  python scripts/check_mail_config.py
"""
import os
from dotenv import load_dotenv

load_dotenv()

print("=" * 60)
print("  DIAGNÓSTICO CONFIGURACIÓN DE CORREO")
print("=" * 60)

# Verificar variables de entorno
variables = {
    'MAIL_SERVER': os.environ.get('MAIL_SERVER'),
    'MAIL_PORT': os.environ.get('MAIL_PORT'),
    'MAIL_USE_TLS': os.environ.get('MAIL_USE_TLS'),
    'MAIL_USERNAME': os.environ.get('MAIL_USERNAME'),
    'MAIL_PASSWORD': '***' + os.environ.get('MAIL_PASSWORD', '')[-4:] if os.environ.get('MAIL_PASSWORD') else 'NO CONFIGURADA',
}

print("\n📧 Variables de Entorno:")
print("-" * 60)

for key, value in variables.items():
    status = "✓" if value and value != "NO CONFIGURADA" else "✗"
    print(f"{status} {key:20} = {value}")

# Validación
print("\n🔍 Validación:")
print("-" * 60)

errors = []
warnings = []

if not os.environ.get('MAIL_USERNAME'):
    errors.append("MAIL_USERNAME no está configurado")
if not os.environ.get('MAIL_PASSWORD'):
    errors.append("MAIL_PASSWORD no está configurado")
if not os.environ.get('MAIL_SERVER'):
    warnings.append("MAIL_SERVER no está configurado (valor por defecto: smtp.gmail.com)")
if not os.environ.get('MAIL_PORT'):
    warnings.append("MAIL_PORT no está configurado (valor por defecto: 587)")

if errors:
    print("\n❌ ERRORES ENCONTRADOS:")
    for error in errors:
        print(f"  • {error}")
    print("\n📍 Solución en Render:")
    print("  1. Ve a tu servicio Web en Render")
    print("  2. Abre Environment")
    print("  3. Agrega variables:")
    print("     - MAIL_USERNAME = tu-correo@gmail.com")
    print("     - MAIL_PASSWORD = [contraseña de aplicación Gmail]")
    print("  4. Haz clic en Deploy Changes")
else:
    print("✅ Todas las variables requeridas están configuradas")

if warnings:
    print("\n⚠️  ADVERTENCIAS:")
    for warning in warnings:
        print(f"  • {warning}")

print("\n🔗 Cómo generar contraseña de aplicación de Gmail:")
print("-" * 60)
print("1. Abre https://myaccount.google.com/apppasswords")
print("2. Selecciona 'Mail' y 'Windows Computer' (o el que uses)")
print("3. Copia la contraseña de 16 caracteres generada")
print("4. Pega esa contraseña en MAIL_PASSWORD en Render")

print("\n" + "=" * 60)

# Intentar conexión SMTP (solo si credenciales están presentes)
if os.environ.get('MAIL_USERNAME') and os.environ.get('MAIL_PASSWORD'):
    print("\n🧪 Intentando conexión SMTP...")
    print("-" * 60)
    
    try:
        import smtplib
        from email.mime.text import MIMEText
        
        server_name = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
        port = int(os.environ.get('MAIL_PORT', 587))
        username = os.environ.get('MAIL_USERNAME')
        password = os.environ.get('MAIL_PASSWORD')
        
        print(f"Conectando a {server_name}:{port}...")
        
        server = smtplib.SMTP(server_name, port, timeout=5)
        server.starttls()
        
        print(f"Autenticando con {username}...")
        server.login(username, password)
        
        print(f"✅ Conexión SMTP exitosa")
        
        server.quit()
        
    except smtplib.SMTPAuthenticationError as e:
        print(f"❌ Error de autenticación: {e}")
        print("   Verifica que MAIL_PASSWORD sea la contraseña de aplicación de Gmail, no tu contraseña normal")
        
    except smtplib.SMTPException as e:
        print(f"❌ Error SMTP: {e}")
        
    except Exception as e:
        print(f"❌ Error de conexión: {type(e).__name__}: {e}")

print("\n" + "=" * 60 + "\n")
