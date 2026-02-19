/**
 * sessionManager.js
 * Gestión centralizada de sesiones y validación de roles
 * 
 * IMPORTANTE: Este archivo debe cargarse PRIMERO en todas las páginas protegidas
 * Ejemplo: <script src="/static/sessionManager.js"></script>
 */

// ==================== DATOS GLOBALES ====================

window.sessionData = {
    usuario: null,
    rol: null,
    nombre_completo: null,
    autenticado: false
};

// ==================== VERIFICAR SESIÓN ====================

/**
 * Verificar si el usuario está autenticado y tiene un rol específico
 * @param {string} rolRequerido - Rol que debe tener ('admin', 'medico', 'recepcion', 'registro')
 * @returns {Promise<boolean>} - true si tiene acceso, false si no
 * 
 * Uso:
 *   const tieneAcceso = await verificarRol('recepcion');
 *   if (!tieneAcceso) return;
 */
async function verificarRol(rolRequerido) {
    try {
        console.log(`🔍 Verificando acceso para rol: ${rolRequerido}...`);
        
        // Hacer petición al servidor
        const response = await fetch('/api/sesion/verificar', {
            method: 'GET',
            credentials: 'include',  // Incluir cookies de sesión
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn(`❌ Sesión no válida (${response.status})`);
            // Redirigir a login
            setTimeout(() => {
                window.location.href = '/';
            }, 500);
            return false;
        }

        const data = await response.json();

        // Guardar datos en sesión global
        window.sessionData = {
            usuario: data.usuario,
            rol: data.rol,
            nombre_completo: data.nombre_completo,
            autenticado: true
        };

        // Verificar si el rol coincide
        if (data.rol !== rolRequerido) {
            console.error(`
❌ ACCESO DENEGADO
   Usuario: ${data.usuario}
   Rol actual: ${data.rol}
   Rol requerido: ${rolRequerido}
            `);
            // Redirigir a login
            setTimeout(() => {
                window.location.href = '/';
            }, 500);
            return false;
        }

        console.log(`
✅ ACCESO PERMITIDO
   Usuario: ${data.usuario}
   Nombre: ${data.nombre_completo}
   Rol: ${data.rol}
        `);
        return true;

    } catch (error) {
        console.error('❌ Error al verificar sesión:', error);
        // En caso de error, redirigir a login como medida de seguridad
        setTimeout(() => {
            window.location.href = '/';
        }, 500);
        return false;
    }
}

// ==================== VERIFICAR AUTENTICACIÓN ====================

/**
 * Verificar si el usuario está autenticado (sin validar rol específico)
 * @returns {Promise<boolean>} - true si está autenticado
 * 
 * Uso:
 *   const autenticado = await estaAutenticado();
 */
async function estaAutenticado() {
    try {
        const response = await fetch('/api/sesion/verificar', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            return false;
        }

        const data = await response.json();

        // Guardar datos
        window.sessionData = {
            usuario: data.usuario,
            rol: data.rol,
            nombre_completo: data.nombre_completo,
            autenticado: true
        };

        console.log(`✅ Autenticado como: ${data.usuario} (${data.rol})`);
        return true;

    } catch (error) {
        console.error('Error al verificar autenticación:', error);
        return false;
    }
}

// ==================== VERIFICAR MÚLTIPLES ROLES ====================

/**
 * Verificar si el usuario tiene uno de varios roles
 * @param {string[]} rolesPermitidos - Array de roles permitidos
 * @returns {Promise<boolean>} - true si tiene uno de los roles
 * 
 * Uso:
 *   const tieneAcceso = await verificarRoles(['admin', 'medico']);
 */
async function verificarRoles(rolesPermitidos) {
    try {
        const response = await fetch('/api/sesion/verificar', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            window.location.href = '/';
            return false;
        }

        const data = await response.json();

        // Guardar datos
        window.sessionData = {
            usuario: data.usuario,
            rol: data.rol,
            nombre_completo: data.nombre_completo,
            autenticado: true
        };

        // Verificar si el rol está en la lista permitida
        if (!rolesPermitidos.includes(data.rol)) {
            console.error(`❌ Rol no permitido: ${data.rol}`);
            window.location.href = '/';
            return false;
        }

        console.log(`✅ Usuario ${data.usuario} tiene acceso (rol: ${data.rol})`);
        return true;

    } catch (error) {
        console.error('Error:', error);
        window.location.href = '/';
        return false;
    }
}

// ==================== LOGOUT ====================

/**
 * Mostrar diálogo de confirmación y cerrar sesión
 * 
 * Uso:
 *   function logout() {
 *       confirmarCierreSesion();
 *   }
 */
function confirmarCierreSesion() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        fetch('/logout', {
            method: 'POST',
            credentials: 'include'
        })
            .then(response => {
                // Limpiar datos de sesión
                window.sessionData = {
                    usuario: null,
                    rol: null,
                    nombre_completo: null,
                    autenticado: false
                };
                // Redirigir a login
                window.location.href = '/';
            })
            .catch(err => {
                console.error('Error al cerrar sesión:', err);
                // De todas formas redirigir
                window.location.href = '/';
            });
    }
}

/**
 * Cerrar sesión sin confirmación (silencioso)
 */
