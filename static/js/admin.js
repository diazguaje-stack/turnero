// Admin Dashboard JS

let availableUsers = {}; // Cache de usuarios por rol

// Helper para fetch que incluye cookies y marca la petición como AJAX
async function apiFetch(url, options = {}) {
    options.credentials = options.credentials || 'same-origin';
    options.headers = options.headers || {};
    // Marcar como petición AJAX para que el backend devuelva JSON en errores de auth
    if (!options.headers['X-Requested-With']) {
        options.headers['X-Requested-With'] = 'XMLHttpRequest';
    }

    return fetch(url, options);
}

async function loadUsers() {
    try {
        const response = await apiFetch('/admin/users/data');
        const users = await response.json();
        
        const grid = document.getElementById('usersGrid');
        
        if (users.length === 0) {
            grid.innerHTML = '<div class="loading">No hay usuarios registrados</div>';
        } else {
            grid.innerHTML = users.map(user => `
                <div class="card">
                    <div class="card-header">
                        <div>
                            <div class="card-title">${user.name}</div>
                            <div style="color: #6b7280; font-size: 13px;">${user.email}</div>
                        </div>
                        <span class="card-badge ${user.is_active ? 'badge-active' : 'badge-inactive'}">
                            ${user.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                    </div>
                    <div class="card-content">
                        <p><strong>Rol:</strong> ${user.role} ${user.consecutive}</p>
                        ${user.assigned_screen ? `<p><strong>Pantalla asignada:</strong> ${user.assigned_screen}</p>` : ''}
                    </div>
                    <div class="card-actions">
                        <button class="btn-secondary ${user.is_active ? 'btn-danger' : 'btn-success'}" 
                                onclick="toggleUser(${user.id})">
                            ${user.is_active ? 'Deshabilitar' : 'Habilitar'}
                        </button>
                        <button class="btn-secondary btn-danger" 
                                onclick="deleteUser(${user.id}, '${user.name.replace(/'/g, "\\'")}')">
                            Eliminar
                        </button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error cargando usuarios:', error);
    }
}

async function createUser(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    try {
        const response = await apiFetch('/admin/create-user', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage('Usuario creado exitosamente', 'success');
            hideModal('createUserModal');
            form.reset();
            loadUsers();
        } else {
            showFlashMessage(result.error || 'Error creando usuario', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

async function toggleUser(userId) {
    try {
        const response = await apiFetch(`/admin/toggle-user/${userId}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage(result.message, 'success');
            loadUsers();
        } else {
            showFlashMessage(result.error || 'Error', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

async function deleteUser(userId, userName) {
    if (!confirm(`¿Estás seguro de que deseas ELIMINAR permanentemente al usuario "${userName}"?\n\nEsta acción NO se puede deshacer.`)) {
        return;
    }
    
    try {
        const response = await apiFetch(`/admin/delete-user/${userId}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage(`✅ Usuario "${userName}" eliminado exitosamente`, 'success');
            loadUsers();
        } else {
            showFlashMessage(result.error || 'Error eliminando usuario', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

// ============================================================
// ✅ FUNCIONES PARA GESTIÓN DE PANTALLAS
// ============================================================

async function loadScreens() {
    try {
        const response = await apiFetch('/admin/screens/data');
        const screens = await response.json();
        
        const grid = document.getElementById('screensGrid');
        
        if (screens.length === 0) {
            grid.innerHTML = '<div class="loading">No hay pantallas creadas</div>';
        } else {
            grid.innerHTML = screens.map(screen => `
                <div class="card">
                    <div class="card-header">
                        <div>
                            <div class="card-title">Pantalla ${screen.screen_number}</div>
                            <div style="color: #6b7280; font-size: 13px;">
                                ${screen.assigned_users_count} usuario(s) asignado(s)
                            </div>
                        </div>
                        <span class="card-badge ${screen.is_active ? 'badge-active' : 'badge-inactive'}">
                            ${screen.is_active ? 'Activa' : 'Inactiva'}
                        </span>
                    </div>
                    <div class="card-content">
                        ${screen.assigned_users && screen.assigned_users.length > 0 ? `
                            <p><strong>Usuarios asignados:</strong></p>
                            <ul style="margin: 8px 0 0 20px; font-size: 13px;">
                                ${screen.assigned_users.map(u => `
                                    <li>${u.name} (${u.role} ${u.consecutive})</li>
                                `).join('')}
                            </ul>
                        ` : `
                            <p style="color: #9ca3af; font-style: italic;">Sin usuarios asignados</p>
                        `}
                    </div>
                    <div class="card-actions screen-actions-group">
                        <button class="btn-secondary btn-preview" onclick="previewScreen(${screen.screen_number})">
                            <i class="fas fa-eye"></i>
                            Ver Pantalla
                        </button>
                        <button class="btn-secondary btn-danger" onclick="deleteScreen(${screen.id})">
                            <i class="fas fa-trash"></i>
                            Eliminar
                        </button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error cargando pantallas:', error);
        showFlashMessage('Error cargando pantallas', 'danger');
    }
}

/**
 * ✅ NUEVA: Vista previa de pantalla en modal
 */
function previewScreen(screenNumber) {
    const modal = document.getElementById('screenPreviewModal');
    const iframe = document.getElementById('screenPreviewIframe');
    const screenNumberSpan = document.getElementById('previewScreenNumber');
    const openNewTabLink = document.getElementById('openScreenNewTab');
    
    // Configurar modal
    screenNumberSpan.textContent = screenNumber;
    
    // Configurar iframe para mostrar la pantalla
    const screenUrl = `/screen/${screenNumber}`;
    iframe.src = screenUrl;
    
    // Configurar enlace para abrir en nueva pestaña
    openNewTabLink.href = screenUrl;
    
    // Mostrar modal
    showModal('screenPreviewModal');
    
    console.log(`📺 Vista previa de pantalla ${screenNumber}`);
}

async function showCreateScreenModal() {
    showModal('createScreenModal');
    await loadReceptionUsers();
}

async function loadReceptionUsers() {
    const container = document.getElementById('receptionUsersList');
    
    try {
        const response = await apiFetch('/admin/users-by-role/reception');
        const result = await response.json();
        
        if (!result.success) {
            container.innerHTML = `
                <div class="no-users-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error cargando usuarios de recepción</p>
                </div>
            `;
            return;
        }
        
        const users = result.users;
        
        if (users.length === 0) {
            container.innerHTML = `
                <div class="no-users-message">
                    <i class="fas fa-info-circle"></i>
                    <p>No hay usuarios de recepción creados</p>
                    <small>Crea usuarios con rol "Recepción" primero</small>
                </div>
            `;
            return;
        }
        
        container.innerHTML = users.map(user => `
            <label class="user-checkbox-item" for="user_${user.id}">
                <input 
                    type="checkbox" 
                    id="user_${user.id}" 
                    name="assigned_users[]" 
                    value="${user.id}"
                    onchange="toggleUserCheckbox(this)"
                >
                <div class="user-info">
                    <div class="user-name">${user.name}</div>
                    <div class="user-details">${user.email} • ${user.role} ${user.consecutive}</div>
                </div>
                <span class="user-badge">Recepción ${user.consecutive}</span>
            </label>
        `).join('');
        
    } catch (error) {
        console.error('Error cargando usuarios de recepción:', error);
        container.innerHTML = `
            <div class="no-users-message">
                <i class="fas fa-exclamation-circle"></i>
                <p>Error de conexión</p>
            </div>
        `;
    }
}

function toggleUserCheckbox(checkbox) {
    const label = checkbox.closest('.user-checkbox-item');
    if (checkbox.checked) {
        label.classList.add('checked');
    } else {
        label.classList.remove('checked');
    }
}

async function createScreen(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    const screenNumber = formData.get('screen_number');
    const checkboxes = form.querySelectorAll('input[name="assigned_users[]"]:checked');
    const assignedUserIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    console.log('Creando pantalla:', {
        screen_number: screenNumber,
        assigned_users: assignedUserIds
    });
    
    try {
        const response = await apiFetch('/admin/create-screen', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                screen_number: parseInt(screenNumber),
                assigned_users: assignedUserIds
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage(
                `✅ Pantalla ${screenNumber} creada exitosamente` + 
                (assignedUserIds.length > 0 ? ` con ${assignedUserIds.length} usuario(s) asignado(s)` : ''),
                'success'
            );
            hideModal('createScreenModal');
            form.reset();
            loadScreens();
        } else {
            showFlashMessage(result.error || 'Error creando pantalla', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

async function deleteScreen(screenId) {
    if (!confirm('¿Estás seguro de eliminar esta pantalla?\n\nLos usuarios asignados perderán el acceso.')) {
        return;
    }
    
    try {
        const response = await apiFetch(`/admin/delete-screen/${screenId}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage('Pantalla eliminada exitosamente', 'success');
            loadScreens();
        } else {
            showFlashMessage(result.error || 'Error eliminando pantalla', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

// ============================================================
// FUNCIONES PARA ENVÍO DE MENSAJES
// ============================================================

async function loadUsersByRole(role) {
    const userSelector = document.getElementById('userSelector');
    const userSelectorContainer = document.getElementById('userSelectorContainer');
    const recipientPreview = document.getElementById('recipientPreview');
    const sendBtn = document.getElementById('sendMessageBtn');
    
    userSelector.innerHTML = '<option value="">-- Cargando usuarios... --</option>';
    userSelector.disabled = true;
    recipientPreview.style.display = 'none';
    sendBtn.disabled = true;
    
    if (!role) {
        userSelectorContainer.style.display = 'none';
        return;
    }
    
    userSelectorContainer.style.display = 'block';
    
    try {
        const response = await apiFetch(`/admin/users-by-role/${role}`);
        const result = await response.json();
        
        if (!result.success) {
            showFlashMessage(result.error || 'Error cargando usuarios', 'danger');
            userSelector.innerHTML = '<option value="">-- Error cargando usuarios --</option>';
            return;
        }
        
        const users = result.users;
        availableUsers[role] = users;
        
        if (users.length === 0) {
            userSelector.innerHTML = '<option value="">-- No hay usuarios con este rol --</option>';
            showFlashMessage(`No hay usuarios con rol "${getRoleName(role)}" en el sistema`, 'warning');
            return;
        }
        
        userSelector.innerHTML = '<option value="">-- Selecciona un usuario --</option>' +
            users.map(u => `
                <option value="${u.id}" 
                        data-name="${u.name}" 
                        data-email="${u.email}" 
                        data-role="${u.role}"
                        data-consecutive="${u.consecutive}">
                    ${u.name} (${u.email}) - ${u.role} ${u.consecutive}
                </option>
            `).join('');
        
        userSelector.disabled = false;
        
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        showFlashMessage('Error de conexión', 'danger');
        userSelector.innerHTML = '<option value="">-- Error de conexión --</option>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const userSelector = document.getElementById('userSelector');
    
    if (userSelector) {
        userSelector.addEventListener('change', function() {
            const recipientPreview = document.getElementById('recipientPreview');
            const sendBtn = document.getElementById('sendMessageBtn');
            
            if (!this.value) {
                recipientPreview.style.display = 'none';
                sendBtn.disabled = true;
                return;
            }
            
            const selectedOption = this.options[this.selectedIndex];
            const name = selectedOption.dataset.name;
            const email = selectedOption.dataset.email;
            const role = selectedOption.dataset.role;
            const consecutive = selectedOption.dataset.consecutive;
            
            document.getElementById('previewName').textContent = name;
            document.getElementById('previewEmail').textContent = email;
            document.getElementById('previewRole').textContent = getRoleName(role);
            document.getElementById('previewConsecutive').textContent = consecutive;
            
            recipientPreview.style.display = 'block';
            sendBtn.disabled = false;
        });
    }
});

async function sendMessageEmail(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const userId = formData.get('user_id');
    
    if (!userId) {
        showFlashMessage('Debes seleccionar un destinatario', 'warning');
        return;
    }
    
    const data = {
        user_id: parseInt(userId),
        subject: formData.get('subject'),
        message: formData.get('message')
    };
    
    try {
        const response = await apiFetch('/admin/send-email-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage('✅ Mensaje enviado exitosamente por correo', 'success');
            form.reset();
            document.getElementById('recipientPreview').style.display = 'none';
            document.getElementById('userSelectorContainer').style.display = 'none';
            document.getElementById('sendMessageBtn').disabled = true;
        } else {
            showFlashMessage(result.error || 'Error enviando mensaje', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

function getRoleName(role) {
    const roleNames = {
        'admin': 'Administrador',
        'reception': 'Recepción',
        'doctor': 'Doctor',
        'registro': 'Registro'
    };
    return roleNames[role] || role;
}

function showCreateUserModal() {
    showModal('createUserModal');
}

// Alternar visibilidad de contraseña en modales
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) icon.classList.remove('fa-eye'), icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        if (icon) icon.classList.remove('fa-eye-slash'), icon.classList.add('fa-eye');
    }
}

// Cargar datos al cambiar de tab
const originalSwitchTab = window.switchTab;
window.switchTab = function(tabName) {
    originalSwitchTab(tabName);
    
    if (tabName === 'users') {
        loadUsers();
    } else if (tabName === 'screens') {
        loadScreens();
    }
};

// Cargar usuarios al iniciar
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('usersGrid')) {
        loadUsers();
    }
});