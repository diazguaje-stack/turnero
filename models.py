# models.py - Modelos de base de datos con SQLAlchemy

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from cryptography.fernet import Fernet
import uuid
import random
import string
import os

db = SQLAlchemy()

_CIPHER_INSTANCE = None

def _get_cipher():
    global _CIPHER_INSTANCE
    if _CIPHER_INSTANCE is not None:
        return _CIPHER_INSTANCE
    try:
        from config import Config
        raw_key = Config.PASSWORD_ENCRYPTION_KEY
        if isinstance(raw_key, str):
            raw_key = raw_key.encode()
        _CIPHER_INSTANCE = Fernet(raw_key)
        return _CIPHER_INSTANCE
    except Exception as e:
        print(f"⚠️  ADVERTENCIA: Clave Fernet inválida ({e}). La visualización de contraseñas estará desactivada.")
        print("   python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"")
        return None

try:
    cipher = _get_cipher()
except Exception:
    cipher = None

def encrypt_password(password):
    c = _get_cipher()
    if not c or not password:
        return ""
    try:
        if isinstance(password, str):
            password = password.encode()
        return c.encrypt(password).decode()
    except Exception as e:
        print(f"Error al encriptar contraseña: {e}")
        return ""

def decrypt_password(encrypted_password):
    c = _get_cipher()
    if not c or not encrypted_password:
        return ""
    try:
        if isinstance(encrypted_password, str):
            encrypted_password = encrypted_password.encode()
        return c.decrypt(encrypted_password).decode()
    except Exception:
        return ""


# ==========================================
# MODELO: Usuario
# ==========================================

class Usuario(db.Model):
    __tablename__ = 'usuarios'

    id                 = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    usuario            = db.Column(db.String(50),  unique=True, nullable=False, index=True)
    password_hash      = db.Column(db.String(255), nullable=False)
    password_encrypted = db.Column(db.String(500))
    rol                = db.Column(db.String(20),  nullable=False)
    nombre_completo    = db.Column(db.String(100))
    email              = db.Column(db.String(100), unique=True)
    telefono           = db.Column(db.String(20))
    activo             = db.Column(db.Boolean, default=True)
    created_at         = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at         = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by         = db.Column(db.String(50))

    # Relación legacy 1:1 (se mantiene para FK recepcionista_id en Pantalla)
    pantallas_asignadas = db.relationship(
        'Pantalla',
        backref='recepcionista',
        lazy='dynamic',
        foreign_keys='Pantalla.recepcionista_id'
    )

    def set_password(self, password):
        self.password_hash      = generate_password_hash(password)
        self.password_encrypted = encrypt_password(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def get_password(self):
        try:
            if self.password_encrypted:
                decrypted = decrypt_password(self.password_encrypted)
                return decrypted if decrypted else ""
            return ""
        except Exception:
            return ""

    def to_dict(self):
        password_value = ""
        try:
            password_value = self.get_password()
        except Exception:
            pass
        return {
            'id':              self.id,
            'usuario':         self.usuario,
            'password':        password_value,
            'rol':             self.rol,
            'nombre_completo': self.nombre_completo,
            'email':           self.email,
            'telefono':        self.telefono,
            'activo':          self.activo,
            'created_at':      self.created_at.isoformat() if self.created_at else None,
            'updated_at':      self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<Usuario {self.usuario}>'


# ==========================================
# TABLA DE ASOCIACIÓN: pantalla_recepciones
# ==========================================

pantalla_recepciones = db.Table(
    'pantalla_recepciones',
    db.Column('pantalla_id',      db.String(36), db.ForeignKey('pantallas.id'),  primary_key=True),
    db.Column('recepcionista_id', db.String(36), db.ForeignKey('usuarios.id'),   primary_key=True),
    db.Column('orden',            db.Integer,    default=0),
    db.Column('asignado_at',      db.DateTime,   default=datetime.utcnow)
)


# ==========================================
# MODELO: Pantalla
# ==========================================

class Pantalla(db.Model):
    __tablename__ = 'pantallas'

    id                  = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    numero              = db.Column(db.Integer,    unique=True, nullable=False, index=True)
    nombre              = db.Column(db.String(100))
    device_id           = db.Column(db.String(100), unique=True, index=True)
    codigo_vinculacion  = db.Column(db.String(6))
    estado              = db.Column(db.String(20),  default='disponible')
    ultima_conexion     = db.Column(db.DateTime)
    vinculada_at        = db.Column(db.DateTime)
    recepcionista_id    = db.Column(db.String(36), db.ForeignKey('usuarios.id'), nullable=True)
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at          = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by          = db.Column(db.String(50))

    # Relación many-to-many (SIN backref para no chocar con pantallas_asignadas en Usuario)
    recepcionistas = db.relationship(
        'Usuario',
        secondary='pantalla_recepciones',
        lazy='dynamic'
    )

    @staticmethod
    def generar_codigo():
        return ''.join(random.choices(string.digits, k=6))

    def _get_recepcionistas_ordenados(self):
        """
        Devuelve lista de dicts con recepcionistas ordenados por 'orden'.
        Usa db.select() para evitar el problema 'too many values to unpack'
        que ocurre con db.session.query(tabla_asociacion, Modelo).
        """
        try:
            # Paso 1: obtener (recepcionista_id, orden) de la tabla de asociación
            stmt = db.select(
                pantalla_recepciones.c.recepcionista_id,
                pantalla_recepciones.c.orden
            ).where(
                pantalla_recepciones.c.pantalla_id == self.id
            ).order_by(
                pantalla_recepciones.c.orden
            )
            filas = db.session.execute(stmt).fetchall()

            # Paso 2: cargar el objeto Usuario para cada fila
            resultado = []
            for fila in filas:
                rid   = fila[0]
                orden = fila[1]
                u = db.session.get(Usuario, rid)
                if u:
                    resultado.append({
                        'id':              str(u.id),
                        'nombre_completo': u.nombre_completo or u.usuario,
                        'usuario':         u.usuario,
                        'orden':           orden,
                    })
            return resultado
        except Exception as e:
            print(f'[WARN] _get_recepcionistas_ordenados error: {e}')
            return []

    def to_dict(self):
        receps = self._get_recepcionistas_ordenados()
        return {
            'id':                   self.id,
            'numero':               self.numero,
            'nombre':               self.nombre,
            'device_id':            self.device_id,
            'codigo_vinculacion':   self.codigo_vinculacion,
            'estado':               self.estado,
            'ultima_conexion':      self.ultima_conexion.isoformat() if self.ultima_conexion else None,
            'vinculada_at':         self.vinculada_at.isoformat()    if self.vinculada_at    else None,
            'recepcionista_id':     self.recepcionista_id,
            'created_at':           self.created_at.isoformat()      if self.created_at      else None,
            # ── many-to-many ──────────────────────────────────────────────
            'recepcionistas':       receps,
            'recepcionista_nombre': receps[0]['nombre_completo'] if receps else None,
        }

    def __repr__(self):
        return f'<Pantalla {self.numero} - {self.estado}>'


# ==========================================
# MODELO: Paciente
# ==========================================

class Paciente(db.Model):
    __tablename__ = 'pacientes'

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    nombre          = db.Column(db.String(100), nullable=False)
    apellido        = db.Column(db.String(100), nullable=False, default='')
    codigo_paciente = db.Column(db.String(50),  unique=True, nullable=True, index=True)
    motivo          = db.Column(db.String(100), nullable=True)
    medico_id       = db.Column(db.String(36), db.ForeignKey('usuarios.id'), nullable=True)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    medico = db.relationship('Usuario', backref='pacientes', foreign_keys=[medico_id])
    turnos = db.relationship('Turno', backref='paciente', lazy='dynamic',
                             order_by='Turno.created_at.desc()')

    @property
    def turno_activo(self):
        return (Turno.query
                .filter_by(paciente_id=self.id, estado='pendiente')
                .order_by(Turno.created_at.desc())
                .first())

    @property
    def codigo_turno_activo(self):
        t = self.turno_activo
        return t.codigo_turno if t else None

    def to_dict(self):
        return {
            'id':              self.id,
            'nombre':          self.nombre,
            'apellido':        self.apellido,
            'nombre_completo': f"{self.nombre} {self.apellido}".strip(),
            'codigo_paciente': self.codigo_paciente,
            'codigo_turno':    self.codigo_turno_activo,
            'motivo':          self.motivo,
            'medico_id':       self.medico_id,
            'medico_nombre':   self.medico.nombre_completo if self.medico else None,
        }

    def __repr__(self):
        return f'<Paciente {self.nombre} ({self.codigo_paciente})>'


# ==========================================
# MODELO: Turno
# ==========================================

class Turno(db.Model):
    __tablename__ = 'turnos'

    id           = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    paciente_id  = db.Column(db.String(36), db.ForeignKey('pacientes.id'), nullable=False)
    medico_id    = db.Column(db.String(36), db.ForeignKey('usuarios.id'))
    fecha        = db.Column(db.Date,    nullable=False)
    hora         = db.Column(db.Time,    nullable=False)
    motivo       = db.Column(db.String(200))
    estado       = db.Column(db.String(20), default='pendiente')
    codigo_turno = db.Column(db.String(50), unique=True, nullable=False, index=True)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':          self.id,
            'paciente_id': self.paciente_id,
            'medico_id':   self.medico_id,
            'fecha':       self.fecha.isoformat() if self.fecha else None,
            'hora':        self.hora.isoformat()  if self.hora  else None,
            'motivo':      self.motivo,
            'estado':      self.estado,
            'codigo_turno': self.codigo_turno,
        }

    def __repr__(self):
        return f'<Turno {self.codigo_turno} - {self.estado}>'


# ==========================================
# FUNCIONES AUXILIARES
# ==========================================

def init_db(app):
    with app.app_context():
        try:
            print('🔄 Verificando conexión a la base de datos...')
            db.session.execute(db.text('SELECT 1'))
            print('✅ Conexión a base de datos exitosa')
        except Exception as e:
            db.session.rollback()
            print(f'❌ Error durante inicialización: {str(e)}')
            print('⚠️  Asegúrate que la BD existe y que ejecutaste "flask db upgrade"')
            return

        try:
            admin = Usuario.query.filter_by(usuario='admin').first()
            if not admin:
                print('🔄 Creando usuario administrador...')
                admin = Usuario(usuario='admin', rol='admin',
                                nombre_completo='Administrador del Sistema', created_by='sistema')
                admin.set_password('admin123')
                db.session.add(admin)
                db.session.commit()
                print('✅ Usuario administrador creado')
            else:
                if admin.rol != 'admin':
                    admin.rol = 'admin'
                    db.session.commit()
                print('✅ Usuario administrador ya existe')
        except Exception as e:
            db.session.rollback()
            print(f'⚠️  Error al crear admin: {str(e)}')

        try:
            recepcion = Usuario.query.filter_by(usuario='recepcion').first()
            if not recepcion:
                print('🔄 Creando usuario recepcionista...')
                recepcion = Usuario(usuario='recepcion', rol='recepcion',
                                    nombre_completo='Usuario Recepción', created_by='sistema')
                recepcion.set_password('recep123')
                db.session.add(recepcion)
                db.session.commit()
                print('✅ Usuario recepcionista creado')
            else:
                print('✅ Usuario recepcionista ya existe')
        except Exception as e:
            db.session.rollback()
            print(f'⚠️  Error al crear recepción: {str(e)}')

        try:
            pantallas_existentes = Pantalla.query.count()
            if pantallas_existentes == 0:
                print('🔄 Creando pantallas por defecto...')
                for i in range(1, 7):
                    db.session.add(Pantalla(numero=i, nombre=f'Pantalla {i}',
                                            estado='disponible', created_by='sistema'))
                db.session.commit()
                print('✅ Pantallas creadas (1-6)')
            else:
                print(f'✅ Pantallas ya existen ({pantallas_existentes} encontradas)')
        except Exception as e:
            db.session.rollback()
            print(f'⚠️  Error al crear pantallas: {str(e)}')

        print('✅ Inicialización de base de datos completada')