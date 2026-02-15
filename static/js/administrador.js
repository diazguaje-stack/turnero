// ==================================================
// CÓDIGO PARA AGREGAR AL INICIO DE TU administrador.js
// (Reemplaza la función de navegación existente)
// ==================================================

// Función de navegación entre secciones
document.addEventListener('DOMContentLoaded', function() {
    console.log('Panel de administrador cargado');
    
    // Obtener todos los botones de navegación
    const navButtons = document.querySelectorAll('.nav-item');
    
    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            const sectionName = this.getAttribute('data-section');
            console.log('Navegando a sección:', sectionName);
            
            // Remover clase active de todos los botones
            navButtons.forEach(btn => btn.classList.remove('active'));
            
            // Agregar clase active al botón clickeado
            this.classList.add('active');
            
            // Ocultar todas las secciones
            const sections = document.querySelectorAll('.section');
            sections.forEach(section => {
                section.classList.remove('active');
                section.style.display = 'none';
            });
            
            // Mostrar la sección seleccionada
            const targetSection = document.getElementById(`section-${sectionName}`);
            if (targetSection) {
                targetSection.classList.add('active');
                targetSection.style.display = 'block';
                
                // Si es la sección de pantallas, inicializarla
                if (sectionName === 'pantallas') {
                    console.log('Inicializando pantallas...');
                    if (typeof inicializarPantallas === 'function') {
                        inicializarPantallas();
                    } else {
                        console.error('Función inicializarPantallas no encontrada');
                    }
                } else {
                    // Limpiar intervalo de pantallas si se sale de esa sección
                    if (typeof limpiarIntervaloPantallas === 'function') {
                        limpiarIntervaloPantallas();
                    }
                }
                
                // Si es la sección de usuarios, cargar usuarios
                if (sectionName === 'usuarios') {
                    if (typeof loadUsers === 'function') {
                        loadUsers();
                    }
                }
            } else {
                console.error('Sección no encontrada:', `section-${sectionName}`);
            }
        });
    });
    
    // Inicializar la primera sección (usuarios)
    const firstSection = document.getElementById('section-usuarios');
    if (firstSection) {
        firstSection.classList.add('active');
        firstSection.style.display = 'block';
    }
    
    // Cargar usuarios al inicio
    if (typeof loadUsers === 'function') {
        loadUsers();
    }
});

// ==================================================
// FIN DEL CÓDIGO DE NAVEGACIÓN
// ==================================================
// administrador.js - Sistema completo de gestión de usuarios con sincronización

// API Configuration
const API_URL = window.location.origin;
const API_BASE_URL = `${API_URL}/api`;
// Base de datos local de usuarios (sincronizada con backend)
let users = [];
let currentUser = null;
let selectedUserId = null;

// =========================
// INICIALIZACIÓN
// =========================

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadUsersFromBackend();
    setupEventListeners();
    updateStats();
});

// =========================
// AUTENTICACIÓN
// =========================

async function checkAuth() {
    // ⚠️ MODO DESARROLLO: Validación deshabilitada
    // Descomentar en producción
    
    const usernameElement = document.getElementById('username');
    if (usernameElement) {
        usernameElement.textContent = 'admin (modo desarrollo)';
    }
    
    currentUser = {
        usuario: 'admin',
        role: 'administrador'
    };
    
    console.log('⚠️ MODO DESARROLLO: Autenticación deshabilitada');
}

function logout() {
    sessionStorage.removeItem('userSession');
    localStorage.removeItem('rememberedCredentials');
    
    fetch(`${API_BASE_URL}/logout`, {
        method: 'POST',
        credentials: 'include'
    })
    .then(() => {
        console.log('Sesión cerrada');
        window.location.href = '/';
    })
    .catch(error => {
        console.error('Error al cerrar sesión:', error);
        window.location.href = '/';
    });
}

// =========================
// NAVEGACIÓN
// =========================

function setupEventListeners() {
    // Navegación entre secciones
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            const section = this.dataset.section;
            switchSection(section);
        });
    });

    // Formulario de crear usuario
    const createUserForm = document.getElementById('createUserForm');
    if (createUserForm) {
        createUserForm.addEventListener('submit', handleCreateUser);
    }

    // Cerrar modales al hacer clic fuera
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeAllModals();
            }
        });
    });
}

