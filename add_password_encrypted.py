#!/usr/bin/env python
"""
fix_passwords.py - Script para reparar contraseñas encriptadas de usuarios existentes

Este script actualiza todos los usuarios que tienen password_encrypted NULL o vacío,
re-encriptando sus contraseñas conocidas.

IMPORTANTE: Este script solo funciona si conoces las contraseñas originales.
"""

from app import app, db
from models import Usuario, encrypt_password
from sqlalchemy import text

# Contraseñas conocidas por defecto
KNOWN_PASSWORDS = {
    'admin': 'admin123',
    'recepcion': 'recep123'
}

def fix_encrypted_passwords():
    """Repara las contraseñas encriptadas de usuarios existentes"""
    with app.app_context():
        try:
            print("\n" + "="*60)
            print("REPARACIÓN DE CONTRASEÑAS ENCRIPTADAS")
            print("="*60 + "\n")
            
            # Obtener todos los usuarios
            usuarios = Usuario.query.all()
            print(f"📊 Total de usuarios en la base de datos: {len(usuarios)}\n")
            
            fixed_count = 0
            skipped_count = 0
            
            for usuario in usuarios:
                # Si ya tiene password_encrypted, saltar
                if usuario.password_encrypted:
                    print(f"✓ {usuario.usuario}: Ya tiene contraseña encriptada")
                    skipped_count += 1
                    continue
                
                # Intentar obtener la contraseña conocida
                if usuario.usuario in KNOWN_PASSWORDS:
                    password = KNOWN_PASSWORDS[usuario.usuario]
                    usuario.password_encrypted = encrypt_password(password)
                    print(f"✅ {usuario.usuario}: Contraseña encriptada agregada")
                    fixed_count += 1
                else:
                    print(f"⚠️  {usuario.usuario}: Contraseña desconocida - se debe cambiar manualmente")
                    skipped_count += 1
            
            # Guardar cambios
            if fixed_count > 0:
                db.session.commit()
                print(f"\n✅ Base de datos actualizada exitosamente")
            else:
                print(f"\n✓ No se necesitaron cambios")
            
            print(f"\n📊 Resumen:")
            print(f"   - Reparados: {fixed_count}")
            print(f"   - Sin cambios: {skipped_count}")
            print(f"   - Total: {len(usuarios)}")
            
            if fixed_count > 0:
                print("\n🎉 ¡Contraseñas reparadas exitosamente!")
            
            print("\n" + "="*60 + "\n")
            
        except Exception as e:
            print(f"\n❌ Error: {str(e)}\n")
            db.session.rollback()
            import traceback
            traceback.print_exc()


def add_missing_column():
    """Agrega la columna password_encrypted si no existe"""
    with app.app_context():
        try:
            print("\n🔧 Verificando columna password_encrypted...")
            
            with db.engine.begin() as connection:
                # Para PostgreSQL
                connection.execute(text("""
                    ALTER TABLE usuarios 
                    ADD COLUMN IF NOT EXISTS password_encrypted VARCHAR(500);
                """))
            
            print("✅ Columna password_encrypted verificada/agregada\n")
            
        except Exception as e:
            print(f"❌ Error al agregar columna: {str(e)}\n")


if __name__ == '__main__':
    print("\n🚀 Iniciando reparación de contraseñas...\n")
    
    # Primero asegurarse de que la columna existe
    add_missing_column()
    
    # Luego reparar las contraseñas
    fix_encrypted_passwords()