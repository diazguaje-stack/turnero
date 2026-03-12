// ==========================================
// main.js — Punto de entrada, se carga al final del HTML
// ==========================================

document.addEventListener('DOMContentLoaded', async function () {
    console.log('Panel de administrador cargando...');

    // 1. Verificar sesión PRIMERO
    await checkAuth();

    // 2. Setup de navegación
    setupNavegacion();

    // 3. Inicializar listeners de formularios y modales
    initUsuarios();

    // 4. Cargar datos iniciales
    await loadUsersFromBackend();

    // 5. Conectar WebSocket
    conectarSocketAdmin();

    // 6. Inicializar Publicidad — DESPUÉS del socket
    //    Esperamos un tick para que socketAdmin esté disponible
    setTimeout(() => {
        if (typeof Publicidad !== 'undefined' && typeof socketAdmin !== 'undefined') {
            Publicidad.init(socketAdmin);
            console.log('✅ Publicidad inicializada');
        } else {
            console.warn('⚠️ Publicidad o socketAdmin no disponible');
        }
    }, 300);

    console.log('✅ Panel de administrador listo');
});