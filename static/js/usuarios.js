/**
 * usuarios.js — Gestión completa de usuarios
 * Lógica de papelera tipo OS (macOS / Windows):
 *   - Mover a papelera → soft delete (activo=False en BD)
 *   - Restaurar        → activo=True en BD
 *   - Eliminar def.    → borra de BD (solo desde papelera)
 *   - Vaciar papelera  → borra todos de BD
 *
 * Requiere: auth.js y config.js cargados antes en el HTML
 */

// ── Estado ────────────────────────────────────────────────────────────────────
let isEditMode = false;
let usersTrash = [];   // espejo en memoria de los usuarios inactivos

// ── Debounce para recargas por WS ─────────────────────────────────────────────
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

// ── Cargar usuarios activos desde backend ─────────────────────────────────────
async function loadUsersFromBackend() {
    try {
        const response = await fetch(USUARIOS_API.getAll, { headers: getAuthHeaders() });
        if (response.ok) {
            const data = await response.json();
            users = data.users;
            console.log(`✅ ${users.length} usuarios activos cargados`);
        } else {
            console.warn('Error al cargar usuarios del backend');
            users = [];
        }
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        users = [];
    }
    loadUsers();
    updateStats();
}

// =============================================================================
// PAPELERA — lógica tipo OS
// =============================================================================

async function openUsersTrash() {
    const modal = document.getElementById('usersTrashModal');
    const body  = document.getElementById('usersTrashBody');
    if (!modal || !body) return;

    body.innerHTML = '<p style="color:#888;text-align:center">Cargando papelera...</p>';
    modal.classList.add('active');

    try {
        const response = await fetch('/api/users/inactivos', { headers: getAuthHeaders() });
        const data     = await response.json();
        usersTrash     = data.users || [];
    } catch (e) {
        console.error('Error cargando papelera:', e);
        body.innerHTML = '<p style="color:red">Error al cargar la papelera</p>';
        return;
    }

    _renderizarPapelera();
}

function _renderizarPapelera() {
    const body = document.getElementById('usersTrashBody');
    if (!body) return;

    body.innerHTML = '';

    if (!usersTrash.length) {
        body.innerHTML = `
            <div style="text-align:center;padding:32px;color:#9ca3af">
                <div style="font-size:3rem;margin-bottom:12px">🗑️</div>
                <p style="font-size:1rem;font-weight:500">La papelera está vacía</p>
                <p style="font-size:0.85rem;margin-top:4px">Los usuarios eliminados aparecerán aquí</p>
            </div>`;
        return;
    }

    // ── Barra superior con contador y botón vaciar ──
    const barra = document.createElement('div');
    barra.className = 'trash-toolbar';
    barra.style.cssText = `
        display:flex; justify-content:space-between; align-items:center;
        padding:10px 14px; background:#fef3c7; border-radius:8px;
        margin-bottom:14px; border:1px solid #fcd34d;`;
    barra.innerHTML = `
        <span style="font-size:0.9rem;color:#92400e;font-weight:500">
            🗑️ ${usersTrash.length} usuario${usersTrash.length > 1 ? 's' : ''} en papelera
        </span>
        <button
            onclick="vaciarPapeleraUsuarios()"
            style="background:#dc2626;color:#fff;border:none;padding:6px 14px;
                   border-radius:6px;cursor:pointer;font-weight:600;font-size:0.85rem;">
            Vaciar papelera
        </button>`;
    body.appendChild(barra);

    // ── Items ──
    usersTrash.forEach(user => {
        const div        = document.createElement('div');
        div.className    = 'trash-item';
        div.style.cssText = `
            display:flex; justify-content:space-between; align-items:center;
            padding:10px 14px; border:1px solid #e5e7eb; border-radius:8px;
            margin-bottom:8px; background:#f9fafb;`;

        const info = document.createElement('div');
        info.innerHTML = `
            <strong style="font-size:0.95rem">${user.usuario}</strong>
            <span style="color:#6b7280;font-size:0.85rem;margin-left:8px">${user.nombre_completo || ''}</span>
            <br>
            <span style="font-size:0.78rem;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">
                ${getRoleLabel(user.rol)}
            </span>`;

        const acciones = document.createElement('div');
        acciones.style.cssText = 'display:flex;gap:8px;flex-shrink:0';
        acciones.innerHTML = `
            <button
                onclick="restoreUser('${user.id}')"
                style="background:#059669;color:#fff;border:none;padding:5px 12px;
                       border-radius:5px;cursor:pointer;font-size:0.82rem;font-weight:500">
                ↩ Restaurar
            </button>
            <button
                onclick="deleteUserForever('${user.id}')"
                style="background:#dc2626;color:#fff;border:none;padding:5px 12px;
                       border-radius:5px;cursor:pointer;font-size:0.82rem;font-weight:500">
                🗑 Eliminar
            </button>`;

        div.appendChild(info);
        div.appendChild(acciones);
        body.appendChild(div);
    });
}

