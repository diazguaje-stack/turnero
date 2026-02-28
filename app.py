from gevent import monkey
monkey.patch_all()
from flask import Flask, request, jsonify, render_template, redirect
from flask_cors import CORS
from datetime import datetime, timedelta, timezone
from functools import wraps
import os, hashlib
from gtts import gTTS
import jwt
from models import db, Usuario, init_db, Pantalla, Paciente, Turno, uuid
from config import config
from flask_socketio import SocketIO, emit, join_room
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from flask_migrate import Migrate
import atexit
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import IntegrityError 
import uuid 
import time
import sys
import signal

# ===================================
# CONFIGURACION
# ===================================

app = Flask(__name__)


# ── Seleccionar config de forma segura ──
# ✅ Detectar automáticamente: si DATABASE_URL existe, es producción
if os.environ.get('DATABASE_URL'):
    env = 'production'
else:
    env = os.environ.get('FLASK_ENV', 'development').lower().strip()

if env not in config:
    print(f"⚠️  Entorno '{env}' no reconocido. Usando 'development'")
    env = 'development'


print(f"🔧 Entorno detectado: {env.upper()}")
app.config.from_object(config[env])

db.init_app(app)

with app.app_context():
    # Solo verificar conexión, NO crear tablas
    try:
        db.session.execute(db.text('SELECT 1'))
        print('✅ Conexión a BD exitosa')
    except Exception as e:
        print(f'❌ Error de conexión: {e}')

TTS_CACHE_DIR = os.path.join(os.path.dirname(__file__), 'static', 'tts_cache')
os.makedirs(TTS_CACHE_DIR, exist_ok=True)

# JWT Secret — en produccion usa variable de entorno
JWT_SECRET = os.environ.get('JWT_SECRET', 'jwt-secret-turnero-2024-cambiar-en-produccion')
JWT_EXPIRATION_HOURS = 8  # Token expira en 8 horas

migrate = Migrate(app, db)

CORS(app, supports_credentials=True, origins=['*'])
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent', logger=False, engineio_logger=False)

_ultimo_llamado=None
_screen_sids={}
_screen_pantalla = {}  
_screen_disconnect_timers={}
_screen_disconnect_active = {}      

# ===================================
# HELPERS JWT       
# ===================================

# ===================================
# LIMPIEZA DIARIA AUTOMÁTICA 00:00
# ===================================

scheduler = BackgroundScheduler()

def limpiar_pacientes_diario():
    """
    Ejecuta a las 00:00 todos los días:
    - Elimina todos los turnos de la BD
    - Elimina todos los pacientes de la BD
    - Notifica a TODAS las screens para limpiar su display
    - Notifica a TODAS las recepciones para limpiar su historial
    """
    with app.app_context():
        try:
            ahora = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            print(f"\n[SCHEDULER] ⏰ Limpieza diaria iniciada: {ahora}")

            total_turnos    = Turno.query.count()
            total_pacientes = Paciente.query.count()

            # Borrar en orden por FK: primero turnos, luego pacientes
            Turno.query.delete()
            Paciente.query.delete()
            db.session.commit()

            print(f"[SCHEDULER] ✅ Eliminados: {total_turnos} turnos, {total_pacientes} pacientes")

            # ── NOTIFICAR A SCREEN ──────────────────────────────
            print(f"[SCHEDULER] 📢 Emitiendo 'limpiar_historial' a sala 'screen'...")
            socketio.emit('limpiar_historial', {
                'motivo': 'limpieza_diaria',
                'tipo': 'screen',
                'timestamp': ahora
            }, room='screen')
            
            # Emitir a pantallas individuales
            print(f"[SCHEDULER] 📢 Emitiendo a salas screen_*...")
            pantallas = Pantalla.query.all()
            for pantalla in pantallas:
                sala_pantalla = f'screen_{pantalla.id}'
                socketio.emit('limpiar_historial', {
                    'motivo': 'limpieza_diaria',
                    'tipo': 'screen',
                    'pantalla_id': str(pantalla.id),
                    'timestamp': ahora
                }, room=sala_pantalla)

            # ── NOTIFICAR A RECEPCIÓN ──────────────────────────────────────────
            print(f"[SCHEDULER] 📢 Emitiendo a sala 'recepcion'...")
            socketio.emit('limpiar_historial_diario', {
                'motivo': 'limpieza_diaria',
                'tipo': 'recepcion',
                'mensaje': 'Limpieza diaria automática ejecutada a las 00:00',
                'hora': ahora
            }, room='recepcion')

            # ── NOTIFICAR A ADMIN ──────────────────────────────────────────────
            print(f"[SCHEDULER] 📢 Emitiendo a sala 'admin'...")
            socketio.emit('limpieza_completada', {
                'timestamp': ahora,
                'turnos_eliminados': total_turnos,
                'pacientes_eliminados': total_pacientes
            }, room='admin')

            print(f"[SCHEDULER] ✅ Limpieza diaria completada")

        except Exception as e:
            db.session.rollback()
            print(f"[SCHEDULER] ❌ Error en limpieza diaria: {str(e)}")

scheduler.add_job(
    func    = limpiar_pacientes_diario,
    trigger = CronTrigger(hour=11, minute=15, second=0),  # 00:00 UTC
    id      = 'limpieza_diaria',
    name    = 'Limpiar pacientes a medianoche',
    replace_existing = True
)

def start_scheduler():
    """Inicia el scheduler"""
    try:
        scheduler.start()
        print("[SCHEDULER] ✅ APScheduler iniciado correctamente")
        print(f"[SCHEDULER] 📅 Job programado: limpieza a las 00:00 UTC")
        print(f"[SCHEDULER] 🔄 Scheduler en ejecución...")
    except Exception as e:
        print(f"[SCHEDULER] ❌ Error al iniciar scheduler: {e}")
        
def shutdown_scheduler(signum=None, frame=None):
    """Apaga el scheduler limpiamente"""
    if scheduler.running:
        print(f"\n[SCHEDULER] 🛑 Apagando scheduler...")
        scheduler.shutdown(wait=False)
        print(f"[SCHEDULER] ✅ Scheduler apagado")
        
# Registrar handlers para señales
atexit.register(shutdown_scheduler)
signal.signal(signal.SIGTERM, shutdown_scheduler)
signal.signal(signal.SIGINT, shutdown_scheduler)


def pagina_protegida(*roles):
    """
    Protege rutas HTML.
    - Si no hay token válido → redirige a login (/)
    - Si el rol no coincide → redirige a login
    """
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            token = obtener_token_del_request()

            if not token:
                return redirect('/')

            payload = verificar_token(token)
            if not payload:
                return redirect('/')

            rol_usuario = normalizar_rol(payload.get('role', ''))

            if roles and rol_usuario not in roles:
                return redirect('/')

            request.current_user = payload
            return f(*args, **kwargs)
        return decorated
    return decorator


