// administrador.js - Sistema completo de gestión de usuarios con sincronización

// API Configuration
const API_BASE_URL = 'http://localhost:5000/api';

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