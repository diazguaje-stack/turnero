#!/usr/bin/env python3
"""
Script simple para ejecutar migración en Render
Agrega el campo recepcionista_id a la tabla pantallas
"""

import os
import sys
from sqlalchemy import create_engine, text
from urllib.parse import quote_plus

def ejecutar_migracion_render():
    """Ejecutar migración usando DATABASE_URL de Render"""
    
    # Obtener DATABASE_URL del entorno
    database_url = os.environ.get('DATABASE_URL')
    
    if not database_url:
        print("❌ ERROR: DATABASE_URL no encontrada en variables de entorno")
        print("Este script debe ejecutarse en Render o con DATABASE_URL configurada")
        sys.exit(1)
    
    # Render usa postgres:// pero SQLAlchemy necesita postgresql://
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    
    print("\n" + "="*60)
    print("MIGRACIÓN DE BASE DE DATOS - RENDER")
    print("="*60 + "\n")
    
    try:
        # Crear engine de SQLAlchemy
        engine = create_engine(database_url)
        
        with engine.connect() as conn:
            print("✅ Conexión a base de datos exitosa\n")
            
            # Verificar si la columna ya existe
            print("🔍 Verificando si la columna 'recepcionista_id' existe...")
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'pantallas' 
                AND column_name = 'recepcionista_id'
            """))
            
            if result.fetchone():
                print("✅ La columna 'recepcionista_id' ya existe")
                print("✅ No se requiere migración\n")
                return True
            
            print("➡️  La columna no existe, procediendo con migración...\n")
            
            # Paso 1: Agregar columna
            print("➡️  Paso 1/3: Agregando columna 'recepcionista_id'...")
            conn.execute(text("""
                ALTER TABLE pantallas 
                ADD COLUMN recepcionista_id VARCHAR(36)
            """))
            conn.commit()
            print("✅ Columna agregada\n")
            
            # Paso 2: Agregar foreign key
            print("➡️  Paso 2/3: Creando foreign key...")
            conn.execute(text("""
                ALTER TABLE pantallas 
                ADD CONSTRAINT fk_pantalla_recepcionista 
                FOREIGN KEY (recepcionista_id) 
                REFERENCES usuarios(id) 
                ON DELETE SET NULL
            """))
            conn.commit()
            print("✅ Foreign key creada\n")
            
            # Paso 3: Crear índice
            print("➡️  Paso 3/3: Creando índice...")
            conn.execute(text("""
                CREATE INDEX idx_pantalla_recepcionista 
                ON pantallas(recepcionista_id)
            """))
            conn.commit()
            print("✅ Índice creado\n")
            
            print("="*60)
            print("🎉 MIGRACIÓN COMPLETADA EXITOSAMENTE")
            print("="*60 + "\n")
            
            return True
            
    except Exception as e:
        print(f"\n❌ ERROR durante la migración:")
        print(f"   {str(e)}\n")
        return False


if __name__ == '__main__':
    print("\n🚀 Iniciando migración de base de datos...\n")
    
    success = ejecutar_migracion_render()
    
    if success:
        print("✅ Migración completada con éxito")
        print("✅ Puedes reiniciar tu aplicación en Render\n")
        sys.exit(0)
    else:
        print("❌ La migración falló")
        print("❌ Revisa los logs y contacta soporte si es necesario\n")
        sys.exit(1)