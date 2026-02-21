/**
 * usuarios.js — Gestión completa de usuarios
 * Requiere: auth.js cargado antes en el HTML
 */

// ── getAuthHeaders: lee el token del lugar correcto ───────────────────────────

function getAuthHeaders() {
    // auth.js guarda el token en sessionStorage con clave 'jwt_token'
    // login.js también lo guarda ahí (y en localStorage como jwt_token_<rol>)
    const token = sessionStorage.getItem('jwt_token')
               || localStorage.getItem('jwt_token_admin')
               || localStorage.getItem('jwt_token_recepcion')
               || localStorage.getItem('jwt_token_registro');

    if (!token) {
        window.location.href = '/';
        return {};
    }

    return {
        'Authorization': 'Bearer ' + token,
        'Content-Type':  'application/json'
    };
}

// ==========================================
let isEditMode = false;
let usersTrash = [];
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
function openUsersTrash() {
    const modal = document.getElementById('usersTrashModal');
    const body  = document.getElementById('usersTrashBody');

    if (!modal || !body) return;

    body.innerHTML = '';

    if (!usersTrash.length) {
        body.innerHTML = '<p>No hay usuarios en papelera</p>';
    } else {
        usersTrash.forEach(user => {
            const div = document.createElement('div');
            div.className = 'trash-item';
            div.innerHTML = `
                <strong>${user.usuario}</strong> (${user.nombre_completo})
                <br>
                <button onclick="restoreUser('${user.id}')">Restaurar</button>
                <button onclick="deleteUserForever('${user.id}')">Eliminar definitivamente</button>
                <hr>
            `;
            body.appendChild(div);
        });
    }

    modal.classList.add('active');
}

function closeUsersTrash() {
    document.getElementById('usersTrashModal').classList.remove('active');
}

function restoreUser(userId) {
    const user = usersTrash.find(u => u.id === userId);
    if (!user) return;

    users.push(user);
    usersTrash = usersTrash.filter(u => u.id !== userId);

    loadUsers();
    updateStats();
    openUsersTrash();

    showToast(`Usuario ${user.usuario} restaurado`, 'success');
}

