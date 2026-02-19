function getAuthHeaders() {
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "/";
        return {};
    }

    return {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
    };
}

// ==========================================
// usuarios.js — Gestión completa de usuarios
// (requiere config.js cargado antes)
// ==========================================

let isEditMode = false;

// ── Inicialización ────────────────────────────────────────────────────────────

function initUsuarios() {
    const form = document.getElementById('createUserForm');
    if (form) form.addEventListener('submit', handleCreateUser);

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function (e) {
            if (e.target === this) closeAllModals();
        });
    });
}

// ── Cargar desde backend ──────────────────────────────────────────────────────

async function loadUsersFromBackend() {
    try {
        const response = await fetch(USUARIOS_API.getAll, { headers: getAuthHeaders() });
        if (response.ok) {
            const data = await response.json();
            users = data.users;
            console.log(`✅ ${users.length} usuarios cargados`);
        } else {
            console.warn('Fallback a localStorage');
            users = JSON.parse(localStorage.getItem('systemUsers')) || [];
        }
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        users = JSON.parse(localStorage.getItem('systemUsers')) || [];
    }
    loadUsers();
    updateStats();
}

// ── Renderizado de la grilla ──────────────────────────────────────────────────

function loadUsers() {
    const grid       = document.getElementById('usersGrid');
    const emptyState = document.getElementById('emptyState');
    if (!grid) return;

    if (users.length === 0) {
        grid.style.display       = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    grid.style.display       = 'grid';
    emptyState.style.display = 'none';
    grid.innerHTML           = '';
    users.forEach(user => grid.appendChild(createUserCard(user)));
}

function createUserCard(user) {
    const card         = document.createElement('div');
    card.className     = 'user-card';
    const nombre       = user.nombre_completo || user.usuario;
    const initial      = nombre.charAt(0).toUpperCase();
    const roleClass    = `role-${(user.rol || '').toLowerCase()}`;
    const roleLabel    = getRoleLabel(user.rol);

    card.innerHTML = `
        <div class="user-card-header">
            <div class="user-avatar">${initial}</div>
            <span class="user-id">#${user.id}</span>
        </div>
        <div class="user-info">
            <h3>${nombre}</h3>
            <span class="user-role ${roleClass}">${roleLabel}</span>
        </div>
    `;

    // Clic normal → abrir detalles
    card.addEventListener('click', () => showUserDetails(user.id));

    // Clic derecho → menú de contexto
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, user.id);
    });

    return card;
}

// ── Crear usuario ─────────────────────────────────────────────────────────────

function generateUserId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return users.some(u => u.id === id) ? generateUserId() : id;
}

async function handleCreateUser(e) {
    e.preventDefault();

    const username = document.getElementById('newUsername').value.trim();
    const name     = document.getElementById('newName').value.trim();
    const password = document.getElementById('newPassword').value;
    const role     = document.getElementById('newRole').value;

    if (!username || !name || !password || !role) {
        showToast('Por favor completa todos los campos', 'error');
        return;
    }
    if (users.some(u => u.usuario.toLowerCase() === username.toLowerCase())) {
        showToast('El usuario ya existe', 'error');
        return;
    }

    const newUser = {
        id:              generateUserId(),
        usuario:         username,
        nombre_completo: name,
        password,
        rol:             role,
        created_at:      new Date().toISOString(),
        created_by:      currentUser ? currentUser.usuario : 'admin'
    };

    try {
        const response = await fetch(USUARIOS_API.create, {
            method:  'POST',
            headers: getAuthHeaders(),
            body:    JSON.stringify(newUser)
        });
        const data = await response.json();

        if (response.ok) {
            await loadUsersFromBackend();
            closeCreateUserModal();
            showToast(`Usuario ${username} creado exitosamente`, 'success');
            document.getElementById('createUserForm').reset();
        } else {
            showToast(data.message || 'Error al crear usuario', 'error');
        }
    } catch (error) {
        // Fallback local
        users.push(newUser);
        localStorage.setItem('systemUsers', JSON.stringify(users));
        loadUsers();
        updateStats();
        closeCreateUserModal();
        showToast(`Usuario ${username} creado localmente`, 'success');
        document.getElementById('createUserForm').reset();
    }
}

// ── Eliminar usuario ──────────────────────────────────────────────────────────

