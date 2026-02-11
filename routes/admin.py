from flask import Blueprint, render_template, request, redirect, url_for, flash, session, jsonify
from config.database import SessionLocal
from models.models import User, Screen, RoleEnum
from utils.auth import login_required, role_required, hash_password
from utils.email_sender import send_admin_message_email
from flask import current_app
import secrets

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')

@admin_bp.route('/users')
@login_required
@role_required('admin')
def users():
    """Lista de usuarios"""
    db = SessionLocal()
    try:
        users = db.query(User).all()
        return render_template('admin/users.html', users=users)
    finally:
        db.close()

@admin_bp.route('/create-user', methods=['POST'])
@login_required
@role_required('admin')
def create_user():
    """Crear nuevo usuario"""
    name = request.form.get('name')
    email = request.form.get('email')
    password = request.form.get('password')
    role = request.form.get('role')
    
    db = SessionLocal()
    try:
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            return jsonify({'success': False, 'error': 'El correo ya está registrado'}), 400
        
        # Obtener consecutivo correcto por rol
        max_user = db.query(User).filter(User.role == RoleEnum(role)).order_by(User.consecutive.desc()).first()
        consecutive = (max_user.consecutive + 1) if max_user else 1
        
        user = User(
            name=name,
            email=email,
            password=hash_password(password),
            role=RoleEnum(role),
            consecutive=consecutive
        )
        db.add(user)
        db.commit()
        
        # Enviar correo de bienvenida (opcional)
        try:
            from utils.email_sender import send_welcome_email
            send_welcome_email(
                user_email=email,
                user_name=name,
                password=password,
                role=role
            )
        except Exception as e:
            print(f"Error enviando correo de bienvenida: {e}")
        
        return jsonify({'success': True, 'message': 'Usuario creado exitosamente'})
    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

@admin_bp.route('/toggle-user/<int:user_id>', methods=['POST'])
@login_required
@role_required('admin')
def toggle_user(user_id):
    """Habilitar/deshabilitar usuario"""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.is_active = not user.is_active
            db.commit()
            status = 'habilitado' if user.is_active else 'deshabilitado'
            return jsonify({'success': True, 'message': f'Usuario {status}', 'is_active': user.is_active})
        return jsonify({'success': False, 'error': 'Usuario no encontrado'}), 404
    finally:
        db.close()

@admin_bp.route('/delete-user/<int:user_id>', methods=['POST'])
@login_required
@role_required('admin')
def delete_user(user_id):
    """Eliminar usuario permanentemente y reorganizar consecutivos"""
    db = SessionLocal()
    try:
        # Verificar que no sea el propio admin
        if user_id == session.get('user_id'):
            return jsonify({
                'success': False, 
                'error': 'No puedes eliminar tu propia cuenta mientras estás conectado'
            }), 400
        
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            return jsonify({'success': False, 'error': 'Usuario no encontrado'}), 404
        
        # Guardar información para reorganización
        user_name = user.name
        user_email = user.email
        user_role = user.role
        user_consecutive = user.consecutive
        
        # Verificar si es el último administrador
        if user.role == RoleEnum.ADMIN:
            admin_count = db.query(User).filter(User.role == RoleEnum.ADMIN).count()
            if admin_count <= 1:
                return jsonify({
                    'success': False,
                    'error': 'No puedes eliminar al último administrador del sistema'
                }), 400
        
        print(f"\n{'='*60}")
        print(f"🗑️  Eliminando usuario")
        print(f"{'='*60}")
        print(f"ID: {user.id}")
        print(f"Nombre: {user_name}")
        print(f"Email: {user_email}")
        print(f"Rol: {user.role.value}")
        print(f"Consecutivo: {user_consecutive}")
        print(f"{'='*60}\n")
        
        # Eliminar usuario
        db.delete(user)
        db.commit()
        
        print(f"✅ Usuario eliminado exitosamente")
        
        # ✅ REORGANIZAR CONSECUTIVOS DEL MISMO ROL
        print(f"\n{'='*60}")
        print(f"🔄 Reorganizando consecutivos para rol: {user_role.value}")
        print(f"{'='*60}")
        
        # Obtener todos los usuarios del mismo rol, ordenados por consecutivo
        users_same_role = db.query(User).filter(
            User.role == user_role
        ).order_by(User.consecutive).all()
        
        print(f"Usuarios encontrados: {len(users_same_role)}")
        
        # Reasignar consecutivos secuenciales (1, 2, 3, ...)
        for index, user_to_update in enumerate(users_same_role, start=1):
            old_consecutive = user_to_update.consecutive
            user_to_update.consecutive = index
            print(f"  - {user_to_update.name}: {old_consecutive} → {index}")
        
        db.commit()
        
        print(f"✅ Consecutivos reorganizados exitosamente")
        print(f"{'='*60}\n")
        
        return jsonify({
            'success': True, 
            'message': f'Usuario {user_name} eliminado y consecutivos reorganizados exitosamente'
        })
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error eliminando usuario: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Error al eliminar el usuario'
        }), 500
    finally:
        db.close()

