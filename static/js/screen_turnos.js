// ============================================================
// screen_turnos.js
// - Turno actual → panel izquierdo
// - Historial de llamados → panel derecho
// - Text-to-Speech: via servidor gTTS (MP3) — compatible Smart TV y Android
// ============================================================

const STORAGE_KEY         = 'screen_ultimo_llamado';
const STORAGE_HISTORY_KEY = 'screen_historial_llamados';

// =========================
// PERSISTENCIA LOCAL
// =========================

function guardarUltimoLlamado(codigo, nombre) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ codigo, nombre }));
    } catch (e) {
        console.warn('[TUR] ⚠️ No se pudo guardar en localStorage:', e);
    }
}

function recuperarUltimoLlamado() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

function guardarHistorial(h) {
    try { localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(h)); } catch (e) {}
}

function recuperarHistorial() {
    try {
        const data = localStorage.getItem(STORAGE_HISTORY_KEY);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

// =========================
// TEXT-TO-SPEECH — via servidor gTTS (MP3)
// Compatible con Smart TV, Android, iOS, PC
// =========================

let _audioEl            = null;   // elemento <audio> reutilizable
let _audioDesbloqueado  = false;  // true tras primer tap del usuario

function _getAudio() {
    if (!_audioEl) {
        _audioEl         = new Audio();
        _audioEl.preload = 'auto';
    }
    return _audioEl;
}

/**
 * Desbloquea el contexto de audio en el primer tap/click.
 * Android y algunos Smart TVs bloquean autoplay sin interacción previa.
 */
function _desbloquearAudio() {
    if (_audioDesbloqueado) return;
    _audioDesbloqueado = true;
    console.log('[TTS] 🔓 Audio desbloqueado por interacción del usuario');

    // Reproducir silencio para "despertar" el contexto de audio del navegador
    const audio = _getAudio();
    audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
    audio.play().catch(() => {});

    // Si había un audio pendiente por autoplay bloqueado, reproducirlo ahora
    if (window._audioPendiente) {
        window._audioPendiente.play().catch(() => {});
        window._audioPendiente = null;
    }
}

/**
 * Formatea el código para que se lea letra por letra.
 * "A-C-001" → "A, C, 1"
 */
function formatearCodigoParaVoz(codigo) {
    if (!codigo) return '';
    return codigo
        .split(/[-_]/)
        .map(parte => {
            if (/^[A-Za-z]+$/.test(parte)) return parte.split('').join(' ');
            if (/^\d+$/.test(parte))        return parseInt(parte, 10).toString();
            return parte;
        })
        .join(', ');
}

/**
 * Construye el texto del anuncio, solicita MP3 al servidor y lo reproduce.
 */
async function anunciarTurno(nombre, codigo, recepcion) {
    const codigoHablado = formatearCodigoParaVoz(codigo);
    const numRecepcion  = recepcion
        ? String(recepcion).replace(/recepci[oó]n\s*/i, '').trim()
        : null;

    let texto = '';
    if (nombre && nombre.trim()) texto += `Paciente ${nombre}. `;
    texto += `Código ${codigoHablado}. `;
    if (numRecepcion)              texto += `Diríjase a recepción ${numRecepcion}.`;

    console.log('[TTS] 🔊 Solicitando audio:', texto);

    try {
        const res  = await fetch('/api/tts', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ texto })
        });
        const data = await res.json();

        if (!data.success) {
            console.warn('[TTS] ❌ Error del servidor:', data.message);
            return;
        }

        const audio = _getAudio();
        audio.src    = data.url + '?t=' + Date.now(); // evitar cache del navegador
        audio.volume = 1.0;

        const playPromise = audio.play();
        if (playPromise) {
            playPromise
                .then(() => console.log('[TTS] ✅ Audio reproduciéndose'))
                .catch(err => {
                    console.warn('[TTS] ⚠️ Autoplay bloqueado, esperando interacción:', err.message);
                    window._audioPendiente = audio;
                });
        }

    } catch (err) {
        console.error('[TTS] ❌ Error al obtener audio del servidor:', err);
    }
}

// =========================
// HISTORIAL EN PANEL DERECHO
// =========================

let historial = recuperarHistorial();

function agregarAlHistorial(codigo, nombre) {
    const entrada = {
        codigo,
        nombre: nombre || '',
        hora:   new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    };

    historial.unshift(entrada);
    if (historial.length > 50) historial = historial.slice(0, 50);

    guardarHistorial(historial);
    renderizarHistorial();
}

function limpiarHistorialScreen() {
    console.log('[TUR] 🧹 Limpiando historial por orden de recepción...');

    historial              = [];
    window._llamadaPendiente = null;
    window._audioPendiente   = null;

    try {
        localStorage.removeItem(STORAGE_HISTORY_KEY);
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}

    // Detener audio en curso
    if (_audioEl) {
        _audioEl.pause();
        _audioEl.src = '';
    }

    // Resetear panel izquierdo
    const idleState   = document.getElementById('idleState');
    const turnoActivo = document.getElementById('turnoActivo');
    const turnoCodigo = document.getElementById('turnoCodigo');
    const turnoNombre = document.getElementById('turnoNombre');
    const turnoLabel  = document.getElementById('turnoLabel');
    const goldDivider = document.getElementById('goldDivider');

    if (turnoActivo)  turnoActivo.style.display = 'none';
    if (idleState)    idleState.classList.remove('hidden');
    if (turnoCodigo)  { turnoCodigo.textContent = '—'; turnoCodigo.classList.remove('visible', 'llamando'); }
    if (turnoNombre)  { turnoNombre.textContent = '';  turnoNombre.classList.remove('visible'); }
    if (turnoLabel)   turnoLabel.classList.remove('visible');
    if (goldDivider)  goldDivider.classList.remove('visible');

    renderizarHistorial();
    console.log('[TUR] ✅ Pantalla limpiada');
}

