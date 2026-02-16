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
    
    // Agregar evento de clic derecho para mostrar menú de contexto
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, user.id);
    });

    const nombreCompleto = user.nombre_completo || user.usuario;
    const initial = nombreCompleto.charAt(0).toUpperCase();
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
            <h3>${nombreCompleto}</h3>
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
    const name = document.getElementById('newName').value.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;

    if (!username || !name || !password || !role) {
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
        nombre_completo: name,
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
            loadUsersFromBackend();
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
    isEditMode = false;

    document.getElementById('detailId').textContent = user.id;
    document.getElementById('detailUsername').textContent = user.usuario;
    document.getElementById('detailName').textContent = user.nombre_completo || 'Sin especificar';
    document.getElementById('detailPassword').textContent = '••••••••';
    document.getElementById('detailPassword').dataset.password = user.password || '';
    
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

    // Asegurar que los inputs están ocultos
    document.getElementById('editUsername').style.display = 'none';
    document.getElementById('editName').style.display = 'none';
    document.getElementById('editPasswordContainer').style.display = 'none';
    document.getElementById('editRole').style.display = 'none';

    // Mostrar vista de contraseña (no editable)
    document.getElementById('detailPasswordView').style.display = 'flex';

    // Mostrar botones correctos
    document.getElementById('deleteBtn').style.display = 'block';
    document.getElementById('saveBtn').style.display = 'none';
    document.getElementById('cancelBtn').style.display = 'none';
    document.getElementById('closeBtn').style.display = 'block';

    const modal = document.getElementById('userDetailsModal');
    modal.classList.add('active');
}

