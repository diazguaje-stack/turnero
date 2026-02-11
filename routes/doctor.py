from flask import Blueprint, render_template, request, redirect, url_for, flash, session, jsonify
from config.database import SessionLocal
from models.models import Doctor, Patient, DoctorStatus, User
from utils.auth import login_required, role_required

doctor_bp = Blueprint('doctor', __name__, url_prefix='/doctor')

@doctor_bp.route('/patients')
@login_required
@role_required('doctor')
def patients():
    """Ver lista de pacientes del doctor"""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == session['user_id']).first()
        
        # Buscar doctor por nombre
        doctor = db.query(Doctor).filter(Doctor.name.contains(user.name)).first()
        
        if not doctor:
            return render_template('doctor/patients.html', patients=[], doctor=None)
        
        patients = db.query(Patient).filter(
            Patient.doctor_id == doctor.id,
            Patient.is_called == False
        ).all()
        
        return render_template('doctor/patients.html', patients=patients, doctor=doctor)
    finally:
        db.close()

@doctor_bp.route('/update-status', methods=['POST'])
@login_required
@role_required('doctor')
def update_status():
    """Actualizar estado del doctor"""
    new_status = request.form.get('status')
    
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == session['user_id']).first()
        doctor = db.query(Doctor).filter(Doctor.name.contains(user.name)).first()
        
        if doctor:
            doctor.status = DoctorStatus(new_status)  # ✅ CORREGIDO: era DoctorStatusEnum
            db.commit()
            return jsonify({'success': True, 'status': new_status})
        
        return jsonify({'success': False, 'error': 'Doctor no encontrado'}), 404
    finally:
        db.close()

@doctor_bp.route('/patients/data')
@login_required
@role_required('doctor')
def patients_data():
    """Obtener datos de pacientes del doctor"""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == session['user_id']).first()
        doctor = db.query(Doctor).filter(Doctor.name.contains(user.name)).first()
        
        if not doctor:
            return jsonify([])
        
        patients = db.query(Patient).filter(
            Patient.doctor_id == doctor.id,
            Patient.is_called == False
        ).all()
        
        patients_data = [{
            'id': p.id,
            'code': p.code,
            'name': p.name,
            'type': p.type.value,
            'created_at': p.created_at.strftime('%H:%M')
        } for p in patients]
        
        return jsonify(patients_data)
    finally:
        db.close()

@doctor_bp.route('/status')
@login_required
@role_required('doctor')
def get_status():
    """Obtener estado actual del doctor"""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == session['user_id']).first()
        doctor = db.query(Doctor).filter(Doctor.name.contains(user.name)).first()
        
        if doctor:
            return jsonify({
                'success': True,
                'status': doctor.status.value,
                'name': doctor.name
            })
        
        return jsonify({'success': False, 'error': 'Doctor no encontrado'}), 404
    finally:
        db.close()