function renderizarHistorial() {
    const listEl  = document.getElementById('historyList');
    const countEl = document.getElementById('historyCount');
    const emptyEl = document.getElementById('historyEmpty');

    if (!listEl) return;
    if (countEl) countEl.textContent = historial.length;

    if (historial.length === 0) {
        if (emptyEl) emptyEl.style.display = 'flex';
        Array.from(listEl.children).forEach(c => { if (c.id !== 'historyEmpty') c.remove(); });
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    Array.from(listEl.children).forEach(c => { if (c.id !== 'historyEmpty') c.remove(); });

    historial.forEach((item, idx) => {
        const div       = document.createElement('div');
        div.className   = 'history-item';
        div.innerHTML   = `
            <span class="history-item-num">${historial.length - idx}</span>
            <span class="history-item-code">${item.codigo}</span>
            <span class="history-item-name">${item.nombre}</span>
            <span class="history-item-time">${item.hora}</span>
        `;
        listEl.appendChild(div);
    });
}

// =========================
// INIT
// =========================

document.addEventListener('DOMContentLoaded', () => {
    console.log('[TUR] Iniciando módulo de turnos...');
    renderizarHistorial();
    esperarSocketYRegistrar();

    // Primer tap/click desbloquea el contexto de audio del navegador
    document.addEventListener('click',      _desbloquearAudio, { once: true });
    document.addEventListener('touchstart', _desbloquearAudio, { once: true });
});

// =========================
// ESPERAR SOCKET
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
// LISTENERS DE SOCKET
// =========================

function registrarListeners(socket) {

    socket.on('limpiar_historial', () => {
        console.log('[TUR] 📨 Evento limpiar_historial recibido');
        limpiarHistorialScreen();
    });

    socket.on('llamar_paciente', (data) => {
        guardarUltimoLlamado(data.codigo, data.nombre);

        const linkedState   = document.getElementById('linkedState');
        const estaVinculada = linkedState && linkedState.style.display !== 'none';

        if (estaVinculada) {
            // Mover turno anterior al historial antes de mostrar el nuevo
            const codigoAnterior = document.getElementById('turnoCodigo')?.textContent?.trim();
            const nombreAnterior = document.getElementById('turnoNombre')?.textContent?.trim();
            if (codigoAnterior && codigoAnterior !== '—' && codigoAnterior !== data.codigo) {
                agregarAlHistorial(codigoAnterior, nombreAnterior);
            }
            mostrarTurnoLlamado(data.codigo, data.nombre, data.recepcion, true);
        } else {
            window._llamadaPendiente = data;
        }
    });

    socket.emit('pedir_ultimo_llamado');

    const linkedState = document.getElementById('linkedState');
    if (!linkedState) return;

    function intentarRestaurar() {
        if (linkedState.style.display === 'none') return;
        if (window._llamadaPendiente) {
            const p              = window._llamadaPendiente;
            window._llamadaPendiente = null;
            mostrarTurnoLlamado(p.codigo, p.nombre, p.recepcion, true);
            return;
        }
        const guardado = recuperarUltimoLlamado();
        if (guardado) {
            mostrarTurnoLlamado(guardado.codigo, guardado.nombre, null, false);
        }
    }

    new MutationObserver(intentarRestaurar)
        .observe(linkedState, { attributes: true, attributeFilter: ['style'] });

    setTimeout(intentarRestaurar, 200);
}

// =========================
// MOSTRAR TURNO LLAMADO
// =========================

function mostrarTurnoLlamado(codigo, nombre, recepcion = null, hablar = true) {
    console.log(`[TUR] Mostrando: ${codigo} — ${nombre} — Recepción: ${recepcion}`);

    const idleState   = document.getElementById('idleState');
    const turnoActivo = document.getElementById('turnoActivo');
    const turnoCodigo = document.getElementById('turnoCodigo');
    const turnoNombre = document.getElementById('turnoNombre');
    const turnoLabel  = document.getElementById('turnoLabel');
    const goldDivider = document.getElementById('goldDivider');

    if (!turnoActivo || !turnoCodigo) {
        console.warn('[TUR] ⚠️ Elementos del DOM no encontrados');
        return;
    }

    if (idleState) idleState.classList.add('hidden');
    turnoActivo.style.display = 'flex';

    turnoCodigo.classList.remove('visible', 'llamando');
    if (turnoNombre) { turnoNombre.classList.remove('visible'); turnoNombre.textContent = nombre || ''; }
    if (turnoLabel)    turnoLabel.classList.remove('visible');
    if (goldDivider)   goldDivider.classList.remove('visible');

    turnoCodigo.textContent = codigo || '—';

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

    if (hablar) {
        setTimeout(() => anunciarTurno(nombre, codigo, recepcion), 500);
    }

    const tsEl = document.getElementById('ultimaActualizacion');
    if (tsEl) tsEl.textContent = new Date().toLocaleTimeString('es-ES', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const dot = document.getElementById('conexionDot');
    if (dot) {
        dot.style.background = '#facc15';
        dot.style.boxShadow  = '0 0 12px #facc15';
        setTimeout(() => {
            if (dot) { dot.style.background = '#22c55e'; dot.style.boxShadow = '0 0 8px #22c55e'; }
        }, 1000);
    }
}