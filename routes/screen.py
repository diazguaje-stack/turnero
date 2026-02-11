from flask import Blueprint, render_template, jsonify, session, flash, redirect, url_for
from config.database import SessionLocal
from models.models import Patient, Multimedia, Screen, User

screen_bp = Blueprint('screen', __name__, url_prefix='/screen')

@screen_bp.route('/<int:screen_number>')
def display_screen(screen_number):
    """Pantalla de visualización pública con verificación de permisos"""
    db = SessionLocal()
    try:
        # Verificar que la pantalla existe
        screen = db.query(Screen).filter(Screen.screen_number == screen_number).first()
        
        if not screen:
            flash(f'La pantalla {screen_number} no existe', 'error')
            return redirect(url_for('auth.login'))
        
        # ✅ PERMITIR ACCESO A ADMINS (para vista previa)
        if session.get('user_role') == 'admin':
            print(f"\n{'='*60}")
            print(f"👑 Admin accediendo a pantalla {screen_number}")
            print(f"Usuario: {session.get('user_name')}")
            print(f"{'='*60}\n")
            return render_template('screen/display.html', screen_number=screen_number, screen=screen)
        
        # ✅ VERIFICAR PERMISOS PARA USUARIOS DE RECEPCIÓN
        if session.get('user_id'):
            user_id = session.get('user_id')
            user = db.query(User).filter(User.id == user_id).first()
            
            if user:
                # Verificar si el usuario tiene asignada esta pantalla
                if user.assigned_screen == screen_number:
                    print(f"\n{'='*60}")
                    print(f"✅ Usuario de recepción accediendo a pantalla {screen_number}")
                    print(f"Usuario: {user.name}")
                    print(f"Rol: {user.role.value} {user.consecutive}")
                    print(f"{'='*60}\n")
                    return render_template('screen/display.html', screen_number=screen_number, screen=screen)
                else:
                    print(f"\n{'='*60}")
                    print(f"❌ Acceso denegado a pantalla {screen_number}")
                    print(f"Usuario: {user.name}")
                    print(f"Pantalla asignada: {user.assigned_screen}")
                    print(f"Pantalla solicitada: {screen_number}")
                    print(f"{'='*60}\n")
                    flash(f'No tienes permisos para acceder a la pantalla {screen_number}', 'error')
                    return redirect(url_for('main.dashboard'))
        
        # Si no está autenticado, redirigir al login
        flash('Debes iniciar sesión para acceder a las pantallas', 'error')
        return redirect(url_for('auth.login'))
        
    finally:
        db.close()

@screen_bp.route('/<int:screen_number>/patients')
def screen_patients(screen_number):
    """Obtener pacientes para la pantalla"""
    db = SessionLocal()
    try:
        # Obtener últimos pacientes llamados para esta pantalla
        patients = db.query(Patient).filter(
            Patient.screen_id == screen_number,
            Patient.is_called == True
        ).order_by(Patient.updated_at.desc()).limit(10).all()
        
        patients_data = [{
            'code': p.code,
            'name': p.name,
            'doctor': p.doctor.name if p.doctor else 'N/A',
            'type': p.type.value
        } for p in patients]
        
        return jsonify(patients_data)
    finally:
        db.close()

@screen_bp.route('/multimedia')
def get_multimedia():
    """Obtener contenido multimedia activo"""
    db = SessionLocal()
    try:
        media = db.query(Multimedia).filter(Multimedia.is_active == True).all()
        
        media_data = [{
            'id': m.id,
            'type': m.type,
            'filepath': '/' + m.filepath.replace('\\', '/')
        } for m in media]
        
        return jsonify(media_data)
    finally:
        db.close()