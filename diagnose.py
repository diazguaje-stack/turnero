#!/usr/bin/env python3
"""
Herramienta de diagnosis para verificar la conexión y la base de datos
"""
import os
import sys
from config import config

print("=" * 60)
print("DIAGNOSIS DEL SERVIDOR TURNERO MÉDICO")
print("=" * 60)

# 1. Verificar configuración
env = os.environ.get('FLASK_ENV', 'development')
print(f"\n1. Entorno: {env}")
print(f"   Config: {config[env]}")

# 2. Verificar base de datos
try:
    from models import db, init_db, Usuario, Pantalla
    from app import app
    
    print("\n2. Inicializando base de datos...")
    init_db(app)
    
    with app.app_context():
        # 3. Contar registros
        num_usuarios = Usuario.query.count()
        num_pantallas = Pantalla.query.count()
        
        print(f"\n3. Estado de base de datos:")
        print(f"   ✓ Usuarios: {num_usuarios}")
        print(f"   ✓ Pantallas: {num_pantallas}")
        
        # 4. Verificar pantallas disponibles
        pantallas_disp = Pantalla.query.filter_by(estado='disponible').count()
        print(f"   ✓ Pantallas disponibles: {pantallas_disp}")
        
        if num_pantallas > 0:
            print("\n4. Pantallas en sistema:")
            for p in Pantalla.query.all():
                print(f"   - Pantalla {p.numero}: {p.estado}")
        
        print("\n✅ Base de datos OK")
        
except Exception as e:
    print(f"\n❌ ERROR en base de datos: {str(e)}")
    print("\nPrueba ejecutar:")
    print("  python migracion.py")
    sys.exit(1)

print("\n" + "=" * 60)
print("INSTRUCCIONES PARA INICIAR EL SERVIDOR:")
print("=" * 60)
print("\n1. En VS Code (terminal integrada):")
print("   python app.py")
print("\n2. Luego abre en el navegador:")
print(f"   http://localhost:5000")
print("\n3. Para la pantalla de turnos:")
print(f"   http://localhost:5000/screen")
print("\n" + "=" * 60)
