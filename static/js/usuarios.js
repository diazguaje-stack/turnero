/**
 * usuarios.js — Gestión completa de usuarios
 * Requiere: auth.js y config.js cargados antes en el HTML
 */

// ==========================================
let isEditMode = false;
let usersTrash = [];

// ── Debounce para evitar recargas múltiples por eventos WS ────────────────────
let _reloadTimeout = null;
function recargarUsuarios() {
    clearTimeout(_reloadTimeout);
    _reloadTimeout = setTimeout(() => loadUsersFromBackend(), 300);
}

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

function onRoleChange() {
    const role        = document.getElementById('newRole').value;
    const prefixGroup = document.getElementById('prefixGroup');
    if (prefixGroup) {
        prefixGroup.style.display = role === 'medico' ? 'flex' : 'none';
    }
}

// ── Cargar desde backend ──────────────────────────────────────────────────────

async function loadUsersFromBackend() {
    try {
        const response = await fetch(USUARIOS_API.getAll, { headers: getAuthHeaders() });
        if (response.ok) {
            const data = await response.json();
            const idsEnPapelera = new Set(usersTrash.map(u => u.id));
            users = data.users.filter(u => !idsEnPapelera.has(u.id));
            console.log(`✅ ${users.length} usuarios cargados (${idsEnPapelera.size} en papelera)`);
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

// ── Papelera ──────────────────────────────────────────────────────────────────

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
                <strong>${user.usuario}</strong> (${user.nombre_completo || ''})
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
    const modal = document.getElementById('usersTrashModal');
    if (modal) modal.classList.remove('active');
}

async function restoreUser(userId) {
    const user = usersTrash.find(u => u.id === userId);
    if (!user) return;

    try {
        const response = await fetch(USUARIOS_API.restaurar(userId), {
            method:  'POST',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            const data = await response.json();
            showToast(data.message || 'Error al restaurar', 'error');
            return;
        }

        usersTrash = usersTrash.filter(u => u.id !== userId);
        await loadUsersFromBackend(); // recargar desde BD para estado fresco
        openUsersTrash();
        showToast(`Usuario ${user.usuario} restaurado`, 'success');

    } catch (error) {
        console.error(error);
        showToast('Error de conexión', 'error');
    }
}

async function deleteUserForever(userId) {
    const user = usersTrash.find(u => u.id === userId);
    if (!user) return;

    if (!confirm(`Eliminar DEFINITIVAMENTE a ${user.usuario}?`)) return;

    try {
        const response = await fetch(USUARIOS_API.delete(userId), {
            method:  'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            usersTrash = usersTrash.filter(u => u.id !== userId);
            openUsersTrash();
            showToast('Usuario eliminado definitivamente', 'success');
        } else {
            const data = await response.json();
            showToast(data.message || 'Error al eliminar en BD', 'error');
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

    grid.innerHTML = ''; // limpiar antes de repoblar — evita listeners duplicados

    if (users.length === 0) {
        grid.style.display       = 'none';
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }

    grid.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';
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

    // Un solo listener por card — no se acumula porque grid.innerHTML='' limpia antes
    card.addEventListener('click', () => showUserDetails(user.id));
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, user.id);
    });

    return card;
}

// ── Crear usuario ─────────────────────────────────────────────────────────────

async function handleCreateUser(e) {
    e.preventDefault();

    const username = document.getElementById('newUsername').value.trim();
    const name     = document.getElementById('newName').value.trim();
    const password = document.getElementById('newPassword').value;
    const role     = document.getElementById('newRole').value;
    const prefijo  = role === 'medico'
        ? (document.getElementById('newPrefijo')?.value || 'Dr.')
        : '';

    if (!username || !name || !password || !role) {
        showToast('Por favor completa todos los campos', 'error');
        return;
    }
    if (users.some(u => u.usuario.toLowerCase() === username.toLowerCase())) {
        showToast('El usuario ya existe', 'error');
        return;
    }

    const nombreConPrefijo = prefijo ? `${prefijo} ${name}` : name;
    const newUser = {
        usuario:         username,
        nombre_completo: nombreConPrefijo,
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

// ── Mover a papelera ──────────────────────────────────────────────────────────

async function moveUserToTrash() {
    if (!selectedUserId) return;

    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;

    if (!confirm(`¿Enviar a la papelera al usuario "${user.usuario}"?`)) return;

    if (usersTrash.some(u => u.id === selectedUserId)) {
        showToast('Este usuario ya está en la papelera', 'warning');
        closeUserDetailsModal();
        return;
    }

    try {
        const response = await fetch(USUARIOS_API.desactivar(selectedUserId), {
            method:  'POST',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            const data = await response.json();
            showToast(data.message || 'Error al desactivar usuario', 'error');
            return;
        }

        usersTrash.push(user);
        users = users.filter(u => u.id !== selectedUserId);

        loadUsers();
        updateStats();
        closeUserDetailsModal();
        showToast(`Usuario ${user.usuario} enviado a papelera`, 'warning');

    } catch (error) {
        console.error('Error al desactivar usuario:', error);
        showToast('Error de conexión', 'error');
    }
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
        newName     !== (user.nombre_completo || '') ||
        newRole     !== user.rol ||
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

    const passInput = document.getElementById('editPassword');
    const userPassword = user.password || '';
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
    document.getElementById('deleteBtn').style.display             = 'block';
    document.getElementById('saveBtn').style.display               = 'none';
    document.getElementById('cancelBtn').style.display             = 'none';
    document.getElementById('closeBtn').style.display              = 'block';
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
    document.getElementById('deleteBtn').style.display             = 'none';
    document.getElementById('saveBtn').style.display               = 'block';
    document.getElementById('cancelBtn').style.display             = 'block';
    document.getElementById('closeBtn').style.display              = 'none';
}

// ── WebSocket — se conecta desde main.js, NO al cargar el archivo ─────────────

let socketAdmin = null;

function conectarSocketAdmin() {
    if (socketAdmin && socketAdmin.connected) return; // evitar reconexiones duplicadas

    socketAdmin = io();

    socketAdmin.on('connect', () => {
        console.log('🔌 Socket admin conectado:', socketAdmin.id);
        socketAdmin.emit('join', { room: 'admin' });
    });

    socketAdmin.on('disconnect', () => {
        console.log('🔌 Socket admin desconectado');
    });

    socketAdmin.on('usuario_creado', (data) => {
        console.log('📨 Nuevo usuario creado en tiempo real:', data);
        recargarUsuarios(); // ← debounce: evita múltiples recargas en ráfaga
        showToast(`👤 Nuevo usuario: ${data.usuario.nombre_completo} (${getRoleLabel(data.usuario.rol)})`, 'success');
    });

    socketAdmin.on('usuario_actualizado', (data) => {
        if (data.tipo === 'edicion') {
            console.log('📨 Usuario actualizado en tiempo real:', data);
            recargarUsuarios(); // ← debounce
            showToast(`✏️ Usuario actualizado: ${data.usuario.nombre_completo}`, 'success');
        }
    });

    socketAdmin.on('pantalla_vinculada',     () => { if (typeof cargarPantallas === 'function') cargarPantallas(); });
    socketAdmin.on('pantalla_desvinculada',  () => { if (typeof cargarPantallas === 'function') cargarPantallas(); });
    socketAdmin.on('recepcionista_asignado', () => { if (typeof cargarPantallas === 'function') cargarPantallas(); });
}

// ── IMPORTANTE: NO llamar conectarSocketAdmin() aquí ─────────────────────────
// Se llama desde main.js dentro del DOMContentLoaded para garantizar
// que el DOM y la sesión estén listos antes de conectar el socket.