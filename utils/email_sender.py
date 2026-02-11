"""
Utilidad para envío de correos electrónicos
"""
from flask_mail import Message
from extensions import mail
from datetime import datetime
import os
import smtplib
import threading

# Verificar si las credenciales de correo están configuradas
def check_mail_config():
    """Verificar que las credenciales de correo estén presentes"""
    config = {
        'MAIL_SERVER': os.environ.get('MAIL_SERVER', ''),
        'MAIL_PORT': os.environ.get('MAIL_PORT', ''),
        'MAIL_USERNAME': os.environ.get('MAIL_USERNAME', ''),
        'MAIL_PASSWORD': os.environ.get('MAIL_PASSWORD', ''),
    }
    
    missing = [k for k, v in config.items() if not v]
    if missing:
        print(f"⚠️  Credenciales de correo incompletas: falta {', '.join(missing)}")
        return False
    return True

def send_email_async(msg, app):
    """Enviar correo de forma asíncrona (en background thread)"""
    with app.app_context():
        try:
            mail.send(msg)
            print(f"✅ Correo enviado (async)")
            return True
        except Exception as e:
            print(f"❌ Error en thread de correo: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            return False

def send_password_reset_email(user_email, user_name, reset_url):
    """Enviar correo de recuperación de contraseña (no-bloqueante)"""
    try:
        # Validar configuración de correo
        if not check_mail_config():
            print(f"❌ Error: Credenciales de correo no configuradas en Render")
            return False
        
        msg = Message(
            subject='Recuperación de Contraseña - Turnero Médico',
            recipients=[user_email],
            html=f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; line-height: 1.6; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                              color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
                    .content {{ background: #f9fafb; padding: 30px; }}
                    .button {{ background: #667eea; color: white; padding: 14px 28px; 
                              text-decoration: none; border-radius: 6px; display: inline-block; 
                              margin: 20px 0; font-weight: 600; }}
                    .footer {{ color: #6b7280; font-size: 13px; text-align: center; 
                              padding: 20px; border-top: 1px solid #e5e7eb; }}
                    .warning {{ background: #fef3c7; border-left: 4px solid #f59e0b; 
                               padding: 12px; margin: 20px 0; border-radius: 4px; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔐 Recuperación de Contraseña</h1>
                    </div>
                    <div class="content">
                        <p>Hola <strong>{user_name}</strong>,</p>
                        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>Turnero Médico</strong>.</p>
                        <p>Haz clic en el siguiente botón para crear una nueva contraseña:</p>
                        <div style="text-align: center;">
                            <a href="{reset_url}" class="button">Restablecer Contraseña</a>
                        </div>
                        <div class="warning">
                            <p style="margin: 0;"><strong>⚠️ Importante:</strong></p>
                            <ul style="margin: 8px 0 0 20px;">
                                <li>Este enlace expirará en <strong>5 minutos</strong></li>
                                <li>Solo puedes usar este enlace una vez</li>
                                <li>Si no solicitaste este cambio, ignora este correo</li>
                            </ul>
                        </div>
                        <p>O copia y pega este enlace en tu navegador:</p>
                        <p style="word-break: break-all; color: #667eea; font-size: 12px;">{reset_url}</p>
                    </div>
                    <div class="footer">
                        <p>Este correo fue enviado automáticamente por <strong>Turnero Médico</strong></p>
                        <p>Fecha: {datetime.utcnow().strftime('%d/%m/%Y %H:%M UTC')}</p>
                    </div>
                </div>
            </body>
            </html>
            """
        )
        
        # Obtener la app para ejecutar en contexto
        from flask import current_app
        app = current_app._get_current_object()
        
        print(f"✅ Enviando correo a {user_email} (async)...")
        # Enviar en thread background para no bloquear la request
        thread = threading.Thread(target=send_email_async, args=(msg, app))
        thread.daemon = False  # Esperar a que termine antes de cerrar app
        thread.start()
        
        # Retornar True inmediatamente (el correo se envía en background)
        print(f"✅ Correo en cola para {user_email}")
        return True
        
    except Exception as e:
        print(f"❌ Error preparando correo para {user_email}: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False


def send_test_password_reset_email(user_email, user_name, reset_url, is_registered=False):
    """Enviar correo de prueba para reseteo de contraseña (no-bloqueante)"""
    try:
        msg = Message(
            subject='[PRUEBA] Recuperación de Contraseña - Turnero Médico',
            recipients=[user_email],
            html=f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; line-height: 1.6; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); 
                              color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
                    .content {{ background: #f9fafb; padding: 30px; }}
                    .button {{ background: #667eea; color: white; padding: 14px 28px; 
                              text-decoration: none; border-radius: 6px; display: inline-block; 
                              margin: 20px 0; font-weight: 600; }}
                    .footer {{ color: #6b7280; font-size: 13px; text-align: center; 
                              padding: 20px; border-top: 1px solid #e5e7eb; }}
                    .warning {{ background: #fef3c7; border-left: 4px solid #f59e0b; 
                               padding: 12px; margin: 20px 0; border-radius: 4px; }}
                    .test-badge {{ background: #fbbf24; color: #78350f; padding: 6px 12px; 
                                  border-radius: 20px; font-weight: 600; display: inline-block; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🧪 CORREO DE PRUEBA</h1>
                        <span class="test-badge">MODO PRUEBA</span>
                    </div>
                    <div class="content">
                        <p>Hola <strong>{user_name}</strong>,</p>
                        <p>Este es un <strong>correo de prueba</strong> del sistema de recuperación de contraseña de <strong>Turnero Médico</strong>.</p>
                        
                        {'<div style="background: #d1fae5; border-left: 4px solid #10b981; padding: 12px; margin: 20px 0; border-radius: 4px;"><p style="margin: 0;"><strong>✅ Usuario registrado:</strong> Este correo está registrado en el sistema, el enlace funcionará correctamente.</p></div>' if is_registered else '<div class="warning"><p style="margin: 0;"><strong>⚠️ Usuario NO registrado:</strong> Este correo NO está en el sistema. El enlace no funcionará. Debe ser creado desde el panel de administración.</p></div>'}
                        
                        <p>Enlace de prueba (expira en 5 minutos):</p>
                        <div style="text-align: center;">
                            <a href="{reset_url}" class="button">Ir al Enlace de Prueba</a>
                        </div>
                        <p>O copia y pega este enlace:</p>
                        <p style="word-break: break-all; color: #667eea; font-size: 12px;">{reset_url}</p>
                    </div>
                    <div class="footer">
                        <p><strong>🧪 Correo de prueba - Turnero Médico</strong></p>
                        <p>Fecha: {datetime.utcnow().strftime('%d/%m/%Y %H:%M UTC')}</p>
                    </div>
                </div>
            </body>
            </html>
            """
        )
        
        # Obtener la app para ejecutar en contexto
        from flask import current_app
        app = current_app._get_current_object()
        
        print(f"✅ Enviando correo de prueba a {user_email} (async)...")
        thread = threading.Thread(target=send_email_async, args=(msg, app))
        thread.daemon = False
        thread.start()
        
        print(f"✅ Correo de prueba en cola para {user_email}")
        return True
        
    except Exception as e:
        print(f"❌ Error preparando correo de prueba para {user_email}: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False


def send_admin_message_email(recipient_email, recipient_name, sender_name, subject, message):
    """Enviar mensaje desde admin a usuario (no-bloqueante)"""
    try:
        msg = Message(
            subject=f'[Turnero Médico] {subject}',
            recipients=[recipient_email],
            html=f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; line-height: 1.6; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                              color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
                    .content {{ background: #f9fafb; padding: 30px; }}
                    .message-box {{ background: white; border-left: 4px solid #667eea; 
                                   padding: 20px; margin: 20px 0; border-radius: 4px; 
                                   box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
                    .footer {{ color: #6b7280; font-size: 13px; text-align: center; 
                              padding: 20px; border-top: 1px solid #e5e7eb; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📧 Mensaje del Administrador</h1>
                    </div>
                    <div class="content">
                        <p>Hola <strong>{recipient_name}</strong>,</p>
                        <p>Has recibido un mensaje de <strong>{sender_name}</strong>:</p>
                        <div class="message-box">
                            <p style="white-space: pre-wrap;">{message}</p>
                        </div>
                    </div>
                    <div class="footer">
                        <p>Este correo fue enviado por <strong>{sender_name}</strong> desde <strong>Turnero Médico</strong></p>
                        <p>Fecha: {datetime.utcnow().strftime('%d/%m/%Y %H:%M UTC')}</p>
                    </div>
                </div>
            </body>
            </html>
            """
        )
        
        from flask import current_app
        app = current_app._get_current_object()
        
        print(f"✅ Enviando mensaje a {recipient_email} (async)...")
        thread = threading.Thread(target=send_email_async, args=(msg, app))
        thread.daemon = False
        thread.start()
        
        print(f"✅ Mensaje en cola para {recipient_email}")
        return True
        
    except Exception as e:
        print(f"❌ Error preparando mensaje para {recipient_email}: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False


def send_welcome_email(user_email, user_name, password, role):
    """Enviar correo de bienvenida a nuevo usuario (no-bloqueante)"""
    try:
        role_names = {
            'admin': 'Administrador',
            'reception': 'Recepción',
            'doctor': 'Doctor',
            'registro': 'Registro'
        }
        
        msg = Message(
            subject='Bienvenido a Turnero Médico - Credenciales de Acceso',
            recipients=[user_email],
            html=f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; line-height: 1.6; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                              color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
                    .content {{ background: #f9fafb; padding: 30px; }}
                    .credentials {{ background: white; border: 2px solid #667eea; 
                                   padding: 20px; margin: 20px 0; border-radius: 8px; }}
                    .footer {{ color: #6b7280; font-size: 13px; text-align: center; 
                              padding: 20px; border-top: 1px solid #e5e7eb; }}
                    .warning {{ background: #fef3c7; border-left: 4px solid #f59e0b; 
                               padding: 12px; margin: 20px 0; border-radius: 4px; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎉 ¡Bienvenido!</h1>
                    </div>
                    <div class="content">
                        <p>Hola <strong>{user_name}</strong>,</p>
                        <p>Tu cuenta en <strong>Turnero Médico</strong> ha sido creada exitosamente.</p>
                        <div class="credentials">
                            <p><strong>📧 Correo:</strong> {user_email}</p>
                            <p><strong>🔑 Contraseña temporal:</strong> {password}</p>
                            <p><strong>👤 Rol:</strong> {role_names.get(role, role)}</p>
                        </div>
                        <div class="warning">
                            <p style="margin: 0;"><strong>⚠️ Importante:</strong></p>
                            <ul style="margin: 8px 0 0 20px;">
                                <li>Cambia tu contraseña después del primer inicio de sesión</li>
                                <li>No compartas estas credenciales</li>
                            </ul>
                        </div>
                    </div>
                    <div class="footer">
                        <p>Este correo fue enviado automáticamente por <strong>Turnero Médico</strong></p>
                        <p>Fecha: {datetime.utcnow().strftime('%d/%m/%Y %H:%M UTC')}</p>
                    </div>
                </div>
            </body>
            </html>
            """
        )
        
        from flask import current_app
        app = current_app._get_current_object()
        
        print(f"✅ Enviando correo de bienvenida a {user_email} (async)...")
        thread = threading.Thread(target=send_email_async, args=(msg, app))
        thread.daemon = False
        thread.start()
        
        print(f"✅ Correo de bienvenida en cola para {user_email}")
        return True
        
    except Exception as e:
        print(f"❌ Error preparando correo de bienvenida para {user_email}: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False