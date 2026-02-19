// Variables globales
let medicosData = [];

// ==================== INICIALIZACIÓN ====================

document.addEventListener("DOMContentLoaded", () => {
    verificarSesion();
    cargarMedicos();
});

// ==================== VERIFICAR SESIÓN ====================

async function verificarSesion() {
    // Validar que tiene rol 'registro' - de lo contrario, redirigirá a login
    const tieneAcceso = await estaAutenticado();
    if (!tieneAcceso) return;

    // Si llegó aquí, tiene acceso. Mostrar nombre del usuario
    const nombreCompleto = window.sessionData.nombre_completo || window.sessionData.usuario || "Usuario";
    
    const userNameElement = document.getElementById("userName");
    if (userNameElement) {
        userNameElement.textContent = nombreCompleto;
    }

    const userAvatarElement = document.getElementById("userAvatar");
    if (userAvatarElement) {
        const inicial = nombreCompleto.charAt(0).toUpperCase();
        userAvatarElement.textContent = inicial;
    }

    console.log(`✅ Página de registro lista para: ${nombreCompleto} (${window.sessionData.rol})`);
}

function logout() {
    confirmarCierreSesion(); // Función del sessionManager.js
}
// ==================== CARGAR MÉDICOS ====================

async function cargarMedicos() {
    try {
        const container = document.getElementById('medicosContainer');
        
        const response = await fetch('/api/medicos', {
            method: 'GET',
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>⚠️ Error</h3>
                    <p>${data.message || 'Error al cargar médicos'}</p>
                </div>
            `;
            return;
        }

        medicosData = data.medicos;

        if (!medicosData || medicosData.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>😕 No hay médicos disponibles</h3>
                    <p>Debes crear médicos desde el panel de administrador</p>
                </div>
            `;
            return;
        }

        // Generar cards
        const html = medicosData.map(medico => crearCardMedico(medico)).join('');
        container.innerHTML = `<div class="medicos-grid">${html}</div>`;

        console.log(`✅ ${medicosData.length} médicos cargados`);

    } catch (error) {
        console.error('Error al cargar médicos:', error);
        document.getElementById('medicosContainer').innerHTML = `
            <div class="empty-state">
                <h3>❌ Error de conexión</h3>
                <p>No se pudieron cargar los médicos. Intenta recargar la página.</p>
            </div>
        `;
    }
}

// ==================== CREAR CARD DE MÉDICO ====================

function crearCardMedico(medico) {
    return `
        <div class="medico-card" onclick="abrirModal('${medico.id}', '${medico.nombre_completo.replace(/'/g, "\\'")}')">
            <div class="medico-avatar-grande">${medico.inicial}</div>
            <h3>${medico.nombre_completo}</h3>
            <p>👨‍⚕️ Médico</p>
            <div class="medico-card-footer">
                Haz clic para registrar paciente
            </div>
        </div>
    `;
}

// ==================== MODAL ====================

function abrirModal(medicoId, medicoNombre) {
    const modal = document.getElementById('registroModal');
    const modalMessage = document.getElementById('modalMessage');
    
    // Limpiar mensaje
    modalMessage.innerHTML = '';
    
    // Llenar datos del médico
    document.getElementById('medicoId').value = medicoId;
    document.getElementById('medicoNombre').value = medicoNombre;
    
    // Limpiar formulario
    document.getElementById('registroForm').reset();
    document.getElementById('btnRegistrar').disabled = false;
    document.getElementById('btnRegistrar').textContent = 'Registrar Paciente';
    
    // Mostrar modal
    modal.classList.add('active');
}

function cerrarModal() {
    const modal = document.getElementById('registroModal');
    modal.classList.remove('active');
    document.getElementById('registroForm').reset();
    document.getElementById('modalMessage').innerHTML = '';
}

// Cerrar modal al hacer click fuera
document.addEventListener('click', (e) => {
    const modal = document.getElementById('registroModal');
    if (e.target === modal) {
        cerrarModal();
    }
});

// ==================== REGISTRAR PACIENTE ====================

async function registrarPaciente(event) {
    event.preventDefault();

    const btnRegistrar = document.getElementById('btnRegistrar');
    const modalMessage = document.getElementById('modalMessage');
    
    btnRegistrar.disabled = true;
    btnRegistrar.textContent = 'Registrando...';

    try {
        const medicoId = document.getElementById('medicoId').value;
        const medicoNombre = document.getElementById('medicoNombre').value;
        const nombre = document.getElementById('pacienteNombre').value.trim();
        const motivo = document.getElementById('pacienteMotivo').value;

        // Validación
        if (!nombre || !motivo) {
            modalMessage.innerHTML = '<div class="success-message" style="background: #f8d7da; color: #721c24; border-color: #f5c6cb;">❌ Completa todos los campos</div>';
            btnRegistrar.disabled = false;
            btnRegistrar.textContent = 'Registrar Paciente';
            return;
        }

        // Hacer request
        const response = await fetch('/api/pacientes/registrar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                nombre: nombre,
                apellido: '',
                documento: '',
                medico_id: medicoId,
                motivo: motivo
            })
        });

        const data = await response.json();

        if (!response.ok) {
            modalMessage.innerHTML = `<div class="success-message" style="background: #f8d7da; color: #721c24; border-color: #f5c6cb;">❌ ${data.message || 'Error al registrar'}</div>`;
            btnRegistrar.disabled = false;
            btnRegistrar.textContent = 'Registrar Paciente';
            return;
        }

        // ✅ Éxito
        document.getElementById('registroForm').style.display = 'none';
        
        const html = `
            <div class="success-message">
                ✅ ¡Paciente registrado exitosamente!
            </div>
            
            <div class="codigo-display">
                <div class="codigo-label">📌 CÓDIGO ÚNICO DEL PACIENTE</div>
                <div class="codigo-valor">${data.paciente.codigo}</div>
            </div>
            
            <div class="paciente-info">
                <p><strong>👤 Paciente:</strong> ${data.paciente.nombre}</p>
                <p><strong>👨‍⚕️ Médico:</strong> ${data.paciente.medico}</p>
                <p><strong>📋 Motivo:</strong> ${data.paciente.motivo}</p>
                <p><strong>🆔 ID Paciente:</strong> ${data.paciente.id}</p>
            </div>
        `;

        modalMessage.innerHTML = html;

        // Botón para cerrar
        const btnCerrar = document.createElement('button');
        btnCerrar.type = 'button';
        btnCerrar.className = 'btn btn-primary';
        btnCerrar.textContent = 'Registrar Otro Paciente';
        btnCerrar.style.width = '100%';
        btnCerrar.onclick = () => {
            cerrarModal();
            cargarMedicos();
        };

        const btnContainer = document.createElement('div');
        btnContainer.style.marginTop = '20px';
        btnContainer.appendChild(btnCerrar);
        modalMessage.appendChild(btnContainer);

        console.log('✅ Paciente registrado:', data.paciente);

    } catch (error) {
        console.error('Error:', error);
        modalMessage.innerHTML = `<div class="success-message" style="background: #f8d7da; color: #721c24; border-color: #f5c6cb;">❌ Error de conexión: ${error.message}</div>`;
        btnRegistrar.disabled = false;
        btnRegistrar.textContent = 'Registrar Paciente';
    }
}

// ==================== LOGOUT ====================

function logout() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        fetch('/logout', { method: 'POST', credentials: 'include' })
            .then(() => window.location.href = '/')
            .catch(err => console.error('Error al cerrar sesión:', err));
    }
}