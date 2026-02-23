// ============================================================
// screen_turnos.js
// Responsabilidad: comunicación con recepcion.js
// Maneja: evento 'llamar_paciente', animaciones de turno
//
// DISEÑO:
// - NO crea su propio socket
// - Espera a window.getSocketScreen() que devuelve el socket
//   de screen_vinculacion.js SOLO cuando ya está en sala 'screen'
//   (después de recibir el evento 'joined' del backend)
// ============================================================

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

    // ── Evento principal: recepción llama a un paciente ──
    socket.on('llamar_paciente', (data) => {
        console.log('[TUR] 📢 llamar_paciente recibido:', data);

        const linkedState   = document.getElementById('linkedState');
        const estaVinculada = linkedState && linkedState.style.display !== 'none';

        if (estaVinculada) {
            mostrarTurnoLlamado(data.codigo, data.nombre);
        } else {
            // Pantalla aún en pendiente/conectando — guardar para después
            console.log('[TUR] Pantalla no activa aún, buffereando llamada...');
            window._llamadaPendiente = data;
        }
    });

    // ── Procesar llamada buffereada cuando linkedState se active ──
    const linkedState = document.getElementById('linkedState');
    if (linkedState) {
        new MutationObserver(() => {
            if (window._llamadaPendiente && linkedState.style.display !== 'none') {
                const p = window._llamadaPendiente;
                window._llamadaPendiente = null;
                console.log('[TUR] Procesando llamada buffereada:', p.codigo);
                mostrarTurnoLlamado(p.codigo, p.nombre);
            }
        }).observe(linkedState, { attributes: true, attributeFilter: ['style'] });
    }
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