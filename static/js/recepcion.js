/**
 * recepcion.js - Página de recepción
 * Requiere: auth.js cargado antes en el HTML
 * Requiere: socket.io cargado antes en el HTML
 *
 * Actualización en tiempo real vía WebSocket:
 * - Cuando registro genera un código, recepción lo recibe INMEDIATAMENTE
 * - El intervalo de 15s sigue como respaldo (fallback)
 */

// ── Estado global ─────────────────────────────────────────
let pacientesData     = {};
let papelera          = [];
let codigosAnteriores = {};
let intervaloRefresco = null;
let socket            = null;

const INTERVALO_REFRESCO_MS = 15_000;

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', () => {
    verificarSesion();
    cargarPacientes();
    cargarPapelera();
    conectarSocket();

    // Fallback: refresco cada 15s por si el socket falla
    intervaloRefresco = setInterval(cargarPacientes, INTERVALO_REFRESCO_MS);
});

window.addEventListener('beforeunload', () => {
    if (intervaloRefresco) clearInterval(intervaloRefresco);
    if (socket) socket.disconnect();
});

// ==================== WEBSOCKET ====================

function conectarSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('🔌 Socket conectado:', socket.id);
        // Unirse a la sala de recepción para recibir eventos
        socket.emit('join', { room: 'recepcion' });
    });

    socket.on('joined', (data) => {
        console.log('✅ Unido a sala:', data.room);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Socket desconectado — usando fallback de 15s');
    });

    // ── Evento principal: nuevo código generado en registro ──
    socket.on('nuevo_codigo', (data) => {
        console.log('📨 Evento nuevo_codigo recibido:', data);

        if (data.tipo === 'nuevo') {
            // Paciente nuevo → agregar directamente sin recargar todo
            agregarPacienteEnTiempoReal(data);
        } else if (data.tipo === 'reimpresion') {
            // Re-registro → actualizar código existente
            actualizarCodigoEnTiempoReal(data);
        }
    });
}

// ── Agregar paciente nuevo sin recargar la página ──────────
function agregarPacienteEnTiempoReal(data) {
    const medicoId   = data.paciente.medico_id;
    const listaEl    = document.getElementById(`pacientes-${medicoId}`);

    if (!listaEl) {
        // El médico no está renderizado aún → recargar todo
        cargarPacientes();
        return;
    }

    // Quitar mensaje "No hay pacientes" si existe
    const noHay = listaEl.querySelector('.no-pacientes');
    if (noHay) noHay.remove();

    // Crear fila del nuevo paciente con animación
    const nuevaFila = document.createElement('div');
    nuevaFila.className  = 'paciente-item nuevo-ingreso';
    nuevaFila.id         = `paciente-row-${data.paciente.id}`;
    nuevaFila.innerHTML  = `
        <div class="paciente-info">
            <span class="paciente-nombre">👤 ${data.paciente.nombre}</span>
            <span class="paciente-codigo">
                🎫 <strong>${data.codigo_turno}</strong>
                <span style="background:#28a745;color:#fff;
                             font-size:0.72em;font-weight:bold;
                             padding:2px 7px;border-radius:10px;margin-left:6px;">
                    🆕 NUEVO
                </span>
            </span>
            <span class="paciente-motivo">📋 ${data.paciente.motivo || '—'}</span>
        </div>
        <button class="btn btn-danger btn-sm"
                onclick="retirarPaciente('${data.paciente.id}', '${medicoId}')">
            🗑️ Retirar
        </button>`;

    listaEl.appendChild(nuevaFila);

    // Actualizar estado global
    if (pacientesData[medicoId]) {
        pacientesData[medicoId].pacientes.push({
            id:     data.paciente.id,
            nombre: data.paciente.nombre,
            codigo: data.codigo_turno,
            motivo: data.paciente.motivo
        });
    }

    // Actualizar badge de contador
    actualizarBadgeContador(medicoId);

    // Animación de entrada + toast
    setTimeout(() => nuevaFila.classList.remove('nuevo-ingreso'), 3000);
    mostrarToast(`🆕 Nuevo paciente: ${data.paciente.nombre} — ${data.codigo_turno}`, 'nuevo');

    console.log(`✅ Paciente agregado en tiempo real: ${data.codigo_turno}`);
}

