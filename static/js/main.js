// ==========================================
// main.js — Punto de entrada, se carga al final
// ==========================================

document.addEventListener('DOMContentLoaded', function () {
    console.log('Panel de administrador cargado');

    checkAuth();           // config.js
    setupNavegacion();     // config.js
    initUsuarios();        // usuarios.js  (listeners de formularios y modales)
    loadUsersFromBackend();// usuarios.js  (carga datos + renderiza + updateStats)
});

console.log('✅ main.js cargado');