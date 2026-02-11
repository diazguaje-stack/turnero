from werkzeug.security import generate_password_hash, check_password_hash
from flask import session, redirect, url_for, flash, request, jsonify
from functools import wraps
import secrets
from datetime import datetime, timedelta

def hash_password(password):
    """Hashea una contraseña usando PBKDF2"""
    return generate_password_hash(password, method='pbkdf2:sha256')

def verify_password(password, hashed):
    """Verifica una contraseña contra su hash"""
    return check_password_hash(hashed, password)

def generate_reset_token():
    """Genera un token seguro para reseteo de contraseña"""
    return secrets.token_urlsafe(32)

def get_token_expiry(minutes=5):
    """Retorna la fecha de expiración del token"""
    return datetime.utcnow() + timedelta(minutes=minutes)

def is_token_valid(token_record):
    """
    Verifica si un token es válido:
    - ¿Existe?
    - ¿No está vencido?
    - ¿No fue usado?
    """
    if not token_record:
        return False
    
    if token_record.used:
        return False
    
    if datetime.utcnow() > token_record.expires_at:
        return False
    
    return True

def validate_password_strength(password):
    """Valida que la contraseña cumpla con los requisitos mínimos (8 caracteres)"""
    if len(password) < 8:
        return False, "La contraseña debe tener al menos 8 caracteres"
    
    return True, "Contraseña válida"

# ✅ DECORADORES AÑADIDOS

def login_required(f):
    """Decorador para requerir login"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            # Si la petición espera JSON (AJAX/fetch), devolver JSON en lugar de redirigir
            wants_json = request.headers.get('X-Requested-With') == 'XMLHttpRequest' or \
                         request.accept_mimetypes.best == 'application/json'
            if wants_json:
                return jsonify({'success': False, 'error': 'Authentication required'}), 401
            flash('Debes iniciar sesión para acceder a esta página', 'error')
            return redirect(url_for('auth.login'))
        return f(*args, **kwargs)
    return decorated_function

def role_required(role):
    """Decorador para requerir un rol específico"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_role' not in session:
                wants_json = request.headers.get('X-Requested-With') == 'XMLHttpRequest' or \
                             request.accept_mimetypes.best == 'application/json'
                if wants_json:
                    return jsonify({'success': False, 'error': 'Authentication required'}), 401
                flash('Debes iniciar sesión', 'error')
                return redirect(url_for('auth.login'))

            user_role = session.get('user_role')

            # Permitir tanto una cadena como una lista/tupla de roles
            if isinstance(role, (list, tuple, set)):
                if user_role not in role:
                    wants_json = request.headers.get('X-Requested-With') == 'XMLHttpRequest' or \
                                 request.accept_mimetypes.best == 'application/json'
                    if wants_json:
                        return jsonify({'success': False, 'error': 'Permission denied'}), 403
                    flash('No tienes permisos para acceder a esta página', 'error')
                    return redirect(url_for('main.dashboard'))
            else:
                if user_role != role:
                    wants_json = request.headers.get('X-Requested-With') == 'XMLHttpRequest' or \
                                 request.accept_mimetypes.best == 'application/json'
                    if wants_json:
                        return jsonify({'success': False, 'error': 'Permission denied'}), 403
                    flash('No tienes permisos para acceder a esta página', 'error')
                    return redirect(url_for('main.dashboard'))

            return f(*args, **kwargs)
        return decorated_function
    return decorator
