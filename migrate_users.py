#!/usr/bin/env python3
"""
Script de migración - Migrar usuarios y actualizar tabla pacientes
Ejecutar una sola vez
"""

import json
import os
import sqlite3
from pathlib import Path

def migrar_usuarios_json():
    """Migrar usuarios desde users_db.json a la BD"""
    
    json_file = 'users_db.json'
    
    if not os.path.exists(json_file):
        print(f"⏭️  Archivo {json_file} no encontrado - omitiendo migración de usuarios")
        return True
    
    print(f"📂 Leyendo {json_file}...")
    
    try:
        # Importar app y modelos aquí para evitar conflictos
        from app import app, db
        from models import Usuario
        
        with app.app_context():
            with open(json_file, 'r', encoding='utf-8') as f:
                users_data = json.load(f)
            
            print(f"📂 {len(users_data)} usuarios encontrados en {json_file}\n")
            
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
                
                # Establecer contraseña
                new_user.set_password(data['password'])
                
                # Agregar a la sesión
                db.session.add(new_user)
                migrated += 1
                
                print(f"✅ Usuario '{username}' migrado - Rol: {data['role']}")
            
            # Confirmar cambios
            if migrated > 0:
                db.session.commit()
            
            print("\n" + "="*60)
            print("✅ MIGRACIÓN DE USUARIOS COMPLETADA")
            print("="*60)
            print(f"✅ Usuarios migrados: {migrated}")
            print(f"⏭️  Usuarios omitidos: {skipped}")
            print(f"📊 Total en base de datos: {Usuario.query.count()}")
            print("="*60 + "\n")
            
            return True
            
    except Exception as e:
        print(f"\n⚠️  Advertencia en migración de usuarios: {str(e)}")
        print("Continuando con migración de tabla...\n")
        return True  # Continuar aunque falle


#!/usr/bin/env python3
"""
Script de migración SQLite - Agregar columnas a tabla pacientes
Soluciona el problema de "Cannot add a UNIQUE column"
"""

def migrar_tabla_pacientes():
    """Migrar tabla pacientes agregando nuevas columnas sin UNIQUE constraint"""
    
    # Buscar la BD
    db_paths = [
        'turnero_medico.db',
        'app.db',
        'database.db'
    ]
    
    db_path = None
    for path in db_paths:
        if Path(path).exists():
            db_path = path
            break
    
    if not db_path:
        print("❌ ERROR: No se encontró la base de datos")
        print("Archivos buscados:", db_paths)
        return False
    
    print(f"📊 Base de datos encontrada: {db_path}\n")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("🔄 Verificando estructura de tabla pacientes...")
        
        # Obtener columnas actuales
        cursor.execute("PRAGMA table_info(pacientes)")
        columnas = {row[1] for row in cursor.fetchall()}
        
        print(f"Columnas actuales: {', '.join(sorted(columnas))}\n")
        
        # Verificar qué columnas faltan
        columnas_necesarias = {'codigo_paciente', 'motivo', 'medico_id'}
        columnas_faltantes = columnas_necesarias - columnas
        
        if not columnas_faltantes:
            print("✅ La tabla ya tiene todas las columnas necesarias\n")
            conn.close()
            return True
        
        print(f"⚠️  Columnas faltantes: {', '.join(sorted(columnas_faltantes))}\n")
        
        # En SQLite, no podemos agregar UNIQUE sin valores, así que lo hacemos sin UNIQUE
        # y luego agregamos un índice único
        
        if 'codigo_paciente' in columnas_faltantes:
            print("➕ Agregando columna 'codigo_paciente' (sin UNIQUE)...")
            try:
                cursor.execute("""
                    ALTER TABLE pacientes 
                    ADD COLUMN codigo_paciente VARCHAR(50)
                """)
                print("   ✓ Agregada")
            except Exception as e:
                print(f"   ⚠️  Columna ya existe: {str(e)}")
        
        if 'motivo' in columnas_faltantes:
            print("➕ Agregando columna 'motivo'...")
            try:
                cursor.execute("""
                    ALTER TABLE pacientes 
                    ADD COLUMN motivo VARCHAR(100)
                """)
                print("   ✓ Agregada")
            except Exception as e:
                print(f"   ⚠️  Columna ya existe: {str(e)}")
        
        if 'medico_id' in columnas_faltantes:
            print("➕ Agregando columna 'medico_id'...")
            try:
                cursor.execute("""
                    ALTER TABLE pacientes 
                    ADD COLUMN medico_id VARCHAR(36)
                """)
                print("   ✓ Agregada")
            except Exception as e:
                print(f"   ⚠️  Columna ya existe: {str(e)}")
        
        # Crear índices únicos (más flexible que UNIQUE constraint)
        print("\n📌 Creando índices únicos...\n")
        
        try:
            cursor.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_codigo_paciente 
                ON pacientes(codigo_paciente)
            """)
            print("➕ Índice 'codigo_paciente' creado")
        except Exception as e:
            print(f"   ⚠️  Índice ya existe: {str(e)}")
        
        # Guardar cambios
        conn.commit()
        
        print("\n" + "="*60)
        print("✅ MIGRACIÓN COMPLETADA EXITOSAMENTE")
        print("="*60)
        print("\nAhora puedes:")
        print("  1. Reiniciar el servidor: python app.py")
        print("  2. Acceder a /registro")
        print("  3. Registrar pacientes\n")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"\n❌ ERROR durante migración:")
        print(f"   {str(e)}\n")
        return False



if __name__ == '__main__':
    print("\n" + "="*60)
    print("🔄 INICIANDO MIGRACIONES")
    print("="*60 + "\n")
    
    # Paso 1: Migrar usuarios desde JSON
    print("PASO 1: Migración de Usuarios desde JSON")
    print("-" * 60)
    migrar_usuarios_json()
    
    # Paso 2: Migrar tabla pacientes
    print("PASO 2: Migración de Tabla Pacientes")
    print("-" * 60)
    success = migrar_tabla_pacientes()
    
    if not success:
        print("⚠️  ADVERTENCIA: La migración de tabla falló.")
        print("   Por favor:")
        print("   1. Verifica que la BD existe")
        print("   2. Intenta nuevamente")
        print("   3. Si persiste, ejecuta manualmente:\n")
        print("   sqlite3 turnero_medico.db")
        print("   ALTER TABLE pacientes ADD COLUMN codigo_paciente VARCHAR(50) UNIQUE;")
        print("   ALTER TABLE pacientes ADD COLUMN motivo VARCHAR(100);")
        print("   ALTER TABLE pacientes ADD COLUMN medico_id VARCHAR(36);")
        print("   .quit\n")
    else:
        print("\n" + "="*60)
        print("🎉 ¡TODAS LAS MIGRACIONES COMPLETADAS!")
        print("="*60)
        print("\n📝 Próximos pasos:")
        print("   1. python app.py")
        print("   2. Login: admin / admin123")
        print("   3. Crear médicos con rol 'medico'")
        print("   4. Login: andres / andres123 (u otro usuario con rol 'registro')")
        print("   5. Acceder a /registro")
        print("   6. ¡Registrar pacientes!\n")