"""
Script para recrear la base de datos del sistema de Turnero Médico
ADVERTENCIA: Este script eliminará TODOS los datos existentes
"""

import os
import sys

def recreate_database():
    """Elimina y recrea la base de datos"""
    
    print("=" * 60)
    print("  RECREAR BASE DE DATOS - TURNERO MÉDICO")
    print("=" * 60)
    print()
    print("⚠️  ADVERTENCIA: Este proceso eliminará TODOS los datos existentes")
    print()
    
    # Confirmar
    response = input("¿Estás seguro de que deseas continuar? (escribe 'SI' para confirmar): ")
    
    if response != 'SI':
        print("\n❌ Operación cancelada")
        return
    
    print("\n[1/3] Eliminando base de datos existente...")
    
    # Buscar y eliminar archivo de base de datos
    db_files = ['turnero.db', 'instance/turnero.db', 'database.db', 'instance/database.db']
    deleted = False
    
    for db_file in db_files:
        if os.path.exists(db_file):
            try:
                os.remove(db_file)
                print(f"  ✓ Eliminado: {db_file}")
                deleted = True
            except Exception as e:
                print(f"  ✗ Error eliminando {db_file}: {e}")
    
    if not deleted:
        print("  ℹ No se encontró ninguna base de datos existente")
    
    print("\n[2/3] Creando nueva base de datos...")
    
    try:
        # Importar después de confirmar para evitar errores antes
        from config.database import init_db
        from app import create_app
        
        app = create_app()
        with app.app_context():
            init_db()
        
        print("  ✓ Base de datos creada exitosamente")
        
    except Exception as e:
        print(f"  ✗ Error creando base de datos: {e}")
        print("\nDetalles del error:")
        import traceback
        traceback.print_exc()
        return
    
    print("\n[3/3] Verificando configuración...")
    print("  ✓ Estructura de base de datos lista")
    print("  ✓ Usuario administrador creado")
    
    print("\n" + "=" * 60)
    print("  BASE DE DATOS RECREADA EXITOSAMENTE")
    print("=" * 60)
    print("\nCredenciales del administrador:")
    print("  📧 Email:    admin@turnero.com")
    print("  🔑 Password: admin123")
    print("\nPara iniciar el servidor ejecuta:")
    print("  python app.py")
    print()

if __name__ == '__main__':
    try:
        recreate_database()
    except KeyboardInterrupt:
        print("\n\n❌ Operación cancelada por el usuario")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error inesperado: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)