// ── Actualizar código de paciente re-registrado ────────────
function actualizarCodigoEnTiempoReal(data) {
    const pacienteId = data.paciente.id;
    const filaEl     = document.getElementById(`paciente-row-${pacienteId}`);

    if (!filaEl) {
        // No está visible aún → recargar
        cargarPacientes();
        return;
    }

    // Resaltar fila con nuevo código
    filaEl.style.borderLeft  = '4px solid #ffc107';
    filaEl.style.background  = '#fffbf0';

    const codigoEl = filaEl.querySelector('.paciente-codigo');
    if (codigoEl) {
        codigoEl.innerHTML = `
            🎫 <strong>${data.codigo_turno}</strong>
            <span style="background:#ffc107;color:#333;
                         font-size:0.72em;font-weight:bold;
                         padding:2px 7px;border-radius:10px;margin-left:6px;">
                ♻️ NUEVO CÓDIGO
            </span>
            <br>
            <span style="font-size:0.78em;color:#856404;">
                Anterior: <s>${data.codigo_anterior || '—'}</s>
            </span>`;
    }

    // Actualizar estado global
    const medicoId = data.paciente.medico_id;
    if (pacientesData[medicoId]) {
        const p = pacientesData[medicoId].pacientes.find(x => x.id === pacienteId);
        if (p) p.codigo = data.codigo_turno;
    }
    codigosAnteriores[pacienteId] = data.codigo_turno;

    mostrarToast(`♻️ Código actualizado: ${data.paciente.nombre} → ${data.codigo_turno}`, 'reimpresion');

    console.log(`♻️ Código actualizado en tiempo real: ${data.codigo_anterior} → ${data.codigo_turno}`);
}

// ── Actualizar badge de contador del médico ────────────────
function actualizarBadgeContador(medicoId) {
    const listaEl = document.getElementById(`pacientes-${medicoId}`);
    if (!listaEl) return;

    const total   = listaEl.querySelectorAll('.paciente-item').length;
    const badgeEl = listaEl.closest('.medico-card')?.querySelector('.badge');
    if (badgeEl) badgeEl.textContent = `${total} paciente(s)`;
}

// ==================== VERIFICAR SESIÓN ====================

async function verificarSesion() {
    const sessionData = await Auth.verificarSesion('recepcion');
    if (!sessionData) return;

    const nombreCompleto = sessionData.nombre_completo || sessionData.usuario || 'Usuario';

    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = nombreCompleto;

    const userAvatarEl = document.getElementById('userAvatar');
    if (userAvatarEl) userAvatarEl.textContent = nombreCompleto.charAt(0).toUpperCase();

    console.log(`✅ Recepción lista para: ${nombreCompleto}`);
}

function logout() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        if (intervaloRefresco) clearInterval(intervaloRefresco);
        Auth.logout();
    }
}

// ==================== CARGAR / REFRESCO ====================

function filtrarPacientesEliminados(pacientes) {
    if (!pacientes || !papelera.length) return pacientes;
    return pacientes.filter(p => !papelera.some(x => x.id == p.id));
}

async function cargarPacientes() {
    try {
        const response = await Auth.fetch('/api/recepcion/pacientes', { method: 'GET' });
        const data     = await response.json();

        if (!response.ok) {
            console.error('Error al cargar pacientes:', data.message);
            const container = document.getElementById('medicosContainer');
            if (container && !container.querySelector('.medico-card')) {
                mostrarErrorEnContenedor('medicosContainer', data.message || 'Error al cargar pacientes');
            }
            return;
        }

        if (!data.medicos || data.medicos.length === 0) {
            mostrarEmptyState('medicosContainer', 'No hay médicos con pacientes registrados');
            pacientesData = {};
            return;
        }

        const codigosNuevos = {};
        data.medicos.forEach(medico => {
            (medico.pacientes || []).forEach(p => {
                codigosNuevos[p.id] = p.codigo;
            });
        });

        const cambios = {};
        Object.entries(codigosNuevos).forEach(([pid, codigoNuevo]) => {
            const codigoAnterior = codigosAnteriores[pid];
            if (codigoAnterior && codigoAnterior !== codigoNuevo) {
                cambios[pid] = { anterior: codigoAnterior, nuevo: codigoNuevo };
            }
        });

        codigosAnteriores = codigosNuevos;

        pacientesData = {};
        data.medicos.forEach(m => { pacientesData[m.id] = m; });

        renderizarMedicos(data.medicos, cambios);

        if (Object.keys(cambios).length > 0) {
            mostrarNotificacionCambio(cambios);
        }

    } catch (error) {
        console.error('Error al cargar pacientes:', error);
    }
}