function logoutSilencioso() {
    fetch('/logout', {
        method: 'POST',
        credentials: 'include'
    })
        .then(() => {
            window.sessionData = {
                usuario: null,
                rol: null,
                nombre_completo: null,
                autenticado: false
            };
            window.location.href = '/';
        })
        .catch(err => {
            console.error('Error:', err);
            window.location.href = '/';
        });
}

// ==================== HELPER: OBTENER DATOS DE SESIÓN ====================

/**
 * Obtener datos actuales de sesión
 * @returns {object} - Datos de sessionData
 */
function obtenerDatosSesion() {
    return window.sessionData;
}

/**
 * Obtener nombre del usuario autenticado
 * @returns {string} - Nombre completo o usuario
 */
function obtenerNombreUsuario() {
    return window.sessionData.nombre_completo || window.sessionData.usuario || 'Usuario';
}

/**
 * Obtener rol del usuario autenticado
 * @returns {string} - Rol del usuario
 */
function obtenerRolUsuario() {
    return window.sessionData.rol || null;
}

/**
 * Obtener letra inicial para avatar
 * @returns {string} - Primer carácter en mayúscula
 */
function obtenerInicial() {
    const nombre = obtenerNombreUsuario();
    return nombre.charAt(0).toUpperCase();
}

// ==================== INICIALIZACIÓN AUTOMÁTICA ====================

/**
 * Inicializar sesión al cargar página
 * (Se ejecuta automáticamente)
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔐 sessionManager.js cargado');
    
    // Verificar si hay datos de sesión guardados
    const datosGuardados = localStorage.getItem('sessionData');
    if (datosGuardados) {
        try {
            window.sessionData = JSON.parse(datosGuardados);
            console.log('📦 Datos de sesión restaurados desde localStorage');
        } catch (e) {
            console.warn('No se pudieron restaurar datos de sesión');
        }
    }
});

/**
 * Guardar datos de sesión en localStorage cuando cambien
 */
function guardarSesionLocal() {
    try {
        localStorage.setItem('sessionData', JSON.stringify(window.sessionData));
    } catch (e) {
        console.warn('No se pudo guardar sesión en localStorage');
    }
}

// ==================== INTERCEPTOR DE ERRORES 401/403 ====================

/**
 * Interceptar respuestas 401/403 de fetch
 * Útil para manejar sesiones expiradas en llamadas AJAX
 */
window.addEventListener('load', function() {
    // Guardar el fetch original
    const originalFetch = window.fetch;

    // Reemplazar fetch
    window.fetch = function(...args) {
        return originalFetch.apply(this, args)
            .then(response => {
                // Si es 401 (no autenticado) o 403 (prohibido), redirigir a login
                if (response.status === 401 || response.status === 403) {
                    console.warn(`⚠️ Respuesta ${response.status} - Redirigiendo a login`);
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 1000);
                }
                return response;
            });
    };
});

// ==================== FUNCIONES ÚTILES ====================

/**
 * Mostrar notificación simple
 * @param {string} mensaje - Mensaje a mostrar
 * @param {string} tipo - 'success', 'error', 'warning', 'info'
 * @param {number} duracion - Duración en ms (default: 3000)
 */
function mostrarNotificacionSesion(mensaje, tipo = 'info', duracion = 3000) {
    const notificacion = document.createElement('div');
    notificacion.className = `notificacion-sesion ${tipo}`;
    notificacion.textContent = mensaje;
    notificacion.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 4px;
        font-weight: 500;
        z-index: 9999;
        animation: slideInRight 0.3s ease;
        background: ${
            tipo === 'success' ? '#d4edda' :
            tipo === 'error' ? '#f8d7da' :
            tipo === 'warning' ? '#fff3cd' :
            '#d1ecf1'
        };
        color: ${
            tipo === 'success' ? '#155724' :
            tipo === 'error' ? '#721c24' :
            tipo === 'warning' ? '#856404' :
            '#0c5460'
        };
        border: 1px solid ${
            tipo === 'success' ? '#c3e6cb' :
            tipo === 'error' ? '#f5c6cb' :
            tipo === 'warning' ? '#ffeeba' :
            '#b8daff'
        };
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    
    document.body.appendChild(notificacion);
    
    setTimeout(() => {
        notificacion.style.opacity = '0';
        notificacion.style.transition = 'opacity 0.3s ease';
        setTimeout(() => notificacion.remove(), 300);
    }, duracion);
}

// Estilos para animación
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// ==================== LOGGER ====================

console.log('%c🔐 Sistema de Autenticación Cargado', 'color: #667eea; font-size: 14px; font-weight: bold;');
console.log('%cFunciones disponibles:', 'color: #667eea; font-weight: bold;');
console.log('%c• verificarRol(rol)', 'color: #667eea;');
console.log('%c• estaAutenticado()', 'color: #667eea;');
console.log('%c• verificarRoles([roles])', 'color: #667eea;');
console.log('%c• confirmarCierreSesion()', 'color: #667eea;');
console.log('%c• obtenerDatosSesion()', 'color: #667eea;');
console.log('%c• obtenerNombreUsuario()', 'color: #667eea;');
console.log('%c• obtenerRolUsuario()', 'color: #667eea;');
console.log('%c• obtenerInicial()', 'color: #667eea;');