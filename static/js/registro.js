/**
 * registro.js - Página de registro de pacientes
 *
 * Manejo de usuarios:
 *  - usuario_desactivado       → el usuario fue movido a papelera (activo=False)
 *  - usuario_eliminado_definitivo → el usuario fue borrado de la BD
 *  - En ambos casos: si es el usuario de ESTA sesión → cerrar sesión forzada
 *                    si es un médico → quitar su card
 *
 * Requiere: auth.js, socket.io
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

    // ── Médico nuevo o editado ──
    socket.on('usuario_actualizado', (data) => {
        if (data.usuario.rol !== 'medico') return;

        console.log('📨 Médico actualizado:', data);
        cargarMedicos();

        const medicoIdActual = document.getElementById('medicoId')?.value;
        if (medicoIdActual === String(data.usuario.id)) {
            document.getElementById('medicoNombre').value = data.usuario.nombre_completo;
            const tituloModal = document.querySelector('#registroModal h2');
            if (tituloModal) tituloModal.textContent = `Registrar Paciente — ${data.usuario.nombre_completo}`;
        }

        const msg = data.tipo === 'nuevo'
            ? `👨‍⚕️ Nuevo médico disponible: ${data.usuario.nombre_completo}`
            : `✏️ Médico actualizado: ${data.usuario.nombre_completo}`;
        mostrarToastRegistro(msg);
    });

    // ── Usuario movido a papelera (soft delete) ──────────────────────────────
    socket.on('usuario_desactivado', (data) => {
        console.log('🗑️ Usuario desactivado recibido en registro:', data);
        _manejarUsuarioInaccesible(data, 'desactivado');
    });

    // ── Usuario eliminado definitivamente de la BD ────────────────────────────
    socket.on('usuario_eliminado_definitivo', (data) => {
        console.log('💀 Usuario eliminado definitivamente recibido en registro:', data);
        _manejarUsuarioInaccesible(data, 'eliminado');
    });

    // ── Médico restaurado desde papelera ──
    socket.on('usuario_restaurado', (data) => {
        if (data.usuario.rol !== 'medico') return;
        console.log('✅ Médico restaurado:', data.usuario);
        if (medicosData.some(m => String(m.id) === String(data.usuario.id))) return;
        cargarMedicos();
        mostrarToastRegistro(`✅ Médico ${data.usuario.nombre_completo} disponible nuevamente`);
    });

    // ── Paciente eliminado ──
    socket.on('paciente_eliminado', (data) => {
        console.log('🗑️ Paciente eliminado:', data);
        const medicoIdActual = document.getElementById('medicoId')?.value;
        const modal          = document.getElementById('registroModal');
        const modalAbierto   = modal?.classList.contains('active');

        if (modalAbierto && medicoIdActual === data.medico_id) {
            cerrarModal();
            mostrarToastRegistro(`🗑️ El paciente "${data.nombre}" fue retirado de la lista`);
        } else {
            mostrarToastRegistro(`🗑️ Paciente retirado: ${data.nombre}`);
        }
    });
}

/**
 * Maneja cualquier evento que haga un usuario inaccesible:
 * tanto "desactivado" (papelera) como "eliminado" (borrado de BD).
 *
 * REGLA 1: Si el usuario afectado ES el usuario de esta sesión → cerrar sesión forzada.
 * REGLA 2: Si el usuario afectado es un médico → quitar su card del DOM.
 */
function _manejarUsuarioInaccesible(data, motivo) {
    // ── Leer sesión exactamente como auth.js la guarda ────────────────────────
    // auth.js usa sessionStorage con claves sueltas: 'usuario', 'rol', 'jwt_token'
    let miId      = '';
    let miUsuario = sessionStorage.getItem('usuario') || '';

    // Extraer user_id del JWT directamente (auth.js no guarda el ID por separado)
    try {
        const token = sessionStorage.getItem('jwt_token');
        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            miId      = String(payload.user_id || '');
            // Reforzar usuario desde el token también
            if (!miUsuario) miUsuario = String(payload.usuario || '');
        }
    } catch (e) {
        console.warn('[Socket] No se pudo decodificar el token JWT:', e);
    }

    console.log(`[Socket:${motivo}] Afectado  → id="${data.usuario_id}" usuario="${data.usuario}"`);
    console.log(`[Socket:${motivo}] Mi sesión → id="${miId}" usuario="${miUsuario}"`);

    const esEsteUsuario =
        (miId      && String(data.usuario_id) === miId)      ||
        (miUsuario && String(data.usuario)    === miUsuario);

    if (esEsteUsuario) {
        console.warn(`⚠️ Esta sesión fue ${motivo}. Forzando cierre...`);
        _forzarCierreSesion(motivo);
        return;
    }

    // ── No es este usuario: manejar si era médico ─────────────────────────────
    if (data.rol === 'medico') {
        medicosData = medicosData.filter(m => String(m.id) !== String(data.usuario_id));

        const card = document.querySelector(`.medico-card[data-medico-id="${data.usuario_id}"]`);
        if (card) card.remove();

        const medicoIdActual = document.getElementById('medicoId')?.value;
        if (medicoIdActual === String(data.usuario_id)) cerrarModal();

        const grid = document.querySelector('.medicos-grid');
        if (grid && grid.children.length === 0) {
            document.getElementById('medicosContainer').innerHTML = `
                <div class="empty-state">
                    <h3>😕 No hay médicos disponibles</h3>
                    <p>Debes crear médicos desde el panel de administrador</p>
                </div>`;
        }
        mostrarToastRegistro(`🗑️ Médico "${data.nombre || data.usuario}" fue dado de baja`);
    }
}
/**
 * Cierra sesión forzada cuando el usuario fue desactivado o eliminado.
 * Muestra una pantalla de bloqueo antes de redirigir.
 */