# ============================================================
# ✅ GESTIÓN DE PANTALLAS
# ============================================================

@admin_bp.route('/screens')
@login_required
@role_required('admin')
def screens():
    """Gestión de pantallas"""
    db = SessionLocal()
    try:
        screens = db.query(Screen).all()
        receptions = db.query(User).filter(User.role == RoleEnum.RECEPTION).all()
        
        return render_template('admin/screens.html', screens=screens, receptions=receptions)
    finally:
        db.close()

@admin_bp.route('/screens/data')
@login_required
@role_required('admin')
def screens_data():
    """Obtener datos de pantallas en JSON"""
    db = SessionLocal()
    try:
        screens = db.query(Screen).all()
        
        screens_data = []
        for screen in screens:
            # Obtener usuarios asignados a esta pantalla
            assigned_users = db.query(User).filter(
                User.assigned_screen == screen.screen_number
            ).all()
            
            screens_data.append({
                'id': screen.id,
                'screen_number': screen.screen_number,
                'is_active': screen.is_active,
                'assigned_users_count': len(assigned_users),
                'assigned_users': [{
                    'id': u.id,
                    'name': u.name,
                    'email': u.email,
                    'role': u.role.value,
                    'consecutive': u.consecutive
                } for u in assigned_users]
            })
        
        return jsonify(screens_data)
    finally:
        db.close()

@admin_bp.route('/create-screen', methods=['POST'])
@login_required
@role_required('admin')
def create_screen():
    """Crear pantalla con usuarios asignados"""
    data = request.get_json()
    
    screen_number = data.get('screen_number')
    assigned_user_ids = data.get('assigned_users', [])
    
    if not screen_number:
        return jsonify({'success': False, 'error': 'Número de pantalla requerido'}), 400
    
    db = SessionLocal()
    try:
        # Verificar si ya existe una pantalla con ese número
        existing = db.query(Screen).filter(Screen.screen_number == screen_number).first()
        if existing:
            return jsonify({'success': False, 'error': f'Ya existe una pantalla con el número {screen_number}'}), 400
        
        print(f"\n{'='*60}")
        print(f"📺 Creando pantalla")
        print(f"{'='*60}")
        print(f"Número: {screen_number}")
        print(f"Usuarios a asignar: {assigned_user_ids}")
        
        # Crear pantalla
        screen = Screen(
            screen_number=screen_number,
            is_active=True
        )
        db.add(screen)
        db.flush()  # Para obtener el ID de la pantalla
        
        print(f"✅ Pantalla creada con ID: {screen.id}")
        
        # Asignar usuarios a la pantalla
        if assigned_user_ids:
            for user_id in assigned_user_ids:
                user = db.query(User).filter(User.id == user_id).first()
                if user:
                    # Verificar que sea usuario de recepción
                    if user.role != RoleEnum.RECEPTION:
                        print(f"⚠️  Usuario {user.name} no es de recepción, saltando...")
                        continue
                    
                    user.assigned_screen = screen_number
                    print(f"  ✓ Asignado: {user.name} (reception {user.consecutive})")
        
        db.commit()
        
        print(f"✅ Pantalla {screen_number} creada exitosamente")
        print(f"{'='*60}\n")
        
        return jsonify({
            'success': True,
            'message': f'Pantalla {screen_number} creada exitosamente',
            'screen_id': screen.id
        })
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error creando pantalla: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Error al crear la pantalla'
        }), 500
    finally:
        db.close()

@admin_bp.route('/delete-screen/<int:screen_id>', methods=['POST'])
@login_required
@role_required('admin')
def delete_screen(screen_id):
    """Eliminar pantalla y desasignar usuarios"""
    db = SessionLocal()
    try:
        screen = db.query(Screen).filter(Screen.id == screen_id).first()
        
        if not screen:
            return jsonify({'success': False, 'error': 'Pantalla no encontrada'}), 404
        
        screen_number = screen.screen_number
        
        print(f"\n{'='*60}")
        print(f"🗑️  Eliminando pantalla {screen_number}")
        print(f"{'='*60}")
        
        # Desasignar todos los usuarios de esta pantalla
        users_with_screen = db.query(User).filter(User.assigned_screen == screen_number).all()
        
        for user in users_with_screen:
            user.assigned_screen = None
            print(f"  ✓ Desasignado: {user.name}")
        
        # Eliminar pantalla
        db.delete(screen)
        db.commit()
        
        print(f"✅ Pantalla {screen_number} eliminada exitosamente")
        print(f"{'='*60}\n")
        
        return jsonify({
            'success': True,
            'message': f'Pantalla {screen_number} eliminada exitosamente'
        })
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error eliminando pantalla: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Error al eliminar la pantalla'
        }), 500
    finally:
        db.close()