function switchSection(sectionName) {
    // Actualizar navegación activa
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

    // Mostrar sección correspondiente
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`section-${sectionName}`).classList.add('active');
}

// =========================
// GESTIÓN DE USUARIOS
// =========================

async function loadUsersFromBackend() {
    try {
        const response = await fetch(`${API_BASE_URL}/users`, {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            users = data.users;
            console.log(`✅ ${users.length} usuarios cargados desde el backend`);
        } else {
            console.warn('No se pudieron cargar usuarios del backend, usando localStorage');
            loadUsersFromLocalStorage();
        }
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        loadUsersFromLocalStorage();
    }

    loadUsers();
}

function loadUsersFromLocalStorage() {
    const localUsers = JSON.parse(localStorage.getItem('systemUsers')) || [];
    users = localUsers;
}

function loadUsers() {
    const usersGrid = document.getElementById('usersGrid');
    const emptyState = document.getElementById('emptyState');

    if (users.length === 0) {
        usersGrid.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    usersGrid.style.display = 'grid';
    emptyState.style.display = 'none';
    usersGrid.innerHTML = '';

    users.forEach(user => {
        const userCard = createUserCard(user);
        usersGrid.appendChild(userCard);
    });
}

function createUserCard(user) {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.onclick = () => showUserDetails(user.id);

    const initial = user.usuario.charAt(0).toUpperCase();
    const roleClass = `role-${user.rol.toLowerCase()}`;
    const roleLabel = {
        'administrador': 'Administrador',
        'recepcion': 'Recepción',
        'medico': 'Médico',
        'enfermero': 'Enfermero'
    }[user.rol.toLowerCase()] || user.rol;

    card.innerHTML = `
        <div class="user-card-header">
            <div class="user-avatar">${initial}</div>
            <span class="user-id">#${user.id}</span>
        </div>
        <div class="user-info">
            <h3>${user.usuario}</h3>
            <span class="user-role ${roleClass}">${roleLabel}</span>
        </div>
    `;

    return card;
}

function generateUserId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 6; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    const exists = users.some(u => u.id === id);
    if (exists) {
        return generateUserId();
    }
    
    return id;
}

async function handleCreateUser(e) {
    e.preventDefault();

    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;

    if (!username || !password || !role) {
        showToast('Por favor completa todos los campos', 'error');
        return;
    }

    const exists = users.some(u => u.usuario.toLowerCase() === username.toLowerCase());
    if (exists) {
        showToast('El usuario ya existe', 'error');
        return;
    }

    const userId = generateUserId();

    const newUser = {
        id: userId,
        usuario: username,
        password: password,
        rol: role,
        created_at: new Date().toISOString(),
        created_by: currentUser ? currentUser.usuario : 'admin'
    };

    try {
        const response = await fetch(`${API_BASE_URL}/users/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(newUser)
        });

        const data = await response.json();

        if (response.ok) {
            users.push(newUser);
            localStorage.setItem('systemUsers', JSON.stringify(users));
            
            loadUsers();
            updateStats();
            closeCreateUserModal();
            showToast(`Usuario ${username} creado exitosamente`, 'success');
            document.getElementById('createUserForm').reset();

            console.log('✅ Usuario creado y sincronizado con el backend');
        } else {
            showToast(data.message || 'Error al crear usuario', 'error');
        }
    } catch (error) {
        console.error('Error al crear usuario:', error);
        
        users.push(newUser);
        localStorage.setItem('systemUsers', JSON.stringify(users));
        
        loadUsers();
        updateStats();
        closeCreateUserModal();
        showToast(`Usuario ${username} creado localmente`, 'success');
        
        document.getElementById('createUserForm').reset();
    }
}

// =========================
// MODALES
// =========================

function openCreateUserModal() {
    const modal = document.getElementById('createUserModal');
    modal.classList.add('active');
}

function closeCreateUserModal() {
    const modal = document.getElementById('createUserModal');
    modal.classList.remove('active');
    document.getElementById('createUserForm').reset();
}

function showUserDetails(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    selectedUserId = userId;

    document.getElementById('detailId').textContent = user.id;
    document.getElementById('detailUsername').textContent = user.usuario;
    document.getElementById('detailPassword').textContent = '••••••••';
    document.getElementById('detailPassword').dataset.password = user.password;
    
    const roleLabel = {
        'administrador': 'Administrador',
        'recepcion': 'Recepción',
        'medico': 'Médico',
        'enfermero': 'Enfermero'
    }[user.rol.toLowerCase()] || user.rol;
    
    const roleClass = `role-${user.rol.toLowerCase()}`;
    const roleElement = document.getElementById('detailRole');
    roleElement.textContent = roleLabel;
    roleElement.className = `detail-value detail-role ${roleClass}`;

    const date = new Date(user.created_at);
    document.getElementById('detailCreated').textContent = date.toLocaleString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const modal = document.getElementById('userDetailsModal');
    modal.classList.add('active');
}

function closeUserDetailsModal() {
    const modal = document.getElementById('userDetailsModal');
    modal.classList.remove('active');
    selectedUserId = null;
    
    const passwordEl = document.getElementById('detailPassword');
    passwordEl.textContent = '••••••••';
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

function toggleDetailPassword() {
    const passwordEl = document.getElementById('detailPassword');
    const actualPassword = passwordEl.dataset.password;
    
    if (passwordEl.textContent === '••••••••') {
        passwordEl.textContent = actualPassword;
    } else {
        passwordEl.textContent = '••••••••';
    }
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
}

async function deleteUser() {
    if (!selectedUserId) return;

    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;

    const confirmed = confirm(`¿Estás seguro de eliminar al usuario "${user.usuario}"?\n\nEsta acción no se puede deshacer.`);
    
    if (confirmed) {
        try {
            const response = await fetch(`${API_BASE_URL}/users/${selectedUserId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            const data = await response.json();

            if (response.ok) {
                users = users.filter(u => u.id !== selectedUserId);
                localStorage.setItem('systemUsers', JSON.stringify(users));
                
                loadUsers();
                updateStats();
                closeUserDetailsModal();
                showToast(`Usuario ${user.usuario} eliminado`, 'success');
                
                console.log('✅ Usuario eliminado del backend');
            } else {
                showToast(data.message || 'Error al eliminar usuario', 'error');
            }
        } catch (error) {
            console.error('Error al eliminar usuario:', error);
            
            users = users.filter(u => u.id !== selectedUserId);
            localStorage.setItem('systemUsers', JSON.stringify(users));
            
            loadUsers();
            updateStats();
            closeUserDetailsModal();
            showToast(`Usuario ${user.usuario} eliminado localmente`, 'success');
        }
    }
}

// =========================
// ESTADÍSTICAS
// =========================

function updateStats() {
    const totalUsersElement = document.getElementById('totalUsers');
    if (totalUsersElement) {
        totalUsersElement.textContent = users.length;
    }
}

// =========================
// NOTIFICACIONES
// =========================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

console.log('✅ Administrador.js cargado correctamente');
// ===================================
// CODIGO PARA AGREGAR A administrador.js
// ===================================

// API Endpoints para pantallas
const PANTALLAS_API = {
    getPantallas: `${API_URL}/api/pantallas`,
    vincular: (id) => `${API_URL}/api/pantallas/${id}/vincular`,
    desvincular: (id) => `${API_URL}/api/pantallas/${id}/desvincular`
};

let pantallasList = [];
let pantallasInterval = null;

/**
 * Inicializar seccion de pantallas
 */
function inicializarPantallas() {
    cargarPantallas();
    
    // Actualizar cada 5 segundos cuando la seccion este visible
    pantallasInterval = setInterval(() => {
        const section = document.getElementById('pantallasSection');
        if (section && section.style.display !== 'none') {
            cargarPantallas();
        }
    }, 5000);
}

/**
 * Cargar todas las pantallas
 */
async function cargarPantallas() {
    try {
        const response = await fetch(PANTALLAS_API.getPantallas, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Error al cargar pantallas');
        }

        const data = await response.json();
        pantallasList = data.pantallas || [];
        renderizarPantallas();

    } catch (error) {
        console.error('Error al cargar pantallas:', error);
        mostrarMensajePantallas('Error al cargar las pantallas', 'error');
    }
}

/**
 * Renderizar pantallas en el grid
 */
function renderizarPantallas() {
    const grid = document.getElementById('pantallasGrid');
    
    if (!grid) return;

    if (!pantallasList || pantallasList.length === 0) {
        grid.innerHTML = '<div class="loading-pantallas">No hay pantallas configuradas</div>';
        return;
    }

    grid.innerHTML = pantallasList.map(pantalla => `
        <div class="pantalla-card ${pantalla.estado}">
            <div class="pantalla-numero">${pantalla.numero}</div>
            
            <div class="pantalla-estado">
                <div class="estado-badge ${pantalla.estado}">
                    ${getEstadoTexto(pantalla.estado)}
                </div>
                <div class="pantalla-nombre">
                    ${pantalla.nombre || `Pantalla ${pantalla.numero}`}
                </div>
            </div>

            <div class="pantalla-info">
                ${renderInfoPantalla(pantalla)}
            </div>

            ${renderAccionesPantalla(pantalla)}
        </div>
    `).join('');

    // Agregar event listeners
    agregarEventListenersPantallas();
}

/**
 * Renderizar informacion segun estado
 */
function renderInfoPantalla(pantalla) {
    if (pantalla.estado === 'disponible') {
        return `
            <div style="text-align: center; color: #6b7280; padding: 20px 0;">
                <p>⚪ Esperando dispositivo...</p>
                <p style="font-size: 12px; margin-top: 8px;">
                    Abre <strong>/screen</strong> en un dispositivo
                </p>
            </div>
        `;
    }

    if (pantalla.estado === 'pendiente') {
        return `
            <div class="instrucciones-vinculacion">
                📱 Dispositivo conectado - Ingresa el código
            </div>
            <div class="codigo-grande">${pantalla.codigo_vinculacion || '------'}</div>
            <div class="codigo-input-group">
                <input 
                    type="text" 
                    class="codigo-input" 
                    id="codigo-${pantalla.id}"
                    placeholder="Ingresa código"
                    maxlength="6"
                    pattern="[0-9]*"
                >
            </div>
            ${pantalla.device_id ? `
                <div class="device-id-small">
                    Device: ${pantalla.device_id.substring(0, 30)}...
                </div>
            ` : ''}
        `;
    }

    if (pantalla.estado === 'vinculada') {
        return `
            <div class="info-item">
                <span class="info-label">Vinculada:</span>
                <span class="info-value">${formatFecha(pantalla.vinculada_at)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Última conexión:</span>
                <span class="info-value">${formatFecha(pantalla.ultima_conexion)}</span>
            </div>
            ${pantalla.device_id ? `
                <div class="device-id-small" style="margin-top: 12px;">
                    Device ID: ${pantalla.device_id.substring(0, 40)}...
                </div>
            ` : ''}
            <a href="/screen" target="_blank" class="link-pantalla">
                🔗 Abrir pantalla completa
            </a>
        `;
    }

    return '';
}

/**
 * Renderizar acciones segun estado
 */
function renderAccionesPantalla(pantalla) {
    if (pantalla.estado === 'pendiente') {
        return `
            <div class="pantalla-actions">
                <button 
                    class="btn btn-primary btn-vincular" 
                    data-id="${pantalla.id}"
                >
                    ✓ Vincular
                </button>
                <button 
                    class="btn btn-secondary btn-cancelar" 
                    data-id="${pantalla.id}"
                >
                    ✗ Cancelar
                </button>
            </div>
        `;
    }

    if (pantalla.estado === 'vinculada') {
        return `
            <div class="pantalla-actions">
                <button 
                    class="btn btn-danger btn-desvincular" 
                    data-id="${pantalla.id}"
                    data-numero="${pantalla.numero}"
                >
                    🔓 Desvincular
                </button>
            </div>
        `;
    }

    return '';
}

/**
 * Agregar event listeners a los botones
 */
function agregarEventListenersPantallas() {
    // Botones de vincular
    document.querySelectorAll('.btn-vincular').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pantallaId = e.target.dataset.id;
            vincularPantallaAdmin(pantallaId);
        });
    });

    // Botones de cancelar
    document.querySelectorAll('.btn-cancelar').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pantallaId = e.target.dataset.id;
            desvincularPantallaAdmin(pantallaId);
        });
    });

    // Botones de desvincular
    document.querySelectorAll('.btn-desvincular').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pantallaId = e.target.dataset.id;
            const numero = e.target.dataset.numero;
            confirmarDesvincularPantalla(pantallaId, numero);
        });
    });

    // Inputs de código - validación y enter
    document.querySelectorAll('.codigo-input').forEach(input => {
        // Solo números
        input.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '').substring(0, 6);
        });

        // Enter para vincular
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const pantallaId = input.id.replace('codigo-', '');
                vincularPantallaAdmin(pantallaId);
            }
        });
    });
}

