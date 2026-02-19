let selectedRole = 'administrador'; // Por defecto

// login.js - Sistema de autenticacion del frontend

// Configuracion de la API
const API_URL = window.location.origin; // Usa la misma URL del navegador
const API_ENDPOINTS = {
    login: `${API_URL}/api/login`,
    logout: `${API_URL}/api/logout`,
    verifySession: `${API_URL}/api/verify-session`
};

// Elementos del DOM
const loginForm = document.getElementById('loginForm');
const usuarioInput = document.getElementById('usuario');
const passwordInput = document.getElementById('password');
const togglePassword = document.getElementById('togglePassword');
const eyeIcon = document.getElementById('eyeIcon');
const errorMessage = document.getElementById('errorMessage');
const submitButton = document.querySelector('button[type="submit"]');

// Event listeners
if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
}
// Detectar botones por rol
document.querySelectorAll('[data-role]').forEach(button => {
    button.addEventListener('click', () => {
        selectedRole = button.getAttribute('data-role');

        // Si no es administrador, disparar login manualmente
        if (button.type === 'button') {
            loginForm.dispatchEvent(new Event('submit'));
        }
    });
});

/**
 * Manejar el envio del formulario de login
 */
async function handleLogin(event) {
    event.preventDefault();
    
    const usuario = usuarioInput.value.trim();
    const password = passwordInput.value;
    
    // Validaciones basicas
    if (!usuario || !password) {
        showError('Por favor completa todos los campos');
        return;
    }
    
    // Deshabilitar boton y mostrar loading
    submitButton.disabled = true;
    submitButton.textContent = 'Iniciando sesion...';
    hideError();
    
    try {
        // Realizar peticion de login
        const response = await fetch(API_ENDPOINTS.login, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                usuario: usuario,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {

            // 🔎 VALIDAR QUE EL ROL COINCIDA CON EL BOTÓN PRESIONADO
            if (data.role !== selectedRole) {
                showError('Credenciales incorrectas para este rol');
                submitButton.disabled = false;
                submitButton.textContent = 'INICIAR SESION';
                return;
            }

            // ✅ Rol correcto
            // Guardar JWT
            localStorage.setItem("token", data.token);
            localStorage.setItem("role", data.role);

            // Redirigir
            redirectToPanel(data.role);
        } else {
            showError(data.message || 'Credenciales incorrectas');
            submitButton.disabled = false;
            submitButton.textContent = 'INICIAR SESION';
        }

    } catch (error) {
        console.error('Error en login:', error);
        showError('Error de conexion. Por favor intenta nuevamente.');
        submitButton.disabled = false;
        submitButton.textContent = 'INICIAR SESION';
    }
}

/**
 * Redirigir al panel correspondiente segun el rol
 */
function redirectToPanel(role) {
    const panels = {
        'administrador': '/administrador',
        'recepcion': '/recepcion',
        'registro': '/registro'
    };
    
    const targetUrl = panels[role] || '/administrador';
    
    // Pequeño delay para mejor UX
    setTimeout(() => {
        window.location.href = targetUrl;
    }, 500);
}

/**
 * Mostrar mensaje de error
 */
function showError(message) {
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        
        // Agregar animacion
        errorMessage.classList.add('shake');
        setTimeout(() => {
            errorMessage.classList.remove('shake');
        }, 500);
    }
}

/**
 * Ocultar mensaje de error
 */
function hideError() {
    if (errorMessage) {
        errorMessage.style.display = 'none';
    }
}

// Focus en el campo de usuario al cargar
document.addEventListener('DOMContentLoaded', () => {
    if (usuarioInput) {
        usuarioInput.focus();
    }
});

// Limpiar errores cuando el usuario empieza a escribir
if (usuarioInput) {
    usuarioInput.addEventListener('input', hideError);
}

if (passwordInput) {
    passwordInput.addEventListener('input', hideError);
}
// Mostrar / Ocultar contraseña
if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {

        const isPassword = passwordInput.getAttribute('type') === 'password';

        // Cambiar tipo del input
        passwordInput.setAttribute(
            'type',
            isPassword ? 'text' : 'password'
        );

        // Cambiar icono SVG (opcional pero profesional)
        if (eyeIcon) {
            eyeIcon.innerHTML = isPassword
                ? `
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.956 9.956 0 012.293-3.95M6.228 6.228A9.956 9.956 0 0112 5c4.478 0 8.268 2.943 9.542 7a9.956 9.956 0 01-4.043 5.568M6.228 6.228L3 3m3.228 3.228l11.544 11.544" />
                `
                : `
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                `;
        }
    });
}
