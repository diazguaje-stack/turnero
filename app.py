from flask import Flask
import os
from config.database import init_db, SessionLocal
from models.models import User, RoleEnum
from utils.auth import hash_password
from dotenv import load_dotenv
# ⭐ IMPORTAR MAIL DESDE EXTENSIONS
from extensions import mail

# Importar blueprints
from routes.auth import auth_bp
from routes.main import main_bp
from routes.admin import admin_bp
from routes.reception import reception_bp
from routes.registro import registro_bp
from routes.doctor import doctor_bp
from routes.screen import screen_bp

load_dotenv()
def create_app():
    app = Flask(__name__)
    
    # Configuración
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max upload
    
    # Configuración de correo
    app.config['MAIL_SERVER'] = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
    app.config['MAIL_PORT'] = int(os.environ.get('MAIL_PORT', 587))
    app.config['MAIL_USE_TLS'] = os.environ.get('MAIL_USE_TLS', 'True') == 'True'
    app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME', '')
    app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD', '')
    app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_USERNAME', 'noreply@turnero.com')
    
    # Inicializar mail con la app
    mail.init_app(app)
    
    # Registrar blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(reception_bp)
    app.register_blueprint(registro_bp)
    app.register_blueprint(doctor_bp)
    app.register_blueprint(screen_bp)
    
    # Inicializar base de datos
    with app.app_context():
        init_db()
        create_default_admin()
    
    return app

def create_default_admin():
    """Crear administrador por defecto si no existe"""
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.role == RoleEnum.ADMIN).first()
        if not admin:
            admin = User(
                name='Administrador',
                email='admin@turnero.com',
                password=hash_password('admin123'),
                role=RoleEnum.ADMIN,
                consecutive=1,
                is_active=True
            )
            db.add(admin)
            db.commit()
            print("✓ Administrador por defecto creado")
            print("  Email: admin@turnero.com")
            print("  Password: admin123")
    except Exception as e:
        print(f"Error creando admin: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == '__main__':
    app = create_app()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)

#function to validate password strengh