/**
 * Vincular pantalla desde admin
 */
async function vincularPantallaAdmin(pantallaId) {
    const input = document.getElementById(`codigo-${pantallaId}`);
    const codigo = input ? input.value.trim() : '';

    if (!codigo || codigo.length !== 6) {
        mostrarMensajePantallas('Por favor ingresa el código de 6 dígitos', 'error');
        if (input) input.focus();
        return;
    }

    try {
        const response = await fetch(PANTALLAS_API.vincular(pantallaId), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ codigo })
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensajePantallas('✅ Pantalla vinculada exitosamente', 'success');
            cargarPantallas();
        } else {
            mostrarMensajePantallas(data.message || 'Código incorrecto', 'error');
        }

    } catch (error) {
        console.error('Error al vincular:', error);
        mostrarMensajePantallas('Error al vincular la pantalla', 'error');
    }
}

/**
 * Confirmar desvinculación
 */
function confirmarDesvincularPantalla(pantallaId, numero) {
    if (confirm(`¿Estás seguro de desvincular la Pantalla ${numero}?\n\nEl dispositivo perderá acceso.`)) {
        desvincularPantallaAdmin(pantallaId);
    }
}

/**
 * Desvincular pantalla
 */
async function desvincularPantallaAdmin(pantallaId) {
    try {
        const response = await fetch(PANTALLAS_API.desvincular(pantallaId), {
            method: 'POST',
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensajePantallas('✅ Pantalla desvinculada exitosamente', 'success');
            cargarPantallas();
        } else {
            mostrarMensajePantallas(data.message || 'Error al desvincular', 'error');
        }

    } catch (error) {
        console.error('Error al desvincular:', error);
        mostrarMensajePantallas('Error al desvincular la pantalla', 'error');
    }
}

/**
 * Obtener texto del estado
 */
function getEstadoTexto(estado) {
    const estados = {
        'disponible': '⚪ Disponible',
        'pendiente': '🟡 Pendiente',
        'vinculada': '🟢 Vinculada'
    };
    return estados[estado] || estado;
}

/**
 * Formatear fecha
 */
function formatFecha(fechaISO) {
    if (!fechaISO) return 'N/A';
    try {
        const fecha = new Date(fechaISO);
        const ahora = new Date();
        const diff = Math.floor((ahora - fecha) / 1000); // segundos

        if (diff < 60) return 'Hace un momento';
        if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
        if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} hrs`;
        
        return fecha.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return 'N/A';
    }
}

/**
 * Mostrar mensaje en la sección de pantallas
 */
function mostrarMensajePantallas(mensaje, tipo) {
    const container = document.getElementById('pantallasMessageContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="pantallas-message ${tipo}">
            ${mensaje}
        </div>
    `;

    setTimeout(() => {
        container.innerHTML = '';
    }, tipo === 'error' ? 5000 : 3000);
}

/**
 * Limpiar intervalo al salir de la sección
 */
function limpiarIntervaloPantallas() {
    if (pantallasInterval) {
        clearInterval(pantallasInterval);
        pantallasInterval = null;
    }
}

// Exportar funciones globales
window.inicializarPantallas = inicializarPantallas;
window.vincularPantallaAdmin = vincularPantallaAdmin;
window.desvincularPantallaAdmin = desvincularPantallaAdmin;
window.limpiarIntervaloPantallas = limpiarIntervaloPantallas;
