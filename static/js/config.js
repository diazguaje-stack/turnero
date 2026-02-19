function getAuthHeaders() {
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "/";
        return {};
    }

    return {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
    };
}
// ==========================================
// config.js — Variables globales y configuración compartida
// Debe cargarse PRIMERO antes que cualquier otro módulo
// ==========================================

const API_URL      = window.location.origin;
const API_BASE_URL = `${API_URL}/api`;

// Endpoints de usuarios
const USUARIOS_API = {
    getAll:        `${API_BASE_URL}/users`,
    create:        `${API_BASE_URL}/users/create`,
    update: (id) => `${API_BASE_URL}/users/${id}`,
    delete: (id) => `${API_BASE_URL}/users/${id}`,
    logout:        `${API_BASE_URL}/logout`
};

// Endpoints de pantallas
const PANTALLAS_API = {
    getAll:                    `${API_URL}/api/pantallas`,
    vincular:           (id) => `${API_URL}/api/pantallas/${id}/vincular`,
    desvincular:        (id) => `${API_URL}/api/pantallas/${id}/desvincular`,
    asignarRecepcionista:(id)=> `${API_URL}/api/pantallas/${id}/asignar-recepcionista`
};

const RECEPCIONISTAS_API = {
    getAll: `${API_URL}/api/users/recepcionistas`
};

// Estado global compartido
let users               = [];
let currentUser         = null;
let selectedUserId      = null;

// ── Utilidades compartidas ────────────────────────────────────────────────────

/**
 * Mostrar notificación toast
 * @param {string} message
 * @param {'success'|'error'} type
 */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className   = `toast ${type}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

/**
 * Obtener etiqueta legible para un rol
 */
function getRoleLabel(rol) {
    const roles = {
        'administrador': 'Administrador',
        'recepcion':     'Recepción',
        'registro':      'Registro'
    };
    return roles[(rol || '').toLowerCase()] || rol;
}

// ── Autenticación ─────────────────────────────────────────────────────────────

async function checkAuth() {
    // ⚠️ MODO DESARROLLO — descomentar validación real en producción
    const usernameEl = document.getElementById('username');
    if (usernameEl) usernameEl.textContent = 'admin (modo desarrollo)';

    currentUser = { usuario: 'admin', role: 'administrador' };
    console.log('⚠️ MODO DESARROLLO: Autenticación deshabilitada');
}

function logout() {
    sessionStorage.removeItem('userSession');
    localStorage.removeItem('rememberedCredentials');

    fetch(USUARIOS_API.logout, { method: 'POST', headers: getAuthHeaders() })
        .finally(() => { window.location.href = '/'; });
}

// ── Navegación ────────────────────────────────────────────────────────────────

function switchSection(sectionName) {
    // Actualizar ítem activo en sidebar
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const activeNav = document.querySelector(`[data-section="${sectionName}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Mostrar sección correspondiente
    document.querySelectorAll('.section').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    const target = document.getElementById(`section-${sectionName}`);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }

    // Acciones al entrar en cada sección
    if (sectionName === 'pantallas') {
        inicializarPantallas();
    } else {
        limpiarIntervaloPantallas();
    }

    if (sectionName === 'usuarios') loadUsers();
    if (sectionName === 'estadisticas') updateStats();
}

function setupNavegacion() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function () {
            switchSection(this.dataset.section);
        });
    });
}