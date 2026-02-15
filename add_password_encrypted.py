#!/usr/bin/env python
# Script para agregar la columna password_encrypted a la tabla usuarios

from app import app, db
from models import Usuario, encrypt_password
from sqlalchemy import text

def migrate():
    with app.app_context():
        try:
            # Intentar agregar la columna
            with db.engine.begin() as connection:
                # Para PostgreSQL
                connection.execute(text("""
                    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_encrypted VARCHAR(500);
                """))
            print("✅ Columna password_encrypted agregada a la tabla usuarios")
            
            # Encriptar contraseñas existentes
            usuarios = Usuario.query.all()
            for usuario in usuarios:
                if usuario.password_hash and not usuario.password_encrypted:
                    # Intentar crear una contraseña encriptada basada en lo que tenemos
                    # Ya que no tenemos la contraseña original, dejaremos el campo vacío
                    usuario.password_encrypted = None
            
            db.session.commit()
            print("✅ Base de datos actualizada exitosamente")
            
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            db.session.rollback()

if __name__ == '__main__':
    migrate()