async function deleteUserForever(userId) {
    const user = usersTrash.find(u => u.id === userId);
    if (!user) return;

    if (!confirm(`Eliminar DEFINITIVAMENTE a ${user.usuario}?`)) return;

    try {
        const response = await fetch(USUARIOS_API.delete(userId), {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            usersTrash = usersTrash.filter(u => u.id !== userId);
            openUsersTrash();
            showToast('Usuario eliminado definitivamente', 'success');
        } else {
            showToast('Error al eliminar en BD', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Error de conexión', 'error');
    }
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
    const card      = document.createElement('div');
    card.className  = 'user-card';
    const nombre    = user.nombre_completo || user.usuario;
    const initial   = nombre.charAt(0).toUpperCase();
    const roleClass = `role-${(user.rol || '').toLowerCase()}`;
    const roleLabel = getRoleLabel(user.rol);

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

    card.addEventListener('click', () => showUserDetails(user.id));
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
        console.error('Error al crear usuario:', error);
        showToast('Error de conexión al crear usuario', 'error');
    }
}

// ── Eliminar usuario ──────────────────────────────────────────────────────────

function moveUserToTrash() {
    if (!selectedUserId) return;

    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;

    if (!confirm(`¿Enviar a la papelera al usuario "${user.usuario}"?`)) return;

    // Agregar a papelera
    usersTrash.push(user);

    // Quitar de la lista visible
    users = users.filter(u => u.id !== selectedUserId);

    loadUsers();
    updateStats();

    closeUserDetailsModal();
    showToast(`Usuario ${user.usuario} enviado a papelera`, 'warning');
}

function openCreateUserModal() {
    const modal = document.getElementById('createUserModal');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('createUserForm').reset();
    setTimeout(() => {
        const input = document.getElementById('newUsername');
        if (input) input.value = '';
    }, 150);
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

    const huboCambios =
        newUsername !== user.usuario ||
        newName !== (user.nombre_completo || '') ||
        newRole !== user.rol ||
        (newPassword && newPassword !== originalPassword);

    if (!huboCambios) {
        closeUserDetailsModal();
        return;
    }

    const updatedData = {
        usuario:         newUsername,
        nombre_completo: newName,
        rol:             newRole
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
        console.error('Error al actualizar usuario:', error);
        showToast('Error de conexión al actualizar usuario', 'error');
    }
}

// ── Modales ───────────────────────────────────────────────────────────────────


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

    const passwordEl   = document.getElementById('detailPassword');
    const userPassword = user.password || '';

    if (!userPassword) {
        passwordEl.textContent          = '[No disponible]';
        passwordEl.dataset.password     = '';
        passwordEl.style.color          = '#9ca3af';
        passwordEl.style.fontStyle      = 'italic';
    } else {
        passwordEl.textContent          = '••••••••';
        passwordEl.dataset.password     = userPassword;
        passwordEl.style.color          = '';
        passwordEl.style.fontStyle      = '';
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
    if (passwordEl) {
        passwordEl.textContent     = '••••••••';
        passwordEl.style.color     = '';
        passwordEl.style.fontStyle = '';
    }
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

    const userPassword = user.password || '';
    const passInput    = document.getElementById('editPassword');
    passInput.value       = userPassword;
    passInput.placeholder = userPassword ? 'Contraseña actual' : 'Establecer nueva contraseña';
    passInput.type        = 'password';

    document.getElementById('editRole').value = user.rol;

    _setModoEdicion();
}

function cancelEditMode() {
    isEditMode = false;

    const user = users.find(u => u.id === selectedUserId);
    if (user) {
        document.getElementById('detailUsername').textContent = user.usuario;
        document.getElementById('detailName').textContent     = user.nombre_completo || 'Sin especificar';

        const passwordEl   = document.getElementById('detailPassword');
        const userPassword = user.password || '';

        if (!userPassword) {
            passwordEl.textContent      = '[No disponible]';
            passwordEl.dataset.password = '';
            passwordEl.style.color      = '#9ca3af';
            passwordEl.style.fontStyle  = 'italic';
        } else {
            passwordEl.textContent      = '••••••••';
            passwordEl.dataset.password = userPassword;
            passwordEl.style.color      = '';
            passwordEl.style.fontStyle  = '';
        }

        const roleEl       = document.getElementById('detailRole');
        roleEl.textContent = getRoleLabel(user.rol);
        roleEl.className   = `detail-value detail-role role-${(user.rol || '').toLowerCase()}`;
    }

    _setModoLectura();
}

// ── Contraseñas ───────────────────────────────────────────────────────────────

function toggleDetailPassword() {
    const el             = document.getElementById('detailPassword');
    const storedPassword = el.dataset.password;

    if (!storedPassword) {
        showToast('Contraseña no disponible. Edita el usuario para establecer una nueva.', 'warning');
        return;
    }

    if (el.textContent === '••••••••') {
        el.textContent      = storedPassword;
        el.style.color      = '#059669';
        el.style.fontWeight = '500';
    } else {
        el.textContent      = '••••••••';
        el.style.color      = '';
        el.style.fontWeight = '';
    }
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
}

function toggleEditPassword() {
    const input = document.getElementById('editPassword');
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
}

// ── Menú de contexto ──────────────────────────────────────────────────────────

function showContextMenu(x, y, userId) {
    const menu         = document.getElementById('contextMenu');
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
    document.getElementById('detailUsername').style.display        = '';
    document.getElementById('editUsername').style.display          = 'none';
    document.getElementById('detailName').style.display            = '';
    document.getElementById('editName').style.display              = 'none';
    document.getElementById('detailPasswordView').style.display    = 'flex';
    document.getElementById('editPasswordContainer').style.display = 'none';
    document.getElementById('detailRole').style.display            = '';
    document.getElementById('editRole').style.display              = 'none';

    document.getElementById('deleteBtn').style.display = 'block';
    document.getElementById('saveBtn').style.display   = 'none';
    document.getElementById('cancelBtn').style.display = 'none';
    document.getElementById('closeBtn').style.display  = 'block';
}

function _setModoEdicion() {
    document.getElementById('detailUsername').style.display        = 'none';
    document.getElementById('editUsername').style.display          = 'block';
    document.getElementById('detailName').style.display            = 'none';
    document.getElementById('editName').style.display              = 'block';
    document.getElementById('detailPasswordView').style.display    = 'none';
    document.getElementById('editPasswordContainer').style.display = 'flex';
    document.getElementById('detailRole').style.display            = 'none';
    document.getElementById('editRole').style.display              = 'block';

    document.getElementById('deleteBtn').style.display = 'none';
    document.getElementById('saveBtn').style.display   = 'block';
    document.getElementById('cancelBtn').style.display = 'block';
    document.getElementById('closeBtn').style.display  = 'none';
}