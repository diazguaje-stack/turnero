// Funciones globales para UI

function toggleAvatarMenu() {
    const dropdown = document.getElementById('avatarDropdown');
    dropdown.classList.toggle('active');
}

function showChangePassword() {
    document.getElementById('changePasswordModal').classList.add('active');
    toggleAvatarMenu();
}

function hideChangePassword() {
    document.getElementById('changePasswordModal').classList.remove('active');
}

function toggleNotifications() {
    const panel = document.getElementById('notificationsPanel');
    panel.classList.toggle('active');
    loadNotifications();
}

async function loadNotifications() {
    try {
        const response = await fetch('/notifications');
        const notifications = await response.json();
        
        const list = document.getElementById('notificationsList');
        const count = document.getElementById('notificationCount');
        
        const unread = notifications.filter(n => !n.is_read).length;
        count.textContent = unread;
        count.style.display = unread > 0 ? 'block' : 'none';
        
        if (notifications.length === 0) {
            list.innerHTML = '<div class="notification-item">No hay notificaciones</div>';
        } else {
            list.innerHTML = notifications.map(n => `
                <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="markAsRead(${n.id})">
                    <div class="notification-sender">${n.sender}</div>
                    <div class="notification-subject">${n.subject}</div>
                    <div class="notification-message">${n.message}</div>
                    <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">${n.created_at}</div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error cargando notificaciones:', error);
    }
}

async function markAsRead(notificationId) {
    try {
        await fetch(`/notifications/${notificationId}/read`, {
            method: 'POST'
        });
        loadNotifications();
    } catch (error) {
        console.error('Error marcando notificación:', error);
    }
}

function switchTab(tabName) {
    // Ocultar todos los tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Mostrar tab seleccionado
    document.getElementById(`${tabName}-tab`).classList.add('active');
    event.target.classList.add('active');
}

function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

async function sendMessage(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    const data = {
        receiver_role: formData.get('receiver_role'),
        receiver_consecutive: parseInt(formData.get('receiver_consecutive')),
        subject: formData.get('subject'),
        message: formData.get('message')
    };
    
    try {
        const response = await fetch('/send-notification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage('Mensaje enviado exitosamente', 'success');
            form.reset();
        } else {
            showFlashMessage(result.error || 'Error enviando mensaje', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

function showFlashMessage(message, type) {
    const flashContainer = document.querySelector('.flash-messages') || createFlashContainer();
    
    const flashDiv = document.createElement('div');
    flashDiv.className = `flash-message flash-${type}`;
    flashDiv.innerHTML = `
        ${message}
        <button onclick="this.parentElement.remove()">×</button>
    `;
    
    flashContainer.appendChild(flashDiv);
    
    setTimeout(() => {
        flashDiv.remove();
    }, 5000);
}

function createFlashContainer() {
    const container = document.createElement('div');
    container.className = 'flash-messages';
    document.body.appendChild(container);
    return container;
}

// Cerrar modales al hacer clic fuera
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
}

// Cargar notificaciones periódicamente
setInterval(loadNotifications, 30000);

// Cerrar dropdowns al hacer clic fuera
document.addEventListener('click', function(event) {
    if (!event.target.closest('.avatar-menu')) {
        const dropdown = document.getElementById('avatarDropdown');
        if (dropdown) dropdown.classList.remove('active');
    }
    
    if (!event.target.closest('.notification-btn') && !event.target.closest('.notifications-panel')) {
        const panel = document.getElementById('notificationsPanel');
        if (panel) panel.classList.remove('active');
    }
});