@admin_bp.route('/assign-screen', methods=['POST'])
@login_required
@role_required('admin')
def assign_screen():
    """Asignar pantalla a recepción"""
    screen_id = request.form.get('screen_id', type=int)
    reception_id = request.form.get('reception_id', type=int)
    
    db = SessionLocal()
    try:
        screen = db.query(Screen).filter(Screen.id == screen_id).first()
        reception = db.query(User).filter(User.id == reception_id).first()
        
        if screen and reception:
            reception.assigned_screen = screen.screen_number
            screen.assigned_reception = f"{reception.role.value}{reception.consecutive}"
            db.commit()
            return jsonify({'success': True, 'message': 'Pantalla asignada'})
        
        return jsonify({'success': False, 'error': 'Pantalla o recepción no encontrada'}), 404
    finally:
        db.close()

@admin_bp.route('/users/data')
@login_required
@role_required('admin')
def users_data():
    """Obtener datos de usuarios en JSON"""
    db = SessionLocal()
    try:
        users = db.query(User).all()
        users_data = [{
            'id': u.id,
            'name': u.name,
            'email': u.email,
            'role': u.role.value,
            'consecutive': u.consecutive,
            'is_active': u.is_active,
            'assigned_screen': u.assigned_screen
        } for u in users]
        return jsonify(users_data)
    finally:
        db.close()


# ============================================================
# ENVÍO DE MENSAJES
# ============================================================

@admin_bp.route('/users-by-role/<role>')
@login_required
@role_required('admin')
def users_by_role(role):
    """Obtener usuarios filtrados por rol"""
    db = SessionLocal()
    try:
        # Validar que el rol sea válido
        valid_roles = ['admin', 'reception', 'doctor', 'registro']
        if role not in valid_roles:
            return jsonify({
                'success': False,
                'error': f'Rol inválido. Roles válidos: {", ".join(valid_roles)}'
            }), 400
        
        # Obtener usuarios del rol especificado
        users = db.query(User).filter(
            User.role == RoleEnum(role),
            User.is_active == True  # Solo usuarios activos
        ).all()
        
        users_data = [{
            'id': u.id,
            'name': u.name,
            'email': u.email,
            'role': u.role.value,
            'consecutive': u.consecutive
        } for u in users]
        
        return jsonify({
            'success': True,
            'users': users_data,
            'count': len(users_data)
        })
        
    except Exception as e:
        print(f"❌ Error en users_by_role: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Error interno del servidor'
        }), 500
    finally:
        db.close()


@admin_bp.route('/send-email-message', methods=['POST'])
@login_required
@role_required('admin')
def send_email_message():
    """Enviar mensaje por correo a un usuario"""
    data = request.get_json()
    
    user_id = data.get('user_id')
    subject = data.get('subject')
    message = data.get('message')
    
    # Validaciones
    if not user_id or not subject or not message:
        return jsonify({
            'success': False,
            'error': 'Faltan campos requeridos'
        }), 400
    
    db = SessionLocal()
    try:
        # Verificar que el destinatario existe
        recipient = db.query(User).filter(User.id == user_id).first()
        
        if not recipient:
            return jsonify({
                'success': False,
                'error': 'Este correo no existe en el sistema. El usuario debe ser creado desde el panel de administración.'
            }), 404
        
        # Verificar que el usuario esté activo
        if not recipient.is_active:
            return jsonify({
                'success': False,
                'error': f'El usuario {recipient.name} está desactivado. Actívalo primero para enviarle mensajes.'
            }), 400
        
        # Obtener información del remitente (admin actual)
        sender = db.query(User).filter(User.id == session['user_id']).first()
        
        print(f"\n{'='*60}")
        print(f"📧 Enviando mensaje por correo")
        print(f"{'='*60}")
        print(f"De: {sender.name} ({sender.email})")
        print(f"Para: {recipient.name} ({recipient.email})")
        print(f"Asunto: {subject}")
        print(f"{'='*60}\n")
        
        # Enviar correo
        email_sent = send_admin_message_email(
            recipient_email=recipient.email,
            recipient_name=recipient.name,
            sender_name=sender.name,
            subject=subject,
            message=message
        )
        
        if email_sent:
            print(f"✅ Correo enviado exitosamente")
            return jsonify({
                'success': True,
                'message': f'Mensaje enviado exitosamente a {recipient.name}'
            })
        else:
            print(f"❌ Error enviando correo")
            return jsonify({
                'success': False,
                'error': 'Error al enviar el correo. Verifica la configuración SMTP.'
            }), 500
            
    except Exception as e:
        print(f"❌ Error en send_email_message: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Error interno del servidor'
        }), 500
    finally:
        db.close()


