#!/usr/bin/env python3
"""
Script para ejecutar la migración de base de datos
Agrega el campo recepcionista_id a la tabla pantallas
"""

from app import app, db
from sqlalchemy import text

def ejecutar_migracion():
    """Ejecutar la migración de base de datos"""
    
    print("\n" + "="*60)
    print("MIGRACIÓN DE BASE DE DATOS")
    print("="*60)
    print("\nAgregando campo 'recepcionista_id' a tabla 'pantallas'...\n")
    
    with app.app_context():
        try:
            # PASO 1: Verificar si la columna ya existe
            result = db.session.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'pantallas' 
                AND column_name = 'recepcionista_id'
            """))
            
            if result.fetchone():
                print("⚠️  La columna 'recepcionista_id' ya existe.")
                print("✅ No se requiere migración.\n")
                return
            
            print("➡️  Paso 1: Agregando columna 'recepcionista_id'...")
            
            # PASO 2: Agregar la columna
            db.session.execute(text("""
                ALTER TABLE pantallas 
                ADD COLUMN recepcionista_id VARCHAR(36)
            """))
            
            print("✅ Columna agregada correctamente.\n")
            
            print("➡️  Paso 2: Creando foreign key...")
            
            # PASO 3: Agregar foreign key
            db.session.execute(text("""
                ALTER TABLE pantallas 
                ADD CONSTRAINT fk_pantalla_recepcionista 
                FOREIGN KEY (recepcionista_id) 
                REFERENCES usuarios(id) 
                ON DELETE SET NULL
            """))
            
            print("✅ Foreign key creada correctamente.\n")
            
            print("➡️  Paso 3: Creando índice...")
            
            # PASO 4: Crear índice
            db.session.execute(text("""
                CREATE INDEX idx_pantalla_recepcionista 
                ON pantallas(recepcionista_id)
            """))
            
            print("✅ Índice creado correctamente.\n")
            
            # Confirmar cambios
            db.session.commit()
            
            print("="*60)
            print("🎉 MIGRACIÓN COMPLETADA EXITOSAMENTE")
            print("="*60)
            
            # Verificar estructura
            print("\n📋 Verificando estructura de la tabla...\n")
            result = db.session.execute(text("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'pantallas'
                ORDER BY ordinal_position
            """))
            
            print(f"{'Columna':<25} {'Tipo':<20} {'Nullable':<10}")
            print("-" * 60)
            for row in result:
                print(f"{row[0]:<25} {row[1]:<20} {row[2]:<10}")
            
            print("\n✅ La tabla 'pantallas' ha sido actualizada correctamente.")
            print("\n⚠️  IMPORTANTE: Reinicia tu servidor Flask para que los cambios surtan efecto.\n")
            
        except Exception as e:
            db.session.rollback()
            print("\n❌ ERROR durante la migración:")
            print(f"   {str(e)}\n")
            print("💡 Posibles causas:")
            print("   - La columna ya existe")
            print("   - Problemas de permisos en la base de datos")
            print("   - La tabla 'pantallas' no existe")
            print("\nVerifica tu base de datos y vuelve a intentar.\n")
            raise


def verificar_migracion():
    """Verificar que la migración se haya ejecutado correctamente"""
    
    print("\n" + "="*60)
    print("VERIFICACIÓN DE MIGRACIÓN")
    print("="*60 + "\n")
    
    with app.app_context():
        try:
            # Verificar columna
            result = db.session.execute(text("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'pantallas'
                AND column_name = 'recepcionista_id'
            """))
            
            row = result.fetchone()
            
            if row:
                print("✅ Columna 'recepcionista_id' encontrada:")
                print(f"   - Tipo: {row[1]}")
                print(f"   - Nullable: {row[2]}")
            else:
                print("❌ Columna 'recepcionista_id' NO encontrada")
                print("   Ejecuta la migración primero.\n")
                return False
            
            # Verificar foreign key
            result = db.session.execute(text("""
                SELECT constraint_name
                FROM information_schema.table_constraints
                WHERE table_name = 'pantallas'
                AND constraint_name = 'fk_pantalla_recepcionista'
            """))
            
            if result.fetchone():
                print("✅ Foreign key 'fk_pantalla_recepcionista' encontrada")
            else:
                print("⚠️  Foreign key 'fk_pantalla_recepcionista' NO encontrada")
            
            # Verificar índice
            result = db.session.execute(text("""
                SELECT indexname
                FROM pg_indexes
                WHERE tablename = 'pantallas'
                AND indexname = 'idx_pantalla_recepcionista'
            """))
            
            if result.fetchone():
                print("✅ Índice 'idx_pantalla_recepcionista' encontrado")
            else:
                print("⚠️  Índice 'idx_pantalla_recepcionista' NO encontrado")
            
            print("\n" + "="*60)
            print("✅ VERIFICACIÓN COMPLETADA")
            print("="*60 + "\n")
            
            return True
            
        except Exception as e:
            print(f"\n❌ Error durante la verificación: {str(e)}\n")
            return False


if __name__ == '__main__':
    import sys
    
    print("\n🔧 HERRAMIENTA DE MIGRACIÓN DE BASE DE DATOS\n")
    
    if len(sys.argv) > 1 and sys.argv[1] == '--verificar':
        verificar_migracion()
    else:
        print("Opciones:")
        print("  1. Ejecutar migración")
        print("  2. Verificar migración")
        print("  3. Salir")
        
        opcion = input("\nSelecciona una opción (1-3): ").strip()
        
        if opcion == '1':
            ejecutar_migracion()
        elif opcion == '2':
            verificar_migracion()
        elif opcion == '3':
            print("Saliendo...\n")
            sys.exit(0)
        else:
            print("❌ Opción inválida\n")
            sys.exit(1)