async function deleteUser() {
    if (!selectedUserId) return;
    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;

    if (!confirm(`¿Eliminar al usuario "${user.usuario}"?\n\nEsta acción no se puede deshacer.`)) return;

    try {
        const response = await fetch(USUARIOS_API.delete(selectedUserId), {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (response.ok) {
            await loadUsersFromBackend();
            closeUserDetailsModal();
            showToast(`Usuario ${user.usuario} eliminado`, 'success');
        } else {
            showToast(data.message || 'Error al eliminar usuario', 'error');
        }
    } catch (error) {
        users = users.filter(u => u.id !== selectedUserId);
        localStorage.setItem('systemUsers', JSON.stringify(users));
        loadUsers();
        updateStats();
        closeUserDetailsModal();
        showToast(`Usuario ${user.usuario} eliminado localmente`, 'success');
    }
}

// ── Guardar cambios ───────────────────────────────────────────────────────────

async function saveUserChanges() {
    const newUsername = document.getElementById('editUsername').value.trim();
    const newName     = document.getElementById('editName').value.trim();
    const newPassword = document.getElementById('editPassword').value;
    const newRole     = document.getElementById('editRole').value;

    if (!newUsername || !newName) {
        showToast('Usuario y Nombre Completo son requeridos', 'error');
        return;
    }

    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;

    const originalPassword = user.password || '';

    // 🔎 Detectar si hubo cambios reales
    const huboCambios =
        newUsername !== user.usuario ||
        newName !== (user.nombre_completo || '') ||
        newRole !== user.rol ||
        (newPassword && newPassword !== originalPassword);

    // 🟢 SI NO HUBO CAMBIOS → solo cerrar modal
    if (!huboCambios) {
        closeUserDetailsModal();
        return;
    }

    // 🟣 SI HUBO CAMBIOS → enviar al backend
    const updatedData = {
        usuario: newUsername,
        nombre_completo: newName,
        rol: newRole
    };

    if (newPassword && newPassword !== originalPassword) {
        updatedData.password = newPassword;
    }

    try {
        const response = await fetch(USUARIOS_API.update(selectedUserId), {
            method:  'PUT',
            headers: getAuthHeaders(),
            body:    JSON.stringify(updatedData)
        });

        const data = await response.json();

        if (response.ok) {
            await loadUsersFromBackend();
            closeUserDetailsModal();
            showToast('Cambios registrados correctamente', 'success');
        } else {
            showToast(data.message || 'Error al actualizar usuario', 'error');
        }
    } catch (error) {
        showToast('Error al actualizar usuario', 'error');
    }
}

// ── Modales ───────────────────────────────────────────────────────────────────

function openCreateUserModal() {
    document.getElementById('createUserModal').classList.add('active');
    const form = document.getElementById('createUserForm');
    form.reset();

    setTimeout(() => {
        document.getElementById('newUsername').value = '';
    }, 150);

    document.getElementById('createUserModal').classList.add('active');
}

function closeCreateUserModal() {
    document.getElementById('createUserModal').classList.remove('active');
    document.getElementById('createUserForm').reset();
}

function showUserDetails(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    selectedUserId = userId;
    isEditMode     = false;

    document.getElementById('detailId').textContent       = user.id;
    document.getElementById('detailUsername').textContent = user.usuario;
    document.getElementById('detailName').textContent     = user.nombre_completo || 'Sin especificar';

    const passwordEl = document.getElementById('detailPassword');
    const userPassword = user.password || '';
    
    // Mostrar indicador si la contraseña está vacía o disponible
    if (!userPassword) {
        passwordEl.textContent = '[No disponible]';
        passwordEl.dataset.password = '';
        passwordEl.style.color = '#9ca3af';
        passwordEl.style.fontStyle = 'italic';
    } else {
        passwordEl.textContent = '••••••••';
        passwordEl.dataset.password = userPassword;
        passwordEl.style.color = '';
        passwordEl.style.fontStyle = '';
    }

    const roleEl       = document.getElementById('detailRole');
    roleEl.textContent = getRoleLabel(user.rol);
    roleEl.className   = `detail-value detail-role role-${(user.rol || '').toLowerCase()}`;

    const date = new Date(user.created_at);
    document.getElementById('detailCreated').textContent = date.toLocaleString('es-ES', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    _setModoLectura();
    document.getElementById('userDetailsModal').classList.add('active');
}

function closeUserDetailsModal() {
    document.getElementById('userDetailsModal').classList.remove('active');
    const passwordEl = document.getElementById('detailPassword');
    passwordEl.textContent = '••••••••';
    passwordEl.style.color = '';
    passwordEl.style.fontStyle = '';
    selectedUserId = null;
    isEditMode     = false;
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

// ── Modo edición ──────────────────────────────────────────────────────────────

function enterEditMode() {
    hideContextMenu();
    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;

    isEditMode = true;

    document.getElementById('userDetailsModal').classList.add('active');
    document.getElementById('editUsername').value = user.usuario;
    document.getElementById('editName').value     = user.nombre_completo || '';
    
    // Manejar contraseña vacía en modo edición
    const userPassword = user.password || '';
    if (!userPassword) {
        document.getElementById('editPassword').value = '';
        document.getElementById('editPassword').placeholder = 'Establecer nueva contraseña';
    } else {
        document.getElementById('editPassword').value = userPassword;
        document.getElementById('editPassword').placeholder = 'Contraseña actual';
    }
    
    document.getElementById('editPassword').type  = 'password';
    document.getElementById('editRole').value     = user.rol;

    _setModoEdicion();
}

function cancelEditMode() {
    isEditMode = false;
    
    // Restaurar datos originales del usuario
    const user = users.find(u => u.id === selectedUserId);
    if (user) {
        // Restaurar valores de lectura
        document.getElementById('detailUsername').textContent = user.usuario;
        document.getElementById('detailName').textContent = user.nombre_completo || 'Sin especificar';
        
        const passwordEl = document.getElementById('detailPassword');
        const userPassword = user.password || '';
        
        if (!userPassword) {
            passwordEl.textContent = '[No disponible]';
            passwordEl.dataset.password = '';
            passwordEl.style.color = '#9ca3af';
            passwordEl.style.fontStyle = 'italic';
        } else {
            passwordEl.textContent = '••••••••';
            passwordEl.dataset.password = userPassword;
            passwordEl.style.color = '';
            passwordEl.style.fontStyle = '';
        }
        
        const roleEl = document.getElementById('detailRole');
        roleEl.textContent = getRoleLabel(user.rol);
        roleEl.className = `detail-value detail-role role-${(user.rol || '').toLowerCase()}`;
    }
    
    _setModoLectura();
}

// ── Contraseñas ───────────────────────────────────────────────────────────────

function toggleDetailPassword() {
    const el = document.getElementById('detailPassword');
    const storedPassword = el.dataset.password;
    
    // Si no hay contraseña almacenada, no hacer nada
    if (!storedPassword) {
        showToast('Esta contraseña no está disponible. Edita el usuario para establecer una nueva.', 'warning');
        return;
    }
    
    // Toggle entre oculta y visible
    if (el.textContent === '••••••••') {
        el.textContent = storedPassword;
        el.style.color = '#059669';
        el.style.fontWeight = '500';
    } else {
        el.textContent = '••••••••';
        el.style.color = '';
        el.style.fontWeight = '';
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

// ── Menú de contexto ──────────────────────────────────────────────────────────

function showContextMenu(x, y, userId) {
    const menu        = document.getElementById('contextMenu');
    menu.style.display = 'block';
    menu.style.left    = x + 'px';
    menu.style.top     = y + 'px';
    selectedUserId     = userId;
    setTimeout(() => document.addEventListener('click', hideContextMenu), 0);
}

function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) menu.style.display = 'none';
    document.removeEventListener('click', hideContextMenu);
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function _setModoLectura() {
    document.getElementById('detailUsername').style.display      = '';
    document.getElementById('editUsername').style.display        = 'none';
    document.getElementById('detailName').style.display          = '';
    document.getElementById('editName').style.display            = 'none';
    document.getElementById('detailPasswordView').style.display  = 'flex';
    document.getElementById('editPasswordContainer').style.display = 'none';
    document.getElementById('detailRole').style.display          = '';
    document.getElementById('editRole').style.display            = 'none';

    document.getElementById('deleteBtn').style.display = 'block';
    document.getElementById('saveBtn').style.display   = 'none';
    document.getElementById('cancelBtn').style.display = 'none';
    document.getElementById('closeBtn').style.display  = 'block';
}

function _setModoEdicion() {
    document.getElementById('detailUsername').style.display      = 'none';
    document.getElementById('editUsername').style.display        = 'block';
    document.getElementById('detailName').style.display          = 'none';
    document.getElementById('editName').style.display            = 'block';
    document.getElementById('detailPasswordView').style.display  = 'none';
    document.getElementById('editPasswordContainer').style.display = 'flex';
    document.getElementById('detailRole').style.display          = 'none';
    document.getElementById('editRole').style.display            = 'block';

    document.getElementById('deleteBtn').style.display = 'none';
    document.getElementById('saveBtn').style.display   = 'block';
    document.getElementById('cancelBtn').style.display = 'block';
    document.getElementById('closeBtn').style.display  = 'none';
}