# ============================================================
# DIAGNÓSTICO DE CONFIGURACIÓN DE CORREO
# ============================================================

@admin_bp.route('/test-email', methods=['GET', 'POST'])
@login_required
@role_required('admin')
def test_email():
    """Enviar correo de prueba para diagnosticar SMTP"""
    import os
    
    if request.method == 'POST':
        test_recipient = request.form.get('test_email', '').strip().lower()
        
        if not test_recipient:
            return jsonify({
                'success': False,
                'error': 'Por favor ingresa un correo para enviar la prueba'
            }), 400
        
        # Validar que sea un correo válido
        if '@' not in test_recipient:
            return jsonify({
                'success': False,
                'error': 'Correo inválido'
            }), 400
        
        try:
            from utils.email_sender import send_password_reset_email
            from flask import url_for
            
            # Usar el correo del admin como remitente
            admin_email = session.get('user_email', 'admin@turnero.com')
            admin_name = session.get('user_name', 'Admin')
            
            # Crear URL de prueba
            test_url = url_for('auth.login', _external=True)
            
            print(f"\n{'='*60}")
            print(f"🧪 PRUEBA DE CORREO SMTP")
            print(f"{'='*60}")
            print(f"Correo destino: {test_recipient}")
            print(f"URL: {test_url}")
            
            # Intentar enviar
            result = send_password_reset_email(
                user_email=test_recipient,
                user_name='Usuario de Prueba',
                reset_url=test_url
            )
            
            if result:
                print(f"✅ Correo de prueba enviado exitosamente")
                print(f"{'='*60}\n")
                return jsonify({
                    'success': True,
                    'message': f'✅ Correo de prueba enviado exitosamente a {test_recipient}. Revisa tu bandeja (y SPAM).'
                })
            else:
                print(f"❌ Fallo al enviar correo de prueba")
                print(f"{'='*60}\n")
                return jsonify({
                    'success': False,
                    'error': 'Error al enviar correo. Revisa Render Logs para más detalles.'
                }), 500
                
        except Exception as e:
            print(f"❌ Excepción en test_email: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            print(f"{'='*60}\n")
            
            return jsonify({
                'success': False,
                'error': f'{type(e).__name__}: {str(e)}'
            }), 500
    
    # GET: Mostrar formulario de prueba
    return jsonify({
        'message': 'POST a esta ruta con JSON: {"test_email": "tu-correo@gmail.com"}'
    })

@admin_bp.route('/mail-config')
@login_required
@role_required('admin')
def mail_config():
    """Diagnosticar configuración de correo SMTP (solo admin)"""
    import os
    
    try:
        config_status = {
            'MAIL_SERVER': os.environ.get('MAIL_SERVER', 'smtp.gmail.com'),
            'MAIL_PORT': os.environ.get('MAIL_PORT', '587'),
            'MAIL_USE_TLS': os.environ.get('MAIL_USE_TLS', 'True'),
            'MAIL_USERNAME': os.environ.get('MAIL_USERNAME', ''),
            'MAIL_PASSWORD_SET': bool(os.environ.get('MAIL_PASSWORD', False)),
        }
        
        # Intentar conexión
        connection_status = None
        try:
            import smtplib
            
            server = smtplib.SMTP(
                config_status['MAIL_SERVER'],
                int(config_status['MAIL_PORT']),
                timeout=5
            )
            server.starttls()
            
            if config_status['MAIL_USERNAME'] and os.environ.get('MAIL_PASSWORD'):
                server.login(
                    config_status['MAIL_USERNAME'],
                    os.environ.get('MAIL_PASSWORD')
                )
            
            server.quit()
            connection_status = 'success'
        except smtplib.SMTPAuthenticationError:
            connection_status = 'auth_error'
        except Exception as e:
            connection_status = f'connection_error: {str(e)}'
        
        return jsonify({
            'success': True,
            'config': config_status,
            'connection': connection_status
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500