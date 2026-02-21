/**
 * auth.js — Helper JWT compartido
 * Incluir ANTES que registro.js, recepcion.js, usuarios.js, pantallas.js
 *
 * Uso en HTML:
 *   <script src="{{ url_for('static', filename='js/auth.js') }}"></script>
 *   <script src="{{ url_for('static', filename='js/registro.js') }}"></script>
 */

const Auth = {

    // ── Token storage ──────────────────────────────────────────────

    /**
     * Guarda el token. Usa sessionStorage (por pestaña) como fuente principal.
     * También persiste en localStorage por rol para recuperación entre sesiones.
     */
    guardarToken(token, role) {
        sessionStorage.setItem('jwt_token', token);
        sessionStorage.setItem('jwt_role', role);
        localStorage.setItem(`jwt_token_${role}`, token);
    },

    /** Obtiene el token activo de esta pestaña. */
    obtenerToken() {
        return sessionStorage.getItem('jwt_token');
    },

    /** Elimina el token de esta pestaña (logout). */
    eliminarToken() {
        const role = sessionStorage.getItem('jwt_role');
        if (role) localStorage.removeItem(`jwt_token_${role}`);
        sessionStorage.removeItem('jwt_token');
        sessionStorage.removeItem('jwt_role');
        // Limpiar también las claves usadas por login.js
        sessionStorage.removeItem('usuario');
        sessionStorage.removeItem('rol');
        sessionStorage.removeItem('nombre_completo');
    },

    obtenerRole() {
        return sessionStorage.getItem('jwt_role');
    },

    obtenerNombreCompleto() {
        return sessionStorage.getItem('nombre_completo') || '';
    },

    obtenerUsuario() {
        return sessionStorage.getItem('usuario') || '';
    },

    estaAutenticado() {
        return !!this.obtenerToken();
    },

    // ── Fetch con JWT automático ───────────────────────────────────

    /**
     * Wrapper de fetch() — agrega Authorization: Bearer <token> automáticamente.
     * Uso: await Auth.fetch('/api/algo', { method: 'GET' })
     */
    async fetch(url, options = {}) {
        const token = this.obtenerToken();

        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await window.fetch(url, {
            ...options,
            headers,
        });

        // Si el token expiró, redirigir al login
        if (response.status === 401) {
            console.warn('[Auth] Token expirado o inválido — redirigiendo al login');
            this.eliminarToken();
            window.location.href = '/';
            return response;
        }

        return response;
    },

    // ── Verificar sesión ───────────────────────────────────────────

    /**
     * Verifica el token con el backend y valida el rol esperado.
     * @param {string|null} rolEsperado - 'registro', 'recepcion', 'admin', o null para cualquier rol
     * @returns {object|null} datos del usuario, o null si la verificación falla
     */
    async verificarSesion(rolEsperado = null) {
        const token = this.obtenerToken();

        if (!token) {
            console.warn('[Auth] No hay token — redirigiendo al login');
            window.location.href = '/';
            return null;
        }

        try {
            const response = await this.fetch('/api/verify-session');

            if (!response.ok) {
                this.eliminarToken();
                window.location.href = '/';
                return null;
            }

            const data = await response.json();

            if (!data.authenticated) {
                this.eliminarToken();
                window.location.href = '/';
                return null;
            }

            // Validar rol si se especificó
            if (rolEsperado && data.role !== rolEsperado && data.role !== 'admin') {
                console.warn(`[Auth] Rol incorrecto: esperado "${rolEsperado}", recibido "${data.role}"`);
                window.location.href = '/';
                return null;
            }

            return data;

        } catch (error) {
            console.error('[Auth] Error al verificar sesión:', error);
            window.location.href = '/';
            return null;
        }
    },

    // ── Login ──────────────────────────────────────────────────────

    async login(usuario, password) {
        const response = await window.fetch('/api/login', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ usuario, password })
        });

        const data = await response.json();

        if (data.success && data.token) {
            const role = (data.role || data.rol || '').toLowerCase();
            this.guardarToken(data.token, role);

            // Guardar datos del usuario en sessionStorage (compatible con login.js)
            sessionStorage.setItem('usuario', data.usuario || usuario);
            sessionStorage.setItem('rol', role);
            sessionStorage.setItem('nombre_completo', data.nombre_completo || '');
        }

        return data;
    },

    // ── Logout ─────────────────────────────────────────────────────

    async logout() {
        try {
            await this.fetch('/api/logout', { method: 'POST' });
        } catch (_) { /* ignorar errores de red en logout */ }
        this.eliminarToken();
        window.location.href = '/';
    },

    // ── Mostrar info del usuario en navbar ────────────────────────

    mostrarUsuarioEnNavbar(data) {
        const nombre = data.nombre_completo || data.usuario || 'Usuario';

        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = nombre;

        const userAvatarEl = document.getElementById('userAvatar');
        if (userAvatarEl) userAvatarEl.textContent = nombre.charAt(0).toUpperCase();
    }
};