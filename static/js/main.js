// ==========================================
// main.js — Punto de entrada, se carga al final del HTML
// ==========================================

document.addEventListener('DOMContentLoaded', async function () {
    console.log('Panel de administrador cargando...');

    // 1. Verificar sesión PRIMERO — si falla, redirige al login y para aquí
    await checkAuth();         // config.js

    // 2. Setup de navegación
    setupNavegacion();         // config.js

    // 3. Inicializar listeners de formularios y modales
    initUsuarios();            // usuarios.js

    // 4. Cargar datos iniciales UNA SOLA VEZ
    await loadUsersFromBackend(); // usuarios.js

    // 5. Conectar WebSocket DESPUÉS de que todo esté listo
    // Así los eventos WS no llegan antes de que el DOM y la sesión estén listos
    conectarSocketAdmin();     // usuarios.js

    console.log('✅ Panel de administrador listo');
});

console.log('✅ main.js cargado');