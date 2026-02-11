#!/usr/bin/env python3
"""Reset / create administrador por defecto.

Uso:
  python scripts/reset_admin.py [nueva_password]

Si no se provee contraseña, se usa la variable de entorno NEW_ADMIN_PASSWORD
o por defecto 'admin123'. El script crea el admin si no existe.
"""
import os
import sys
from app import create_app
from config.database import SessionLocal
from models.models import User, RoleEnum
from utils.auth import hash_password


def reset_admin(new_password: str):
    app = create_app()
    with app.app_context():
        db = SessionLocal()
        try:
            admin = db.query(User).filter(User.email == 'admin@turnero.com').first()
            if admin:
                admin.password = hash_password(new_password)
                admin.is_active = True
                db.commit()
                print(f"✓ Contraseña del admin actualizada a: {new_password}")
                print(f"  - Email: {admin.email}")
                return

            # Si no existe, crear uno
            admin = User(
                name='Administrador',
                email='admin@turnero.com',
                password=hash_password(new_password),
                role=RoleEnum.ADMIN,
                consecutive=1,
                is_active=True
            )
            db.add(admin)
            db.commit()
            print(f"✓ Administrador creado:")
            print(f"  - Email: admin@turnero.com")
            print(f"  - Password: {new_password}")
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
            db.rollback()
        finally:
            db.close()


if __name__ == '__main__':
    pw = None
    if len(sys.argv) > 1:
        pw = sys.argv[1]
    else:
        pw = os.environ.get('NEW_ADMIN_PASSWORD')

    if not pw:
        pw = 'admin123'

    reset_admin(pw)
