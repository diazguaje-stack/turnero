"""
Script para crear un usuario de prueba con tu email real
Ejecuta esto para asegurarte de que existe un usuario con diazguaje@gmail.com
"""

from app import create_app
from config.database import SessionLocal
from models.models import User, RoleEnum
from utils.auth import hash_password

def create_test_user():
    app = create_app()
    
    with app.app_context():
        db = SessionLocal()
        
        try:
            # Verificar si ya existe
            existing = db.query(User).filter(User.email == 'diazguaje@gmail.com').first()
            
            if existing:
                print(f"✓ Usuario ya existe:")
                print(f"  - ID: {existing.id}")
                print(f"  - Nombre: {existing.name}")
                print(f"  - Email: {existing.email}")
                print(f"  - Rol: {existing.role.value}")
                print(f"  - Activo: {existing.is_active}")
                
                # Actualizar contraseña por si acaso
                existing.password = hash_password('test123')
                existing.is_active = True
                db.commit()
                print(f"\n✓ Contraseña actualizada a: test123")
            else:
                # Crear nuevo usuario
                user = User(
                    name='Diego Guaje',
                    email='diazguaje@gmail.com',
                    password=hash_password('test123'),
                    role=RoleEnum.ADMIN,
                    consecutive=2,
                    is_active=True
                )
                db.add(user)
                db.commit()
                
                print(f"✓ Usuario creado exitosamente:")
                print(f"  - Email: diazguaje@gmail.com")
                print(f"  - Password: test123")
                print(f"  - Rol: admin")
            
            print(f"\n🧪 Ahora puedes probar el forgot-password con este email")
            
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
            db.rollback()
        finally:
            db.close()

if __name__ == '__main__':
    create_test_user()