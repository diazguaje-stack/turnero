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
        // ── Médico nuevo o editado → recargar cards ──
    socket.on('usuario_actualizado', (data) => {
        if (data.usuario.rol === 'medico') {
            console.log('📨 Médico actualizado, recargando cards...');
            cargarMedicos();

            // ── NUEVO: si el modal está abierto para este médico, actualizar nombre ──
            const medicoIdActual = document.getElementById('medicoId')?.value;
            if (medicoIdActual === String(data.usuario.id)) {
                document.getElementById('medicoNombre').value = data.usuario.nombre_completo;

                // Actualizar el título visible del modal si existe
                const tituloModal = document.querySelector('#registroModal h2');
                if (tituloModal) {
                    tituloModal.textContent = `Registrar Paciente — ${data.usuario.nombre_completo}`;
                }
            }

            const msg = data.tipo === 'nuevo'
                ? `👨‍⚕️ Nuevo médico disponible: ${data.usuario.nombre_completo}`
                : `✏️ Médico actualizado: ${data.usuario.nombre_completo}`;

            mostrarToastRegistro(msg);
        }
    });
    socket.on('paciente_eliminado', (data) => {
    console.log('🗑️ Paciente eliminado en tiempo real:', data);

    const medicoIdActual = document.getElementById('medicoId')?.value;
    const modal = document.getElementById('registroModal');
    const modalAbierto = modal?.classList.contains('active');

    // Si el modal está abierto para el mismo médico del paciente eliminado, cerrarlo
        if (modalAbierto && medicoIdActual === data.medico_id) {
            cerrarModal();
            mostrarToastRegistro(`🗑️ El paciente "${data.nombre}" fue retirado de la lista`);
        } else {
            mostrarToastRegistro(`🗑️ Paciente retirado: ${data.nombre}`);
        }
    });

    socket.on('usuario_desactivado', (data) => {
        if (data.rol !== 'medico') return;

        console.log('🗑️ Médico desactivado, quitando card:', data.usuario_id);

        // Quitar de medicosData
        medicosData = medicosData.filter(m => String(m.id) !== String(data.usuario_id));

        // Quitar card del DOM
        const card = document.querySelector(`.medico-card[data-medico-id="${data.usuario_id}"]`);
        if (card) card.remove();

        // Si el modal estaba abierto para este médico, cerrarlo
        const medicoIdActual = document.getElementById('medicoId')?.value;
        if (medicoIdActual === String(data.usuario_id)) {
            cerrarModal();
        }

        // Si no quedan cards, mostrar empty state
        const grid = document.querySelector('.medicos-grid');
        if (grid && grid.children.length === 0) {
            document.getElementById('medicosContainer').innerHTML = `
                <div class="empty-state">
                    <h3>😕 No hay médicos disponibles</h3>
                    <p>Debes crear médicos desde el panel de administrador</p>
                </div>`;
        }

        mostrarToastRegistro(`🗑️ Médico ${data.nombre} fue dado de baja`);
    });

    // ── Médico restaurado → agregar card en tiempo real ──
    socket.on('usuario_restaurado', (data) => {
        if (data.usuario.rol !== 'medico') return;

        console.log('✅ Médico restaurado, agregando card:', data.usuario);

        // Si ya existe en medicosData, no duplicar
        if (medicosData.some(m => String(m.id) === String(data.usuario.id))) return;

        // Agregar a medicosData
        const nuevoMedico = {
            id:             data.usuario.id,
            nombre_completo: data.usuario.nombre_completo,
            inicial:        data.usuario.inicial || data.usuario.nombre_completo[0].toUpperCase()
        };
        medicosData.push(nuevoMedico);

        // Reconstruir grid (más simple que insertar manualmente)
        cargarMedicos();

        mostrarToastRegistro(`✅ Médico ${data.usuario.nombre_completo} disponible nuevamente`);
    });

    
}

function mostrarToastRegistro(msg) {
    let toast = document.getElementById('toastRegistro');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastRegistro';
        toast.style.cssText = `
            position:fixed; top:16px; right:16px; z-index:9999;
            background:#d4edda; color:#155724; border:1px solid #28a745;
            border-radius:8px; padding:12px 20px; font-size:0.9em;
            font-weight:500; box-shadow:0 4px 12px rgba(0,0,0,0.15);
            transition:opacity 0.4s ease; max-width:320px;`;
        document.body.appendChild(toast);
    }
    toast.textContent   = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
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

// Reemplaza crearCardMedico completo:
function crearCardMedico(medico) {
    const nombreDisplay = medico.nombre_completo; // ya incluye "Dr. juan"
    return `
        <div class="medico-card"
             data-medico-id="${medico.id}"
             data-medico-nombre="${nombreDisplay.replace(/"/g, '&quot;')}">
            <div class="medico-avatar-grande">${medico.inicial}</div>
            <h3>${nombreDisplay}</h3>
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