def generar_token(usuario_id, usuario, rol, nombre_completo):
    """Genera un JWT token firmado. Normaliza administrador -> admin."""
    rol_normalizado = normalizar_rol(rol)
    payload = {
        'user_id':        str(usuario_id),
        'usuario':        usuario,
        'role':           rol_normalizado,  # siempre 'admin', nunca 'administrador'
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

            rol_resp = normalizar_rol(user.rol)   # siempre 'admin', nunca 'administrador'
            return jsonify({
                'success':         True,
                'token':           token,
                'role':            rol_resp,    # para auth.js  (normalizado)
                'rol':             rol_resp,    # para login.js (normalizado)
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
    token = obtener_token_del_request()
    if not token:
        return jsonify({'success': False, 'authenticated': False, 'message': 'Sin token'}), 401

    payload = verificar_token(token)
    if not payload:
        return jsonify({'success': False, 'authenticated': False, 'message': 'Token invalido o expirado'}), 401

    # ── Verificar que el usuario siga existiendo y activo en BD ──────────────
    user = Usuario.query.filter_by(id=payload['user_id'], activo=True).first()
    if not user:
        return jsonify({
            'success': False, 'authenticated': False,
            'message': 'Usuario inactivo o eliminado'
        }), 401

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
    numero_recepcion = request.args.get('recepcion', '1')
    return render_template('screen.html', numero_recepcion=numero_recepcion)

@app.route('/api/tts', methods=['POST'])
def generar_tts():
    """
    Genera o devuelve desde cache un MP3 con el texto del turno.
    Body: { "texto": "Paciente Juan García. Código A C 1. Diríjase a recepción 2." }
    """
    try:
        data  = request.get_json()
        texto = data.get('texto', '').strip()

        if not texto:
            return jsonify({'success': False, 'message': 'Texto vacío'}), 400

        # Cache por hash del texto — evita regenerar el mismo anuncio
        hash_key   = hashlib.md5(texto.encode()).hexdigest()
        nombre_mp3 = f"{hash_key}.mp3"
        ruta_mp3   = os.path.join(TTS_CACHE_DIR, nombre_mp3)

        if not os.path.exists(ruta_mp3):
            tts = gTTS(text=texto, lang='es', slow=False)
            tts.save(ruta_mp3)
            print(f"[TTS] 🔊 MP3 generado: {nombre_mp3}")
        else:
            print(f"[TTS] 📦 MP3 desde cache: {nombre_mp3}")

        return jsonify({
            'success': True,
            'url':     f'/static/tts_cache/{nombre_mp3}'
        }), 200

    except Exception as e:
        print(f"[TTS] ❌ Error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500



# ===================================
# RUTAS DE GESTION DE USUARIOS
# ===================================



@app.route('/api/users', methods=['GET'])
@rol_requerido('admin')
def get_users():
    try:
        # activo=True → solo usuarios activos en el grid principal
        # Los inactivos (papelera) se consultan por /api/users/inactivos
        users      = Usuario.query.filter_by(activo=True).all()
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
            activo          = True,
            created_by      = request.current_user.get('usuario', 'admin')
        )
        new_user.set_password(password)
        db.session.add(new_user)
        # ── En create_user, justo ANTES del return final ──────────────
        db.session.commit()

        # AÑADIR ESTO:
        socketio.emit('usuario_creado', {
            'tipo':   'nuevo',
            'usuario': {
                'id':              str(new_user.id),
                'usuario':         new_user.usuario,
                'nombre_completo': new_user.nombre_completo,
                'rol':             new_user.rol,
            }
        }, room='admin')

        # También notificar a la sala del rol correspondiente
        socketio.emit('usuario_actualizado', {
            'tipo':   'nuevo',
            'usuario': {
                'id':              str(new_user.id),
                'nombre_completo': new_user.nombre_completo,
                'rol':             new_user.rol,
                'inicial':         (new_user.nombre_completo or new_user.usuario)[0].upper(),
            }
        }, room=new_user.rol)   # sala 'medico', 'recepcion', 'registro', etc.

        print(f"[{datetime.now()}] Usuario creado: {usuario} - Rol: {rol}")

        if new_user.rol == 'medico':
            socketio.emit('usuario_actualizado', {
                'tipo':    'nuevo',
                'usuario': {
                    'id':              str(new_user.id),
                    'nombre_completo': new_user.nombre_completo,
                    'rol':             new_user.rol,
                    'inicial':         (new_user.nombre_completo or new_user.usuario)[0].upper(),
                }
            }, room='registro')

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



@app.route('/api/users/recepcionistas', methods=['GET'])
@rol_requerido('admin')
def get_recepcionistas():
    try:
        recepcionistas = Usuario.query.filter_by(rol='recepcion', activo=True).all()
        return jsonify({'success': True, 'recepcionistas': [r.to_dict() for r in recepcionistas]}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': 'Error al obtener recepcionistas'}), 500


@app.route('/api/users/inactivos', methods=['GET'])
@rol_requerido('admin')
def get_users_inactivos():
    """Devuelve usuarios inactivos (papelera) — separado del listado principal."""
    try:
        users_inactivos = Usuario.query.filter_by(activo=False).all()
        return jsonify({'success': True, 'users': [u.to_dict() for u in users_inactivos]}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': 'Error al obtener usuarios inactivos'}), 500

@app.route('/api/users/<user_id>/desactivar', methods=['POST'])
@rol_requerido('admin')
def desactivar_usuario(user_id):
    """
    Mueve el usuario a la papelera (activo=False).
    NO borra de la BD. Equivale a "mover a papelera" en macOS/Windows.
    Notifica al rol afectado para que su página caiga/reaccione.
    """
    try:
        user = db.session.get(Usuario, user_id)
        if not user:
            return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404
        if user.usuario == 'admin':
            return jsonify({'success': False, 'message': 'No se puede desactivar el administrador principal'}), 403
        if not user.activo:
            return jsonify({'success': False, 'message': 'El usuario ya está en la papelera'}), 400

        user.activo = False

        # Si era recepcionista, liberar pantallas asignadas
        if user.rol == 'recepcion':
            for pantalla in Pantalla.query.filter_by(recepcionista_id=user.id).all():
                pantalla.recepcionista_id = None
                socketio.emit('recepcionista_asignado', {
                    'pantalla_id':          str(pantalla.id),
                    'recepcionista_nombre': None
                }, room='screen')

        db.session.commit()

        payload = {
            'usuario_id': str(user.id),
            'usuario':    user.usuario,
            'rol':        user.rol,
            'nombre':     user.nombre_completo,
        }

        # Notificar a TODAS las salas relevantes para que las páginas "caigan"
        salas = ['admin', 'registro', 'recepcion', user.rol]
        for sala in set(salas):  # set() evita duplicados
            socketio.emit('usuario_desactivado', payload, room=sala)

        print(f"[{datetime.now()}] Usuario movido a papelera: {user.usuario} ({user.rol})")
        return jsonify({'success': True, 'message': f'Usuario {user.usuario} movido a papelera'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/users/<user_id>/restaurar', methods=['POST'])
@rol_requerido('admin')
def restaurar_usuario(user_id):
    """
    Restaura un usuario desde la papelera (activo=True).
    Equivale a "Sacar de la papelera" en macOS/Windows.
    """
    try:
        user = db.session.get(Usuario, user_id)
        if not user:
            return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404
        if user.activo:
            return jsonify({'success': False, 'message': 'El usuario ya está activo'}), 400

        user.activo = True
        db.session.commit()

        payload = {
            'usuario': {
                'id':              str(user.id),
                'usuario':         user.usuario,
                'nombre_completo': user.nombre_completo,
                'rol':             user.rol,
                'inicial':         (user.nombre_completo or user.usuario)[0].upper(),
            }
        }

        salas = ['admin', 'registro', 'recepcion', user.rol]
        for sala in set(salas):
            socketio.emit('usuario_restaurado', payload, room=sala)

        print(f"[{datetime.now()}] Usuario restaurado: {user.usuario} ({user.rol})")
        return jsonify({'success': True, 'message': f'Usuario {user.usuario} restaurado'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500



@app.route('/api/users/vaciar-papelera', methods=['DELETE'])
@rol_requerido('admin')
def vaciar_papelera_usuarios():
    """
    Elimina DEFINITIVAMENTE todos los usuarios inactivos.
    Borra de la BD. Equivale a "Vaciar papelera" en macOS/Windows.
    """
    try:
        inactivos = Usuario.query.filter_by(activo=False).all()
        if not inactivos:
            return jsonify({'success': True, 'eliminados': 0}), 200

        # Guardar datos antes de borrar (para sockets post-commit)
        datos = [(str(u.id), u.rol, u.usuario, u.nombre_completo) for u in inactivos]

        # Limpiar FKs de pantallas antes de borrar
        for user in inactivos:
            if user.rol == 'recepcion':
                Pantalla.query.filter_by(recepcionista_id=user.id).update(
                    {'recepcionista_id': None}, synchronize_session='fetch'
                )

        # Borrar uno a uno para respetar el ORM y las constraints
        for user in inactivos:
            db.session.delete(user)

        db.session.commit()

        # Notificar a todas las salas
        for uid, rol, usuario, nombre in datos:
            payload = {'usuario_id': uid, 'rol': rol, 'usuario': usuario, 'nombre': nombre}
            for sala in set(['admin', 'registro', 'recepcion', rol]):
                socketio.emit('usuario_eliminado_definitivo', payload, room=sala)

        print(f"[{datetime.now()}] Papelera vaciada: {len(datos)} usuarios eliminados definitivamente")
        return jsonify({'success': True, 'eliminados': len(datos)}), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error vaciando papelera: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/users/<user_id>', methods=['DELETE'])
@rol_requerido('admin')
def delete_user(user_id):
    """
    Elimina DEFINITIVAMENTE un usuario específico desde la papelera.
    Solo debería llamarse si el usuario ya está inactivo (activo=False).
    """
    try:
        user = db.session.get(Usuario, user_id)
        if not user:
            return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404
        if user.usuario == 'admin':
            return jsonify({'success': False, 'message': 'No se puede eliminar el administrador principal'}), 403
        if user.activo:
            # Salvaguarda: no permitir borrar usuarios activos directamente
            return jsonify({
                'success': False,
                'message': 'Mueve el usuario a la papelera antes de eliminarlo definitivamente'
            }), 400

        uid    = str(user.id)
        rol    = user.rol
        nombre = user.nombre_completo
        usuario_nombre = user.usuario

        # Limpiar FKs de pantallas
        if rol == 'recepcion':
            for pantalla in Pantalla.query.filter_by(recepcionista_id=user.id).all():
                pantalla.recepcionista_id = None

        db.session.delete(user)
        db.session.commit()

        payload = {'usuario_id': uid, 'rol': rol, 'usuario': usuario_nombre, 'nombre': nombre}
        for sala in set(['admin', 'registro', 'recepcion', rol]):
            socketio.emit('usuario_eliminado_definitivo', payload, room=sala)

        print(f"[{datetime.now()}] Usuario eliminado definitivamente: {usuario_nombre} ({rol})")
        return jsonify({'success': True, 'message': f'Usuario {usuario_nombre} eliminado definitivamente'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500




@app.route('/api/users/<user_id>', methods=['PUT'])
@rol_requerido('admin')
def update_user(user_id):
    try:
        user = db.session.get(Usuario, user_id)
        if not user:
            return jsonify({'success': False, 'message': 'Usuario no encontrado'}), 404

        data = request.get_json()

        nuevo_usuario = data.get('usuario', '').strip()
        if not nuevo_usuario:
            return jsonify({'success': False, 'message': 'El usuario es requerido'}), 400

        if nuevo_usuario != user.usuario:
            existente = Usuario.query.filter_by(usuario=nuevo_usuario).first()
            if existente and str(existente.id) != user_id:
                return jsonify({'success': False, 'message': 'El nombre de usuario ya existe'}), 400

        user.usuario         = nuevo_usuario
        user.nombre_completo = data.get('nombre_completo', user.nombre_completo)
        user.rol             = data.get('rol', user.rol)
        user.updated_at      = datetime.utcnow()

        if data.get('password', '').strip():
            user.set_password(data['password'])

        db.session.commit()

        payload_admin = {
            'tipo':    'edicion',
            'usuario': {
                'id':              str(user.id),
                'usuario':         user.usuario,
                'nombre_completo': user.nombre_completo,
                'rol':             user.rol,
            }
        }
        socketio.emit('usuario_actualizado', payload_admin, room='admin')

        payload_rol = {
            'tipo':    'edicion',
            'usuario': {
                'id':              str(user.id),
                'nombre_completo': user.nombre_completo,
                'rol':             user.rol,
                'inicial':         (user.nombre_completo or user.usuario)[0].upper(),
            }
        }
        for sala in set(['registro', 'recepcion', user.rol]):
            socketio.emit('usuario_actualizado', payload_rol, room=sala)

        return jsonify({
            'success': True,
            'message': f'Usuario {user.usuario} actualizado',
            'user':    user.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500





# ===================================
# RUTAS DE PANTALLAS
# ===================================

@app.route('/api/pantallas', methods=['GET'])
@rol_requerido('admin')
def get_pantallas():
    try:
        from sqlalchemy.orm import joinedload
        pantallas = (Pantalla.query
                     .options(joinedload(Pantalla.recepcionista))  # ← carga la relación en 1 query
                     .order_by(Pantalla.numero)
                     .all())
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

@app.route('/api/recepcion/limpiar-historial', methods=['POST'])
@rol_requerido('recepcion', 'admin')
def limpiar_historial_recepcion():
    """
    Limpia el historial de la recepción actual (del usuario autenticado).
    
    VALIDACIONES DE SEGURIDAD:
    1. Usuario debe estar autenticado (ya hecho por @rol_requerido)
    2. Usuario debe ser recepcionista o admin
    3. Recepcionista SOLO puede limpiar su propio historial
    4. Admin puede limpiar cualquier historial (si proporciona recepcionista_id)
    """
    try:
        data = request.get_json() or {}
        usuario_autenticado = request.current_user
        rol_usuario = usuario_autenticado.get('role', 'recepcion').lower()
        usuario_id = usuario_autenticado.get('user_id')
        
        print(f"[LIMPIAR] 📢 Solicitud de limpiar historial")
        print(f"[LIMPIAR] Usuario autenticado: {usuario_autenticado.get('usuario')} (rol: {rol_usuario})")
        
        # ── OBTENER EL USUARIO AUTENTICADO ──────────────────────────────────────
        usuario = db.session.get(Usuario, usuario_id)
        if not usuario:
            return jsonify({
                'success': False,
                'message': 'Usuario no encontrado'
            }), 404
        
        # ── CASO 1: RECEPCIONISTA (SOLO su propio historial) ────────────────────
        if rol_usuario == 'recepcion':
            print(f"[LIMPIAR] 🔒 Modo RECEPCIONISTA - SOLO puede limpiar su historial")
            
            # Recepcionista SOLO puede limpiar historial de pantallas SUYAS
            pantallas_suyas = Pantalla.query.filter_by(
                recepcionista_id=usuario_id,
                estado='vinculada'
            ).all()
            
            if not pantallas_suyas:
                print(f"[LIMPIAR] ⚠️ Recepcionista {usuario.nombre_completo} no tiene pantallas vinculadas")
                return jsonify({
                    'success': True,
                    'message': 'No tienes pantallas vinculadas',
                    'pantallas_limpiadas': 0
                }), 200
            
            # Limpiar historial SOLO de sus pantallas
            for pantalla in pantallas_suyas:
                sala_pantalla = f'screen_{pantalla.id}'
                socketio.emit('limpiar_historial', {
                    'motivo': 'limpiar_manual',
                    'numRecepcion': usuario.nombre_completo,
                    'timestamp': datetime.utcnow().isoformat()
                }, room=sala_pantalla)
                print(f"[LIMPIAR] ✅ Historial limpiado - Pantalla {pantalla.numero} (Recepción: {usuario.nombre_completo})")
            
            return jsonify({
                'success': True,
                'message': f'Historial limpiado para {len(pantallas_suyas)} pantalla(s)',
                'pantallas_limpiadas': len(pantallas_suyas)
            }), 200
        
        # ── CASO 2: ADMIN (puede limpiar cualquier recepcionista) ────────────────
        elif rol_usuario == 'admin':
            print(f"[LIMPIAR] 👨‍💼 Modo ADMIN - Puede limpiar cualquier recepción")
            
            recepcionista_id = data.get('recepcionista_id')
            
            if not recepcionista_id:
                return jsonify({
                    'success': False,
                    'message': 'Admin debe proporcionar recepcionista_id'
                }), 400
            
            # Validar que el recepcionista existe
            recepcionista = db.session.get(Usuario, recepcionista_id)
            if not recepcionista or recepcionista.rol != 'recepcion':
                return jsonify({
                    'success': False,
                    'message': 'Recepcionista no válido'
                }), 404
            
            # Limpiar pantallas del recepcionista
            pantallas_recepcionista = Pantalla.query.filter_by(
                recepcionista_id=recepcionista_id,
                estado='vinculada'
            ).all()
            
            for pantalla in pantallas_recepcionista:
                sala_pantalla = f'screen_{pantalla.id}'
                socketio.emit('limpiar_historial', {
                    'motivo': 'limpiar_manual',
                    'numRecepcion': recepcionista.nombre_completo,
                    'timestamp': datetime.utcnow().isoformat()
                }, room=sala_pantalla)
                print(f"[LIMPIAR] ✅ Historial limpiado - Pantalla {pantalla.numero} (Recepción: {recepcionista.nombre_completo})")
            
            return jsonify({
                'success': True,
                'message': f'Historial de {recepcionista.nombre_completo} limpiado ({len(pantallas_recepcionista)} pantalla(s))',
                'pantallas_limpiadas': len(pantallas_recepcionista)
            }), 200
        
        else:
            return jsonify({
                'success': False,
                'message': 'Rol no autorizado para limpiar historial'
            }), 403

    except Exception as e:
        print(f"[LIMPIAR] ❌ Error: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error al limpiar historial: {str(e)}'
        }), 500



@app.route('/api/pantallas/<pantalla_id>/vincular', methods=['POST'])
@rol_requerido('admin')
def vincular_pantalla(pantalla_id):
    try:
        data             = request.get_json()
        codigo           = data.get('codigo', '').strip()
        recepcionista_id = data.get('recepcionista_id', None)

        if not codigo or len(codigo) != 6:
            return jsonify({'success': False, 'message': 'Codigo invalido'}), 400

        # ── Validación 1: recepcionista obligatorio ──────────────────
        if not recepcionista_id:
            return jsonify({
                'success': False,
                'message': 'Debes asignar un recepcionista para vincular la pantalla'
            }), 400

        # ── Validación 2: recepcionista exclusivo ────────────────────
        pantalla_ocupada = (Pantalla.query
            .filter(
                Pantalla.recepcionista_id == recepcionista_id,
                Pantalla.estado           == 'vinculada',
                Pantalla.id               != pantalla_id
            ).first())

        if pantalla_ocupada:
            recep        = db.session.get(Usuario, recepcionista_id)
            nombre_recep = recep.nombre_completo if recep else 'El recepcionista'
            return jsonify({
                'success': False,
                'message': f'"{nombre_recep}" ya está asignado a la Pantalla {pantalla_ocupada.numero}'
            }), 409

        # ── Buscar pantalla pendiente con ese código ──────────────────
        pantalla = Pantalla.query.filter_by(
            id=pantalla_id, codigo_vinculacion=codigo, estado='pendiente'
        ).first()

        if not pantalla:
            return jsonify({
                'success': False,
                'message': 'Código incorrecto o pantalla no disponible'
            }), 404

        # ── Validar recepcionista existe y está activo ────────────────
        recepcionista = db.session.get(Usuario, recepcionista_id)
        if not recepcionista or recepcionista.rol != 'recepcion' or not recepcionista.activo:
            return jsonify({'success': False, 'message': 'Recepcionista no válido'}), 400

        # ── Vincular + asignar en una sola transacción ───────────────
        pantalla.estado           = 'vinculada'
        pantalla.vinculada_at     = datetime.utcnow()
        pantalla.recepcionista_id = recepcionista_id  # ← atómico
        db.session.commit()

        socketio.emit('pantalla_vinculada', {
            'pantalla_id':          str(pantalla.id),
            'numero':               pantalla.numero,
            'estado':               'vinculada',
            'recepcionista_nombre': recepcionista.nombre_completo,
            'sala_propia':          f'screen_{pantalla.id}'   
        }, room='screen')

        socketio.emit('recepcionista_asignado', {
            'pantalla_id':          str(pantalla.id),
            'recepcionista_nombre': recepcionista.nombre_completo
        }, room='screen')

        return jsonify({
            'success':  True,
            'message':  'Pantalla vinculada',
            'pantalla': pantalla.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Error al vincular pantalla'}), 500

@app.route('/api/pantallas/<pantalla_id>/desvincular', methods=['POST'])
@rol_requerido('admin')
def desvincular_pantalla(pantalla_id):
    try:
        pantalla = db.session.get(Pantalla, pantalla_id)
        if not pantalla:
            return jsonify({'success': False, 'message': 'Pantalla no encontrada'}), 404

        pantalla.device_id          = None
        pantalla.codigo_vinculacion = None
        pantalla.estado             = 'disponible'
        pantalla.vinculada_at       = None
        db.session.commit()

        socketio.emit('pantalla_desvinculada', {
            'pantalla_id': str(pantalla.id),
            'numero':      pantalla.numero,
            'estado':      'desvinculada'
        }, room='screen')

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
        pantalla         = db.session.get(Pantalla, pantalla_id)

        if not pantalla:
            return jsonify({'success': False, 'message': 'Pantalla no encontrada'}), 404

        if not recepcionista_id:
            pantalla.recepcionista_id = None
            db.session.commit()
            return jsonify({'success': True, 'message': 'Recepcionista desasignado', 'pantalla': pantalla.to_dict()}), 200

        recepcionista = db.session.get(Usuario, recepcionista_id)
        if not recepcionista:
            return jsonify({'success': False, 'message': 'Recepcionista no encontrado'}), 404
        if recepcionista.rol != 'recepcion':
            return jsonify({'success': False, 'message': 'El usuario no es recepcionista'}), 400

        pantalla.recepcionista_id = recepcionista_id
        db.session.commit()

        socketio.emit('recepcionista_asignado', {
            'pantalla_id':          str(pantalla.id),
            'recepcionista_nombre': recepcionista.nombre_completo if recepcionista_id else None
        }, room='admin')

        socketio.emit('recepcionista_asignado', {
            'pantalla_id':          str(pantalla.id),
            'recepcionista_nombre': recepcionista.nombre_completo if recepcionista_id else None
        }, room='screen')


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

        socketio.emit('pantalla_pendiente', {
            'pantalla_id': str(pantalla_disponible.id),
            'numero':      pantalla_disponible.numero,
            'codigo':      codigo,
            'estado':      'pendiente'
        }, room='admin')


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
        medicos_data = []

        for medico in medicos:
            nombre_completo = medico.nombre_completo or medico.usuario

            # Detectar prefijo: "Dr." o "Dra." al inicio
            prefijo = ''
            nombre_sin_prefijo = nombre_completo
            for p in ['Dr. ', 'Dra. ']:
                if nombre_completo.startswith(p):
                    prefijo            = p.strip()   # "Dr." o "Dra."
                    nombre_sin_prefijo = nombre_completo[len(p):]
                    break

            # Inicial SOLO del nombre (sin prefijo) para los códigos
            inicial_codigo = nombre_sin_prefijo[0].upper() if nombre_sin_prefijo else 'X'

            medicos_data.append({
                'id':                medico.id,
                'nombre_completo':   nombre_completo,       # "Dr. juan"
                'nombre_sin_prefijo': nombre_sin_prefijo,   # "juan"
                'prefijo':           prefijo,               # "Dr."
                'usuario':           medico.usuario,
                'inicial':           nombre_completo[0].upper(),      # para avatar
                'inicial_codigo':    inicial_codigo,        # para generar códigos
            })

        return jsonify({'success': True, 'medicos': medicos_data, 'total': len(medicos_data)}), 200

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ===================================
# RUTAS DE PACIENTES
# ===================================

def generar_codigo_paciente(medico_id, motivo):
    """
    Genera código ESTABLE del paciente.
    
    Formato: LETRA-MOTIVO-SECUENCIA
    Ejemplo: M-I-001, M-C-002...
    
    - LETRA: Primera letra del NOMBRE (ignorando "Dr." o "Dra.")
    - MOTIVO: Primera letra del motivo (C=Consulta, I=Información)
    - SECUENCIA: 001, 002, 003... (secuencial por médico+motivo)
    """
    
    # Obtener médico
    medico = db.session.get(Usuario, medico_id)
    if not medico:
        raise Exception("Médico no encontrado")
    
    # 1️⃣ Obtener nombre del médico y eliminar prefijo "Dr." o "Dra."
    nombre_medico = medico.nombre_completo or medico.usuario
    
    # Eliminar prefijos comunes
    nombre_limpio = nombre_medico.replace("Dr.", "").replace("Dra.", "").strip()
    
    # Tomar primer caracter válido
    letra_medico = nombre_limpio[0].upper() if nombre_limpio else "X"
    
    print(f"[GEN_PAC] nombre_medico original: '{nombre_medico}'")
    print(f"[GEN_PAC] nombre_limpio (sin prefijo): '{nombre_limpio}'")
    print(f"[GEN_PAC] letra_medico: '{letra_medico}'")
    
    # 2️⃣ Obtener letra del motivo
    motivo_normalizado = motivo.lower().strip()
    if 'consulta' in motivo_normalizado:
        letra_motivo = 'C'
    elif 'informacion' in motivo_normalizado or 'información' in motivo_normalizado:
        letra_motivo = 'I'
    else:
        letra_motivo = motivo[0].upper() if motivo else 'X'
    
    # 3️⃣ Contar pacientes previos con esta combinación (médico+motivo)
    pacientes_previos = Paciente.query.filter(
        Paciente.medico_id == medico_id,
        Paciente.motivo == motivo
    ).count()
    secuencia = f"{pacientes_previos + 1:03d}"  # 001, 002, 003...
    
    codigo_paciente = f"{letra_medico}-{letra_motivo}-{secuencia}"
    
    print(f"[GEN_PAC] Motivo: {motivo} → {letra_motivo}")
    print(f"[GEN_PAC] Pacientes previos (medico+motivo): {pacientes_previos}")
    print(f"[GEN_PAC] código_paciente final: {codigo_paciente}")
    
    return codigo_paciente

def generar_codigo_turno(paciente_id, medico_id, motivo):
    """
    Genera un código de turno ÚNICO SIN sufijo -Tn.
    
    Si el código del paciente ya existe en BD, incrementa el número final:
    - "M-I-001" existe → intenta "M-I-002" → ✅
    - Sin agregar sufijo -T1, -T2, etc.
    """
    
    paciente = db.session.get(Paciente, paciente_id)
    if not paciente:
        raise Exception("Paciente no encontrado")

    # 1️⃣ Asegurar que el paciente tenga código estable
    if not paciente.codigo_paciente:
        paciente.codigo_paciente = generar_codigo_paciente(medico_id, motivo)
        db.session.flush()

    # 2️⃣ Base del código
    codigo_base = paciente.codigo_paciente
    codigo_turno = codigo_base
    contador = 0
    
    # 3️⃣ Si el código ya existe, incrementar número final
    while Turno.query.filter_by(codigo_turno=codigo_turno).first():
        contador += 1
        
        # Extraer partes y incrementar el número final
        partes = codigo_base.split('-')
        
        if partes[-1].isdigit():
            # Si termina en número (ej: "M-I-001"), incrementar ese número
            numero = int(partes[-1]) + contador
            codigo_turno = '-'.join(partes[:-1]) + f"-{numero:03d}"
        else:
            # Si no termina en número, simplemente agregar contador
            codigo_turno = f"{codigo_base}-{contador}"
        
        # Prevención de loop infinito
        if contador > 1000:
            raise Exception("No se pudo generar código único de turno")
    
    print(f"[GEN_CODIGO] Paciente: {paciente.nombre}")
    print(f"[GEN_CODIGO] Código base: {codigo_base}")
    print(f"[GEN_CODIGO] Código turno final (ÚNICO): {codigo_turno}")
    
    return codigo_turno



@app.route('/api/pacientes/registrar', methods=['POST'])
@rol_requerido('registro', 'admin')
def registrar_paciente():
    try:
        data      = request.get_json()
        nombre    = data.get('nombre', '').strip()
        medico_id = data.get('medico_id', '').strip()
        motivo    = data.get('motivo', '').strip()

        if not nombre or not medico_id or not motivo:
            return jsonify({'success': False, 'message': 'Nombre, médico y motivo son obligatorios'}), 400

        medico = Usuario.query.filter_by(id=medico_id, rol='medico', activo=True).first()
        if not medico:
            return jsonify({'success': False, 'message': 'Médico no encontrado'}), 404

        # ── Normalización del nombre para comparación ──────────────
        nombre_normalizado = nombre.lower().strip()

        # ── Buscar si ya existe este paciente ──
        paciente_existente = Paciente.query.filter(
            db.func.lower(db.func.trim(Paciente.nombre)) == nombre_normalizado,
            Paciente.medico_id == medico_id,
            Paciente.motivo    == motivo
        ).first()

        ahora = datetime.utcnow()

        if paciente_existente:
            # ══════════════════════════════════════════════════════
            # CASO: RE-REGISTRO
            # ══════════════════════════════════════════════════════
            print(f"[REGISTRO] RE-REGISTRO detectado para: {nombre}")

            # 1. Marcar turno anterior como 'reemplazado'
            turno_anterior = (Turno.query
                              .filter_by(paciente_id=paciente_existente.id, estado='pendiente')
                              .order_by(Turno.created_at.desc())
                              .first())

            codigo_anterior = None
            if turno_anterior:
                codigo_anterior         = turno_anterior.codigo_turno
                turno_anterior.estado   = 'reemplazado'
                print(f"[REGISTRO] Turno anterior {codigo_anterior} marcado como reemplazado")

            # 2. Generar NUEVO código de turno (sin sufijo -T1, -T2)
            # ✅ generar_codigo_turno() ahora verifica duplicados y genera alternativo
            nuevo_codigo_turno = generar_codigo_turno(
                paciente_existente.id, 
                medico_id, 
                motivo
            )

            # 3. Crear el nuevo turno
            nuevo_turno = Turno(
                id           = str(uuid.uuid4()),
                codigo_turno = nuevo_codigo_turno,
                paciente_id  = paciente_existente.id,
                medico_id    = medico_id,
                estado       = 'pendiente',
                fecha        = ahora.date(),
                hora         = ahora.time(),
                motivo       = motivo,
                created_at   = ahora
            )
            db.session.add(nuevo_turno)
            db.session.commit()

            print(f"✅ RE-REGISTRO: {nombre}")
            print(f"   Anterior: {codigo_anterior}")
            print(f"   Nuevo:    {nuevo_codigo_turno}")

            return jsonify({
                'success':      True,
                'tipo':         'reimpresion',
                'codigo_turno': nuevo_codigo_turno,
                'codigo_anterior': codigo_anterior,
                'paciente': {
                    'id':     paciente_existente.id,
                    'nombre': paciente_existente.nombre,
                    'medico': medico.nombre_completo,
                    'motivo': motivo,
                    'codigo_paciente': paciente_existente.codigo_paciente
                },
                'message': f'Turno re-generado. Código anterior {codigo_anterior} fue reemplazado.'
            }), 200

        else:
            # ══════════════════════════════════════════════════════
            # CASO: NUEVO PACIENTE
            # ══════════════════════════════════════════════════════
            print(f"[REGISTRO] NUEVO PACIENTE: {nombre}")

            # 1. Crear el paciente
            nuevo_paciente = Paciente(
                id         = str(uuid.uuid4()),
                nombre     = nombre,
                apellido   = data.get('apellido', ''),
                motivo     = motivo,
                medico_id  = medico_id,
                created_at = ahora
            )
            
            # 2. Generar código estable del paciente
            nuevo_paciente.codigo_paciente = generar_codigo_paciente(medico_id, motivo)
            
            db.session.add(nuevo_paciente)
            db.session.flush()

            # 3. Generar código de turno (sin sufijo -T1)
            primer_codigo_turno = generar_codigo_turno(
                nuevo_paciente.id, 
                medico_id, 
                motivo
            )

            # 4. Crear el turno
            turno = Turno(
                id           = str(uuid.uuid4()),
                codigo_turno = primer_codigo_turno,
                paciente_id  = nuevo_paciente.id,
                medico_id    = medico_id,
                estado       = 'pendiente',
                fecha        = ahora.date(),
                hora         = ahora.time(),
                motivo       = motivo,
                created_at   = ahora
            )
            db.session.add(turno)
            db.session.commit()

            print(f"✅ NUEVO PACIENTE: {nombre}")
            print(f"   código_paciente: {nuevo_paciente.codigo_paciente}")
            print(f"   código_turno:    {primer_codigo_turno}")

            socketio.emit('nuevo_codigo', {
                'tipo':         'nuevo',
                'codigo_turno': primer_codigo_turno,
                'paciente': {
                    'id':     nuevo_paciente.id,
                    'nombre': nuevo_paciente.nombre,
                    'medico_id': medico_id,
                    'medico': medico.nombre_completo,
                    'motivo': motivo,
                    'codigo_paciente': nuevo_paciente.codigo_paciente
                }
            }, room='recepcion')

            return jsonify({
                'success':      True,
                'tipo':         'nuevo',
                'codigo_turno': primer_codigo_turno,
                'paciente': {
                    'id':     nuevo_paciente.id,
                    'nombre': nuevo_paciente.nombre,
                    'medico': medico.nombre_completo,
                    'motivo': motivo,
                    'codigo_paciente': nuevo_paciente.codigo_paciente
                }
            }), 201

    except IntegrityError as e:
        db.session.rollback()
        error_msg = str(e)
        
        print(f"❌ IntegrityError: {error_msg}")
        
        if 'UNIQUE constraint failed' in error_msg and 'codigo_turno' in error_msg:
            print("[DEBUG] Código de turno duplicado detectado")
            return jsonify({
                'success': False, 
                'message': 'Error: código de turno duplicado. Intenta de nuevo.'
            }), 500
        
        return jsonify({
            'success': False, 
            'message': f'Error de base de datos: {error_msg}'
        }), 500
    
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error general: {str(e)}")
        return jsonify({
            'success': False, 
            'message': f'Error: {str(e)}'
        }), 500



@app.route('/api/recepcion/pacientes', methods=['GET'])
@rol_requerido('recepcion', 'admin')
def obtener_pacientes_recepcion():
    """
    Retorna la lista de médicos con sus pacientes pendientes.
    Para cada paciente se incluye el código de turno ACTIVO (último pendiente).
    Así, cuando un paciente fue re-registrado, recepción siempre ve el código nuevo.
    """
    try:
        medicos   = Usuario.query.filter_by(rol='medico', activo=True).all()
        resultado = []

        for medico in medicos:
            # Solo pacientes con al menos un turno pendiente
            pacientes = (Paciente.query
                         .filter_by(medico_id=medico.id)
                         .all())

            pacientes_data = []
            for p in pacientes:
                turno_activo = (Turno.query
                                .filter_by(paciente_id=p.id, estado='pendiente')
                                .order_by(Turno.created_at.desc())
                                .first())
                if not turno_activo:
                    continue  # paciente sin turno activo → no mostrar en recepción

                pacientes_data.append({
                    'id':         p.id,
                    'nombre':     p.nombre,
                    'codigo':     turno_activo.codigo_turno,   # código de turno ACTIVO
                    'codigo_paciente': p.codigo_paciente,
                    'motivo':     p.motivo,
                    'created_at': p.created_at.isoformat() if p.created_at else None
                })

            medico_data = {
                'id':              medico.id,
                'nombre':          medico.nombre_completo or medico.usuario,
                'usuario':         medico.usuario,
                'inicial':         (medico.nombre_completo or medico.usuario)[0].upper(),
                'total_pacientes': len(pacientes_data),
                'pacientes':       pacientes_data
            }
            resultado.append(medico_data)

        return jsonify({
            'success':       True,
            'medicos':       resultado,
            'total_medicos': len(resultado)
        }), 200

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
    """
    Busca por código de turno (ej. A-C-001-T2) O por código de paciente (ej. A-C-001).
    Siempre retorna el turno activo del paciente encontrado.
    """
    try:
        # Intentar buscar por código de turno exacto
        turno = Turno.query.filter_by(codigo_turno=codigo).first()

        if turno:
            paciente = db.session.get(Paciente, turno.paciente_id)
        else:
            # Intentar buscar por código de paciente
            paciente = Paciente.query.filter_by(codigo_paciente=codigo).first()

        if not paciente:
            return jsonify({'success': False, 'message': 'Paciente no encontrado'}), 404

        medico = db.session.get(Usuario, paciente.medico_id)

        # Turno activo actual
        turno_activo = (Turno.query
                        .filter_by(paciente_id=paciente.id, estado='pendiente')
                        .order_by(Turno.created_at.desc())
                        .first())

        return jsonify({
            'success':  True,
            'paciente': {
                'id':              paciente.id,
                'nombre':          paciente.nombre,
                'apellido':        paciente.apellido,
                'nombre_completo': f"{paciente.nombre} {paciente.apellido}".strip(),
                'codigo_paciente': paciente.codigo_paciente,
                'codigo':          turno_activo.codigo_turno if turno_activo else None,
                'motivo':          paciente.motivo,
                'medico':          medico.nombre_completo if medico else 'Sin médico',
                'created_at':      paciente.created_at.isoformat() if paciente.created_at else None
            }
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/recepcion/paciente/<paciente_id>', methods=['DELETE'])
@rol_requerido('recepcion', 'admin')
def eliminar_paciente(paciente_id):
    try:
        paciente = db.session.get(Paciente, paciente_id)
        if not paciente:
            return jsonify({'success': False, 'message': 'Paciente no encontrado'}), 404

        nombre    = paciente.nombre
        medico_id = str(paciente.medico_id)

        # Eliminar primero los turnos (FK constraint)
        Turno.query.filter_by(paciente_id=paciente_id).delete()
        
        # Ahora sí eliminar el paciente
        db.session.delete(paciente)
        db.session.commit()

        socketio.emit('paciente_eliminado', {
            'paciente_id': paciente_id,
            'nombre':      nombre,
            'medico_id':   medico_id
        }, room='registro')

        return jsonify({'success': True, 'message': f'Paciente {nombre} eliminado'}), 200

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

def resetear_pantalla_delayed(device_fp):
    """
    Resetea la pantalla DESPUÉS del grace period (5 segundos).
    Solo se ejecuta si NO hubo reconexión en ese tiempo.
    Usa flag para evitar ejecuciones duplicadas en gevent.
    """
    
    time.sleep(5)
    
    # ← VERIFICAR si este timer debe ejecutarse
    if not _screen_disconnect_active.get(device_fp, False):
        print(f"[GRACE] ⏸️ Timer cancelado para {device_fp[:20]}... (reconexión detectada)")
        return
    
    with app.app_context():
        pantalla = Pantalla.query.filter_by(device_id=device_fp).first()
        if not pantalla:
            print(f"[GRACE] ❌ Pantalla con device_id {device_fp[:20]}... no encontrada")
            _screen_disconnect_timers.pop(device_fp, None)
            _screen_disconnect_active.pop(device_fp, None)
            sids_to_remove = [sid for sid, fp in _screen_sids.items() if fp == device_fp]
            for sid in sids_to_remove:
                print(f"[GRACE] Removiendo {sid} de dicts")
                _screen_sids.pop(sid, None)
                _screen_pantalla.pop(sid, None)
            return

        numero_pantalla = pantalla.numero
        pantalla_id     = str(pantalla.id)

        print(f"[GRACE] ⏱️ Grace period expirado → reseteando Pantalla {numero_pantalla}")

        if pantalla.estado in ('pendiente', 'vinculada'):
            pantalla.device_id          = None
            pantalla.codigo_vinculacion = None
            pantalla.estado             = 'disponible'
            pantalla.vinculada_at       = None
            pantalla.recepcionista_id   = None

        db.session.commit()
        print(f"[GRACE] ✅ Pantalla {numero_pantalla} reseteada a 'disponible'")

        socketio.emit('pantalla_desvinculada', {
            'pantalla_id': pantalla_id,
            'numero':      numero_pantalla,
            'estado':      'disponible',
            'motivo':      'screen_cerrada'
            
        }, room='admin')

        # Limpiar
        _screen_disconnect_timers.pop(device_fp, None)
        _screen_disconnect_active.pop(device_fp, None)
        
        sids_to_remove = [sid for sid, fp in _screen_sids.items() if fp == device_fp]
        for sid in sids_to_remove:
            print(f"[GRACE] Removiendo {sid} de dicts después de reset")
            _screen_sids.pop(sid, None)
            _screen_pantalla.pop(sid, None)




@socketio.on('connect')
def on_connect():
    print(f"[WS] Cliente conectado: {request.sid}")


@socketio.on('disconnect')
def on_disconnect():
    print(f"[WS] Cliente desconectado: {request.sid}")

    device_fp = _screen_sids.get(request.sid, None)
    if not device_fp:
        return

    print(f"[WS] 📺 Screen desconectada (GRACE PERIOD 5s): {device_fp[:20]}...")

    # ── Marcar que este timer DEBE ejecutarse ──────────────────────
    _screen_disconnect_active[device_fp] = True
    
    # ── Iniciar grace period de 5 segundos ─────────────────────────
    print(f"[GRACE] ⏳ Grace period iniciado — esperando reconexión...")
    timer = socketio.start_background_task(resetear_pantalla_delayed, device_fp)
    _screen_disconnect_timers[device_fp] = timer

@socketio.on('join')
def on_join(data):
    room      = data.get('room', '')
    device_fp = data.get('device_fingerprint', None)
    join_room(room)
    print(f"[WS] Cliente {request.sid} entró a sala: {room}")

    if room == 'screen' and device_fp:
        # ── PASO 1: CANCELAR grace period si esta screen se reconecta ─────────
        if device_fp in _screen_disconnect_timers:
            print(f"[GRACE] ✅ Reconexión detectada → screen salvada")
            # ← MARCAR que el timer NO debe ejecutarse
            _screen_disconnect_active[device_fp] = False
            _screen_disconnect_timers.pop(device_fp, None)
        
        # ── PASO 2: Encontrar el SID ANTIGUO del mismo device_fp ──────────────
        old_sid = None
        for sid, fp in list(_screen_sids.items()):
            if fp == device_fp and sid != request.sid:
                old_sid = sid
                break
        
        if old_sid:
            print(f"[WS] 🔄 Migrando de {old_sid} → {request.sid}")
            
            # Migrar pantalla_id del sid antiguo al nuevo
            if old_sid in _screen_pantalla:
                pantalla_id = _screen_pantalla[old_sid]
                _screen_pantalla[request.sid] = pantalla_id
                print(f"[WS] 📋 Pantalla ID migrada: {pantalla_id}")
                del _screen_pantalla[old_sid]
            
            # Remover el sid antiguo
            del _screen_sids[old_sid]
        
        # ── PASO 3: Agregar el nuevo sid ──────────────────────────────────────
        _screen_sids[request.sid] = device_fp

        # ── PASO 4: Buscar pantalla y unirse a sala propia ────────────────────
        pantalla = Pantalla.query.filter_by(device_id=device_fp).first()
        if pantalla:
            sala_propia = f'screen_{pantalla.id}'
            join_room(sala_propia)
            _screen_pantalla[request.sid] = str(pantalla.id)
            print(f"[WS] ✅ Screen {request.sid} → sala {sala_propia} (estado: {pantalla.estado})")
        else:
            print(f"[WS] ⚠️ Screen {request.sid} sin pantalla aún")

    emit('joined', {'room': room, 'status': 'ok'})

@socketio.on('pedir_numero_recepcion')
def on_pedir_numero_recepcion():
    """
    Screen solicita el número de recepción asignado.
    Se busca la pantalla vinculada a través del device_id guardado en el sid.
    
    Flow:
    1. screen_turnos.js emite: socket.emit('pedir_numero_recepcion')
    2. app.py recibe en este handler
    3. app.py busca la pantalla del socket actual
    4. app.py emite de vuelta: 'numero_recepcion' con el número
    5. screen_turnos.js recibe en socket.on('numero_recepcion', ...)
    6. miNumeroRecepcion queda asignado ✅
    """
    device_fp = _screen_sids.get(request.sid)
    
    if not device_fp:
        print(f"[WS] ⚠️ pedir_numero_recepcion: device_fp no encontrado para sid {request.sid}")
        emit('numero_recepcion', {'numRecepcion': None})
        return
    
    with app.app_context():
        # Buscar la pantalla por device_id
        pantalla = Pantalla.query.filter_by(device_id=device_fp).first()
        
        if not pantalla:
            print(f"[WS] ⚠️ pedir_numero_recepcion: pantalla no encontrada para device_id {device_fp[:20]}...")
            emit('numero_recepcion', {'numRecepcion': None})
            return
        
        # Si la pantalla está vinculada y tiene recepcionista, obtener su número
        if pantalla.estado == 'vinculada' and pantalla.recepcionista_id:
            recepcionista = db.session.get(Usuario, pantalla.recepcionista_id)
            if recepcionista:
                # ← Enviar el nombre del recepcionista como número de recepción
                num_recepcion = recepcionista.nombre_completo or recepcionista.usuario
                print(f"[WS] ✅ Emitiendo numero_recepcion: {num_recepcion}")
                emit('numero_recepcion', {
                    'numRecepcion': num_recepcion, 
                    'numero_recepcion': num_recepcion
                })
                return
        
        # Fallback: usar el número de pantalla
        num_recepcion = str(pantalla.numero)
        print(f"[WS] ✅ Emitiendo numero_recepcion (fallback): {num_recepcion}")
        emit('numero_recepcion', {
            'numRecepcion': num_recepcion, 
            'numero_recepcion': num_recepcion
        })



@socketio.on('join_screen_propia')
def on_join_screen_propia(data):
    """
    Llamado por screen_vinculacion.js cuando recibe 'pantalla_vinculada'.
    """
    pantalla_id = data.get('pantalla_id', '')
    device_fp   = data.get('device_fingerprint', '')

    if not pantalla_id:
        return

    if device_fp in _screen_disconnect_timers:
        print(f"[GRACE] ✅ Vinculación detectada → timer cancelado")
        # ← MARCAR que el timer NO debe ejecutarse
        _screen_disconnect_active[device_fp] = False
        _screen_disconnect_timers.pop(device_fp, None)

    sala_propia = f'screen_{pantalla_id}'
    join_room(sala_propia)
    _screen_pantalla[request.sid] = str(pantalla_id)

    if device_fp:
        _screen_sids[request.sid] = device_fp

    print(f"[WS] ✅ Screen vinculada al sid {request.sid} → sala {sala_propia}")
    emit('joined_screen_propia', {'sala': sala_propia, 'pantalla_id': pantalla_id})


@socketio.on('llamar_paciente')
def on_llamar_paciente(data):
    global _ultimo_llamado

    codigo           = data.get('codigo', '')
    nombre           = data.get('nombre', '')
    paciente_id      = data.get('pacienteId', '')
    recepcion        = data.get('recepcion', '')
    recepcionista_id = data.get('recepcionistaId', '')

    print(f"[WS] 📢 Llamando: {codigo} — {nombre}")
    print(f"[WS] RecepcionistaId: {recepcionista_id}")

    # ── VALIDACIÓN 1: Recepcionista ID es obligatorio ──────────────────────────
    if not recepcionista_id:
        print(f"[WS] ❌ RecepcionistaId vacío — NO se emite")
        socketio.emit('error_llamada', {
            'mensaje': 'No hay recepcionista asignado'
        }, room=request.sid)
        return

    # ── VALIDACIÓN 2: Buscar pantalla vinculada a ESTE recepcionista ──────────
    pantalla = Pantalla.query.filter_by(
        recepcionista_id=recepcionista_id,
        estado='vinculada'
    ).first()

    if not pantalla:
        print(f"[WS] ❌ Recepcionista {recepcionista_id} no tiene pantalla vinculada")
        socketio.emit('error_llamada', {
            'mensaje': f'El recepcionista no tiene pantalla vinculada'
        }, room=request.sid)
        return

    # ── VALIDACIÓN 3: Pantalla tiene device_id (conectada) ────────────────────
    if not pantalla.device_id:
        print(f"[WS] ⚠️ Pantalla {pantalla.numero} está desconectada")
        socketio.emit('error_llamada', {
            'mensaje': f'Pantalla {pantalla.numero} desconectada'
        }, room=request.sid)
        return

    # ── OBTENER NOMBRE DEL RECEPCIONISTA ──────────────────────────────────────
    recepcionista = db.session.get(Usuario, recepcionista_id)
    nombre_recepcionista = recepcionista.nombre_completo if recepcionista else 'Sin asignar'
    
    print(f"[WS] 📋 Recepcionista: {nombre_recepcionista}")

    # ── CONSTRUIR PAYLOAD CON NOMBRE DEL RECEPCIONISTA ──────────────────────────
    # ← IMPORTANTE: Incluir el nombre del recepcionista para que screen_turnos.js
    #   pueda filtrar y SOLO mostrar llamados de su recepción
    payload = {
        'codigo':                 codigo,
        'nombre':                 nombre,
        'pacienteId':             paciente_id,
        'recepcion':              nombre_recepcionista,  # ← CAMBIO: Enviar nombre completo
        'recepcionista_id':       recepcionista_id,       # ← Agregar para referencia
        'recepcionista_nombre':   nombre_recepcionista    # ← Agregar también aquí
    }

    sala_destino = f'screen_{pantalla.id}'

    print(f"[WS] ✅ Emitiendo a {sala_destino} (Pantalla {pantalla.numero})")
    print(f"[WS]    Recepcionista: {nombre_recepcionista}")
    
    # ── EMITIR A LA PANTALLA VINCULADA ────────────────────────────────────────
    socketio.emit('llamar_paciente', payload, to=sala_destino)

    # ── GUARDAR último llamado ────────────────────────────────────────────────
    _ultimo_llamado = {
        'codigo':                 codigo,
        'nombre':                 nombre,
        'pacienteId':             paciente_id,
        'recepcion':              nombre_recepcionista,
        'recepcionista_id':       recepcionista_id,
        'recepcionista_nombre':   nombre_recepcionista,
        'pantalla_id':            str(pantalla.id),
        'sala_destino':           sala_destino,
        'timestamp':              datetime.utcnow().isoformat()
    }

    # ── REENVIAR A RECEPCIÓN PARA HISTORIAL ───────────────────────────────────
    print(f"[WS] Emitiendo historial al recepcionista: {request.sid}")
    socketio.emit('llamar_paciente', payload, room=request.sid)


@socketio.on('pedir_ultimo_llamado')
def on_pedir_ultimo_llamado():
    """
    Solo reenvía el último llamado si pertenece a la sala de ESTA screen.
    """
    if not _ultimo_llamado:
        return

    # Verificar antigüedad
    try:
        ts        = datetime.fromisoformat(_ultimo_llamado['timestamp'])
        antiguedad = (datetime.utcnow() - ts).total_seconds()
        if antiguedad > 30:
            print(f"[WS] Último llamado ignorado — {antiguedad:.0f}s de antigüedad")
            return
    except Exception:
        return

    # Verificar que esta screen sea la destinataria
    sala_destino   = _ultimo_llamado.get('sala_destino')
    mi_pantalla_id = _screen_pantalla.get(request.sid)

    if sala_destino and mi_pantalla_id:
        if sala_destino == f'screen_{mi_pantalla_id}':
            emit('llamar_paciente', _ultimo_llamado)
            print(f"[WS] ↩️ Último llamado restaurado → {request.sid}")
        else:
            print(f"[WS] ↩️ Último llamado NO es para esta screen ({sala_destino} ≠ screen_{mi_pantalla_id})")
    # Si no hay sala_destino definida, no reenviar a nadie
    
# DESPUÉS:
@socketio.on('limpiar_historial')
def on_limpiar_historial(data=None):
    global _ultimo_llamado
    recepcionista_id = (data or {}).get('recepcionistaId')

    print(f"[WS] 🧹 Historial limpiado — recepcionistaId: {recepcionista_id}")

    if recepcionista_id:
        # Buscar la pantalla vinculada a ESTE recepcionista
        pantalla = Pantalla.query.filter_by(
            recepcionista_id = recepcionista_id,
            estado           = 'vinculada'
        ).first()

        if pantalla:
            sala_destino = f'screen_{pantalla.id}'
            print(f"[WS] 🧹 Limpiando solo: {sala_destino} (Pantalla {pantalla.numero})")
            socketio.emit('limpiar_historial', {}, to=sala_destino)

            # Limpiar _ultimo_llamado solo si era de esta pantalla
            if _ultimo_llamado and _ultimo_llamado.get('sala_destino') == sala_destino:
                _ultimo_llamado = None
        else:
            print(f"[WS] ⚠️ Recepcionista {recepcionista_id} no tiene pantalla vinculada — nada que limpiar")
    else:
        # Fallback: sin recepcionistaId → limpiar global (comportamiento anterior)
        print(f"[WS] 🧹 Sin recepcionistaId → limpieza global")
        _ultimo_llamado = None
        socketio.emit('limpiar_historial', {}, to='screen')


init_db(app)

start_scheduler()

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

    try:
        while True:
            socketio.run(app, host='0.0.0.0', port=port, debug=debug, allow_unsafe_werkzeug=True)
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n\n⛔ Servidor detenido por el usuario")
        shutdown_scheduler()
