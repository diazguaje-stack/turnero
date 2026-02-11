from flask import Blueprint, render_template, request, redirect, url_for, flash, session
from config.database import SessionLocal
from models.models import User, Doctor, Patient, RoleEnum
from utils.auth import login_required, hash_password, verify_password

main_bp = Blueprint('main', __name__)

@main_bp.route('/dashboard')
@login_required
def dashboard():
    """Dashboard principal - redirige según el rol del usuario"""
    role = session.get('user_role')
    
    print(f"\n{'='*60}")
    print(f"📊 DEBUG - Dashboard")
    print(f"{'='*60}")
    print(f"Rol en sesión: {role}")
    print(f"Usuario: {session.get('user_name')}")
    print(f"Email: {session.get('user_email')}")
    print(f"{'='*60}\n")

    # ✅ CORREGIDO: Usar los valores correctos del enum
    if role == 'admin':
        return render_template('admin_dashboard.html')
    elif role == 'reception':
        return render_template('reception_dashboard.html')
    elif role == 'doctor':
        return render_template('doctor_dashboard.html')
    elif role == 'registro':
        return render_template('registro_dashboard.html')
    else:
        flash(f'Rol no reconocido: {role}', 'danger')
        return redirect(url_for('auth.logout'))
    

@main_bp.route('/change-password', methods=['POST'])
@login_required
def change_password():
    """Cambiar contraseña del usuario actual"""
    current_password = request.form.get('current_password', '').strip()
    new_password = request.form.get('new_password', '').strip()

    if not current_password or not new_password:
        flash('Debes completar todos los campos', 'danger')
        return redirect(url_for('main.dashboard'))

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == session['user_id']).first()

        if not user:
            flash('Usuario no encontrado', 'danger')
            return redirect(url_for('auth.logout'))

        # Verificar contraseña actual
        if not verify_password(current_password, user.password):
            flash('Contraseña actual incorrecta', 'danger')
            return redirect(url_for('main.dashboard'))
        
        # Actualizar contraseña
        user.password = hash_password(new_password)
        db.commit()
        
        flash('¡Contraseña actualizada exitosamente!', 'success')
        
    except Exception as e:
        print(f"❌ Error cambiando contraseña: {e}")
        db.rollback()
        flash('Error al actualizar la contraseña', 'danger')
    finally:
        db.close()

    return redirect(url_for('main.dashboard'))