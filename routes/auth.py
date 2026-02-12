from flask import Blueprint, render_template, request, redirect, url_for, flash, session
from config.database import SessionLocal
from models.models import User, PasswordResetToken
from utils.auth import (
    verify_password, 
    hash_password, 
    generate_reset_token, 
    get_token_expiry,
    is_token_valid,
    validate_password_strength
)
from utils.email_sender import send_password_reset_email
from datetime import datetime

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    """Página de inicio de sesión"""
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        
        if not email or not password:
            flash('Por favor completa todos los campos', 'error')
            return render_template('login.html')
        
        db = SessionLocal()
        try:
            # Buscar usuario
            user = db.query(User).filter(User.email == email).first()
            
            if not user:
                flash('Correo o contraseña incorrectos', 'error')
                return render_template('login.html')
            
            # Verificar contraseña
            if not verify_password(password, user.password):
                flash('Correo o contraseña incorrectos', 'error')
                return render_template('login.html')
            
            # Verificar que el usuario esté activo
            if not user.is_active:
                flash('Tu cuenta está desactivada. Contacta al administrador.', 'error')
                return render_template('login.html')
            
            # Crear sesión
            session['user_id'] = user.id
            session['user_name'] = user.name
            session['user_email'] = user.email
            session['user_role'] = user.role.value
            session['user_consecutive'] = user.consecutive
            
            if user.assigned_screen:
                session['assigned_screen'] = user.assigned_screen
            
            flash(f'¡Bienvenido {user.name}!', 'success')
            
            # ✅ MARCAR NUEVA PESTAÑA: agregamos `new_tab` para inicializar sessionStorage en el cliente
            return redirect(url_for('main.dashboard', new_tab=1))
                
        except Exception as e:
            print(f"❌ Error en login: {e}")
            import traceback
            traceback.print_exc()
            flash('Ocurrió un error. Por favor intenta nuevamente.', 'error')
            return render_template('login.html')
        finally:
            db.close()
    
    # GET: Mostrar formulario de login
    return render_template('login.html')


@auth_bp.route('/logout')
def logout():
    """Cerrar sesión"""
    session.clear()
    flash('Sesión cerrada exitosamente', 'info')
    return redirect(url_for('auth.login'))


@auth_bp.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    """Página para solicitar recuperación de contraseña"""
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        mode = request.form.get('mode', 'registered')  # 'registered' o 'test'
        test_name = request.form.get('test_name', '').strip()
        
        if not email:
            flash('Por favor ingresa tu correo electrónico', 'error')
            return render_template('forgot_password.html')
        
        db = SessionLocal()
        try:
            # ⭐ MODO PRUEBA: Permite enviar a cualquier Gmail
            if mode == 'test':
                # Validar que sea Gmail
                if not email.endswith('@gmail.com'):
                    flash('En modo de prueba solo se permiten correos @gmail.com', 'error')
                    return render_template('forgot_password.html')
                
                print(f"\n{'='*60}")
                print(f"🧪 MODO PRUEBA - Forgot Password")
                print(f"{'='*60}")
                print(f"Email destino: {email}")
                print(f"Nombre: {test_name or 'Usuario de Prueba'}")
                
                # Buscar si el usuario existe (para poder resetear después)
                user = db.query(User).filter(User.email == email).first()
                
                if user:
                    print(f"✓ Usuario encontrado en sistema:")
                    print(f"  - ID: {user.id}")
                    print(f"  - Nombre: {user.name}")
                    print(f"  - Rol: {user.role.value}")
                    
                    # Generar token real
                    token = generate_reset_token()
                    expires_at = get_token_expiry(minutes=5)
                    
                    reset_token = PasswordResetToken(
                        user_id=user.id,
                        token=token,
                        expires_at=expires_at,
                        used=False
                    )
                    db.add(reset_token)
                    db.commit()
                    
                    reset_url = url_for('auth.reset_password', token=token, _external=True)
                    recipient_name = user.name
                    
                else:
                    print(f"⚠ Usuario NO encontrado en sistema")
                    print(f"  Se enviará correo informativo (sin token válido)")
                    
                    # Crear token falso solo para demostración
                    token = generate_reset_token()
                    reset_url = url_for('auth.reset_password', token=token, _external=True)
                    recipient_name = test_name or 'Usuario de Prueba'
                
                print(f"Token: {token[:20]}...")
                print(f"URL: {reset_url}")
                
                # Enviar correo de prueba
                from utils.email_sender import send_test_password_reset_email
                email_sent = send_test_password_reset_email(
                    user_email=email,
                    user_name=recipient_name,
                    reset_url=reset_url,
                    is_registered=user is not None
                )
                
                print(f"Correo enviado: {'✓ SÍ' if email_sent else '✗ NO'}")
                print(f"{'='*60}\n")
                
                if email_sent:
                    if user:
                        flash(f'✅ Correo de prueba enviado a {email}. El enlace es VÁLIDO porque el usuario está registrado.', 'success')
                    else:
                        flash(f'✅ Correo de prueba enviado a {email}. ⚠️ El enlace NO funcionará porque el correo no está registrado en el sistema.', 'warning')
                else:
                    flash('Error al enviar el correo de prueba. Verifica la configuración SMTP.', 'error')
                
                return redirect(url_for('auth.login'))
            
            # ⭐ MODO NORMAL: Solo usuarios registrados
            else:
                user = db.query(User).filter(User.email == email).first()
                
                print(f"\n{'='*60}")
                print(f"🔍 MODO NORMAL - Forgot Password")
                print(f"{'='*60}")
                print(f"Email ingresado: {email}")
                print(f"Usuario encontrado: {'SÍ' if user else 'NO'}")
                
                if user:
                    print(f"  - ID: {user.id}")
                    print(f"  - Nombre: {user.name}")
                    print(f"  - Email: {user.email}")
                    print(f"  - Activo: {user.is_active}")
                    
                    # Generar token de reseteo
                    token = generate_reset_token()
                    expires_at = get_token_expiry(minutes=5)
                    
                    print(f"  - Token generado: {token[:20]}...")
                    print(f"  - Expira: {expires_at}")
                    
                    # Guardar token en BD
                    reset_token = PasswordResetToken(
                        user_id=user.id,
                        token=token,
                        expires_at=expires_at,
                        used=False
                    )
                    db.add(reset_token)
                    db.commit()
                    print(f"  - Token guardado en BD: ✓")
                    
                    # Construir URL de reseteo
                    reset_url = url_for(
                        'auth.reset_password', 
                        token=token, 
                        _external=True
                    )
                    
                    print(f"  - URL de reseteo: {reset_url}")
                    
                    # Enviar correo
                    print(f"  - Intentando enviar correo...")
                    email_sent = send_password_reset_email(
                        user_email=user.email,
                        user_name=user.name,
                        reset_url=reset_url
                    )
                    
                    print(f"  - Correo enviado: {'✓ SÍ' if email_sent else '✗ NO'}")
                    
                    if not email_sent:
                        print(f"{'='*60}\n")
                        flash('Hubo un error al enviar el correo. Por favor intenta nuevamente.', 'error')
                        return render_template('forgot_password.html')
                else:
                    print(f"  - No se encontró usuario con ese email")
                
                print(f"{'='*60}\n")
                
                # Siempre mostrar éxito (seguridad)
                flash('Si el correo existe en nuestro sistema, recibirás un enlace de recuperación en unos momentos.', 'success')
                return redirect(url_for('auth.login'))
            
        except Exception as e:
            print(f"❌ Error en forgot_password: {e}")
            import traceback
            traceback.print_exc()
            flash('Ocurrió un error. Por favor intenta nuevamente.', 'error')
            return render_template('forgot_password.html')
        finally:
            db.close()
    
    return render_template('forgot_password.html')


