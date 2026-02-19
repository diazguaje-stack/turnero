/**
 * auth.js — Helper JWT compartido
 * Incluir este script ANTES que registro.js, recepcion.js, usuarios.js
 * 
 * Uso en HTML:
 *   <script src="{{ url_for('static', filename='js/auth.js') }}"></script>
 *   <script src="{{ url_for('static', filename='js/registro.js') }}"></script>
 */

const Auth = {

    // ── Token storage ──────────────────────────────────────────────

    /**
     * Guarda el token en localStorage con clave por rol.
     * Cada rol tiene su propio espacio — no se pisan.
     */
    guardarToken(token, role) {
        localStorage.setItem(`jwt_token_${role}`, token);
        // También guardamos el token activo de esta pestaña
        sessionStorage.setItem('jwt_token_active', token);
        sessionStorage.setItem('jwt_role_active', role);
    },

    /**
     * Obtiene el token activo de esta pestaña (sessionStorage).
     * sessionStorage es EXCLUSIVO por pestaña — no se comparte.
     */
    obtenerToken() {
        return sessionStorage.getItem('jwt_token_active');
    },

    /**
     * Elimina el token de esta pestaña (logout).
     */
    eliminarToken() {
        const role = sessionStorage.getItem('jwt_role_active');
        if (role) localStorage.removeItem(`jwt_token_${role}`);
        sessionStorage.removeItem('jwt_token_active');
        sessionStorage.removeItem('jwt_role_active');
    },

    obtenerRole() {
        return sessionStorage.getItem('jwt_role_active');
    },

    estaAutenticado() {
        return !!this.obtenerToken();
    },

    // ── Fetch con JWT automático ───────────────────────────────────

    /**
     * Reemplaza fetch() — agrega Authorization: Bearer <token> automáticamente.
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
            console.warn('Token expirado o inválido — redirigiendo al login');
            this.eliminarToken();
            window.location.href = '/';
            return response;
        }

        return response;
    },

    // ── Verificar sesión ───────────────────────────────────────────

    /**
     * Verifica el token con el backend y valida el rol esperado.
     * @param {string} rolEsperado - 'registro', 'recepcion', 'admin'
     * @returns {object|null} datos del usuario o null si falla
     */
    async verificarSesion(rolEsperado = null) {
        const token = this.obtenerToken();

        if (!token) {
            window.location.href = '/';
            return null;
        }

        try {
            const response = await this.fetch('/api/verify-session');
            const data     = await response.json();

            if (!data.authenticated) {
                this.eliminarToken();
                window.location.href = '/';
                return null;
            }

            // Validar rol si se especificó
            if (rolEsperado && data.role !== rolEsperado && data.role !== 'admin') {
                console.warn(`Rol incorrecto: esperado "${rolEsperado}", recibido "${data.role}"`);
                window.location.href = '/';
                return null;
            }

            return data;

        } catch (error) {
            console.error('Error verificando sesión:', error);
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
            this.guardarToken(data.token, data.role.toLowerCase());
        }

        return data;
    },

    // ── Logout ─────────────────────────────────────────────────────

    async logout() {
        try {
            await this.fetch('/api/logout', { method: 'POST' });
        } catch (_) {}
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