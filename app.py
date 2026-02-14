"""
app.py - Backend Flask con PostgreSQL
Sistema de autenticacion y gestion de usuarios
"""

from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
from datetime import datetime, timedelta
import os
from functools import wraps
from models import db, Usuario, init_db
from config import config

# Crear aplicacion Flask
app = Flask(__name__)

# Configuracion del entorno
env = os.environ.get('FLASK_ENV', 'production')
app.config.from_object(config[env])

# Inicializar base de datos
init_db(app)

# Habilitar CORS
CORS(app, supports_credentials=True, origins=['*'])


# Decorador para rutas protegidas
def login_required(f):
    """Decorador para proteger rutas que requieren autenticacion"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'usuario' not in session:
            return jsonify({
                'success': False,
                'message': 'No autorizado'
            }), 401
        return f(*args, **kwargs)
    return decorated_function


# ===================================
# RUTAS DE AUTENTICACION
# ===================================

@app.route('/api/login', methods=['POST'])
def login():
    """Endpoint de login para autenticar usuarios"""
    try:
        data = request.get_json()
        usuario = data.get('usuario', '').strip()
        password = data.get('password', '')

        print(f"[{datetime.now()}] Intento de login: {usuario}")

        # Validar campos requeridos
        if not usuario or not password:
            return jsonify({
                'success': False,
                'message': 'Usuario y contrasena son requeridos'
            }), 400

        # Buscar usuario en la base de datos
        user = Usuario.query.filter_by(usuario=usuario, activo=True).first()

        if user and user.check_password(password):
            # Guardar en sesion
            session.permanent = True
            session['usuario'] = usuario
            session['role'] = user.rol
            session['user_id'] = user.id
            session['login_time'] = datetime.now().isoformat()

            print(f"[{datetime.now()}] Login exitoso: {usuario}")

            return jsonify({
                'success': True,
                'role': user.rol,
                'usuario': usuario,
                'nombre_completo': user.nombre_completo,
                'message': 'Autenticacion exitosa',
                'timestamp': datetime.now().isoformat()
            }), 200

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
    """Endpoint para cerrar sesion"""
    usuario = session.get('usuario', 'Desconocido')
    session.clear()
    
    print(f"[{datetime.now()}] Logout: {usuario}")
    
    return jsonify({
        'success': True,
        'message': 'Sesion cerrada exitosamente'
    }), 200


@app.route('/api/verify-session', methods=['GET'])
def verify_session():
    """Verificar si hay una sesion activa valida"""
    if 'usuario' in session:
        return jsonify({
            'success': True,
            'authenticated': True,
            'usuario': session['usuario'],
            'role': session['role'],
            'login_time': session.get('login_time')
        }), 200
    
    return jsonify({
        'success': False,
        'authenticated': False,
        'message': 'No hay sesion activa'
    }), 401


# ===================================
# RUTAS DE GESTION DE USUARIOS
# ===================================

@app.route('/api/users', methods=['GET'])
@login_required
def get_users():
    """Obtener lista de todos los usuarios"""
    try:
        users = Usuario.query.all()
        users_list = [user.to_dict() for user in users]
        
        return jsonify({
            'success': True,
            'users': users_list
        }), 200
    except Exception as e:
        print(f"Error al obtener usuarios: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Error al obtener usuarios'
        }), 500


@app.route('/api/users/create', methods=['POST'])
@login_required
def create_user():
    """Crear un nuevo usuario"""
    try:
        data = request.get_json()
        usuario = data.get('usuario', '').strip()
        password = data.get('password', '')
        rol = data.get('rol', '')

        # Validaciones
        if not usuario or not password or not rol:
            return jsonify({
                'success': False,
                'message': 'Faltan campos requeridos'
            }), 400

        # Verificar si el usuario ya existe
        existing_user = Usuario.query.filter_by(usuario=usuario).first()
        if existing_user:
            return jsonify({
                'success': False,
                'message': 'El usuario ya existe'
            }), 400

        # Crear nuevo usuario
        new_user = Usuario(
            usuario=usuario,
            rol=rol,
            nombre_completo=data.get('nombre_completo', usuario),
            email=data.get('email'),
            telefono=data.get('telefono'),
            created_by=session.get('usuario', 'admin')
        )
        new_user.set_password(password)

        # Guardar en base de datos
        db.session.add(new_user)
        db.session.commit()

        print(f"[{datetime.now()}] Usuario creado: {usuario} - Rol: {rol}")

        return jsonify({
            'success': True,
            'message': f'Usuario {usuario} creado exitosamente',
            'user': new_user.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        print(f"[{datetime.now()}] Error al crear usuario: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Error al crear usuario'
        }), 500


@app.route('/api/users/<user_id>', methods=['DELETE'])
@login_required
def delete_user(user_id):
    """Eliminar un usuario"""
    try:
        user = Usuario.query.get(user_id)

        if not user:
            return jsonify({
                'success': False,
                'message': 'Usuario no encontrado'
            }), 404

        # No permitir eliminar el usuario admin principal
        if user.usuario == 'admin':
            return jsonify({
                'success': False,
                'message': 'No se puede eliminar el usuario administrador principal'
            }), 403

        # Eliminar usuario
        db.session.delete(user)
        db.session.commit()

        print(f"[{datetime.now()}] Usuario eliminado: {user.usuario}")

        return jsonify({
            'success': True,
            'message': f'Usuario {user.usuario} eliminado exitosamente'
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"[{datetime.now()}] Error al eliminar usuario: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Error al eliminar usuario'
        }), 500


# ===================================
# RUTAS DE PAGINAS HTML
# ===================================

@app.route('/')
def index():
    """Pagina principal - Login"""
    return render_template('login.html')


@app.route('/administrador')
def administrador():
    """Pagina de administrador"""
    return render_template('administrador.html')


@app.route('/registro')
def registro():
    """Pagina de registro"""
    return render_template('registro.html')


@app.route('/recepcion')
def recepcion():
    """Pagina de recepcion"""
    return render_template('recepcion.html')


# ===================================
# RUTAS DE UTILIDAD
# ===================================

@app.route('/health')
def health():
    """Health check para Render"""
    try:
        db.session.execute('SELECT 1')
        db_status = 'connected'
    except Exception as e:
        db_status = f'error: {str(e)}'
    
    return jsonify({
        'status': 'OK',
        'service': 'Sistema de Login Flask',
        'database': db_status,
        'timestamp': datetime.now().isoformat(),
        'environment': os.environ.get('FLASK_ENV', 'production')
    }), 200


# ===================================
# MANEJO DE ERRORES
# ===================================

@app.errorhandler(404)
def not_found(error):
    """Manejar errores 404"""
    return jsonify({
        'success': False,
        'error': 'Recurso no encontrado'
    }), 404


@app.errorhandler(500)
def internal_error(error):
    """Manejar errores 500"""
    return jsonify({
        'success': False,
        'error': 'Error interno del servidor'
    }), 500


# ===================================
# INICIALIZACION
# ===================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'
    
    print("\n" + "=" * 60)
    print("Servidor Flask iniciando...")
    print("=" * 60)
    print(f"Puerto: {port}")
    print(f"Entorno: {os.environ.get('FLASK_ENV', 'production')}")
    print(f"Debug: {debug}")
    print(f"Base de datos: PostgreSQL")
    print(f"URL Local: http://localhost:{port}")
    print("\nCredenciales por defecto:")
    print("   Usuario: admin")
    print("   Contrasena: admin123")
    print("=" * 60 + "\n")
    
    app.run(host='0.0.0.0', port=port, debug=debug)