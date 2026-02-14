# models.py - Modelos de base de datos con SQLAlchemy

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import uuid

db = SQLAlchemy()

# ==========================================
# MODELO: Usuario
# ==========================================

class Usuario(db.Model):
    """Modelo de Usuario del sistema"""
    
    __tablename__ = 'usuarios'
    
    # Columnas
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
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
    
    # Métodos
    def set_password(self, password):
        """Hashea la contraseña antes de guardarla"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Verifica si la contraseña es correcta"""
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
# MODELO: Paciente (Ejemplo adicional)
# ==========================================

class Paciente(db.Model):
    """Modelo de Paciente"""
    
    __tablename__ = 'pacientes'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
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
    
    # Relación con turnos
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
# MODELO: Turno (Ejemplo adicional)
# ==========================================

class Turno(db.Model):
    """Modelo de Turno/Cita Médica"""
    
    __tablename__ = 'turnos'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    paciente_id = db.Column(db.Integer, db.ForeignKey('pacientes.id'), nullable=False)
    medico_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'))
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
        # Crear todas las tablas
        db.create_all()
        
        # Crear usuario administrador por defecto si no existe
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
            print('✅ Usuario administrador creado')
