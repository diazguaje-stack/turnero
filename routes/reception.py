from flask import Blueprint, request, jsonify, session, render_template
from config.database import SessionLocal
from models.models import Doctor, Patient, Multimedia, DoctorType, DoctorStatus
from utils.auth import login_required, role_required
from werkzeug.utils import secure_filename
from datetime import datetime
from sqlalchemy import inspect
import os
import traceback

reception_bp = Blueprint('reception', __name__, url_prefix='/reception')

# ============================================================
# GESTIÓN DE DOCTORES
# ============================================================

@reception_bp.route('/doctors/data')
@login_required
@role_required('reception')
def doctors_data():
    """Obtener datos de doctores con conteo de pacientes"""
    db = SessionLocal()
    try:
        doctors = db.query(Doctor).all()
        doctors_data = [{
            'id': d.id,
            'name': d.name,
            'type': d.type.value,
            'status': d.status.value,
            'is_active': d.is_active,
            'patient_count': db.query(Patient).filter(
                Patient.doctor_id == d.id,
                Patient.is_called == False
            ).count()
        } for d in doctors]
        return jsonify(doctors_data)
    except Exception as e:
        print(f"❌ Error en doctors_data: {e}")
        return jsonify([])
    finally:
        db.close()

@reception_bp.route('/create-doctor', methods=['POST'])
@login_required
@role_required('reception')
def create_doctor():
    """Crear doctor"""
    name = request.form.get('name')
    doctor_type = request.form.get('type')
    
    if not name or not doctor_type:
        return jsonify({'success': False, 'error': 'Faltan campos requeridos'}), 400
    
    if doctor_type not in ['I', 'C']:
        return jsonify({'success': False, 'error': 'Tipo de doctor inválido. Usa I o C'}), 400
    
    db = SessionLocal()
    try:
        # Verificar si ya existe un doctor con ese nombre
        existing = db.query(Doctor).filter(Doctor.name == name).first()
        if existing:
            return jsonify({'success': False, 'error': f'Ya existe un doctor con el nombre "{name}"'}), 400
        
        doctor = Doctor(
            name=name,
            type=DoctorType(doctor_type),
            status=DoctorStatus.AVAILABLE,
            is_active=True,
            created_by=session['user_id']
        )
        db.add(doctor)
        db.commit()
        
        print(f"\n✅ Doctor creado: {name} (Tipo {doctor_type})")
        
        return jsonify({'success': True, 'message': 'Doctor creado exitosamente'})
    except Exception as e:
        db.rollback()
        print(f"❌ Error creando doctor: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Error interno del servidor'}), 500
    finally:
        db.close()

@reception_bp.route('/toggle-doctor/<int:doctor_id>', methods=['POST'])
@login_required
@role_required('reception')
def toggle_doctor(doctor_id):
    """Habilitar/deshabilitar doctor"""
    db = SessionLocal()
    try:
        doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
        if doctor:
            doctor.is_active = not doctor.is_active
            db.commit()
            
            status = 'habilitado' if doctor.is_active else 'deshabilitado'
            return jsonify({'success': True, 'message': f'Doctor {status}', 'is_active': doctor.is_active})
        
        return jsonify({'success': False, 'error': 'Doctor no encontrado'}), 404
    finally:
        db.close()

@reception_bp.route('/delete-doctor/<int:doctor_id>', methods=['POST'])
@login_required
@role_required('reception')
def delete_doctor(doctor_id):
    """Eliminar doctor"""
    db = SessionLocal()
    try:
        doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
        if not doctor:
            return jsonify({'success': False, 'error': 'Doctor no encontrado'}), 404
        
        # Verificar si tiene pacientes pendientes
        pending_patients = db.query(Patient).filter(
            Patient.doctor_id == doctor_id,
            Patient.is_called == False
        ).count()
        
        if pending_patients > 0:
            return jsonify({
                'success': False,
                'error': f'No se puede eliminar. El doctor tiene {pending_patients} paciente(s) en espera.'
            }), 400
        
        doctor_name = doctor.name
        db.delete(doctor)
        db.commit()
        
        return jsonify({'success': True, 'message': f'Doctor "{doctor_name}" eliminado'})
    except Exception as e:
        db.rollback()
        print(f"❌ Error eliminando doctor: {e}")
        return jsonify({'success': False, 'error': 'Error interno del servidor'}), 500
    finally:
        db.close()

# ============================================================
# GESTIÓN DE PACIENTES - ✅ ULTRA-ROBUSTA CON LOGS DETALLADOS
# ============================================================

@reception_bp.route('/patients/data')
@login_required
@role_required(['reception','registro'])
def patients_data():
    """Obtener todos los pacientes ordenados por doctor y código"""
    
    print("\n" + "="*60)
    print("🔍 DEBUG - /reception/patients/data")
    print("="*60)
    
    db = SessionLocal()
    
    try:
        # 1. Verificar estructura de la tabla
        print("\n[1/6] Verificando estructura de tabla 'patients'...")
        inspector = inspect(db.bind)
        columns = inspector.get_columns('patients')
        column_names = [col['name'] for col in columns]
        print(f"  ✓ Columnas disponibles: {', '.join(column_names)}")
        
        # 2. Contar total de pacientes
        print("\n[2/6] Contando pacientes en BD...")
        total_patients = db.query(Patient).count()
        print(f"  ✓ Total de pacientes: {total_patients}")
        
        if total_patients == 0:
            print("  ⚠️  No hay pacientes en la base de datos")
            print("="*60 + "\n")
            return jsonify([])
        
        # 3. Contar doctores
        print("\n[3/6] Verificando doctores...")
        total_doctors = db.query(Doctor).count()
        print(f"  ✓ Total de doctores: {total_doctors}")
        
        if total_doctors == 0:
            print("  ⚠️  No hay doctores en la base de datos")
            print("  ⚠️  Los pacientes no tienen doctor asignado")
        
        # 4. Obtener pacientes SIN JOIN (más seguro)
        print("\n[4/6] Obteniendo pacientes...")
        patients = db.query(Patient).order_by(
            Patient.doctor_id,
            Patient.code
        ).all()
        
        print(f"  ✓ Pacientes obtenidos: {len(patients)}")
        
        # 5. Procesar cada paciente individualmente
        print("\n[5/6] Procesando pacientes...")
        patients_data = []
        errors = []
        
        for idx, patient in enumerate(patients, 1):
            try:
                # Obtener doctor por separado (más seguro)
                doctor = None
                doctor_name = "Sin doctor"
                doctor_type = "?"
                
                if patient.doctor_id:
                    doctor = db.query(Doctor).filter(Doctor.id == patient.doctor_id).first()
                    if doctor:
                        doctor_name = doctor.name
                        doctor_type = doctor.type.value
                    else:
                        print(f"  ⚠️  Paciente {patient.code}: doctor_id={patient.doctor_id} no existe")
                
                patient_dict = {
                    'id': patient.id,
                    'code': patient.code,
                    'name': patient.name,
                    'type': patient.type.value if patient.type else '?',
                    'doctor_id': patient.doctor_id,
                    'doctor_name': doctor_name,
                    'doctor_type': doctor_type,
                    'is_called': patient.is_called,
                    'created_at': patient.created_at.strftime('%H:%M:%S') if patient.created_at else '',
                    'called_at': patient.called_at.strftime('%H:%M:%S') if patient.called_at else None
                }
                
                patients_data.append(patient_dict)
                
                # Log cada 10 pacientes
                if idx % 10 == 0 or idx == len(patients):
                    print(f"  ✓ Procesados: {idx}/{len(patients)}")
                
            except Exception as e:
                error_msg = f"Error en paciente ID {patient.id}: {str(e)}"
                print(f"  ❌ {error_msg}")
                errors.append(error_msg)
                continue
        
        # 6. Resumen
        print("\n[6/6] Resumen:")
        print(f"  ✓ Pacientes procesados exitosamente: {len(patients_data)}")
        if errors:
            print(f"  ⚠️  Errores encontrados: {len(errors)}")
            for err in errors[:5]:  # Mostrar máximo 5 errores
                print(f"    - {err}")
        
        print("="*60 + "\n")
        
        return jsonify(patients_data)
        
    except Exception as e:
        print(f"\n❌ ERROR CRÍTICO en patients_data:")
        print(f"  Tipo: {type(e).__name__}")
        print(f"  Mensaje: {str(e)}")
        print("\n  Traceback completo:")
        traceback.print_exc()
        print("="*60 + "\n")
        
        return jsonify({
            'error': True,
            'message': 'Error interno del servidor',
            'details': str(e)
        }), 500
    finally:
        db.close()

@reception_bp.route('/call-patient/<int:patient_id>', methods=['POST'])
@login_required
@role_required('reception')
def call_patient(patient_id):
    """Llamar a un paciente"""
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        
        if not patient:
            return jsonify({'success': False, 'error': 'Paciente no encontrado'}), 404
        
        if patient.is_called:
            return jsonify({'success': False, 'error': 'El paciente ya fue llamado'}), 400
        
        patient.is_called = True
        patient.called_at = datetime.utcnow()
        
        # Asignar pantalla si el usuario de recepción tiene una
        if session.get('assigned_screen'):
            patient.screen_id = session['assigned_screen']
        
        db.commit()
        
        print(f"\n🔔 Paciente llamado: {patient.code} - {patient.name}")
        
        return jsonify({'success': True, 'message': 'Paciente llamado'})
    except Exception as e:
        db.rollback()
        print(f"❌ Error llamando paciente: {e}")
        return jsonify({'success': False, 'error': 'Error interno del servidor'}), 500
    finally:
        db.close()

@reception_bp.route('/delete-patient/<int:patient_id>', methods=['POST'])
@login_required
@role_required('reception')
def delete_patient(patient_id):
    """Eliminar paciente"""
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        
        if not patient:
            return jsonify({'success': False, 'error': 'Paciente no encontrado'}), 404
        
        patient_code = patient.code
        db.delete(patient)
        db.commit()
        
        return jsonify({'success': True, 'message': f'Paciente {patient_code} eliminado'})
    finally:
        db.close()

# ============================================================
# GESTIÓN DE MULTIMEDIA
# ============================================================

@reception_bp.route('/multimedia/data')
@login_required
@role_required('reception')
def multimedia_data():
    """Obtener archivos multimedia"""
    db = SessionLocal()
    try:
        media = db.query(Multimedia).order_by(Multimedia.created_at.desc()).all()
        
        media_data = [{
            'id': m.id,
            'filename': m.filename,
            'type': m.type,
            'filepath': m.filepath,
            'is_active': m.is_active,
            'created_at': m.created_at.strftime('%d/%m/%Y %H:%M') if m.created_at else ''
        } for m in media]
        
        return jsonify(media_data)
    finally:
        db.close()

@reception_bp.route('/upload-media', methods=['POST'])
@login_required
@role_required('reception')
def upload_media():
    """Subir contenido multimedia"""
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No se encontró archivo'}), 400
    
    file = request.files['file']
    media_type = request.form.get('type')
    
    if file.filename == '':
        return jsonify({'success': False, 'error': 'Archivo vacío'}), 400
    
    if media_type not in ['image', 'video']:
        return jsonify({'success': False, 'error': 'Tipo inválido'}), 400
    
    # Validar extensión
    allowed_extensions = {
        'image': ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
        'video': ['.mp4', '.webm', '.ogg']
    }
    
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions[media_type]:
        return jsonify({
            'success': False,
            'error': f'Extensión no permitida. Usa: {", ".join(allowed_extensions[media_type])}'
        }), 400
    
    filename = secure_filename(file.filename)
    upload_folder = os.path.join('static', 'uploads', media_type + 's')
    os.makedirs(upload_folder, exist_ok=True)
    
    filepath = os.path.join(upload_folder, filename)
    file.save(filepath)
    
    db = SessionLocal()
    try:
        multimedia = Multimedia(
            type=media_type,
            filename=filename,
            filepath=filepath,
            is_active=True,
            uploaded_by=session['user_id']
        )
        db.add(multimedia)
        db.commit()
        
        return jsonify({'success': True, 'message': 'Archivo subido exitosamente'})
    except Exception as e:
        db.rollback()
        # Eliminar archivo si falla la BD
        if os.path.exists(filepath):
            os.remove(filepath)
        print(f"❌ Error subiendo multimedia: {e}")
        return jsonify({'success': False, 'error': 'Error interno del servidor'}), 500
    finally:
        db.close()

@reception_bp.route('/delete-media/<int:media_id>', methods=['POST'])
@login_required
@role_required('reception')
def delete_media(media_id):
    """Eliminar archivo multimedia"""
    db = SessionLocal()
    try:
        media = db.query(Multimedia).filter(Multimedia.id == media_id).first()
        
        if not media:
            return jsonify({'success': False, 'error': 'Archivo no encontrado'}), 404
        
        # Eliminar archivo físico
        if os.path.exists(media.filepath):
            try:
                os.remove(media.filepath)
            except Exception as e:
                print(f"⚠️ No se pudo eliminar archivo físico: {e}")
        
        media_filename = media.filename
        db.delete(media)
        db.commit()
        
        return jsonify({'success': True, 'message': f'Archivo "{media_filename}" eliminado'})
    finally:
        db.close()