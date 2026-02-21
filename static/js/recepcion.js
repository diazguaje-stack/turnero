/**
 * recepcion.js - Página de recepción
 * Requiere: auth.js cargado antes en el HTML
 *
 * CAMBIOS:
 *  - Auto-refresco cada 15 segundos para detectar códigos de turno
 *    actualizados (re-registros).
 *  - Cuando un código cambia en pantalla, se resalta visualmente
 *    para que el recepcionista lo note.
 *  - La lista de pacientes eliminados (localmente) se mantiene
 *    pero el "eliminar" ahora hace soft-delete en el servidor
 *    (cancela el turno activo), no borra el registro.
 */

// ── Estado global ────────────────────────────────────────────
let pacientesData       = {};   // { medico_id: medicoObj }
let papelera = [];   // IDs de pacientes ocultos localmente
let codigosAnteriores   = {};   // { paciente_id: codigo_turno } → detectar cambios
let intervaloRefresco   = null;
// ── Constantes ───────────────────────────────────────────────
const INTERVALO_REFRESCO_MS = 15_000;   // 15 segundos

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', () => {
    verificarSesion();
    
    cargarPacientes();
    cargarPapelera();

    // Auto-refresco para detectar re-registros
    intervaloRefresco = setInterval(cargarPacientes, INTERVALO_REFRESCO_MS);
});

// Limpiar intervalo si el usuario abandona la página
window.addEventListener('beforeunload', () => {
    if (intervaloRefresco) clearInterval(intervaloRefresco);
});

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
            // Solo mostrar error si el contenedor está vacío (primer carga)
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

        // ── Detectar códigos que cambiaron (re-registros) ──────────
        const codigosNuevos = {};   // { paciente_id: codigo_turno }
        data.medicos.forEach(medico => {
            (medico.pacientes || []).forEach(p => {
                codigosNuevos[p.id] = p.codigo;
            });
        });

        const cambios = {};   // { paciente_id: { anterior, nuevo } }
        Object.entries(codigosNuevos).forEach(([pid, codigoNuevo]) => {
            const codigoAnterior = codigosAnteriores[pid];
            if (codigoAnterior && codigoAnterior !== codigoNuevo) {
                cambios[pid] = { anterior: codigoAnterior, nuevo: codigoNuevo };
                console.log(`♻️  Código actualizado para paciente ${pid}: ${codigoAnterior} → ${codigoNuevo}`);
            }
        });

        // Guardar snapshot actual de códigos
        codigosAnteriores = codigosNuevos;

        // Actualizar estado global
        pacientesData = {};
        data.medicos.forEach(m => { pacientesData[m.id] = m; });

        // Renderizar (pasando los cambios detectados para resaltarlos)
        renderizarMedicos(data.medicos, cambios);

        if (Object.keys(cambios).length > 0) {
            mostrarNotificacionCambio(cambios);
        }

        console.log(`🔄 ${data.total_medicos} médicos / ${Object.keys(codigosNuevos).length} pacientes activos`);

    } catch (error) {
        console.error('Error al cargar pacientes:', error);
        // No mostrar error en cada tick de refresco
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

        // Estilo especial si este paciente tuvo un re-registro
        const estiloFila     = cambiado ? 'border-left: 4px solid #ffc107; background: #fffbf0;' : '';
        const badgeReimpresion = cambiado
            ? `<span style="
                background:#ffc107;color:#333;
                font-size:0.72em;font-weight:bold;
                padding:2px 7px;border-radius:10px;
                margin-left:6px;">
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

function retirarPaciente(pacienteId, medicoId) {

    const medico = pacientesData[medicoId];
    if (!medico) return;

    const paciente = medico.pacientes.find(p => p.id == pacienteId);
    if (!paciente) return;

    // Agregar a papelera
    papelera.push({
        id: paciente.id,
        nombre: paciente.nombre,
        codigo: paciente.codigo,
        medicoId: medicoId
    });

    localStorage.setItem('papelera', JSON.stringify(papelera));

    // Quitar visualmente
    const row = document.getElementById(`paciente-row-${pacienteId}`);
    if (row) row.remove();

    console.log("📦 Movido a papelera:", paciente.codigo);
}

function cargarPapelera() {
    const guardado = localStorage.getItem('papelera');
    if (guardado) {
        papelera = JSON.parse(guardado);
    }
}

function abrirPapelera() {

    const modal = document.getElementById('papeleraModal');
    const body  = document.getElementById('papeleraBody');

    if (!papelera.length) {
        body.innerHTML = "<p>No hay códigos en la papelera</p>";
    } else {
        body.innerHTML = papelera.map(p => `
            <div class="papelera-item">
                <span>🎫 ${p.codigo} - ${p.nombre}</span>
                <div>
                    <button onclick="restaurarPaciente('${p.id}')">Restaurar</button>
                    <button onclick="eliminarDefinitivo('${p.id}')">Eliminar</button>
                </div>
            </div>
        `).join('');
    }

    modal.style.display = "flex";
}

function restaurarPaciente(pacienteId) {

    papelera = papelera.filter(p => p.id != pacienteId);
    localStorage.setItem('papelera', JSON.stringify(papelera));

    cerrarPapelera();
    cargarPacientes(); // vuelve a renderizar
}

async function eliminarDefinitivo(pacienteId) {

    if (!confirm("¿Eliminar definitivamente este código?")) return;

    try {
        const response = await Auth.fetch(`/api/recepcion/paciente/${pacienteId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok && data.success) {

            papelera = papelera.filter(p => p.id != pacienteId);
            localStorage.setItem('papelera', JSON.stringify(papelera));

            abrirPapelera();

            console.log("🗑️ Eliminado definitivamente");
        } else {
            alert(data.message || "Error al eliminar");
        }

    } catch (error) {
        alert("Error de conexión");
    }
}

