# migrate_users.py - Script para migrar usuarios de JSON a PostgreSQL
import json
import os
from app_postgresql import app
from models import db, Usuario

def migrate_users_from_json():
    """Migrar usuarios desde users_db.json a PostgreSQL"""
    
    json_file = 'users_db.json'
    
    if not os.path.exists(json_file):
        print(f"❌ Archivo {json_file} no encontrado")
        return
    
    with app.app_context():
        try:
            # Leer usuarios desde JSON
            with open(json_file, 'r', encoding='utf-8') as f:
                users_data = json.load(f)
            
            print(f"📂 {len(users_data)} usuarios encontrados en {json_file}")
            
            migrated = 0
            skipped = 0
            
            for username, data in users_data.items():
                # Verificar si el usuario ya existe
                existing_user = Usuario.query.filter_by(usuario=username).first()
                
                if existing_user:
                    print(f"⏭️  Usuario '{username}' ya existe - omitido")
                    skipped += 1
                    continue
                
                # Crear nuevo usuario
                new_user = Usuario(
                    usuario=data['usuario'],
                    rol=data['role'],
                    nombre_completo=data.get('nombre_completo', data['usuario']),
                    created_by=data.get('created_by', 'migracion')
                )
                
                # Establecer contraseña (en texto plano desde JSON)
                new_user.set_password(data['password'])
                
                # Agregar a la sesión
                db.session.add(new_user)
                migrated += 1
                
                print(f"✅ Usuario '{username}' migrado - Rol: {data['role']}")
            
            # Confirmar cambios
            db.session.commit()
            
            print("\n" + "="*60)
            print("🎉 MIGRACIÓN COMPLETADA")
            print("="*60)
            print(f"✅ Usuarios migrados: {migrated}")
            print(f"⏭️  Usuarios omitidos: {skipped}")
            print(f"📊 Total en base de datos: {Usuario.query.count()}")
            print("="*60)
            
        except Exception as e:
            db.session.rollback()
            print(f"\n❌ Error durante la migración: {str(e)}")
            raise

if __name__ == '__main__':
    print("\n🔄 INICIANDO MIGRACIÓN DE USUARIOS")
    print("="*60)
    migrate_users_from_json()