from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

# ✅ IMPORTANTE: Importar Base desde database.py
from config.database import Base

class RoleEnum(enum.Enum):
    ADMIN = "admin"
    RECEPTION = "reception"
    DOCTOR = "doctor"
    REGISTRO = "registro"

class DoctorType(enum.Enum):
    I = "I"  # Tipo I - Información
    C = "C"  # Tipo C - Consulta

class PatientStatus(enum.Enum):
    WAITING = "waiting"
    CALLED = "called"
    ATTENDED = "attended"

class DoctorStatus(enum.Enum):
    AVAILABLE = "available"
    BUSY = "busy"
    PAUSED = "paused"
    UNAVAILABLE = "unavailable"

class User(Base):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(SQLEnum(RoleEnum), nullable=False)
    consecutive = Column(Integer, nullable=False)
    assigned_screen = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relaciones
    sent_messages = relationship('Message', foreign_keys='Message.sender_id', back_populates='sender')
    received_messages = relationship('Message', foreign_keys='Message.receiver_id', back_populates='receiver')
    password_reset_tokens = relationship('PasswordResetToken', back_populates='user', cascade='all, delete-orphan')

class PasswordResetToken(Base):
    """Tabla para tokens de recuperación de contraseña"""
    __tablename__ = 'password_reset_tokens'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    token = Column(String(255), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    used_at = Column(DateTime, nullable=True)
    
    # Relación
    user = relationship('User', back_populates='password_reset_tokens')

class Screen(Base):
    """Tabla para pantallas de visualización"""
    __tablename__ = 'screens'
    
    id = Column(Integer, primary_key=True)
    screen_number = Column(Integer, unique=True, nullable=False)
    assigned_reception = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Doctor(Base):
    __tablename__ = 'doctors'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    type = Column(SQLEnum(DoctorType), nullable=False)
    status = Column(SQLEnum(DoctorStatus), default=DoctorStatus.AVAILABLE)
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relaciones
    patients = relationship('Patient', back_populates='doctor')

class Patient(Base):
    __tablename__ = 'patients'
    
    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    type = Column(SQLEnum(DoctorType), nullable=False)
    doctor_id = Column(Integer, ForeignKey('doctors.id'), nullable=False)
    screen_id = Column(Integer, nullable=True)
    status = Column(SQLEnum(PatientStatus), default=PatientStatus.WAITING)
    is_called = Column(Boolean, default=False)
    registered_by = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow)
    called_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relaciones
    doctor = relationship('Doctor', back_populates='patients')

class Multimedia(Base):
    """Tabla para contenido multimedia en pantallas"""
    __tablename__ = 'multimedia'
    
    id = Column(Integer, primary_key=True)
    filename = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)
    filepath = Column(String(500), nullable=False)
    screen_number = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)
    uploaded_by = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow)

class Message(Base):
    __tablename__ = 'messages'
    
    id = Column(Integer, primary_key=True)
    sender_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    receiver_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    subject = Column(String(200), nullable=True)
    content = Column(String(500), nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relaciones
    sender = relationship('User', foreign_keys=[sender_id], back_populates='sent_messages')
    receiver = relationship('User', foreign_keys=[receiver_id], back_populates='received_messages')