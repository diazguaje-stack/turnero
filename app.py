"""
app.py - Backend Flask con SQLite/PostgreSQL
Sistema de autenticacion y gestion de usuarios
Autenticacion: JWT Tokens (sin cookies de sesion)
"""

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from datetime import datetime, timedelta, timezone
from functools import wraps
import os
import jwt
from models import db, Usuario, init_db, Pantalla, Paciente, uuid
from config import config


# ===================================
# CONFIGURACION
# ===================================

app = Flask(__name__)

env = os.environ.get('FLASK_ENV', 'development')
app.config.from_object(config[env])

# JWT Secret — en produccion usa variable de entorno
JWT_SECRET = os.environ.get('JWT_SECRET', 'jwt-secret-turnero-2024-cambiar-en-produccion')
JWT_EXPIRATION_HOURS = 8  # Token expira en 8 horas

init_db(app)
CORS(app, supports_credentials=True, origins=['*'])


# ===================================
# HELPERS JWT
# ===================================

def generar_token(usuario_id, usuario, rol, nombre_completo):
    """Genera un JWT token firmado"""
    payload = {
        'user_id':        str(usuario_id),
        'usuario':        usuario,
        'role':           rol,       # clave 'role' para consistencia con frontend
        'nombre_completo': nombre_completo,
        'iat':            datetime.now(timezone.utc),
        'exp':            datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')


def verificar_token(token):
    """Verifica y decodifica un JWT token. Retorna payload o None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def obtener_token_del_request():
    """Extrae el Bearer token del header Authorization."""
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:]
    return None


def normalizar_rol(rol):
    """Normaliza 'administrador' → 'admin' para compatibilidad con registros legacy."""
    if rol == 'administrador':
        return 'admin'
    return rol


def rol_requerido(*roles):
    """Decorator: requiere que el usuario tenga uno de los roles especificados.
    Acepta 'administrador' como alias de 'admin' para compatibilidad con BDs existentes."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            token = obtener_token_del_request()
            if not token:
                return jsonify({'success': False, 'message': 'Token no proporcionado'}), 401

            payload = verificar_token(token)
            if not payload:
                return jsonify({'success': False, 'message': 'Token invalido o expirado'}), 401

            rol_usuario = normalizar_rol(payload.get('role', ''))

            if rol_usuario not in roles:
                return jsonify({
                    'success': False,
                    'message': f'Acceso denegado. Roles permitidos: {", ".join(roles)}'
                }), 403

            # Guardar rol normalizado para uso en los endpoints
            payload['role'] = rol_usuario
            request.current_user = payload
            return f(*args, **kwargs)
        return decorated
    return decorator


def login_required(f):
    """Decorator: requiere cualquier usuario autenticado con token valido."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = obtener_token_del_request()
        if not token:
            return jsonify({'success': False, 'message': 'Token no proporcionado'}), 401

        payload = verificar_token(token)
        if not payload:
            return jsonify({'success': False, 'message': 'Token invalido o expirado'}), 401

        request.current_user = payload
        return f(*args, **kwargs)
    return decorated


# ===================================
# RUTAS DE AUTENTICACION
# ===================================

@app.route('/api/login', methods=['POST'])
def api_login():
    """Login — retorna JWT token"""
    try:
        data     = request.get_json()
        usuario  = data.get('usuario', '').strip()
        password = data.get('password', '')

        print(f"[{datetime.now()}] Intento de login: {usuario}")

        if not usuario or not password:
            return jsonify({'success': False, 'message': 'Usuario y contrasena son requeridos'}), 400

        user = Usuario.query.filter_by(usuario=usuario, activo=True).first()

        if user and user.check_password(password):
            token = generar_token(
                usuario_id      = user.id,
                usuario         = usuario,
                rol             = user.rol,
                nombre_completo = user.nombre_completo or usuario
            )

            print(f"[{datetime.now()}] Login exitoso: {usuario} (rol: {user.rol})")

            return jsonify({
                'success':         True,
                'token':           token,
                'role':            user.rol,   # para auth.js
                'rol':             user.rol,   # para login.js (usa data.rol)
                'usuario':         usuario,
                'nombre_completo': user.nombre_completo,
                'message':         'Autenticacion exitosa',
                'expires_in':      JWT_EXPIRATION_HOURS * 3600
            }), 200

        print(f"[{datetime.now()}] Login fallido: {usuario}")
        return jsonify({'success': False, 'message': 'Credenciales incorrectas'}), 401

    except Exception as e:
        print(f"[{datetime.now()}] Error en login: {str(e)}")
        return jsonify({'success': False, 'message': 'Error en el servidor'}), 500


@app.route('/api/logout', methods=['POST'])
@app.route('/logout', methods=['POST'])
def api_logout():
    """
    Logout — con JWT es del lado del cliente (eliminar token).
    Este endpoint existe para logs y compatibilidad.
    """
    token   = obtener_token_del_request()
    usuario = 'Desconocido'
    if token:
        payload = verificar_token(token)
        if payload:
            usuario = payload.get('usuario', 'Desconocido')

    print(f"[{datetime.now()}] Logout: {usuario}")

    return jsonify({'success': True, 'message': 'Sesion cerrada. Elimina el token del cliente.'}), 200


@app.route('/api/verify-session', methods=['GET'])
def verify_session():
    """Verifica si el JWT token es valido y retorna datos del usuario"""
    token = obtener_token_del_request()

    if not token:
        return jsonify({'success': False, 'authenticated': False, 'message': 'Sin token'}), 401

    payload = verificar_token(token)

    if not payload:
        return jsonify({'success': False, 'authenticated': False, 'message': 'Token invalido o expirado'}), 401

    return jsonify({
        'success':         True,
        'authenticated':   True,
        'usuario':         payload['usuario'],
        'nombre_completo': payload['nombre_completo'],
        'role':            payload['role'],
        'rol':             payload['role'],
        'id':              payload['user_id'],
    }), 200


# ===================================
# RUTAS DE PAGINAS HTML (publicas)
# ===================================

@app.route('/')
def index():
    return render_template('login.html')

@app.route('/administrador')
def administrador():
    return render_template('administrador.html')

@app.route('/registro')
def registro():
    return render_template('registro.html')

@app.route('/recepcion')
def recepcion():
    return render_template('recepcion.html')

@app.route('/screen')
def screen():
    return render_template('screen.html')


# ===================================
# RUTAS DE GESTION DE USUARIOS
# ===================================

@app.route('/api/users', methods=['GET'])
@rol_requerido('admin')
def get_users():
    try:
        users      = Usuario.query.all()
        users_list = [user.to_dict() for user in users]
        return jsonify({'success': True, 'users': users_list}), 200
    except Exception as e:
        print(f"Error al obtener usuarios: {str(e)}")
        return jsonify({'success': False, 'message': 'Error al obtener usuarios'}), 500


@app.route('/api/users/create', methods=['POST'])
@rol_requerido('admin')
def create_user():
    try:
        data     = request.get_json()
        usuario  = data.get('usuario', '').strip()
        password = data.get('password', '')
        rol      = data.get('rol', '')

        if not usuario or not password or not rol:
            return jsonify({'success': False, 'message': 'Faltan campos requeridos'}), 400

        if Usuario.query.filter_by(usuario=usuario).first():
            return jsonify({'success': False, 'message': 'El usuario ya existe'}), 400

        new_user = Usuario(
            usuario         = usuario,
            rol             = rol,
            nombre_completo = data.get('nombre_completo', usuario),
            email           = data.get('email'),
            telefono        = data.get('telefono'),
            created_by      = request.current_user.get('usuario', 'admin')
        )
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()

        print(f"[{datetime.now()}] Usuario creado: {usuario} - Rol: {rol}")

        return jsonify({
            'success': True,
            'message': f'Usuario {usuario} creado exitosamente',
            'user':    new_user.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        print(f"Error al crear usuario: {str(e)}")
        return jsonify({'success': False, 'message': 'Error al crear usuario'}), 500


@app.route('/api/users/<user_id>', methods=['DELETE'])
@rol_requerido('admin')
def delete_user(user_id):
    try:
        user = Usuario.query.get(user_id)
        if not user:
            return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404
        if user.usuario == 'admin':
            return jsonify({'success': False, 'message': 'No se puede eliminar el administrador principal'}), 403

        db.session.delete(user)
        db.session.commit()

        return jsonify({'success': True, 'message': f'Usuario {user.usuario} eliminado'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Error al eliminar usuario'}), 500


@app.route('/api/users/<user_id>', methods=['PUT'])
@rol_requerido('admin')
def update_user(user_id):
    try:
        user = Usuario.query.get(user_id)
        if not user:
            return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404

        data = request.get_json()

        if not data.get('usuario', '').strip():
            return jsonify({'success': False, 'message': 'El usuario es requerido'}), 400

        if data['usuario'].strip() != user.usuario:
            if Usuario.query.filter_by(usuario=data['usuario'].strip()).first():
                return jsonify({'success': False, 'message': 'El usuario ya existe'}), 400

        user.usuario         = data.get('usuario', user.usuario).strip()
        user.nombre_completo = data.get('nombre_completo', user.nombre_completo)
        user.rol             = data.get('rol', user.rol)

        if data.get('password', '').strip():
            user.set_password(data['password'])

        user.updated_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Usuario {user.usuario} actualizado',
            'user':    user.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Error al actualizar usuario'}), 500


@app.route('/api/users/recepcionistas', methods=['GET'])
@rol_requerido('admin')
def get_recepcionistas():
    try:
        recepcionistas = Usuario.query.filter_by(rol='recepcion', activo=True).all()
        return jsonify({'success': True, 'recepcionistas': [r.to_dict() for r in recepcionistas]}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': 'Error al obtener recepcionistas'}), 500


# ===================================
# RUTAS DE PANTALLAS
# ===================================

@app.route('/api/pantallas', methods=['GET'])
@rol_requerido('admin')
def get_pantallas():
    try:
        pantallas = Pantalla.query.order_by(Pantalla.numero).all()
        return jsonify({'success': True, 'pantallas': [p.to_dict() for p in pantallas]}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': 'Error al obtener pantallas'}), 500


@app.route('/api/recepcion/pantallas', methods=['GET'])
@rol_requerido('recepcion', 'admin')
def get_pantallas_recepcion():
    try:
        pantallas = Pantalla.query.all()
        return jsonify({'success': True, 'pantallas': [p.to_dict() for p in pantallas]}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': 'Error al obtener pantallas'}), 500


@app.route('/api/pantallas/<pantalla_id>/vincular', methods=['POST'])
@rol_requerido('admin')
def vincular_pantalla(pantalla_id):
    try:
        data   = request.get_json()
        codigo = data.get('codigo', '').strip()

        if not codigo or len(codigo) != 6:
            return jsonify({'success': False, 'message': 'Codigo invalido'}), 400

        pantalla = Pantalla.query.filter_by(
            id=pantalla_id, codigo_vinculacion=codigo, estado='pendiente'
        ).first()

        if not pantalla:
            return jsonify({'success': False, 'message': 'Codigo incorrecto o pantalla no disponible'}), 404

        pantalla.estado       = 'vinculada'
        pantalla.vinculada_at = datetime.utcnow()
        db.session.commit()

        return jsonify({'success': True, 'message': 'Pantalla vinculada', 'pantalla': pantalla.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Error al vincular pantalla'}), 500


@app.route('/api/pantallas/<pantalla_id>/desvincular', methods=['POST'])
@rol_requerido('admin')
def desvincular_pantalla(pantalla_id):
    try:
        pantalla = Pantalla.query.get(pantalla_id)
        if not pantalla:
            return jsonify({'success': False, 'message': 'Pantalla no encontrada'}), 404

        pantalla.device_id          = None
        pantalla.codigo_vinculacion = None
        pantalla.estado             = 'disponible'
        pantalla.vinculada_at       = None
        db.session.commit()

        return jsonify({'success': True, 'message': 'Pantalla desvinculada', 'pantalla': pantalla.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Error al desvincular pantalla'}), 500


@app.route('/api/pantallas/<pantalla_id>/asignar-recepcionista', methods=['POST'])
@rol_requerido('admin')
def asignar_recepcionista(pantalla_id):
    try:
        data             = request.get_json()
        recepcionista_id = data.get('recepcionista_id')
        pantalla         = Pantalla.query.get(pantalla_id)

        if not pantalla:
            return jsonify({'success': False, 'message': 'Pantalla no encontrada'}), 404

        if not recepcionista_id:
            pantalla.recepcionista_id = None
            db.session.commit()
            return jsonify({'success': True, 'message': 'Recepcionista desasignado', 'pantalla': pantalla.to_dict()}), 200

        recepcionista = Usuario.query.get(recepcionista_id)
        if not recepcionista:
            return jsonify({'success': False, 'message': 'Recepcionista no encontrado'}), 404
        if recepcionista.rol != 'recepcion':
            return jsonify({'success': False, 'message': 'El usuario no es recepcionista'}), 400

        pantalla.recepcionista_id = recepcionista_id
        db.session.commit()

        return jsonify({'success': True, 'message': 'Recepcionista asignado', 'pantalla': pantalla.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Error al asignar recepcionista'}), 500


# ===================================
# RUTAS DE PANTALLA (PUBLICAS — dispositivos TV)
# ===================================

@app.route('/api/screen/init', methods=['POST'])
def screen_init():
    try:
        data               = request.get_json()
        device_fingerprint = data.get('device_fingerprint')

        if not device_fingerprint:
            return jsonify({'success': False, 'message': 'Device fingerprint requerido'}), 400

        pantalla_existente = Pantalla.query.filter_by(device_id=device_fingerprint).first()
        if pantalla_existente:
            return jsonify({'success': True, 'status': 'vinculada', 'pantalla': pantalla_existente.to_dict()}), 200

        pantalla_disponible = Pantalla.query.filter_by(estado='disponible').first()
        if not pantalla_disponible:
            return jsonify({'success': False, 'message': 'No hay pantallas disponibles'}), 404

        codigo                               = Pantalla.generar_codigo()
        pantalla_disponible.codigo_vinculacion = codigo
        pantalla_disponible.device_id        = device_fingerprint
        pantalla_disponible.estado           = 'pendiente'
        pantalla_disponible.ultima_conexion  = datetime.utcnow()
        db.session.commit()

        return jsonify({'success': True, 'status': 'pendiente', 'pantalla': pantalla_disponible.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Error al inicializar pantalla'}), 500


@app.route('/api/screen/status', methods=['POST'])
def screen_status():
    try:
        data               = request.get_json()
        device_fingerprint = data.get('device_fingerprint')

        if not device_fingerprint:
            return jsonify({'success': False, 'message': 'Device fingerprint requerido'}), 400

        pantalla = Pantalla.query.filter_by(device_id=device_fingerprint).first()
        if not pantalla:
            return jsonify({'success': True, 'status': 'desvinculada', 'message': 'Dispositivo desvinculado'}), 200

        pantalla.ultima_conexion = datetime.utcnow()
        db.session.commit()

        return jsonify({'success': True, 'status': pantalla.estado, 'pantalla': pantalla.to_dict()}), 200

    except Exception as e:
        return jsonify({'success': False, 'message': 'Error al verificar estado'}), 500


# ===================================
# RUTAS DE MEDICOS
# ===================================

@app.route('/api/medicos', methods=['GET'])
@login_required
def obtener_medicos():
    try:
        medicos      = Usuario.query.filter_by(rol='medico', activo=True).all()
        medicos_data = [{
            'id':              medico.id,
            'nombre_completo': medico.nombre_completo or medico.usuario,
            'usuario':         medico.usuario,
            'inicial':         (medico.nombre_completo or medico.usuario)[0].upper()
        } for medico in medicos]

        return jsonify({'success': True, 'medicos': medicos_data, 'total': len(medicos_data)}), 200

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ===================================
# RUTAS DE PACIENTES
# ===================================

def generar_codigo_paciente(medico_id, motivo):
    medico = Usuario.query.filter_by(id=medico_id, rol='medico').first()
    if not medico:
        raise Exception("Medico no encontrado")

    inicial_medico = (medico.nombre_completo or medico.usuario)[0].upper()
    inicial_motivo = motivo[0].upper() if motivo else 'X'

    ultimo = Paciente.query.filter(
        Paciente.medico_id == medico_id,
        Paciente.motivo    == motivo
    ).order_by(Paciente.created_at.desc()).first()

    if ultimo and ultimo.codigo_paciente:
        partes = ultimo.codigo_paciente.split('-')
        numero = int(partes[2]) + 1 if len(partes) >= 3 else 1
    else:
        numero = 1

    return f"{inicial_medico}-{inicial_motivo}-{numero:03d}"


@app.route('/api/pacientes/registrar', methods=['POST'])
@rol_requerido('registro', 'admin')
def registrar_paciente():
    try:
        data      = request.get_json()
        nombre    = data.get('nombre', '').strip()
        medico_id = data.get('medico_id', '').strip()
        motivo    = data.get('motivo', '').strip()
        documento = data.get('documento', '').strip() or str(uuid.uuid4())[:12]

        if not nombre or not medico_id or not motivo:
            return jsonify({'success': False, 'message': 'Nombre, medico y motivo son obligatorios'}), 400

        medico = Usuario.query.filter_by(id=medico_id, rol='medico', activo=True).first()
        if not medico:
            return jsonify({'success': False, 'message': 'Medico no encontrado'}), 404

        codigo_paciente = generar_codigo_paciente(medico_id, motivo)

        nuevo = Paciente(
            id              = str(uuid.uuid4()),
            nombre          = nombre,
            apellido        = data.get('apellido', ''),
            documento       = documento,
            codigo_paciente = codigo_paciente,
            motivo          = motivo,
            medico_id       = medico_id,
            created_at      = datetime.utcnow()
        )
        db.session.add(nuevo)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Paciente registrado exitosamente',
            'paciente': {
                'id':     nuevo.id,
                'nombre': nuevo.nombre,
                'codigo': codigo_paciente,
                'medico': medico.nombre_completo,
                'motivo': motivo
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500


@app.route('/api/recepcion/pacientes', methods=['GET'])
@rol_requerido('recepcion', 'admin')
def obtener_pacientes_recepcion():
    try:
        medicos   = Usuario.query.filter_by(rol='medico', activo=True).all()
        resultado = []

        for medico in medicos:
            pacientes   = Paciente.query.filter_by(medico_id=medico.id).all()
            medico_data = {
                'id':              medico.id,
                'nombre':          medico.nombre_completo or medico.usuario,
                'usuario':         medico.usuario,
                'inicial':         (medico.nombre_completo or medico.usuario)[0].upper(),
                'total_pacientes': len(pacientes),
                'pacientes':       [{
                    'id':         p.id,
                    'nombre':     p.nombre,
                    'codigo':     p.codigo_paciente,
                    'motivo':     p.motivo,
                    'created_at': p.created_at.isoformat() if p.created_at else None
                } for p in pacientes]
            }
            resultado.append(medico_data)

        return jsonify({'success': True, 'medicos': resultado, 'total_medicos': len(resultado)}), 200

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/recepcion/medico/<medico_id>/pacientes', methods=['GET'])
@rol_requerido('recepcion', 'admin')
def obtener_pacientes_por_medico(medico_id):
    try:
        medico = Usuario.query.filter_by(id=medico_id, rol='medico', activo=True).first()
        if not medico:
            return jsonify({'success': False, 'message': 'Medico no encontrado'}), 404

        pacientes      = Paciente.query.filter_by(medico_id=medico_id).all()
        pacientes_data = [{
            'id':              p.id,
            'nombre':          p.nombre,
            'apellido':        p.apellido,
            'nombre_completo': f"{p.nombre} {p.apellido}",
            'codigo':          p.codigo_paciente,
            'motivo':          p.motivo,
            'documento':       p.documento,
            'created_at':      p.created_at.isoformat() if p.created_at else None
        } for p in pacientes]

        return jsonify({
            'success':  True,
            'medico':   {'id': medico.id, 'nombre': medico.nombre_completo or medico.usuario},
            'pacientes': pacientes_data,
            'total':    len(pacientes_data)
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/recepcion/paciente/<codigo>', methods=['GET'])
@rol_requerido('recepcion', 'admin')
def buscar_paciente_codigo(codigo):
    try:
        paciente = Paciente.query.filter_by(codigo_paciente=codigo).first()
        if not paciente:
            return jsonify({'success': False, 'message': 'Paciente no encontrado'}), 404

        medico = Usuario.query.filter_by(id=paciente.medico_id).first()

        return jsonify({
            'success':  True,
            'paciente': {
                'id':              paciente.id,
                'nombre':          paciente.nombre,
                'apellido':        paciente.apellido,
                'nombre_completo': f"{paciente.nombre} {paciente.apellido}",
                'codigo':          paciente.codigo_paciente,
                'motivo':          paciente.motivo,
                'documento':       paciente.documento,
                'medico':          medico.nombre_completo if medico else 'Sin medico',
                'created_at':      paciente.created_at.isoformat() if paciente.created_at else None
            }
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/recepcion/paciente/<paciente_id>', methods=['DELETE'])
@rol_requerido('recepcion', 'admin')
def eliminar_paciente(paciente_id):
    try:
        paciente = Paciente.query.filter_by(id=paciente_id).first()
        if not paciente:
            return jsonify({'success': False, 'message': 'Paciente no encontrado'}), 404

        db.session.delete(paciente)
        db.session.commit()

        return jsonify({'success': True, 'message': 'Paciente eliminado'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/pacientes/medico/<medico_id>', methods=['GET'])
@login_required
def obtener_pacientes_medico(medico_id):
    try:
        pacientes      = Paciente.query.filter_by(medico_id=medico_id).all()
        pacientes_data = [p.to_dict() for p in pacientes]
        return jsonify({'success': True, 'pacientes': pacientes_data, 'total': len(pacientes_data)}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/pacientes/codigo/<codigo>', methods=['GET'])
@login_required
def obtener_paciente_codigo(codigo):
    try:
        paciente = Paciente.query.filter_by(codigo_paciente=codigo).first()
        if not paciente:
            return jsonify({'success': False, 'message': 'Paciente no encontrado'}), 404
        return jsonify({'success': True, 'paciente': paciente.to_dict()}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ===================================
# HEALTH CHECK
# ===================================

@app.route('/health')
def health():
    try:
        db.session.execute(db.text('SELECT 1'))
        db_status = 'connected'
    except Exception as e:
        db_status = f'error: {str(e)}'

    return jsonify({
        'status':      'OK',
        'service':     'Turnero Medico',
        'database':    db_status,
        'auth':        'JWT',
        'timestamp':   datetime.now().isoformat(),
        'environment': os.environ.get('FLASK_ENV', 'production')
    }), 200


# ===================================
# MANEJO DE ERRORES
# ===================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Recurso no encontrado'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'success': False, 'error': 'Error interno del servidor'}), 500


# ===================================
# INICIALIZACION
# ===================================

if __name__ == '__main__':
    port  = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'

    print("\n" + "=" * 60)
    print("Servidor Flask iniciando...")
    print("=" * 60)
    print(f"Puerto:      {port}")
    print(f"Entorno:     {os.environ.get('FLASK_ENV', 'production')}")
    print(f"Auth:        JWT Tokens")
    print(f"URL Local:   http://localhost:{port}")
    print("\nCredenciales por defecto:")
    print("   admin / admin123")
    print("   recepcion / recep123")
    print("=" * 60 + "\n")

    app.run(host='0.0.0.0', port=port, debug=debug)