function cerrarPapelera() {
    document.getElementById('papeleraModal').style.display = "none";
}

async function vaciarPapelera() {

    if (!confirm("¿Eliminar todos definitivamente?")) return;

    for (let p of papelera) {
        await Auth.fetch(`/api/recepcion/paciente/${p.id}`, {
            method: 'DELETE'
        });
    }

    papelera = [];
    localStorage.removeItem('papelera');

    abrirPapelera();
}
// ==================== NOTIFICACIÓN VISUAL DE CAMBIO ====================

function mostrarNotificacionCambio(cambios) {
    const n = Object.keys(cambios).length;
    const msg = n === 1
        ? `♻️ 1 paciente re-registró su turno. El código fue actualizado.`
        : `♻️ ${n} pacientes re-registraron su turno. Códigos actualizados.`;

    // Toast simple en la parte superior
    let toast = document.getElementById('toastCambio');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastCambio';
        toast.style.cssText = `
            position: fixed; top: 16px; right: 16px; z-index: 9999;
            background: #fff3cd; color: #856404;
            border: 1px solid #ffc107; border-radius: 8px;
            padding: 12px 20px; font-size: 0.9em; font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: opacity 0.4s ease;
        `;
        document.body.appendChild(toast);
    }

    toast.textContent = msg;
    toast.style.opacity = '1';

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.style.opacity = '0';
    }, 5000);
}

// ==================== BUSCAR PACIENTE POR CÓDIGO ====================

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
                        <strong style="color:#1565c0">${p.codigo || '—'}</strong>
                    </p>
                    <p><strong>🔖 Código paciente:</strong> ${p.codigo_paciente || '—'}</p>
                    <p><strong>📋 Motivo:</strong> ${p.motivo || '—'}</p>
                    <p><strong>👨‍⚕️ Médico:</strong> ${p.medico || '—'}</p>
                </div>`;
        }

    } catch (error) {
        console.error('Error en búsqueda:', error);
        if (resultEl) resultEl.innerHTML = '<p style="color:#dc3545">❌ Error de conexión</p>';
    }
}

// ==================== HELPERS DE UI ====================

function mostrarErrorEnContenedor(containerId, mensaje) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>❌ Error</h3>
                <p>${mensaje}</p>
            </div>`;
    }
}

function mostrarEmptyState(containerId, mensaje) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>😕 Sin datos</h3>
                <p>${mensaje}</p>
            </div>`;
    }
}