# app.py - Backend Flask con estructura de templates y static
from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
from datetime import datetime, timedelta
import os
import json
from functools import wraps

app = Flask(__name__)

# Configuración
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'tu_clave_secreta_muy_segura_12345')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)

# Habilitar CORS
CORS(app, supports_credentials=True, origins=['*'])

# Credenciales por defecto (en producción usar base de datos)
USERS = {
    'admin': {
        'usuario': 'admin',
        'password': 'admin123',
        'role': 'administrador',
        'nombre_completo': 'Administrador del Sistema'
    },
    'recepcion': {
        'usuario': 'recepcion',
        'password': 'recep123',
        'role': 'recepcion',
        'nombre_completo': 'Usuario Recepción'
    }
}

# Archivo para persistir usuarios
USERS_FILE = 'users_db.json'

def load_users():
    """Cargar usuarios desde archivo JSON"""
    global USERS
    try:
        if os.path.exists(USERS_FILE):
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                loaded_users = json.load(f)
                # Fusionar usuarios cargados con usuarios por defecto
                USERS.update(loaded_users)
                print(f"✅ {len(loaded_users)} usuarios cargados desde {USERS_FILE}")
    except Exception as e:
        print(f"⚠️ Error al cargar usuarios: {e}")

def save_users():
    """Guardar usuarios en archivo JSON"""
    try:
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(USERS, f, ensure_ascii=False, indent=2)
        print(f"✅ Usuarios guardados en {USERS_FILE}")
    except Exception as e:
        print(f"⚠️ Error al guardar usuarios: {e}")

# Cargar usuarios al iniciar
load_users()

# Decorador para rutas protegidas
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Verificar si hay sesión activa
        if 'usuario' not in session:
            return jsonify({'success': False, 'message': 'No autorizado'}), 401
        
        return f(*args, **kwargs)
    
    return decorated_function

# =========================
# RUTAS DE AUTENTICACIÓN
# =========================

@app.route('/api/login', methods=['POST'])
def login():
    """Endpoint de login para autenticar usuarios"""
    try:
        data = request.get_json()
        usuario = data.get('usuario', '').strip()
        password = data.get('password', '')
        role = data.get('role', '')

        print(f"[{datetime.now()}] Intento de login: {usuario} - Role: {role}")

        # Validar campos requeridos
        if not usuario or not password:
            return jsonify({
                'success': False,
                'message': 'Usuario y contraseña son requeridos'
            }), 400

        # Verificar credenciales
        if usuario in USERS and USERS[usuario]['password'] == password:
            user_data = USERS[usuario]
            
            # Guardar en sesión
            session.permanent = True
            session['usuario'] = usuario
            session['role'] = user_data['role']
            session['login_time'] = datetime.now().isoformat()

            print(f"[{datetime.now()}] Login exitoso: {usuario}")

            return jsonify({
                'success': True,
                'role': user_data['role'],
                'usuario': usuario,
                'nombre_completo': user_data['nombre_completo'],
                'message': 'Autenticación exitosa',
                'timestamp': datetime.now().isoformat()
            }), 200
        else:
            print(f"[{datetime.now()}] Login fallido: {usuario}")
            return jsonify({
                'success': False,
                'message': 'Credenciales incorrectas'
            }), 401

    except Exception as e:
        print(f"[{datetime.now()}] Error en login: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Error en el servidor'
        }), 500


@app.route('/api/logout', methods=['POST'])
def logout():
    """Endpoint para cerrar sesión"""
    usuario = session.get('usuario', 'Desconocido')
    session.clear()
    
    print(f"[{datetime.now()}] Logout: {usuario}")
    
    return jsonify({
        'success': True,
        'message': 'Sesión cerrada exitosamente'
    }), 200


@app.route('/api/verify-session', methods=['GET'])
def verify_session():
    """Verificar si hay una sesión activa válida"""
    if 'usuario' in session:
        return jsonify({
            'success': True,
            'authenticated': True,
            'usuario': session['usuario'],
            'role': session['role'],
            'login_time': session.get('login_time')
        }), 200
    else:
        return jsonify({
            'success': False,
            'authenticated': False,
            'message': 'No hay sesión activa'
        }), 401


@app.route('/api/users', methods=['GET'])
def get_users():
    """Obtener lista de todos los usuarios"""
    users_list = []
    for username, data in USERS.items():
        users_list.append({
            'id': data.get('id', username.upper()[:6]),
            'usuario': data['usuario'],
            'rol': data['role'],
            'nombre_completo': data.get('nombre_completo', ''),
            'created_at': data.get('created_at', datetime.now().isoformat()),
            'created_by': data.get('created_by', 'sistema')
        })
    
    return jsonify({
        'success': True,
        'users': users_list
    }), 200


