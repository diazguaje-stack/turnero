// login.js - Manejo de login con múltiples roles

let selectedRole = null;  // Variable global para guardar el rol seleccionado

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    const usuarioInput = document.getElementById('usuario');
    const rememberMe = document.getElementById('rememberMe');
    
    // ==================== TOGGLE PASSWORD ====================
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', function(e) {
            e.preventDefault();
            
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // Cambiar ícono
            const eyeIcon = document.getElementById('eyeIcon');
            if (eyeIcon) {
                eyeIcon.style.opacity = type === 'text' ? '0.5' : '1';
            }
        });
    }
    
    // ==================== RECORDAR CREDENCIALES ====================
    if (rememberMe && usuarioInput && passwordInput) {
        // Cargar credenciales guardadas
        const savedUser = localStorage.getItem('savedUser');
        if (savedUser) {
            usuarioInput.value = savedUser;
            rememberMe.checked = true;
        }
    }
    
    // ==================== BOTONES DE ROL ====================
    // Todos los botones que tienen data-role
    const roleButtons = document.querySelectorAll('[data-role]');
    
    roleButtons.forEach(button => {
        button.addEventListener('click', async function(e) {
            e.preventDefault();
            
            const rol = this.getAttribute('data-role');
            console.log(`📍 Botón presionado: ${rol}`);
            
            // Guardar el rol seleccionado
            selectedRole = rol;
            
            // Desabilitar el botón
            this.disabled = true;
            const textoBtnOriginal = this.textContent;
            this.textContent = '⏳ Iniciando sesión...';
            
            // Obtener valores
            const usuario = usuarioInput.value.trim();
            const password = passwordInput.value;
            
            // Validar campos
            if (!usuario || !password) {
                showError('Usuario y contraseña son requeridos');
                this.disabled = false;
                this.textContent = textoBtnOriginal;
                return;
            }
            
            try {
                // Hacer petición POST
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',  // IMPORTANTE: incluir cookies
                    body: JSON.stringify({
                        usuario: usuario,
                        password: password
                    })
                });
                
                const data = await response.json();
                console.log('📊 Respuesta del servidor:', data);
                
                if (response.ok && data.success) {
                    // ✅ LOGIN EXITOSO
                    console.log('✅ Login exitoso');
                    
                    // VALIDAR QUE EL ROL COINCIDA
                    // Nota: El backend retorna 'rol', no 'role'
                    const rolDelUsuario = data.rol || data.role;
                    
                    console.log(`🔍 Rol solicitado: ${selectedRole}`);
                    console.log(`🔍 Rol del usuario: ${rolDelUsuario}`);
                    
                    if (rolDelUsuario !== selectedRole) {
                        console.error('❌ El rol no coincide');
                        showError(`Este usuario no tiene rol de ${selectedRole}`);
                        this.disabled = false;
                        this.textContent = textoBtnOriginal;
                        return;
                    }
                    
                    // ✅ TODO CORRECTO - Redirigir
                    console.log(`✅ Rol correcto, redirigiendo a /${selectedRole}`);
                    
                    // Guardar credenciales si lo solicita
                    if (rememberMe && rememberMe.checked) {
                        localStorage.setItem('savedUser', usuario);
                    } else {
                        localStorage.removeItem('savedUser');
                    }
                    
                    // Guardar en sessionStorage
                    sessionStorage.setItem('usuario', data.usuario);
                    sessionStorage.setItem('rol', rolDelUsuario);
                    sessionStorage.setItem('nombre_completo', data.nombre_completo);
                    
                    // Limpiar error
                    const errorDiv = document.getElementById('loginError');
                    if (errorDiv) {
                        errorDiv.textContent = '';
                        errorDiv.style.display = 'none';
                    }
                    
                    // Redirigir
                    setTimeout(() => {
                        window.location.href = `/${selectedRole}`;
                    }, 500);
                    
                } else {
                    // ❌ LOGIN FALLIDO
                    console.error('❌ Login fallido:', data.message);
                    showError(data.message || 'Credenciales incorrectas');
                    
                    this.disabled = false;
                    this.textContent = textoBtnOriginal;
                }
                
            } catch (error) {
                console.error('❌ Error en petición:', error);
                showError('Error de conexión: ' + error.message);
                
                this.disabled = false;
                this.textContent = textoBtnOriginal;
            }
        });
    });
    
    // ==================== FORM SUBMIT (si es necesario) ====================
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            // El submit se maneja con los botones individuales
        });
    }
});

// ==================== MOSTRAR ERROR ====================

function showError(mensaje) {
    const errorDiv = document.getElementById('loginError');
    
    if (!errorDiv) {
        console.error('⚠️ No existe elemento con id "loginError"');
        return;
    }
    
    errorDiv.textContent = mensaje;
    errorDiv.style.display = 'block';
    errorDiv.style.color = '#dc3545';
    errorDiv.style.marginTop = '15px';
    errorDiv.style.padding = '12px';
    errorDiv.style.borderRadius = '4px';
    errorDiv.style.backgroundColor = '#f8d7da';
    errorDiv.style.border = '1px solid #f5c6cb';
    errorDiv.style.fontSize = '14px';
    errorDiv.style.fontWeight = '500';
    
    // Scroll hasta el error
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Auto limpiar después de 10 segundos
    const timeoutId = setTimeout(() => {
        if (errorDiv.textContent === mensaje) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        }
    }, 10000);
    
    // Guardar el timeout ID para limpieza manual si es necesario
    errorDiv.dataset.timeoutId = timeoutId;
}

// Limpiar error cuando el usuario empieza a escribir
document.addEventListener('DOMContentLoaded', function() {
    const usuarioInput = document.getElementById('usuario');
    const passwordInput = document.getElementById('password');
    
    if (usuarioInput) {
        usuarioInput.addEventListener('focus', clearError);
    }
    
    if (passwordInput) {
        passwordInput.addEventListener('focus', clearError);
    }
});

function clearError() {
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
        // Cancelar el timeout si existe
        if (errorDiv.dataset.timeoutId) {
            clearTimeout(parseInt(errorDiv.dataset.timeoutId));
        }
        errorDiv.textContent = '';
        errorDiv.style.display = 'none';
    }
}

// ==================== LOGGER ====================

console.log('%c🔐 Login System Loaded', 'color: #667eea; font-size: 14px; font-weight: bold;');
console.log('%cClicking a role button will:', 'color: #667eea;');
console.log('%c1. Save the selected role', 'color: #667eea;');
console.log('%c2. Send POST /api/login with credentials', 'color: #667eea;');
console.log('%c3. Verify role matches', 'color: #667eea;');
console.log('%c4. Redirect to /{role} page', 'color: #667eea;');