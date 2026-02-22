/**
 * registro.js - Página de registro de pacientes
 * Requiere: auth.js cargado antes en el HTML
 * Requiere: socket.io cargado antes en el HTML
 */

let medicosData = [];
let socket      = null;

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', () => {
    verificarSesion();
    cargarMedicos();
    conectarSocket();
});

// ==================== WEBSOCKET ====================

function conectarSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('🔌 Socket conectado:', socket.id);
        socket.emit('join', { room: 'registro' });
    });

    socket.on('disconnect', () => {
        console.log('🔌 Socket desconectado');
    });
}

// ==================== VERIFICAR SESIÓN ====================

async function verificarSesion() {
    const sessionData = await Auth.verificarSesion('registro');
    if (!sessionData) return;

    const nombreCompleto = sessionData.nombre_completo || sessionData.usuario || 'Usuario';

    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = nombreCompleto;

    const userAvatarEl = document.getElementById('userAvatar');
    if (userAvatarEl) userAvatarEl.textContent = nombreCompleto.charAt(0).toUpperCase();

    console.log(`✅ Página de registro lista para: ${nombreCompleto}`);
}

function logout() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        Auth.logout();
    }
}

// ==================== CARGAR MÉDICOS ====================

async function cargarMedicos() {
    try {
        const container = document.getElementById('medicosContainer');

        const response = await Auth.fetch('/api/medicos', { method: 'GET' });
        const data     = await response.json();

        if (!response.ok) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>⚠️ Error</h3>
                    <p>${data.message || 'Error al cargar médicos'}</p>
                </div>`;
            return;
        }

        medicosData = data.medicos;

        if (!medicosData || medicosData.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>😕 No hay médicos disponibles</h3>
                    <p>Debes crear médicos desde el panel de administrador</p>
                </div>`;
            return;
        }

        const html = medicosData.map(medico => crearCardMedico(medico)).join('');
        container.innerHTML = `<div class="medicos-grid">${html}</div>`;

        console.log(`✅ ${medicosData.length} médicos cargados`);

    } catch (error) {
        console.error('Error al cargar médicos:', error);
        const container = document.getElementById('medicosContainer');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>❌ Error de conexión</h3>
                    <p>No se pudieron cargar los médicos. Intenta recargar la página.</p>
                </div>`;
        }
    }
}

// ==================== CREAR CARD DE MÉDICO ====================

function crearCardMedico(medico) {
    return `
        <div class="medico-card"
             data-medico-id="${medico.id}"
             data-medico-nombre="${medico.nombre_completo.replace(/"/g, '&quot;')}">
            <div class="medico-avatar-grande">${medico.inicial}</div>
            <h3>${medico.nombre_completo}</h3>
            <p>👨‍⚕️ Médico</p>
            <div class="medico-card-footer">
                Haz clic para registrar paciente
            </div>
        </div>`;
}

// ==================== MODAL ====================

function abrirModal(medicoId, medicoNombre) {
    const modal        = document.getElementById('registroModal');
    const modalMessage = document.getElementById('modalMessage');

    modalMessage.innerHTML = '';

    const form = document.getElementById('registroForm');
    if (form) {
        form.reset();
        form.style.display = 'block';
    }

    document.getElementById('medicoId').value     = medicoId;
    document.getElementById('medicoNombre').value = medicoNombre;

    const btn = document.getElementById('btnRegistrar');
    if (btn) {
        btn.disabled    = false;
        btn.textContent = 'Registrar Paciente';
    }

    modal.classList.add('active');
}

function cerrarModal() {
    const modal = document.getElementById('registroModal');
    modal.classList.remove('active');

    const form = document.getElementById('registroForm');
    if (form) {
        form.reset();
        form.style.display = 'block';
    }

    const modalMessage = document.getElementById('modalMessage');
    if (modalMessage) modalMessage.innerHTML = '';
}

document.addEventListener("click", (e) => {
    const modal = document.getElementById("registroModal");

    if (modal && e.target === modal) {
        cerrarModal();
        return;
    }

    const card = e.target.closest(".medico-card[data-medico-id]");
    if (card) {
        const medicoId     = card.dataset.medicoId;
        const medicoNombre = card.dataset.medicoNombre;
        abrirModal(medicoId, medicoNombre);
    }
});

// ==================== REGISTRAR PACIENTE ====================

async function registrarPaciente(event) {
    event.preventDefault();

    const btnRegistrar = document.getElementById('btnRegistrar');
    const modalMessage = document.getElementById('modalMessage');

    btnRegistrar.disabled    = true;
    btnRegistrar.textContent = 'Registrando...';

    try {
        const medicoId     = document.getElementById('medicoId').value;
        const medicoNombre = document.getElementById('medicoNombre').value;
        const nombre       = document.getElementById('pacienteNombre').value.trim();
        const motivo       = document.getElementById('pacienteMotivo').value;

        if (!nombre || !motivo) {
            modalMessage.innerHTML = `
                <div class="success-message" style="background:#f8d7da;color:#721c24;border-color:#f5c6cb;">
                    ❌ Completa todos los campos
                </div>`;
            btnRegistrar.disabled    = false;
            btnRegistrar.textContent = 'Registrar Paciente';
            return;
        }

        const response = await Auth.fetch('/api/pacientes/registrar', {
            method: 'POST',
            body:   JSON.stringify({
                nombre:    nombre,
                apellido:  '',
                documento: '',
                medico_id: medicoId,
                motivo:    motivo
            })
        });

        const data = await response.json();

        if (!response.ok) {
            modalMessage.innerHTML = `
                <div class="success-message" style="background:#f8d7da;color:#721c24;border-color:#f5c6cb;">
                    ❌ ${data.message || 'Error al registrar'}
                </div>`;
            btnRegistrar.disabled    = false;
            btnRegistrar.textContent = 'Registrar Paciente';
            return;
        }

        // ── Ocultar formulario ──────────────────────────────────
        document.getElementById('registroForm').style.display = 'none';

        const esReimpresion = data.tipo === 'reimpresion';

        const bannerColor  = esReimpresion ? '#fff3cd' : '#d4edda';
        const bannerBorder = esReimpresion ? '#ffc107' : '#28a745';
        const bannerText   = esReimpresion ? '#856404' : '#155724';
        const bannerIcono  = esReimpresion ? '♻️' : '✅';
        const bannerTitulo = esReimpresion ? '¡Turno re-generado!' : '¡Paciente registrado exitosamente!';

        const infoAdicional = esReimpresion ? `
            <div style="background:#fff8e1;border:1px solid #ffd54f;border-radius:6px;
                        padding:10px 14px;margin-top:10px;font-size:0.9em;color:#5d4037;">
                ⚠️ <strong>Re-impresión de turno</strong><br>
                El paciente ya estaba registrado.<br>
                Código anterior: <strong style="color:#c62828">${data.codigo_anterior || '—'}</strong>
                fue <strong>reemplazado</strong> por el nuevo código.
            </div>` : '';

        modalMessage.innerHTML = `
            <div class="success-message"
                 style="background:${bannerColor};color:${bannerText};border-color:${bannerBorder};">
                ${bannerIcono} ${bannerTitulo}
            </div>
            <div class="codigo-display">
                <div class="codigo-label">📌 CÓDIGO DE TURNO</div>
                <div class="codigo-valor">${data.codigo_turno}</div>
                <div style="font-size:0.8em;color:#666;margin-top:4px;">
                    ID Paciente: ${data.paciente.codigo_paciente || data.paciente.id.substring(0, 8) + '...'}
                </div>
            </div>
            ${infoAdicional}
            <div class="paciente-info">
                <p><strong>👤 Paciente:</strong> ${data.paciente.nombre}</p>
                <p><strong>👨‍⚕️ Médico:</strong> ${data.paciente.medico}</p>
                <p><strong>📋 Motivo:</strong> ${data.paciente.motivo}</p>
            </div>`;

        const btnCerrar       = document.createElement('button');
        btnCerrar.type        = 'button';
        btnCerrar.className   = 'btn btn-primary';
        btnCerrar.textContent = 'Registrar Otro Paciente';
        btnCerrar.style.width = '100%';
        btnCerrar.style.marginTop = '20px';
        btnCerrar.onclick = () => {
            const form = document.getElementById('registroForm');
            if (form) { form.style.display = 'block'; form.reset(); }
            cerrarModal();
            setTimeout(() => cargarMedicos(), 200);
        };
        modalMessage.appendChild(btnCerrar);

        console.log(`${esReimpresion ? '♻️ Re-registro' : '✅ Nuevo'} paciente:`, data.paciente);

    } catch (error) {
        console.error('Error:', error);
        if (modalMessage) {
            modalMessage.innerHTML = `
                <div class="success-message" style="background:#f8d7da;color:#721c24;border-color:#f5c6cb;">
                    ❌ Error de conexión: ${error.message}
                </div>`;
        }
        btnRegistrar.disabled    = false;
        btnRegistrar.textContent = 'Registrar Paciente';
    }
}