@app.route('/api/users/create', methods=['POST'])
def create_user():
    """Crear un nuevo usuario"""
    try:
        data = request.get_json()
        usuario = data.get('usuario', '').strip()
        password = data.get('password', '')
        rol = data.get('rol', '')
        user_id = data.get('id', '')

        # Validaciones
        if not usuario or not password or not rol:
            return jsonify({
                'success': False,
                'message': 'Faltan campos requeridos'
            }), 400

        # Verificar si el usuario ya existe
        if usuario in USERS:
            return jsonify({
                'success': False,
                'message': 'El usuario ya existe'
            }), 400

        # Crear nuevo usuario
        USERS[usuario] = {
            'id': user_id,
            'usuario': usuario,
            'password': password,
            'role': rol,
            'nombre_completo': data.get('nombre_completo', usuario),
            'created_at': datetime.now().isoformat(),
            'created_by': session.get('usuario', 'admin')
        }

        # Guardar en archivo
        save_users()

        print(f"[{datetime.now()}] Usuario creado: {usuario} - Rol: {rol}")

        return jsonify({
            'success': True,
            'message': f'Usuario {usuario} creado exitosamente',
            'user': {
                'id': user_id,
                'usuario': usuario,
                'rol': rol
            }
        }), 201

    except Exception as e:
        print(f"[{datetime.now()}] Error al crear usuario: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Error al crear usuario'
        }), 500


@app.route('/api/users/<user_id>', methods=['DELETE'])
def delete_user(user_id):
    """Eliminar un usuario"""
    try:
        # Buscar usuario por ID
        user_to_delete = None
        for username, data in USERS.items():
            if data.get('id', '') == user_id:
                user_to_delete = username
                break

        if not user_to_delete:
            return jsonify({
                'success': False,
                'message': 'Usuario no encontrado'
            }), 404

        # No permitir eliminar el usuario admin principal
        if user_to_delete == 'admin':
            return jsonify({
                'success': False,
                'message': 'No se puede eliminar el usuario administrador principal'
            }), 403

        # Eliminar usuario
        del USERS[user_to_delete]
        save_users()

        print(f"[{datetime.now()}] Usuario eliminado: {user_to_delete}")

        return jsonify({
            'success': True,
            'message': f'Usuario {user_to_delete} eliminado exitosamente'
        }), 200

    except Exception as e:
        print(f"[{datetime.now()}] Error al eliminar usuario: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Error al eliminar usuario'
        }), 500


# =========================
# RUTAS DE PÁGINAS HTML
# =========================

@app.route('/')
def index():
    """Página principal - Login"""
    return render_template('login.html')


@app.route('/administrador')
# @login_required  # Temporalmente deshabilitado para desarrollo
def administrador():
    """Página de administrador (protegida)"""
    # if session.get('role') != 'administrador':
    #     return jsonify({'message': 'Acceso denegado'}), 403
    
    return render_template('administrador.html')


@app.route('/registro')
def registro():
    """Página de registro (pública)"""
    return render_template('registro.html')


@app.route('/recepcion')
def recepcion():
    """Página de recepción (pública)"""
    return render_template('recepcion.html')


# =========================
# RUTAS DE UTILIDAD
# =========================

@app.route('/health')
def health():
    """Health check para Render"""
    return jsonify({
        'status': 'OK',
        'service': 'Sistema de Login Flask',
        'timestamp': datetime.now().isoformat(),
        'environment': os.environ.get('FLASK_ENV', 'production')
    }), 200


# =========================
# MANEJO DE ERRORES
# =========================

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'Recurso no encontrado'
    }), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'success': False,
        'error': 'Error interno del servidor'
    }), 500


# =========================
# INICIALIZACIÓN
# =========================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'
    
    print("\n" + "="*60)
    print("🚀 Servidor Flask iniciando...")
    print("="*60)
    print(f"📍 Puerto: {port}")
    print(f"🌍 Entorno: {os.environ.get('FLASK_ENV', 'production')}")
    print(f"🔧 Debug: {debug}")
    print(f"🔗 URL Local: http://localhost:{port}")
    print(f"📁 Templates: templates/")
    print(f"📁 Static: static/css/ static/js/")
    print("\n👤 Credenciales de Administrador:")
    print("   Usuario: admin")
    print("   Contraseña: admin123")
    print("\n👤 Credenciales de Recepción:")
    print("   Usuario: recepcion")
    print("   Contraseña: recep123")
    print("="*60 + "\n")
    
    app.run(host='0.0.0.0', port=port, debug=debug)