@auth_bp.route('/reset-password/<token>', methods=['GET', 'POST'])
def reset_password(token):
    """Página para restablecer contraseña con token"""
    db = SessionLocal()
    
    try:
        # Buscar token en BD
        token_record = db.query(PasswordResetToken).filter(
            PasswordResetToken.token == token
        ).first()
        
        # Validar token
        if not is_token_valid(token_record):
            flash('El enlace de recuperación es inválido o ha expirado. Solicita uno nuevo.', 'error')
            return redirect(url_for('auth.forgot_password'))
        
        if request.method == 'POST':
            # ✅ CORREGIDO: Usar los nombres correctos de los campos del formulario
            password = request.form.get('new_password', '').strip()
            password_confirm = request.form.get('confirm_password', '').strip()
            
            print(f"\n{'='*60}")
            print(f"🔐 DEBUG - Reset Password")
            print(f"{'='*60}")
            print(f"Password recibido: {'***' if password else 'VACÍO'}")
            print(f"Confirm recibido: {'***' if password_confirm else 'VACÍO'}")
            print(f"Longitud password: {len(password)}")
            print(f"Longitud confirm: {len(password_confirm)}")
            
            # Validaciones
            if not password or not password_confirm:
                flash('Debes completar ambos campos', 'error')
                return render_template('reset_password.html', token=token)
            
            if password != password_confirm:
                flash('Las contraseñas no coinciden', 'error')
                return render_template('reset_password.html', token=token)
            
            # Validar fortaleza
            is_valid, message = validate_password_strength(password)
            if not is_valid:
                flash(message, 'error')
                return render_template('reset_password.html', token=token)
            
            # Actualizar contraseña
            user = db.query(User).filter(User.id == token_record.user_id).first()
            if user:
                print(f"  - Usuario encontrado: {user.email}")
                
                # ✅ HASHEAR LA CONTRASEÑA ANTES DE GUARDARLA
                new_password_hash = hash_password(password)
                print(f"  - Hash generado: {new_password_hash[:30]}...")
                
                user.password = new_password_hash
                token_record.used = True
                token_record.used_at = datetime.utcnow()
                
                db.commit()
                print(f"  - Contraseña actualizada en BD: ✓")
                print(f"  - Token marcado como usado: ✓")
                print(f"{'='*60}\n")
                
                flash('¡Contraseña actualizada exitosamente! Ya puedes iniciar sesión.', 'success')
                return redirect(url_for('auth.login'))
            else:
                print(f"  - ❌ Usuario NO encontrado")
                print(f"{'='*60}\n")
                flash('Usuario no encontrado', 'error')
                return redirect(url_for('auth.forgot_password'))
        
        # GET: Mostrar formulario
        return render_template('reset_password.html', token=token)
        
    except Exception as e:
        print(f"❌ Error en reset_password: {e}")
        import traceback
        traceback.print_exc()
        flash('Ocurrió un error. Por favor intenta nuevamente.', 'error')
        return redirect(url_for('auth.forgot_password'))
    finally:
        db.close()