function closeUsersTrash() {
    const modal = document.getElementById('usersTrashModal');
    if (modal) modal.classList.remove('active');
}

// ── Mover a papelera (desde grid principal — soft delete) ─────────────────────
async function moveUserToTrash() {
    if (!selectedUserId) return;

    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;

    if (!confirm(`¿Enviar a la papelera al usuario "${user.usuario}"?\nPodrás restaurarlo más tarde.`)) return;

    try {
        const response = await fetch(USUARIOS_API.desactivar(selectedUserId), {
            method:  'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (!response.ok) {
            showToast(data.message || 'Error al mover a papelera', 'error');
            return;
        }

        // Actualizar estado local sin recargar todo
        users      = users.filter(u => u.id !== selectedUserId);
        usersTrash = [...usersTrash, user];

        loadUsers();
        updateStats();
        closeUserDetailsModal();
        showToast(`🗑️ "${user.usuario}" movido a la papelera`, 'warning');

    } catch (error) {
        console.error('Error al mover a papelera:', error);
        showToast('Error de conexión', 'error');
    }
}

// ── Restaurar desde papelera ──────────────────────────────────────────────────
async function restoreUser(userId) {
    const user = usersTrash.find(u => u.id === userId);
    if (!user) return;

    try {
        const response = await fetch(USUARIOS_API.restaurar(userId), {
            method:  'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (!response.ok) {
            showToast(data.message || 'Error al restaurar', 'error');
            return;
        }

        // Actualizar estado local
        usersTrash = usersTrash.filter(u => u.id !== userId);
        users      = [...users, { ...user, activo: true }];

        loadUsers();
        updateStats();
        _renderizarPapelera();
        showToast(`✅ "${user.usuario}" restaurado correctamente`, 'success');

    } catch (error) {
        console.error('Error al restaurar:', error);
        showToast('Error de conexión', 'error');
    }
}

// ── Eliminar definitivamente UN usuario (solo desde papelera) ─────────────────
async function deleteUserForever(userId) {
    const user = usersTrash.find(u => u.id === userId);
    if (!user) return;

    if (!confirm(
        `⚠️ ELIMINAR DEFINITIVAMENTE\n\n` +
        `¿Estás seguro de que deseas eliminar a "${user.usuario}" de forma permanente?\n` +
        `Esta acción NO se puede deshacer.`
    )) return;

    try {
        const response = await fetch(USUARIOS_API.delete(userId), {
            method:  'DELETE',
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (!response.ok) {
            showToast(data.message || 'Error al eliminar', 'error');
            return;
        }

        // Eliminar del estado local
        usersTrash = usersTrash.filter(u => u.id !== userId);
        _renderizarPapelera();
        showToast(`🗑️ "${user.usuario}" eliminado definitivamente`, 'success');

    } catch (error) {
        console.error('Error al eliminar definitivamente:', error);
        showToast('Error de conexión', 'error');
    }
}

// ── Vaciar papelera completa ──────────────────────────────────────────────────
async function vaciarPapeleraUsuarios() {
    if (!usersTrash.length) return;

    const total = usersTrash.length;
    if (!confirm(
        `⚠️ VACIAR PAPELERA\n\n` +
        `¿Eliminar DEFINITIVAMENTE los ${total} usuario${total > 1 ? 's' : ''} en papelera?\n` +
        `Esta acción NO se puede deshacer.`
    )) return;

    try {
        const response = await fetch('/api/users/vaciar-papelera', {
            method:  'DELETE',
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (!response.ok) {
            showToast(data.message || 'Error al vaciar papelera', 'error');
            return;
        }

        usersTrash = [];
        _renderizarPapelera();
        showToast(`🗑️ Papelera vaciada — ${data.eliminados} usuario${data.eliminados !== 1 ? 's' : ''} eliminado${data.eliminados !== 1 ? 's' : ''} definitivamente`, 'success');

    } catch (e) {
        console.error('Error al vaciar papelera:', e);
        showToast('Error de conexión', 'error');
    }
}

// =============================================================================
// RENDERIZADO DE GRILLA
// =============================================================================

function loadUsers() {
    const grid       = document.getElementById('usersGrid');
    const emptyState = document.getElementById('emptyState');
    if (!grid) return;

    grid.innerHTML = '';

    if (users.length === 0) {
        grid.style.display = 'none';
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
        </div>`;

    card.addEventListener('click', () => showUserDetails(user.id));
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, user.id);
    });

    return card;
}

// =============================================================================
// CREAR USUARIO
// =============================================================================

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
            showToast(`✅ Usuario "${username}" creado exitosamente`, 'success');
            document.getElementById('createUserForm').reset();
        } else {
            showToast(data.message || 'Error al crear usuario', 'error');
        }
    } catch (error) {
        console.error('Error al crear usuario:', error);
        showToast('Error de conexión al crear usuario', 'error');
    }
}

// =============================================================================
// GUARDAR CAMBIOS (edición)
// =============================================================================

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

    const updatedData = { usuario: newUsername, nombre_completo: newName, rol: newRole };
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
            showToast('✅ Cambios registrados correctamente', 'success');
        } else {
            showToast(data.message || 'Error al actualizar usuario', 'error');
        }
    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        showToast('Error de conexión al actualizar usuario', 'error');
    }
}

// =============================================================================
// MODALES
// =============================================================================

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

// =============================================================================
// MODO EDICIÓN
// =============================================================================

function enterEditMode() {
    hideContextMenu();
    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;

    isEditMode = true;
    document.getElementById('userDetailsModal').classList.add('active');
    document.getElementById('editUsername').value = user.usuario;
    document.getElementById('editName').value     = user.nombre_completo || '';

    const passInput    = document.getElementById('editPassword');
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

// =============================================================================
// CONTRASEÑAS
// =============================================================================

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

// =============================================================================
// MENÚ DE CONTEXTO
// =============================================================================

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

// =============================================================================
// HELPERS INTERNOS DE MODAL
// =============================================================================

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

// =============================================================================
// WEBSOCKET — conectar desde main.js (NO desde aquí)
// =============================================================================

let socketAdmin = null;

function conectarSocketAdmin() {
    if (socketAdmin && socketAdmin.connected) return;

    socketAdmin = io();

    socketAdmin.on('connect', () => {
        console.log('🔌 Socket admin conectado:', socketAdmin.id);
        socketAdmin.emit('join', { room: 'admin' });
    });

    socketAdmin.on('disconnect', () => {
        console.log('🔌 Socket admin desconectado');
    });

    // ── Nuevo usuario creado ──
    socketAdmin.on('usuario_creado', (data) => {
        console.log('📨 Nuevo usuario creado:', data);
        recargarUsuarios();
        showToast(`👤 Nuevo usuario: ${data.usuario.nombre_completo} (${getRoleLabel(data.usuario.rol)})`, 'success');
    });

    // ── Usuario editado ──
    socketAdmin.on('usuario_actualizado', (data) => {
        if (data.tipo === 'edicion') {
            console.log('📨 Usuario actualizado:', data);
            recargarUsuarios();
            showToast(`✏️ Usuario actualizado: ${data.usuario.nombre_completo}`, 'success');
        }
    });

    // ── Usuario desactivado (movido a papelera) ──
    // En admin solo recargamos, no hacemos "caer" la página
    socketAdmin.on('usuario_desactivado', (data) => {
        console.log('🗑️ Usuario movido a papelera:', data);
        recargarUsuarios();
        // Si el modal de detalles está abierto para este usuario, cerrarlo
        if (selectedUserId === data.usuario_id) {
            closeUserDetailsModal();
        }
    });

    // ── Usuario restaurado desde papelera ──
    socketAdmin.on('usuario_restaurado', (data) => {
        console.log('✅ Usuario restaurado:', data);
        recargarUsuarios();
        showToast(`✅ Restaurado: ${data.usuario.nombre_completo}`, 'success');
    });

    // ── Usuario eliminado definitivamente (desde papelera) ──
    socketAdmin.on('usuario_eliminado_definitivo', (data) => {
        console.log('💀 Usuario eliminado definitivamente:', data);
        // En admin solo limpiamos el estado, ya se maneja en deleteUserForever/vaciar
        users      = users.filter(u => u.id !== data.usuario_id);
        usersTrash = usersTrash.filter(u => u.id !== data.usuario_id);
        loadUsers();
        updateStats();
    });

    // ── Pantallas ──
    socketAdmin.on('pantalla_vinculada',     () => { if (typeof cargarPantallas === 'function') cargarPantallas(); });
    socketAdmin.on('pantalla_desvinculada',  () => { if (typeof cargarPantallas === 'function') cargarPantallas(); });
    socketAdmin.on('recepcionista_asignado', () => { if (typeof cargarPantallas === 'function') cargarPantallas(); });
}