// ==========================================
// estadisticas.js — Sección de estadísticas
// (requiere config.js y usuarios.js cargados antes)
// ==========================================

/**
 * Actualizar los contadores del panel de estadísticas.
 * Amplía esta función cuando agregues más métricas.
 */
function updateStats() {
    // Total de usuarios
    const totalUsersEl = document.getElementById('totalUsers');
    if (totalUsersEl) totalUsersEl.textContent = users.length;

    // Aquí puedes agregar más métricas en el futuro:
    // document.getElementById('totalPantallas').textContent = pantallasList.length;
    // document.getElementById('pantallasActivas').textContent = pantallasList.filter(p => p.estado === 'vinculada').length;
}