// ==================== RENDERIZAR MÉDICOS ====================

function renderizarMedicos(medicos, cambios = {}) {
    const container = document.getElementById('medicosContainer');
    if (!container) return;

    if (!medicos || medicos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>😕 Sin médicos</h3>
                <p>No hay médicos con pacientes registrados</p>
            </div>`;
        return;
    }

    const html = medicos.map(medico => {
        const pacientesFiltrados = filtrarPacientesEliminados(medico.pacientes || []);
        return `
            <div class="medico-card">
                <div class="medico-header">
                    <div class="medico-avatar">${medico.inicial || medico.nombre[0].toUpperCase()}</div>
                    <div>
                        <h3>${medico.nombre}</h3>
                        <span class="badge">${pacientesFiltrados.length} paciente(s)</span>
                    </div>
                </div>
                <div class="pacientes-list" id="pacientes-${medico.id}">
                    ${renderizarPacientes(pacientesFiltrados, medico.id, cambios)}
                </div>
            </div>`;
    }).join('');

    container.innerHTML = html;
}

function renderizarPacientes(pacientes, medicoId, cambios = {}) {
    if (!pacientes || pacientes.length === 0) {
        return '<p class="no-pacientes">No hay pacientes pendientes</p>';
    }

    return pacientes.map(p => {
        const cambiado = cambios[p.id];
        const estiloFila = cambiado ? 'border-left: 4px solid #ffc107; background: #fffbf0;' : '';
        const badgeReimpresion = cambiado
            ? `<span style="background:#ffc107;color:#333;font-size:0.72em;font-weight:bold;
                            padding:2px 7px;border-radius:10px;margin-left:6px;">
                ♻️ NUEVO CÓDIGO
               </span>`
            : '';

        return `
        <div class="paciente-item" id="paciente-row-${p.id}" style="${estiloFila}">
            <div class="paciente-info">
                <span class="paciente-nombre">👤 ${p.nombre}</span>
                <span class="paciente-codigo">
                    🎫 <strong>${p.codigo || '—'}</strong>
                    ${badgeReimpresion}
                </span>
                <span class="paciente-motivo">📋 ${p.motivo || '—'}</span>
                ${cambiado ? `<span style="font-size:0.78em;color:#856404;">
                    Código anterior: <s>${cambiado.anterior}</s>
                </span>` : ''}
            </div>
            <button class="btn btn-danger btn-sm"
                    onclick="retirarPaciente('${p.id}', '${medicoId}')">
                🗑️ Retirar
            </button>
        </div>`;
    }).join('');
}

// ==================== PAPELERA ====================

function retirarPaciente(pacienteId, medicoId) {
    const medico = pacientesData[medicoId];
    if (!medico) return;

    const paciente = medico.pacientes.find(p => p.id == pacienteId);
    if (!paciente) return;

    papelera.push({
        id: paciente.id, nombre: paciente.nombre,
        codigo: paciente.codigo, medicoId: medicoId
    });
    localStorage.setItem('papelera', JSON.stringify(papelera));

    const row = document.getElementById(`paciente-row-${pacienteId}`);
    if (row) row.remove();

    actualizarBadgeContador(medicoId);
}

function cargarPapelera() {
    const guardado = localStorage.getItem('papelera');
    if (guardado) papelera = JSON.parse(guardado);
}

function abrirPapelera() {
    const modal = document.getElementById('papeleraModal');
    const body  = document.getElementById('papeleraBody');

    body.innerHTML = !papelera.length
        ? '<p>No hay códigos en la papelera</p>'
        : papelera.map(p => `
            <div class="papelera-item">
                <span>🎫 ${p.codigo} - ${p.nombre}</span>
                <div>
                    <button onclick="restaurarPaciente('${p.id}')">Restaurar</button>
                    <button onclick="eliminarDefinitivo('${p.id}')">Eliminar</button>
                </div>
            </div>`).join('');

    modal.style.display = 'flex';
}

function restaurarPaciente(pacienteId) {
    papelera = papelera.filter(p => p.id != pacienteId);
    localStorage.setItem('papelera', JSON.stringify(papelera));
    cerrarPapelera();
    cargarPacientes();
}

async function eliminarDefinitivo(pacienteId) {
    if (!confirm('¿Eliminar definitivamente este código?')) return;
    try {
        const response = await Auth.fetch(`/api/recepcion/paciente/${pacienteId}`, { method: 'DELETE' });
        const data     = await response.json();
        if (response.ok && data.success) {
            papelera = papelera.filter(p => p.id != pacienteId);
            localStorage.setItem('papelera', JSON.stringify(papelera));
            abrirPapelera();
        } else {
            alert(data.message || 'Error al eliminar');
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

function cerrarPapelera() {
    document.getElementById('papeleraModal').style.display = 'none';
}

async function vaciarPapelera() {
    if (!confirm('¿Eliminar todos definitivamente?')) return;
    for (let p of papelera) {
        await Auth.fetch(`/api/recepcion/paciente/${p.id}`, { method: 'DELETE' });
    }
    papelera = [];
    localStorage.removeItem('papelera');
    abrirPapelera();
}

// ==================== BUSCAR PACIENTE ====================

async function buscarPaciente() {
    const input    = document.getElementById('buscarCodigo');
    const codigo   = input ? input.value.trim() : '';
    const resultEl = document.getElementById('resultadoBusqueda');

    if (!codigo) {
        if (resultEl) resultEl.innerHTML = '<p style="color:#dc3545">Ingresa un código para buscar</p>';
        return;
    }

    try {
        const response = await Auth.fetch(`/api/recepcion/paciente/${codigo}`, { method: 'GET' });
        const data     = await response.json();

        if (!response.ok || !data.success) {
            if (resultEl) resultEl.innerHTML =
                `<p style="color:#dc3545">❌ ${data.message || 'Paciente no encontrado'}</p>`;
            return;
        }

        const p = data.paciente;
        if (resultEl) {
            resultEl.innerHTML = `
                <div class="paciente-resultado">
                    <p><strong>👤 Nombre:</strong> ${p.nombre_completo || p.nombre}</p>
                    <p><strong>🎫 Código de turno activo:</strong>
                        <strong style="color:#1565c0">${p.codigo || '—'}</strong></p>
                    <p><strong>🔖 Código paciente:</strong> ${p.codigo_paciente || '—'}</p>
                    <p><strong>📋 Motivo:</strong> ${p.motivo || '—'}</p>
                    <p><strong>👨‍⚕️ Médico:</strong> ${p.medico || '—'}</p>
                </div>`;
        }
    } catch (error) {
        if (resultEl) resultEl.innerHTML = '<p style="color:#dc3545">❌ Error de conexión</p>';
    }
}

// ==================== TOAST / NOTIFICACIONES ====================

function mostrarToast(msg, tipo = 'nuevo') {
    const colores = {
        nuevo:       { bg: '#d4edda', color: '#155724', border: '#28a745' },
        reimpresion: { bg: '#fff3cd', color: '#856404', border: '#ffc107' }
    };
    const c = colores[tipo] || colores.nuevo;

    let toast = document.getElementById('toastCambio');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastCambio';
        toast.style.cssText = `
            position:fixed;top:16px;right:16px;z-index:9999;
            border-radius:8px;padding:12px 20px;
            font-size:0.9em;font-weight:500;
            box-shadow:0 4px 12px rgba(0,0,0,0.15);
            transition:opacity 0.4s ease;max-width:320px;`;
        document.body.appendChild(toast);
    }

    toast.style.background  = c.bg;
    toast.style.color       = c.color;
    toast.style.border      = `1px solid ${c.border}`;
    toast.textContent       = msg;
    toast.style.opacity     = '1';

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 5000);
}

function mostrarNotificacionCambio(cambios) {
    const n   = Object.keys(cambios).length;
    const msg = n === 1
        ? '♻️ 1 paciente re-registró su turno.'
        : `♻️ ${n} pacientes re-registraron su turno.`;
    mostrarToast(msg, 'reimpresion');
}

// ==================== HELPERS ====================

function mostrarErrorEnContenedor(containerId, mensaje) {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = `
        <div class="empty-state"><h3>❌ Error</h3><p>${mensaje}</p></div>`;
}

function mostrarEmptyState(containerId, mensaje) {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = `
        <div class="empty-state"><h3>😕 Sin datos</h3><p>${mensaje}</p></div>`;
}