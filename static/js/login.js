// login.js - Lógica de autenticación y manejo del formulario

// Configuración de la API
const API_BASE_URL = 'http://localhost:5000/api';

console.log('🔗 API URL:', API_BASE_URL);

// Credenciales por defecto (fallback)
const DEFAULT_ADMIN = {
    usuario: 'admin',
    password: 'admin123'
};

// Referencias al DOM
const loginForm = document.getElementById('loginForm');
const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');
const usuarioInput = document.getElementById('usuario');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const rememberMeCheckbox = document.getElementById('rememberMe');
const btnAdmin = document.getElementById('btnAdmin');

// =========================
// TOGGLE DE VISUALIZACIÓN DE CONTRASEÑA
// =========================

togglePassword.addEventListener('click', function() {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
    
    if (type === 'text') {
        this.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
        `;
    } else {
        this.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
        `;
    }
});

// =========================
// CARGAR CREDENCIALES GUARDADAS
// =========================

window.addEventListener('load', function() {
    const savedCredentials = localStorage.getItem('rememberedCredentials');
    if (savedCredentials) {
        try {
            const credentials = JSON.parse(savedCredentials);
            usuarioInput.value = credentials.usuario;
            passwordInput.value = credentials.password;
            rememberMeCheckbox.checked = true;
        } catch (e) {
            console.error('Error al cargar credenciales guardadas:', e);
        }
    }
});

// =========================
// FUNCIONES AUXILIARES
// =========================

function showMessage(message, isError = true) {
    if (isError) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        successMessage.style.display = 'none';
    } else {
        successMessage.textContent = message;
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
    }

    setTimeout(() => {
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';
    }, 5000);
}

function handleRememberMe(usuario, password) {
    if (rememberMeCheckbox.checked) {
        localStorage.setItem('rememberedCredentials', JSON.stringify({ usuario, password }));
    } else {
        localStorage.removeItem('rememberedCredentials');
    }
}

function setButtonLoading(button, loading) {
    if (loading) {
        button.disabled = true;
        const originalText = button.innerHTML;
        button.dataset.originalText = originalText;
        button.innerHTML = '<span class="loading"></span> Autenticando...';
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText || '👤 Administrador';
    }
}

// =========================
// AUTENTICACIÓN CON FLASK
// =========================

async function authenticateWithFlask(usuario, password, role) {
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ usuario, password, role })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Error de autenticación');
        }

        return data;
    } catch (error) {
        console.error('Error al conectar con Flask:', error);
        throw error;
    }
}

// =========================
// MANEJADOR DEL FORMULARIO DE LOGIN
// =========================

loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const usuario = usuarioInput.value.trim();
    const password = passwordInput.value;
    const role = 'administrador';

    if (!usuario || !password) {
        showMessage('Por favor, completa todos los campos');
        return;
    }

    setButtonLoading(btnAdmin, true);

    try {
        const result = await authenticateWithFlask(usuario, password, role);
        
        if (result.success) {
            handleRememberMe(usuario, password);
            
            // Guardar sesión en sessionStorage
            sessionStorage.setItem('userSession', JSON.stringify({
                usuario: result.usuario,
                role: result.role,
                nombre_completo: result.nombre_completo,
                timestamp: Date.now()
            }));

            showMessage(`¡Bienvenido ${result.usuario}! Redirigiendo...`, false);
            
            setTimeout(() => {
                window.location.href = '/administrador';
            }, 1500);
        } else {
            showMessage(result.message || 'Credenciales incorrectas');
            setButtonLoading(btnAdmin, false);
        }
    } catch (error) {
        showMessage('Error al intentar iniciar sesión. Verifica que el servidor esté corriendo.');
        setButtonLoading(btnAdmin, false);
    }
});

// =========================
// BOTONES DE REGISTRO Y RECEPCIÓN
// =========================

document.querySelectorAll('.btn-registro, .btn-recepcion').forEach(button => {
    button.addEventListener('click', function() {
        const role = this.dataset.role;
        
        // Guardar sesión básica
        sessionStorage.setItem('userSession', JSON.stringify({
            usuario: 'invitado',
            role: role,
            timestamp: Date.now()
        }));

        showMessage(`Accediendo a ${role}...`, false);
        
        setTimeout(() => {
            window.location.href = `/${role}`;
        }, 1000);
    });
});

// =========================
// VERIFICAR SESIÓN EXISTENTE
// =========================

async function checkExistingSession() {
    const currentSession = sessionStorage.getItem('userSession');
    if (!currentSession) return;

    try {
        const session = JSON.parse(currentSession);
        const sessionAge = Date.now() - session.timestamp;
        
        // Sesión válida por 8 horas
        if (sessionAge < 8 * 60 * 60 * 1000) {
            console.log('✅ Sesión activa detectada, verificando con servidor...');
            
            // Verificar con el servidor que la sesión sigue válida
            try {
                const response = await fetch(`${API_BASE_URL}/verify-session`, {
                    credentials: 'include'
                });
                
                if (response.ok) {
                    // Sesión válida, redirigir
                    if (session.role === 'administrador') {
                        window.location.href = '/administrador';
                    } else {
                        window.location.href = `/${session.role}`;
                    }
                } else {
                    // Sesión expirada en el servidor
                    console.log('⚠️ Sesión expirada en el servidor');
                    sessionStorage.removeItem('userSession');
                }
            } catch (error) {
                console.log('⚠️ No se pudo verificar sesión con el servidor');
                // Continuar sin verificar
            }
        } else {
            console.log('⚠️ Sesión expirada localmente');
            sessionStorage.removeItem('userSession');
        }
    } catch (e) {
        console.error('Error al verificar sesión:', e);
        sessionStorage.removeItem('userSession');
    }
}

// Verificar sesión al cargar
checkExistingSession();

console.log('✅ Login.js cargado correctamente');