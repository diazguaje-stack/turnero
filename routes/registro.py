from flask import Blueprint, render_template, request, redirect, url_for, flash, session, jsonify
from config.database import SessionLocal
from models.models import Doctor, Patient, DoctorType
from utils.auth import login_required, role_required
from datetime import datetime

registro_bp = Blueprint('registro', __name__, url_prefix='/registro')

@registro_bp.route('/doctors')
@login_required
@role_required('registro')
def doctors():
    """Lista de doctores activos"""
    db = SessionLocal()
    try:
        doctors = db.query(Doctor).filter(Doctor.is_active == True).all()
        return render_template('registro/doctors.html', doctors=doctors)
    finally:
        db.close()

@registro_bp.route('/create-patient', methods=['POST'])
@login_required
@role_required('registro')
def create_patient():
    """Crear paciente"""
    patient_name = request.form.get('patient_name')
    doctor_id = request.form.get('doctor_id', type=int)
    
    if not patient_name or not doctor_id:
        return jsonify({
            'success': False, 
            'error': 'Faltan campos requeridos'
        }), 400
    
    db = SessionLocal()
    try:
        doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
        
        if not doctor:
            return jsonify({
                'success': False, 
                'error': 'Doctor no encontrado'
            }), 404
        
        if not doctor.is_active:
            return jsonify({
                'success': False,
                'error': f'El doctor {doctor.name} está inactivo'
            }), 400
        
        # Generar código de paciente basado en el tipo del doctor
        # Debe ser único a nivel global; contar por tipo (no por doctor)
        count = db.query(Patient).filter(
            Patient.type == doctor.type
        ).count()

        code = f"{doctor.type.value}{count + 1:03d}"

        # Protección adicional: asegúrate de no crear un código ya existente
        # en caso de condiciones de carrera o datos previos inconsistentes.
        # Si existe, incrementa hasta encontrar uno libre.
        while db.query(Patient).filter(Patient.code == code).first():
            count += 1
            code = f"{doctor.type.value}{count + 1:03d}"
        
        print(f"\n{'='*60}")
        print(f"👤 Creando paciente desde Registro")
        print(f"{'='*60}")
        print(f"Nombre: {patient_name}")
        print(f"Doctor: {doctor.name} (ID: {doctor_id})")
        print(f"Tipo: {doctor.type.value}")
        print(f"Código generado: {code}")
        print(f"Registrado por: {session.get('user_name')}")
        
        # ✅ CORREGIDO: Asegurar que todos los campos estén presentes
        patient = Patient(
            code=code,
            name=patient_name,
            type=doctor.type,  # El paciente hereda el tipo del doctor
            doctor_id=doctor_id,
            registered_by=session['user_id'],
            is_called=False,
            created_at=datetime.utcnow()
        )
        
        db.add(patient)
        db.commit()
        db.refresh(patient)  # ✅ IMPORTANTE: Refrescar para obtener el ID
        
        print(f"✅ Paciente creado con ID: {patient.id}")
        print(f"{'='*60}\n")
        
        return jsonify({
            'success': True,
            'message': 'Paciente registrado exitosamente',
            'code': code,
            'patient_id': patient.id,
            'patient': {
                'id': patient.id,
                'code': code,
                'name': patient_name,
                'doctor_name': doctor.name,
                'doctor_type': doctor.type.value,
                'created_at': patient.created_at.strftime('%H:%M:%S')
            }
        })
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error creando paciente: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Error interno: {str(e)}'
        }), 500
    finally:
        db.close()

@registro_bp.route('/doctors/data')
@login_required
@role_required('registro')
def doctors_data():
    """Obtener datos de doctores activos con conteo actualizado"""
    db = SessionLocal()
    try:
        doctors = db.query(Doctor).filter(Doctor.is_active == True).all()
        
        doctors_data = []
        for doctor in doctors:
            # Contar solo pacientes NO llamados
            patient_count = db.query(Patient).filter(
                Patient.doctor_id == doctor.id,
                Patient.is_called == False
            ).count()
            
            doctors_data.append({
                'id': doctor.id,
                'name': doctor.name,
                'type': doctor.type.value,
                'status': doctor.status.value,
                'patient_count': patient_count
            })
        
        return jsonify(doctors_data)
        
    except Exception as e:
        print(f"❌ Error en doctors_data: {e}")
        import traceback
        traceback.print_exc()
        return jsonify([])
    finally:
        db.close()