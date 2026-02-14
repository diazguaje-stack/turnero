// administrador.js - Panel de administrador

// Configuracion de la API
const API_URL = window.location.origin;
const API_ENDPOINTS = {
    logout: `${API_URL}/api/logout`,
    verifySession: `${API_URL}/api/verify-session`,
    getUsers: `${API_URL}/api/users`,
    createUser: `${API_URL}/api/users/create`,
    deleteUser: (userId) => `${API_URL}/api/users/${userId}`
};

/**
 * Verificar sesion activa al cargar la pagina
 */
async function verificarSesion() {
    try {
        const response = await fetch(API_ENDPOINTS.verifySession, {
            method: 'GET',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.authenticated) {
            // No hay sesion activa, redirigir al login
            window.location.href = '/';
            return;
        }
        
        // Verificar que el rol sea administrador
        if (data.role !== 'administrador') {
            console.error('Acceso denegado: rol incorrecto');
            cerrarSesion();
            return;
        }
        
        console.log('Sesion verificada:', data);
        
        // Mostrar nombre del usuario si existe el elemento
        const userNameElement = document.getElementById('userName');
        if (userNameElement && data.usuario) {
            userNameElement.textContent = data.usuario;
        }
        
    } catch (error) {
        console.error('Error al verificar sesion:', error);
        window.location.href = '/';
    }
}

/**
 * Cerrar sesion
 */
async function cerrarSesion() {
    try {
        const response = await fetch(API_ENDPOINTS.logout, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            console.log('Sesion cerrada exitosamente');
        }
    } catch (error) {
        console.error('Error al cerrar sesion:', error);
    } finally {
        // Redirigir al login siempre
        window.location.href = '/';
    }
}

/**
 * Event listeners
 */
document.addEventListener('DOMContentLoaded', () => {
    // Verificar sesion al cargar
    verificarSesion();
    
    // Agregar evento al boton de logout si existe
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            cerrarSesion();
        });
    }
    
    // Tambien buscar por clase
    const logoutButtons = document.querySelectorAll('.logout-btn, .btn-logout');
    logoutButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            cerrarSesion();
        });
    });
});

// Exportar funciones para uso global
window.cerrarSesion = cerrarSesion;
window.verificarSesion = verificarSesion;