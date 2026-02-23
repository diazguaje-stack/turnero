// ============================================================
// screen_turnos.js
// Responsabilidad: comunicación con recepcion.js
// Maneja: evento 'llamar_paciente', animaciones de turno, persistencia local
//
// DISEÑO:
// - NO crea su propio socket
// - Espera a window.getSocketScreen() que devuelve el socket
//   de screen_vinculacion.js SOLO cuando ya está en sala 'screen'
//   (después de recibir el evento 'joined' del backend)
// ============================================================

// =========================
// PERSISTENCIA LOCAL
// Definidas primero para que estén disponibles en todo el archivo
// =========================

const STORAGE_KEY = 'screen_ultimo_llamado';

function guardarUltimoLlamado(codigo, nombre) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ codigo, nombre }));
        console.log('[TUR] 💾 Guardado en localStorage:', codigo, nombre);
    } catch (e) {
        console.warn('[TUR] ⚠️ No se pudo guardar en localStorage:', e);
    }
}

function recuperarUltimoLlamado() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

// =========================
// INIT
// =========================

document.addEventListener('DOMContentLoaded', () => {
    console.log('[TUR] Iniciando módulo de turnos...');
    esperarSocketYRegistrar();
});

// =========================
// ESPERAR SOCKET LISTO
// Reintentar cada 100ms hasta que screen_vinculacion.js
// confirme que el socket está en sala 'screen'
// =========================

function esperarSocketYRegistrar() {
    const socket = window.getSocketScreen ? window.getSocketScreen() : null;
    if (socket) {
        registrarListeners(socket);
        console.log('[TUR] ✅ Socket obtenido y listeners registrados');
    } else {
        setTimeout(esperarSocketYRegistrar, 100);
    }
}

// =========================
// REGISTRAR LISTENERS
// =========================

function registrarListeners(socket) {

    socket.on('llamar_paciente', (data) => {
        guardarUltimoLlamado(data.codigo, data.nombre);
        const linkedState   = document.getElementById('linkedState');
        const estaVinculada = linkedState && linkedState.style.display !== 'none';
        if (estaVinculada) {
            mostrarTurnoLlamado(data.codigo, data.nombre);
        } else {
            window._llamadaPendiente = data;
        }
    });

    // ← AGREGAR ESTO: pedir al servidor al conectar
    socket.emit('pedir_ultimo_llamado');

    const linkedState = document.getElementById('linkedState');
    if (!linkedState) return;

    function intentarRestaurar() {
        if (linkedState.style.display === 'none') return;
        if (window._llamadaPendiente) {
            const p = window._llamadaPendiente;
            window._llamadaPendiente = null;
            mostrarTurnoLlamado(p.codigo, p.nombre);
            return;
        }
        const guardado = recuperarUltimoLlamado();
        if (guardado) {
            mostrarTurnoLlamado(guardado.codigo, guardado.nombre);
        }
    }

    new MutationObserver(intentarRestaurar)
        .observe(linkedState, { attributes: true, attributeFilter: ['style'] });

    setTimeout(intentarRestaurar, 200);
}
 
// =========================
// MOSTRAR TURNO LLAMADO
// =========================

function mostrarTurnoLlamado(codigo, nombre) {
    console.log(`[TUR] Mostrando: ${codigo} — ${nombre}`);

    const idleState   = document.getElementById('idleState');
    const turnoActivo = document.getElementById('turnoActivo');
    const turnoCodigo = document.getElementById('turnoCodigo');
    const turnoNombre = document.getElementById('turnoNombre');
    const turnoLabel  = document.getElementById('turnoLabel');
    const goldDivider = document.getElementById('goldDivider');

    if (!turnoActivo || !turnoCodigo) {
        console.warn('[TUR] ⚠️ Elementos del DOM no encontrados (#turnoActivo / #turnoCodigo)');
        return;
    }

    // Ocultar idle
    if (idleState) idleState.classList.add('hidden');

    // Mostrar contenedor
    turnoActivo.style.display = 'flex';

    // Resetear animaciones
    turnoCodigo.classList.remove('visible', 'llamando');
    if (turnoNombre) { turnoNombre.classList.remove('visible'); turnoNombre.textContent = nombre || ''; }
    if (turnoLabel)    turnoLabel.classList.remove('visible');
    if (goldDivider)   goldDivider.classList.remove('visible');

    // Contenido
    turnoCodigo.textContent = codigo || '—';

    // Stagger de animaciones
    requestAnimationFrame(() => {
        if (turnoLabel) turnoLabel.classList.add('visible');
        turnoCodigo.classList.add('visible');
        setTimeout(() => {
            turnoCodigo.classList.add('llamando');
            if (goldDivider) goldDivider.classList.add('visible');
        }, 150);
        setTimeout(() => {
            if (turnoNombre && nombre) turnoNombre.classList.add('visible');
        }, 350);
    });

    // Timestamp
    const tsEl = document.getElementById('ultimaActualizacion');
    if (tsEl) tsEl.textContent = new Date().toLocaleTimeString('es-ES', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    // Flash dot amarillo → verde
    const dot = document.getElementById('conexionDot');
    if (dot) {
        dot.style.background = '#facc15';
        dot.style.boxShadow  = '0 0 12px #facc15';
        setTimeout(() => {
            if (dot) { dot.style.background = '#22c55e'; dot.style.boxShadow = '0 0 8px #22c55e'; }
        }, 1000);
    }
}