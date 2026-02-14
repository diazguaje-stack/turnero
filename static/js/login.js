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
const errorMessage = document.getElementById('errorMessage');
const submitButton = document.querySelector('button[type="submit"]');

// Event listeners
if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
}

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
            credentials: 'include', // Importante para cookies de sesion
            body: JSON.stringify({
                usuario: usuario,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Login exitoso
            console.log('Login exitoso:', data);
            
            // Redirigir segun el rol
            redirectToPanel(data.role);
        } else {
            // Login fallido
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
        'medico': '/medico'
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

/**
 * Verificar si hay sesion activa al cargar la pagina
 */
async function checkExistingSession() {
    try {
        const response = await fetch(API_ENDPOINTS.verifySession, {
            method: 'GET',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok && data.authenticated) {
            // Ya hay sesion activa, redirigir
            console.log('Sesion activa detectada');
            redirectToPanel(data.role);
        }
    } catch (error) {
        // No hay sesion activa o error, continuar normal
        console.log('No hay sesion activa');
    }
}

// Verificar sesion al cargar la pagina
document.addEventListener('DOMContentLoaded', () => {
    checkExistingSession();
    
    // Focus en el campo de usuario
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