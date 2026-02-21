/**
 * recepcion.js - Página de recepción
 * Requiere: auth.js cargado antes en el HTML
 */

// Variables globales
let pacientesData      = {};
let pacientesEliminados = [];

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', () => {
    verificarSesion();
    cargarPacientes();
    cargarEliminados();
});

// ==================== VERIFICAR SESIÓN ====================

async function verificarSesion() {
    const sessionData = await Auth.verificarSesion('recepcion');
    if (!sessionData) return;  // Auth redirige si falla

    const nombreCompleto = sessionData.nombre_completo || sessionData.usuario || 'Usuario';

    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = nombreCompleto;

    const userAvatarEl = document.getElementById('userAvatar');
    if (userAvatarEl) userAvatarEl.textContent = nombreCompleto.charAt(0).toUpperCase();

    console.log(`✅ Página de recepción lista para: ${nombreCompleto} (${sessionData.role || sessionData.rol})`);
}

function logout() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        Auth.logout();
    }
}

// ==================== CARGAR PACIENTES ====================

function filtrarPacientesEliminados(pacientes) {
    if (!pacientes || !pacientesEliminados.length) return pacientes;
    return pacientes.filter(p => !pacientesEliminados.includes(p.id));
}

async function cargarPacientes() {
    try {
        const response = await Auth.fetch('/api/recepcion/pacientes', { method: 'GET' });
        const data     = await response.json();

        if (!response.ok) {
            console.error('Error al cargar pacientes:', data.message);
            mostrarErrorEnContenedor('medicosContainer', data.message || 'Error al cargar pacientes');
            return;
        }

        pacientesData = {};

        if (!data.medicos || data.medicos.length === 0) {
            mostrarEmptyState('medicosContainer', 'No hay médicos con pacientes registrados');
            return;
        }

        data.medicos.forEach(medico => {
            pacientesData[medico.id] = medico;
        });

        renderizarMedicos(data.medicos);
        console.log(`✅ ${data.total_medicos} médicos cargados`);

    } catch (error) {
        console.error('Error al cargar pacientes:', error);
        mostrarErrorEnContenedor('medicosContainer', 'Error de conexión');
    }
}

async function cargarEliminados() {
    const guardados = localStorage.getItem('pacientes_eliminados');
    if (guardados) {
        try {
            pacientesEliminados = JSON.parse(guardados);
        } catch (_) {
            pacientesEliminados = [];
        }
    }
}

// ==================== RENDERIZAR MÉDICOS ====================

function renderizarMedicos(medicos) {
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
                    ${renderizarPacientes(pacientesFiltrados, medico.id)}
                </div>
            </div>`;
    }).join('');

    container.innerHTML = html;
}

function renderizarPacientes(pacientes, medicoId) {
    if (!pacientes || pacientes.length === 0) {
        return '<p class="no-pacientes">No hay pacientes pendientes</p>';
    }

    return pacientes.map(p => `
        <div class="paciente-item" id="paciente-row-${p.id}">
            <div class="paciente-info">
                <span class="paciente-nombre">👤 ${p.nombre}</span>
                <span class="paciente-codigo">🔖 ${p.codigo || '—'}</span>
                <span class="paciente-motivo">📋 ${p.motivo || '—'}</span>
            </div>
            <button class="btn btn-danger btn-sm" onclick="eliminarPaciente('${p.id}', '${medicoId}')">
                🗑️ Eliminar
            </button>
        </div>`).join('');
}

// ==================== ELIMINAR PACIENTE ====================

async function eliminarPaciente(pacienteId, medicoId) {
    if (!confirm('¿Eliminar este paciente de la lista?')) return;

    try {
        const response = await Auth.fetch(`/api/recepcion/paciente/${pacienteId}`, { method: 'DELETE' });
        const data     = await response.json();

        if (response.ok && data.success) {
            // Registrar eliminación localmente
            if (!pacientesEliminados.includes(pacienteId)) {
                pacientesEliminados.push(pacienteId);
                localStorage.setItem('pacientes_eliminados', JSON.stringify(pacientesEliminados));
            }

            // Eliminar del DOM
            const row = document.getElementById(`paciente-row-${pacienteId}`);
            if (row) row.remove();

            console.log(`✅ Paciente ${pacienteId} eliminado`);
        } else {
            alert(data.message || 'Error al eliminar paciente');
        }

    } catch (error) {
        console.error('Error al eliminar:', error);
        alert('Error de conexión al eliminar paciente');
    }
}

// ==================== BUSCAR PACIENTE POR CÓDIGO ====================

async function buscarPaciente() {
    const input   = document.getElementById('buscarCodigo');
    const codigo  = input ? input.value.trim() : '';
    const resultEl = document.getElementById('resultadoBusqueda');

    if (!codigo) {
        if (resultEl) resultEl.innerHTML = '<p style="color:#dc3545">Ingresa un código para buscar</p>';
        return;
    }

    try {
        const response = await Auth.fetch(`/api/recepcion/paciente/${codigo}`, { method: 'GET' });
        const data     = await response.json();

        if (!response.ok || !data.success) {
            if (resultEl) resultEl.innerHTML = `<p style="color:#dc3545">❌ ${data.message || 'Paciente no encontrado'}</p>`;
            return;
        }

        const p = data.paciente;
        if (resultEl) {
            resultEl.innerHTML = `
                <div class="paciente-resultado">
                    <p><strong>👤 Nombre:</strong> ${p.nombre_completo || p.nombre}</p>
                    <p><strong>🔖 Código:</strong> ${p.codigo}</p>
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