function _forzarCierreSesion(motivo) {
    // Limpiar exactamente lo que auth.js guarda
    const role = sessionStorage.getItem('jwt_role');
    if (role) localStorage.removeItem(`jwt_token_${role}`);

    sessionStorage.removeItem('jwt_token');
    sessionStorage.removeItem('jwt_role');
    sessionStorage.removeItem('usuario');
    sessionStorage.removeItem('rol');
    sessionStorage.removeItem('nombre_completo');

    const mensajes = {
        desactivado: {
            titulo: '🔒 Acceso suspendido',
            cuerpo: 'Tu cuenta ha sido movida a la papelera por un administrador.',
            sub:    'Contacta al administrador si crees que es un error.',
            color:  '#f59e0b',
        },
        eliminado: {
            titulo: '❌ Cuenta eliminada',
            cuerpo: 'Tu cuenta ha sido eliminada del sistema.',
            sub:    'Solicita una nueva cuenta al administrador.',
            color:  '#dc2626',
        }
    };
    const msg = mensajes[motivo] || mensajes['desactivado'];

    document.body.innerHTML = `
        <div style="position:fixed;inset:0;background:#0f172a;display:flex;flex-direction:column;
                    align-items:center;justify-content:center;z-index:99999;
                    font-family:system-ui,sans-serif;text-align:center;padding:32px;">
            <div style="background:#1e293b;border:2px solid ${msg.color};border-radius:16px;
                        padding:48px 40px;max-width:440px;width:100%;
                        box-shadow:0 25px 50px rgba(0,0,0,0.5);">
                <div style="font-size:3.5rem;margin-bottom:16px">${msg.titulo.split(' ')[0]}</div>
                <h2 style="color:${msg.color};font-size:1.4rem;margin:0 0 16px">
                    ${msg.titulo.substring(2)}
                </h2>
                <p style="color:#cbd5e1;font-size:1rem;margin:0 0 10px;line-height:1.6">${msg.cuerpo}</p>
                <p style="color:#64748b;font-size:0.85rem;margin:0 0 32px">${msg.sub}</p>
                <button onclick="location.href='/'"
                    style="background:${msg.color};color:#fff;border:none;padding:12px 32px;
                           border-radius:8px;cursor:pointer;font-size:1rem;font-weight:600;width:100%">
                    Ir al inicio de sesión
                </button>
            </div>
        </div>`;

    setTimeout(() => { location.href = '/'; }, 5000);
}
// ==================== TOAST ====================

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

// ==================== SESIÓN ====================

async function verificarSesion() {
    const sessionData = await Auth.verificarSesion('registro');
    if (!sessionData) return;

    const nombreCompleto = sessionData.nombre_completo || sessionData.usuario || 'Usuario';
    const userNameEl     = document.getElementById('userName');
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

// ==================== MÉDICOS ====================

async function cargarMedicos() {
    try {
        const container = document.getElementById('medicosContainer');
        const response  = await Auth.fetch('/api/medicos', { method: 'GET' });
        const data      = await response.json();

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

function crearCardMedico(medico) {
    const nombreDisplay = medico.nombre_completo;
    return `
        <div class="medico-card"
             data-medico-id="${medico.id}"
             data-medico-nombre="${nombreDisplay.replace(/"/g, '&quot;')}">
            <div class="medico-avatar-grande">${medico.inicial}</div>
            <h3>${nombreDisplay}</h3>
            <p>👨‍⚕️ Médico</p>
            <div class="medico-card-footer">Haz clic para registrar paciente</div>
        </div>`;
}

// ==================== MODAL ====================

function abrirModal(medicoId, medicoNombre) {
    const modal        = document.getElementById('registroModal');
    const modalMessage = document.getElementById('modalMessage');
    modalMessage.innerHTML = '';

    const form = document.getElementById('registroForm');
    if (form) { form.reset(); form.style.display = 'block'; }

    document.getElementById('medicoId').value     = medicoId;
    document.getElementById('medicoNombre').value = medicoNombre;

    const btn = document.getElementById('btnRegistrar');
    if (btn) { btn.disabled = false; btn.textContent = 'Registrar Paciente'; }

    modal.classList.add('active');
}

function cerrarModal() {
    const modal = document.getElementById('registroModal');
    modal.classList.remove('active');

    const form = document.getElementById('registroForm');
    if (form) { form.reset(); form.style.display = 'block'; }

    const modalMessage = document.getElementById('modalMessage');
    if (modalMessage) modalMessage.innerHTML = '';
}

document.addEventListener('click', (e) => {
    const modal = document.getElementById('registroModal');
    if (modal && e.target === modal) { cerrarModal(); return; }

    const card = e.target.closest('.medico-card[data-medico-id]');
    if (card) {
        abrirModal(card.dataset.medicoId, card.dataset.medicoNombre);
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
        const medicoId = document.getElementById('medicoId').value;
        const nombre   = document.getElementById('pacienteNombre').value.trim();
        const motivo   = document.getElementById('pacienteMotivo').value;

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
            body:   JSON.stringify({ nombre, apellido: '', documento: '', medico_id: medicoId, motivo })
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

        document.getElementById('registroForm').style.display = 'none';

        const esReimpresion = data.tipo === 'reimpresion';
        const bannerColor   = esReimpresion ? '#fff3cd' : '#d4edda';
        const bannerBorder  = esReimpresion ? '#ffc107' : '#28a745';
        const bannerText    = esReimpresion ? '#856404' : '#155724';
        const bannerIcono   = esReimpresion ? '♻️' : '✅';
        const bannerTitulo  = esReimpresion ? '¡Turno re-generado!' : '¡Paciente registrado exitosamente!';

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