function closeUserDetailsModal() {
    const modal = document.getElementById('userDetailsModal');
    modal.classList.remove('active');
    selectedUserId = null;
    isEditMode = false;
    
    const passwordEl = document.getElementById('detailPassword');
    passwordEl.textContent = '••••••••';
    
    // Cancelar edición si está en modo edición
    if (isEditMode) {
        cancelEditMode();
    }
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

function toggleEditPassword() {
    const input = document.getElementById('editPassword');
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
                loadUsersFromBackend();
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
    desvincular: (id) => `${API_URL}/api/pantallas/${id}/desvincular`,
    asignarRecepcionista: (id) => `${API_URL}/api/pantallas/${id}/asignar-recepcionista`
};

const RECEPCIONISTAS_API = {
    getAll: `${API_URL}/api/users/recepcionistas`
};

let pantallasList = [];
let pantallasInterval = null;
let recepcionistasDisponibles = [];

/**
 * Inicializar seccion de pantallas
 */
function inicializarPantallas() {
    cargarRecepcionistas(); // Cargar lista de recepcionistas
    cargarPantallas();
    
    // Actualizar cada 5 segundos cuando la seccion este visible
    pantallasInterval = setInterval(() => {
        const section = document.getElementById('pantallasSection');
        const isVisible = section && (
            section.classList.contains('active') ||
            window.getComputedStyle(section).display !== 'none' ||
            section.offsetParent !== null
        );

        if (isVisible) {
            cargarPantallas();
        }
    }, 3000); // polling cada 3s para detectar cambios rápidamente
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
 * Renderizar pantallas en el grid - NUEVA VERSIÓN SIMPLIFICADA
 */
function renderizarPantallas() {
    const grid = document.getElementById('pantallasGrid');
    
    if (!grid) return;

    if (!pantallasList || pantallasList.length === 0) {
        grid.innerHTML = '<div class="loading-pantallas">No hay pantallas configuradas</div>';
        return;
    }

    grid.innerHTML = '';
    
    pantallasList.forEach(pantalla => {
        const card = document.createElement('div');
        card.className = `tv-card ${pantalla.estado}`;
        
        // Agregar evento onclick directamente
        card.onclick = () => {
            abrirModalPantalla(
                pantalla.id, 
                pantalla.numero, 
                pantalla.estado, 
                pantalla.recepcionista_id || '', 
                pantalla.codigo_vinculacion || ''
            );
        };
        
        card.innerHTML = `
            <div class="tv-header">
                <div class="tv-icon">📺</div>
                <div class="tv-numero">TV ${pantalla.numero}</div>
            </div>
            <div class="tv-estado">
                <span class="estado-dot ${pantalla.estado}"></span>
                <span class="estado-texto">${pantalla.estado === 'vinculada' ? 'Ocupado' : 'Disponible'}</span>
            </div>
            ${pantalla.recepcionista_nombre ? `
                <div class="tv-recepcionista">
                    👤 ${pantalla.recepcionista_nombre}
                </div>
            ` : ''}
        `;
        
        grid.appendChild(card);
    });
}
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

/**
 * Cargar lista de recepcionistas disponibles
 */
async function cargarRecepcionistas() {
    try {
        const response = await fetch(RECEPCIONISTAS_API.getAll, {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            recepcionistasDisponibles = data.recepcionistas || [];
            console.log(`✅ ${recepcionistasDisponibles.length} recepcionistas cargados`);
        }
    } catch (error) {
        console.error('Error al cargar recepcionistas:', error);
    }
}

/**
 * Asignar recepcionista a una pantalla
 */
async function asignarRecepcionista(pantallaId, recepcionistaId) {
    try {
        const response = await fetch(PANTALLAS_API.asignarRecepcionista(pantallaId), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                recepcionista_id: recepcionistaId
            })
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensajePantallas(
                recepcionistaId ? '✅ Recepcionista asignado exitosamente' : '✅ Recepcionista desasignado',
                'success'
            );
            cargarPantallas();
        } else {
            mostrarMensajePantallas(data.message || 'Error al asignar recepcionista', 'error');
        }

    } catch (error) {
        console.error('Error al asignar recepcionista:', error);
        mostrarMensajePantallas('Error al asignar recepcionista', 'error');
    }
}

/**
 * Mostrar modal para asignar recepcionista
 */
function mostrarModalAsignarRecepcionista(pantallaId, pantallaNumero, recepcionistaActualId) {
    const opciones = recepcionistasDisponibles.map(r => 
        `<option value="${r.id}" ${r.id === recepcionistaActualId ? 'selected' : ''}>
            ${r.nombre_completo || r.usuario} (ID: ${r.id})
        </option>`
    ).join('');

    const html = `
        <div class="modal-asignar-recepcionista" id="modalAsignarRecepcionista">
            <div class="modal-content-small">
                <h3>Asignar Recepcionista</h3>
                <p>Pantalla ${pantallaNumero}</p>
                <select id="selectRecepcionista" class="form-select">
                    <option value="">Sin asignar</option>
                    ${opciones}
                </select>
                <div class="modal-buttons">
                    <button onclick="cerrarModalRecepcionista()" class="btn btn-secondary">Cancelar</button>
                    <button onclick="confirmarAsignacionRecepcionista('${pantallaId}')" class="btn btn-primary">Asignar</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
}

function cerrarModalRecepcionista() {
    const modal = document.getElementById('modalAsignarRecepcionista');
    if (modal) {
        modal.remove();
    }
}

function confirmarAsignacionRecepcionista(pantallaId) {
    const select = document.getElementById('selectRecepcionista');
    const recepcionistaId = select.value || null;
    
    asignarRecepcionista(pantallaId, recepcionistaId);
    cerrarModalRecepcionista();
}

// =========================
// MENÚ DE CONTEXTO Y EDICIÓN
// =========================

let isEditMode = false;

function showContextMenu(x, y, userId) {
    const menu = document.getElementById('contextMenu');
    menu.style.display = 'block';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    selectedUserId = userId;
    
    // Cerrar el menú cuando se hace clic en otro lugar
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu);
    }, 0);
}

function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    menu.style.display = 'none';
    document.removeEventListener('click', hideContextMenu);
}

function enterEditMode() {
    hideContextMenu();
    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;

    isEditMode = true;

    // Primero mostrar el modal
    document.getElementById('userDetailsModal').classList.add('active');
    
    // Cargar los datos en los campos de solo lectura
    document.getElementById('detailId').textContent = user.id;
    document.getElementById('detailUsername').textContent = user.usuario;
    document.getElementById('detailName').textContent = user.nombre_completo || 'Sin especificar';
    
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

    // Ocultar spans y mostrar inputs
    document.getElementById('detailUsername').style.display = 'none';
    document.getElementById('editUsername').style.display = 'block';
    document.getElementById('editUsername').value = user.usuario;

    document.getElementById('detailName').style.display = 'none';
    document.getElementById('editName').style.display = 'block';
    document.getElementById('editName').value = user.nombre_completo || '';

    // Mostrar campo de contraseña editable
    document.getElementById('detailPasswordView').style.display = 'none';
    document.getElementById('editPasswordContainer').style.display = 'flex';
    
    // Cargar contraseña actual
    const passwordValue = user.password || '';
    document.getElementById('editPassword').value = passwordValue;
    document.getElementById('editPassword').type = 'password';
    
    // Debug: log para verificar
    console.log('User:', user);
    console.log('Password:', passwordValue);

    document.getElementById('detailRole').style.display = 'none';
    document.getElementById('editRole').style.display = 'block';
    document.getElementById('editRole').value = user.rol;

    // Cambiar botones
    document.getElementById('deleteBtn').style.display = 'none';
    document.getElementById('saveBtn').style.display = 'block';
    document.getElementById('cancelBtn').style.display = 'block';
    document.getElementById('closeBtn').style.display = 'none';
}

function cancelEditMode() {
    isEditMode = false;
    
    // Mostrar spans y ocultar inputs
    document.getElementById('detailUsername').style.display = 'span';
    document.getElementById('editUsername').style.display = 'none';

    document.getElementById('detailName').style.display = 'span';
    document.getElementById('editName').style.display = 'none';

    document.getElementById('detailPasswordView').style.display = 'flex';
    document.getElementById('editPasswordContainer').style.display = 'none';

    document.getElementById('detailRole').style.display = 'span';
    document.getElementById('editRole').style.display = 'none';

    // Restaurar botones
    document.getElementById('deleteBtn').style.display = 'block';
    document.getElementById('saveBtn').style.display = 'none';
    document.getElementById('cancelBtn').style.display = 'none';
    document.getElementById('closeBtn').style.display = 'block';
}

async function saveUserChanges() {
    const newUsername = document.getElementById('editUsername').value.trim();
    const newName = document.getElementById('editName').value.trim();
    const newPassword = document.getElementById('editPassword').value;
    const newRole = document.getElementById('editRole').value;

    if (!newUsername || !newName) {
        showToast('Usuario y Nombre Completo son requeridos', 'error');
        return;
    }

    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;

    const updatedData = {
        usuario: newUsername,
        nombre_completo: newName,
        rol: newRole
    };

    // Solo incluir contraseña si ha sido modificada
    if (newPassword !== user.password) {
        updatedData.password = newPassword;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/users/${selectedUserId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(updatedData)
        });

        const data = await response.json();

        if (response.ok) {
            loadUsersFromBackend();
            cancelEditMode();
            closeUserDetailsModal();
            showToast('Usuario actualizado exitosamente', 'success');
        } else {
            showToast(data.message || 'Error al actualizar usuario', 'error');
        }
    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        showToast('Error al actualizar usuario', 'error');
    }
}

// =========================
// MODAL DE VINCULACIÓN DE PANTALLA
// =========================

let modalPantallaActual = null;

/**
 * Abrir modal de gestión de pantalla
 */
function abrirModalPantalla(id, numero, estado, recepcionistaId, codigoVinculacion) {
    modalPantallaActual = { id, numero, estado, recepcionistaId, codigoVinculacion };
    
    const pantalla = pantallasList.find(p => p.id === id);
    if (!pantalla) return;
    
    const modalHTML = `
        <div class="modal active" id="modalPantalla" onclick="cerrarModalSiFueraClick(event)">
            <div class="modal-pantalla-content">
                <div class="modal-pantalla-header">
                    <h3>📺 TV ${numero}</h3>
                    <button class="modal-close" onclick="cerrarModalPantalla()">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                
                <div class="modal-pantalla-body">
                    ${estado === 'disponible' ? `
                        <div class="estado-pantalla-info" style="background: #fef3c7; border-color: #f59e0b;">
                            <p style="color: #92400e;">⚠️ Pantalla disponible - Esperando dispositivo...</p>
                        </div>
                    ` : ''}
                    
                    ${estado === 'pendiente' || estado === 'vinculada' ? `
                        <div class="modal-section">
                            <div class="modal-section-title">Código de Vinculación</div>
                            ${estado === 'pendiente' ? `
                                <div class="codigo-display">
                                    <div class="codigo-numero">${codigoVinculacion || '------'}</div>
                                    <div class="codigo-instruccion">Ingresa este código en el dispositivo</div>
                                </div>
                                <div class="input-codigo-group">
                                    <input 
                                        type="text" 
                                        class="input-codigo" 
                                        id="inputCodigoModal"
                                        placeholder="CÓDIGO"
                                        maxlength="6"
                                    />
                                    <button class="btn-vincular" onclick="vincularDesdeModal()">
                                        ✓ Vincular
                                    </button>
                                </div>
                            ` : `
                                <div class="estado-pantalla-info">
                                    <p>✅ Pantalla vinculada correctamente</p>
                                </div>
                            `}
                        </div>
                    ` : ''}
                    
                    ${estado === 'vinculada' ? `
                        <div class="modal-section">
                            <div class="modal-section-title">Asignar Recepcionista</div>
                            <select class="select-recepcionista" id="selectRecepcionistaModal" onchange="asignarRecepcionistaDesdeModal()">
                                <option value="">Sin asignar</option>
                                ${recepcionistasDisponibles.map(r => `
                                    <option value="${r.id}" ${r.id === recepcionistaId ? 'selected' : ''}>
                                        ${r.nombre_completo || r.usuario}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    ` : ''}
                </div>
                
                <div class="modal-pantalla-footer">
                    ${estado === 'vinculada' ? `
                        <button class="btn-desvincular-modal" onclick="desvincularDesdeModal()">
                            🔓 Desvincular
                        </button>
                    ` : ''}
                    ${estado === 'pendiente' ? `
                        <button class="btn-desvincular-modal" onclick="desvincularDesdeModal()">
                            ✗ Cancelar
                        </button>
                    ` : ''}
                    <button class="btn-cerrar-modal" onclick="cerrarModalPantalla()">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Insertar modal
    const existingModal = document.getElementById('modalPantalla');
    if (existingModal) {
        existingModal.remove();
    }
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Focus en input si está en modo pendiente
    if (estado === 'pendiente') {
        setTimeout(() => {
            const input = document.getElementById('inputCodigoModal');
            if (input) {
                input.focus();
                // Solo números
                input.addEventListener('input', (e) => {
                    e.target.value = e.target.value.replace(/[^0-9]/g, '').substring(0, 6);
                });
                // Enter para vincular
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        vincularDesdeModal();
                    }
                });
            }
        }, 100);
    }
}

/**
 * Cerrar modal si se hace clic fuera
 */
function cerrarModalSiFueraClick(event) {
    if (event.target.id === 'modalPantalla') {
        cerrarModalPantalla();
    }
}

/**
 * Cerrar modal de pantalla
 */
function cerrarModalPantalla() {
    const modal = document.getElementById('modalPantalla');
    if (modal) {
        modal.remove();
    }
    modalPantallaActual = null;
}

/**
 * Vincular desde modal
 */
async function vincularDesdeModal() {
    if (!modalPantallaActual) return;
    
    const input = document.getElementById('inputCodigoModal');
    const codigo = input ? input.value.trim() : '';
    
    if (!codigo || codigo.length !== 6) {
        mostrarMensajePantallas('Por favor ingresa el código de 6 dígitos', 'error');
        if (input) input.focus();
        return;
    }
    
    try {
        const response = await fetch(PANTALLAS_API.vincular(modalPantallaActual.id), {
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
            cerrarModalPantalla();
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
 * Desvincular desde modal
 */
async function desvincularDesdeModal() {
    if (!modalPantallaActual) return;
    
    const confirmar = confirm(`¿Estás seguro de desvincular la TV ${modalPantallaActual.numero}?`);
    if (!confirmar) return;
    
    try {
        const response = await fetch(PANTALLAS_API.desvincular(modalPantallaActual.id), {
            method: 'POST',
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensajePantallas('✅ Pantalla desvinculada exitosamente', 'success');
            cerrarModalPantalla();
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
 * Asignar recepcionista desde modal
 */
async function asignarRecepcionistaDesdeModal() {
    if (!modalPantallaActual) return;
    
    const select = document.getElementById('selectRecepcionistaModal');
    const recepcionistaId = select ? select.value : null;
    
    try {
        const response = await fetch(PANTALLAS_API.asignarRecepcionista(modalPantallaActual.id), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                recepcionista_id: recepcionistaId || null
            })
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensajePantallas(
                recepcionistaId ? '✅ Recepcionista asignado' : '✅ Recepcionista removido',
                'success'
            );
            cargarPantallas();
        } else {
            mostrarMensajePantallas(data.message || 'Error al asignar recepcionista', 'error');
        }
    } catch (error) {
        console.error('Error al asignar recepcionista:', error);
        mostrarMensajePantallas('Error al asignar recepcionista', 'error');
    }
}
// Exportar funciones globales
// Exportar funciones globales
window.inicializarPantallas = inicializarPantallas;
window.limpiarIntervaloPantallas = limpiarIntervaloPantallas;
window.abrirModalPantalla = abrirModalPantalla;
window.cerrarModalPantalla = cerrarModalPantalla;
window.vincularDesdeModal = vincularDesdeModal;
window.desvincularDesdeModal = desvincularDesdeModal;
window.asignarRecepcionistaDesdeModal = asignarRecepcionistaDesdeModal;
window.cerrarModalSiFueraClick = cerrarModalSiFueraClick;
// Auto-inicializar pantallas si la sección ya está visible al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    const section = document.getElementById('section-pantallas') || document.getElementById('pantallasSection');
    if (section) {
        const isVisible = section.classList.contains('active') || window.getComputedStyle(section).display !== 'none' || section.offsetParent !== null;
        if (isVisible) {
            inicializarPantallas();
        }
    }
});