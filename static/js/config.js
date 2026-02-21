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
    getAll:                     `${API_URL}/api/pantallas`,
    vincular:            (id) => `${API_URL}/api/pantallas/${id}/vincular`,
    desvincular:         (id) => `${API_URL}/api/pantallas/${id}/desvincular`,
    asignarRecepcionista:(id) => `${API_URL}/api/pantallas/${id}/asignar-recepcionista`
};

const RECEPCIONISTAS_API = {
    getAll: `${API_URL}/api/users/recepcionistas`
};

// Estado global compartido
let users          = [];
let currentUser    = null;
let selectedUserId = null;

// ==========================================
// GESTIÓN DE TOKEN JWT
// ==========================================

/**
 * Obtiene el token JWT del administrador activo en esta pestaña.
 * Busca en sessionStorage primero (token de la sesión actual),
 * luego en localStorage como fallback (token guardado por rol).
 */
function obtenerTokenAdmin() {
    const tokenSession = sessionStorage.getItem('jwt_token');
    const rolSession   = sessionStorage.getItem('jwt_role');

    // Aceptar 'admin' y 'administrador' como roles válidos de administrador
    if (tokenSession && (rolSession === 'admin' || rolSession === 'administrador')) {
        return tokenSession;
    }

    // Fallback localStorage
    return localStorage.getItem('jwt_token_admin')
        || localStorage.getItem('jwt_token_administrador')
        || null;
}

/**
 * Devuelve los headers de autorización JWT para el administrador.
 * Si no hay token de admin, redirige al login.
 */
function getAuthHeaders() {
    const token = obtenerTokenAdmin();

    if (!token) {
        console.warn('[Config] No hay token de admin — redirigiendo al login');
        window.location.href = '/';
        return {};
    }

    return {
        'Authorization': 'Bearer ' + token,
        'Content-Type':  'application/json'
    };
}

// ==========================================
// AUTENTICACIÓN
// ==========================================

/**
 * Verifica la sesión JWT con el backend.
 * Exige rol 'admin' — redirige al login si no cumple.
 */
async function checkAuth() {
    const token = obtenerTokenAdmin();

    if (!token) {
        console.warn('[Auth] Sin token de admin — redirigiendo al login');
        window.location.href = '/';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/verify-session`, {
            method:  'GET',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type':  'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok || !data.authenticated) {
            console.warn('[Auth] Token inválido o expirado — redirigiendo al login');
            limpiarTokenAdmin();
            window.location.href = '/';
            return;
        }

        // Aceptar tanto 'admin' como 'administrador' (compatibilidad con registros existentes)
        const esAdmin = data.role === 'admin' || data.role === 'administrador';
        if (!esAdmin) {
            console.warn(`[Auth] Rol insuficiente: "${data.role}" — se requiere "admin"`);
            window.location.href = '/';
            return;
        }

        // ✅ Sesión válida — actualizar UI y estado global
        currentUser = {
            id:              data.id,
            usuario:         data.usuario,
            nombre_completo: data.nombre_completo,
            role:            data.role
        };

        const usernameEl = document.getElementById('username');
        if (usernameEl) usernameEl.textContent = data.nombre_completo || data.usuario;

        console.log(`✅ Admin autenticado: ${data.usuario}`);

    } catch (error) {
        console.error('[Auth] Error al verificar sesión:', error);
        window.location.href = '/';
    }
}

/**
 * Limpia los tokens del administrador del storage.
 */
function limpiarTokenAdmin() {
    localStorage.removeItem('jwt_token_admin');
    // Solo limpiar sessionStorage si el token activo era de admin
    if (sessionStorage.getItem('jwt_role') === 'admin') {
        sessionStorage.removeItem('jwt_token');
        sessionStorage.removeItem('jwt_role');
        sessionStorage.removeItem('usuario');
        sessionStorage.removeItem('rol');
        sessionStorage.removeItem('nombre_completo');
    }
}

/**
 * Logout del administrador.
 */
function logout() {
    fetch(`${API_BASE_URL}/logout`, {
        method:  'POST',
        headers: getAuthHeaders()
    }).finally(() => {
        limpiarTokenAdmin();
        window.location.href = '/';
    });
}

// ==========================================
// NAVEGACIÓN
// ==========================================

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

    if (sectionName === 'usuarios')     loadUsers();
    if (sectionName === 'estadisticas') updateStats();
}

function setupNavegacion() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function () {
            switchSection(this.dataset.section);
        });
    });
}

// ==========================================
// UTILIDADES COMPARTIDAS
// ==========================================

/**
 * Mostrar notificación toast.
 * @param {string} message
 * @param {'success'|'error'|'warning'} type
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
 * Obtener etiqueta legible para un rol.
 */
function getRoleLabel(rol) {
    const roles = {
        'admin':     'Administrador',
        'recepcion': 'Recepción',
        'registro':  'Registro',
        'medico':    'Médico'
    };
    return roles[(rol || '').toLowerCase()] || rol;
}

/**
 * Actualizar estadísticas del panel (llamada desde sección estadísticas).
 * Implementación básica — expandir según necesidades.
 */
function updateStats() {
    const totalEl = document.getElementById('totalUsuarios');
    if (totalEl) totalEl.textContent = users.length;

    const adminCount  = users.filter(u => u.rol === 'admin').length;
    const recepCount  = users.filter(u => u.rol === 'recepcion').length;
    const regCount    = users.filter(u => u.rol === 'registro').length;
    const medicoCount = users.filter(u => u.rol === 'medico').length;

    const adminEl  = document.getElementById('totalAdmins');
    const recepEl  = document.getElementById('totalRecepcion');
    const regEl    = document.getElementById('totalRegistro');
    const medicoEl = document.getElementById('totalMedicos');

    if (adminEl)  adminEl.textContent  = adminCount;
    if (recepEl)  recepEl.textContent  = recepCount;
    if (regEl)    regEl.textContent    = regCount;
    if (medicoEl) medicoEl.textContent = medicoCount;
}