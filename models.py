# models.py - Modelos de base de datos con SQLAlchemy

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import uuid
import random
import string

db = SQLAlchemy()

# ==========================================
# MODELO: Usuario
# ==========================================

class Usuario(db.Model):
    """Modelo de Usuario del sistema"""
    
    __tablename__ = 'usuarios'
    
    # Columnas
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    usuario = db.Column(db.String(50), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    rol = db.Column(db.String(20), nullable=False)
    nombre_completo = db.Column(db.String(100))
    email = db.Column(db.String(100), unique=True)
    telefono = db.Column(db.String(20))
    activo = db.Column(db.Boolean, default=True)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.String(50))
    
    # Metodos
    def set_password(self, password):
        """Hashea la contrasena antes de guardarla"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Verifica si la contrasena es correcta"""
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        """Convierte el usuario a diccionario"""
        return {
            'id': self.id,
            'usuario': self.usuario,
            'rol': self.rol,
            'nombre_completo': self.nombre_completo,
            'email': self.email,
            'telefono': self.telefono,
            'activo': self.activo,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def __repr__(self):
        return f'<Usuario {self.usuario}>'


# ==========================================
# MODELO: Pantalla
# ==========================================

class Pantalla(db.Model):
    """Modelo de Pantalla/Display para sistema de turnos"""
    
    __tablename__ = 'pantallas'
    
    # Columnas
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    numero = db.Column(db.Integer, unique=True, nullable=False, index=True)  # 1-6
    nombre = db.Column(db.String(100))  # Ej: "Pantalla Sala Espera 1"
    device_id = db.Column(db.String(100), unique=True, index=True)  # ID unico del dispositivo
    codigo_vinculacion = db.Column(db.String(6))  # Codigo de 6 digitos para vincular
    estado = db.Column(db.String(20), default='disponible')  # disponible, pendiente, vinculada
    ultima_conexion = db.Column(db.DateTime)
    vinculada_at = db.Column(db.DateTime)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.String(50))
    
    # Metodos
    @staticmethod
    def generar_codigo():
        """Genera un codigo de 6 digitos aleatorio"""
        return ''.join(random.choices(string.digits, k=6))
    
    def to_dict(self):
        """Convierte la pantalla a diccionario"""
        return {
            'id': self.id,
            'numero': self.numero,
            'nombre': self.nombre,
            'device_id': self.device_id,
            'codigo_vinculacion': self.codigo_vinculacion,
            'estado': self.estado,
            'ultima_conexion': self.ultima_conexion.isoformat() if self.ultima_conexion else None,
            'vinculada_at': self.vinculada_at.isoformat() if self.vinculada_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<Pantalla {self.numero} - {self.estado}>'


# ==========================================
# MODELO: Paciente
# ==========================================

class Paciente(db.Model):
    """Modelo de Paciente"""
    
    __tablename__ = 'pacientes'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    nombre = db.Column(db.String(100), nullable=False)
    apellido = db.Column(db.String(100), nullable=False)
    documento = db.Column(db.String(20), unique=True, nullable=False, index=True)
    fecha_nacimiento = db.Column(db.Date)
    genero = db.Column(db.String(10))
    telefono = db.Column(db.String(20))
    email = db.Column(db.String(100))
    direccion = db.Column(db.String(200))
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacion con turnos
    turnos = db.relationship('Turno', backref='paciente', lazy='dynamic')
    
    def to_dict(self):
        return {
            'id': self.id,
            'nombre': self.nombre,
            'apellido': self.apellido,
            'nombre_completo': f"{self.nombre} {self.apellido}",
            'documento': self.documento,
            'fecha_nacimiento': self.fecha_nacimiento.isoformat() if self.fecha_nacimiento else None,
            'genero': self.genero,
            'telefono': self.telefono,
            'email': self.email,
            'direccion': self.direccion
        }
    
    def __repr__(self):
        return f'<Paciente {self.nombre} {self.apellido}>'


# ==========================================
# MODELO: Turno
# ==========================================

class Turno(db.Model):
    """Modelo de Turno/Cita Medica"""
    
    __tablename__ = 'turnos'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    paciente_id = db.Column(db.String(36), db.ForeignKey('pacientes.id'), nullable=False)
    medico_id = db.Column(db.String(36), db.ForeignKey('usuarios.id'))
    fecha = db.Column(db.Date, nullable=False)
    hora = db.Column(db.Time, nullable=False)
    motivo = db.Column(db.String(200))
    estado = db.Column(db.String(20), default='pendiente')  # pendiente, confirmado, cancelado, completado
    notas = db.Column(db.Text)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.String(50))
    
    def to_dict(self):
        return {
            'id': self.id,
            'paciente_id': self.paciente_id,
            'medico_id': self.medico_id,
            'fecha': self.fecha.isoformat() if self.fecha else None,
            'hora': self.hora.isoformat() if self.hora else None,
            'motivo': self.motivo,
            'estado': self.estado,
            'notas': self.notas
        }
    
    def __repr__(self):
        return f'<Turno {self.id} - {self.fecha} {self.hora}>'


# ==========================================
# FUNCIONES AUXILIARES
# ==========================================

def init_db(app):
    """Inicializar la base de datos"""
    db.init_app(app)
    
    with app.app_context():
        try:
            # Intentar crear todas las tablas
            db.create_all()
            
            # Verificar si el usuario admin existe
            admin = Usuario.query.filter_by(usuario='admin').first()
            if not admin:
                admin = Usuario(
                    usuario='admin',
                    rol='administrador',
                    nombre_completo='Administrador del Sistema',
                    created_by='sistema'
                )
                admin.set_password('admin123')
                db.session.add(admin)
                db.session.commit()
                print('Usuario administrador creado')
            else:
                print('Usuario administrador ya existe')
            
            # Crear pantallas por defecto (1-6)
            for i in range(1, 7):
                pantalla = Pantalla.query.filter_by(numero=i).first()
                if not pantalla:
                    pantalla = Pantalla(
                        numero=i,
                        nombre=f'Pantalla {i}',
                        estado='disponible',
                        created_by='sistema'
                    )
                    db.session.add(pantalla)
            
            db.session.commit()
            print('Pantallas inicializadas')
                
        except Exception as e:
            error_msg = str(e).lower()
            
            # Si hay error de columnas, recrear las tablas
            if 'does not exist' in error_msg or 'column' in error_msg:
                print('Detectado error de esquema - Recreando tablas...')
                
                try:
                    # Eliminar todas las tablas
                    db.drop_all()
                    print('Tablas antiguas eliminadas')
                    
                    # Crear todas las tablas nuevamente
                    db.create_all()
                    print('Tablas recreadas correctamente')
                    
                    # Crear usuario administrador
                    admin = Usuario(
                        usuario='admin',
                        rol='administrador',
                        nombre_completo='Administrador del Sistema',
                        created_by='sistema'
                    )
                    admin.set_password('admin123')
                    db.session.add(admin)
                    
                    # Crear pantallas
                    for i in range(1, 7):
                        pantalla = Pantalla(
                            numero=i,
                            nombre=f'Pantalla {i}',
                            estado='disponible',
                            created_by='sistema'
                        )
                        db.session.add(pantalla)
                    
                    db.session.commit()
                    print('Usuario administrador y pantallas creados')
                    
                except Exception as recreate_error:
                    print(f'Error al recrear tablas: {str(recreate_error)}')
                    raise
            else:
                print(f'Error en base de datos: {str(e)}')
                raise