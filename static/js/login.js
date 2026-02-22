// login.js - Manejo de login con múltiples roles

let selectedRole = null;

document.addEventListener('DOMContentLoaded', function () {

    const togglePassword = document.getElementById('togglePassword');
    const passwordInput  = document.getElementById('password');
    const usuarioInput   = document.getElementById('usuario');
    const rememberMe     = document.getElementById('rememberMe');

    // ==================== TOGGLE PASSWORD ====================
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', function (e) {
            e.preventDefault();
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            const eyeIcon = document.getElementById('eyeIcon');
            if (eyeIcon) eyeIcon.style.opacity = type === 'text' ? '0.5' : '1';
        });
    }

    // ==================== RECORDAR CREDENCIALES ====================
    if (rememberMe && usuarioInput) {
        const savedUser = localStorage.getItem('savedUser');
        if (savedUser) {
            usuarioInput.value = savedUser;
            rememberMe.checked = true;
        }
    }

    // ==================== BOTONES DE ROL ====================
    const roleButtons = document.querySelectorAll('[data-role]');

    roleButtons.forEach(button => {
        button.addEventListener('click', async function (e) {
            e.preventDefault();

            const rol = this.getAttribute('data-role');
            selectedRole = rol;

            this.disabled = true;
            const textoBtnOriginal = this.textContent;
            this.textContent = '⏳ Iniciando sesión...';

            const usuario  = usuarioInput ? usuarioInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value : '';

            if (!usuario || !password) {
                showError('Usuario y contraseña son requeridos');
                this.disabled = false;
                this.textContent = textoBtnOriginal;
                return;
            }

            try {
                const response = await fetch('/api/login', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ usuario, password })
                });

                const data = await response.json();
                console.log('[Login] Respuesta del servidor:', data);

                if (response.ok && data.success) {

                    // El backend retorna tanto 'rol' como 'role' para compatibilidad
                    const rolDelUsuario = (data.rol || data.role || '').toLowerCase();
                    const rolSolicitado = rol.toLowerCase();

                    // Normalizar: 'administrador' y 'admin' son equivalentes
                    const normalizar = r => r === 'administrador' ? 'admin' : r;
                    const rolUserNorm = normalizar(rolDelUsuario);
                    const rolSolNorm  = normalizar(rolSolicitado);

                    console.log(`[Login] Rol solicitado: ${rolSolicitado}(${rolSolNorm}) | Rol usuario: ${rolDelUsuario}(${rolUserNorm})`);

                    if (rolUserNorm !== rolSolNorm) {
                        showError(`Este usuario no tiene rol de ${rolSolicitado}`);
                        this.disabled = false;
                        this.textContent = textoBtnOriginal;
                        return;
                    }

                    // ✅ Guardar token y datos de sesión
                    if (data.token) {
                        sessionStorage.setItem('jwt_token', data.token);
                        sessionStorage.setItem('jwt_role', rolDelUsuario);
                        localStorage.setItem(`jwt_token_${rolDelUsuario}`, data.token);
                        // Guardar también como 'admin' para compatibilidad con config.js
                        if (rolDelUsuario === 'administrador') {
                            localStorage.setItem('jwt_token_admin', data.token);
                        }
                    }

                    sessionStorage.setItem('usuario', data.usuario || usuario);
                    sessionStorage.setItem('rol', rolDelUsuario);
                    sessionStorage.setItem('nombre_completo', data.nombre_completo || '');

                    // Guardar credenciales si el usuario lo solicitó
                    if (rememberMe && rememberMe.checked) {
                        localStorage.setItem('savedUser', usuario);
                    } else {
                        localStorage.removeItem('savedUser');
                    }

                    clearError();

                    // Redirigir al panel correspondiente
                    // Tanto 'admin' como 'administrador' → /administrador
                    const rutaDestino = (rolUserNorm === 'admin') ? 'administrador' : rolSolicitado;
                    console.log(`[Login] ✅ Redirigiendo a /${rutaDestino}`);
                    const rutaFinal = `/${rutaDestino}`;
                    // Verificar que el token quedó guardado antes de redirigir
                    const tokenGuardado = sessionStorage.getItem('jwt_token');
                    if (tokenGuardado) {
                        window.location.href = rutaFinal;
                    } else {
                        // Segundo intento con pequeño delay
                        setTimeout(() => {
                            window.location.href = rutaFinal;
                        }, 200);
                    }
                } else {
                    showError(data.message || 'Credenciales incorrectas');
                    this.disabled = false;
                    this.textContent = textoBtnOriginal;
                }

            } catch (error) {
                console.error('[Login] Error de conexión:', error);
                showError('Error de conexión: ' + error.message);
                this.disabled = false;
                this.textContent = textoBtnOriginal;
            }
        });
    });

    // Limpiar error al enfocar inputs
    if (usuarioInput)  usuarioInput.addEventListener('focus', clearError);
    if (passwordInput) passwordInput.addEventListener('focus', clearError);
});

// ==================== MOSTRAR / LIMPIAR ERROR ====================

function showError(mensaje) {
    const errorDiv = document.getElementById('loginError');
    if (!errorDiv) {
        console.error('[Login] No existe elemento con id "loginError"');
        return;
    }

    // Cancelar timeout anterior si existe
    if (errorDiv.dataset.timeoutId) {
        clearTimeout(parseInt(errorDiv.dataset.timeoutId));
    }

    errorDiv.textContent         = mensaje;
    errorDiv.style.display       = 'block';
    errorDiv.style.color         = '#721c24';
    errorDiv.style.marginTop     = '15px';
    errorDiv.style.padding       = '12px';
    errorDiv.style.borderRadius  = '4px';
    errorDiv.style.backgroundColor = '#f8d7da';
    errorDiv.style.border        = '1px solid #f5c6cb';
    errorDiv.style.fontSize      = '14px';
    errorDiv.style.fontWeight    = '500';

    // Ocultar automáticamente después de 10 segundos
    const timeoutId = setTimeout(() => {
        clearError();
    }, 10000);
    errorDiv.dataset.timeoutId = timeoutId;
}

function clearError() {
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
        if (errorDiv.dataset.timeoutId) {
            clearTimeout(parseInt(errorDiv.dataset.timeoutId));
        }
        errorDiv.textContent   = '';
        errorDiv.style.display = 'none';
    }
}

console.log('%c🔐 Login System Loaded', 'color: #667eea; font-size: 14px; font-weight: bold;');