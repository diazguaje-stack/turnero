// ============================================================
// screen_turnos.js
// - Turno actual → panel izquierdo
// - Historial de llamados → panel derecho
// - Text-to-Speech: anuncia código, nombre y recepción
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
// TEXT-TO-SPEECH
// =========================

let _vocesListas = false;
let _colaHablar  = [];

function inicializarTTS() {
    if (!window.speechSynthesis) {
        console.warn('[TTS] ⚠️ Web Speech API no disponible en este navegador.');
        return;
    }

    const cargarVoces = () => {
        const voces = window.speechSynthesis.getVoices();
        if (voces.length > 0) {
            _vocesListas = true;
            console.log('[TTS] ✅ Voces cargadas:', voces.length);
            while (_colaHablar.length > 0) {
                const item = _colaHablar.shift();
                _hablar(item.texto);
            }
        }
    };

    window.speechSynthesis.onvoiceschanged = cargarVoces;
    cargarVoces();
}

/**
 * Construye y pronuncia el anuncio del turno.
 * Ejemplo: "Paciente Juan García. Código A, C, 1. Diríjase a recepción 2."
 *
 * @param {string} nombre    - Nombre del paciente
 * @param {string} codigo    - Código del turno (ej: "A-C-001")
 * @param {string} recepcion - Número o nombre de recepción (ej: "1", "Recepción 2")
 */
function anunciarTurno(nombre, codigo, recepcion) {
    if (!window.speechSynthesis) return;

    const codigoHablado = formatearCodigoParaVoz(codigo);

    // Extraer solo el número si viene "Recepción 1" o "recepcion 1"
    const numRecepcion = recepcion
        ? String(recepcion).replace(/recepci[oó]n\s*/i, '').trim()
        : null;

    let texto = '';
    if (nombre && nombre.trim()) {
        texto += `Paciente ${nombre}. `;
    }
    texto += `Código ${codigoHablado}. `;
    if (numRecepcion) {
        texto += `Diríjase a recepción ${numRecepcion}.`;
    }

    console.log('[TTS] 🔊 Anunciando:', texto);

    if (!_vocesListas) {
        _colaHablar.push({ texto });
        return;
    }

    _hablar(texto);
}

/**
 * Formatea el código para que se lea letra por letra de forma clara.
 * "A-C-001" → "A, C, 1"
 * "DR-005"  → "D R, 5"
 */
function formatearCodigoParaVoz(codigo) {
    if (!codigo) return '';

    return codigo
        .split(/[-_]/)
        .map(parte => {
            if (/^[A-Za-z]+$/.test(parte)) {
                // Letras: espaciar cada una para que se pronuncien individualmente
                return parte.split('').join(' ');
            }
            if (/^\d+$/.test(parte)) {
                // Números: eliminar ceros iniciales (001 → 1)
                return parseInt(parte, 10).toString();
            }
            return parte;
        })
        .join(', ');
}

function _hablar(texto) {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(texto);

    // Buscar voz en español (preferir local, luego remota, luego inglés de fallback)
    const voces = window.speechSynthesis.getVoices();
    const vozEs  = voces.find(v => v.lang === 'es-CO') ||
                   voces.find(v => v.lang === 'es-ES' && v.localService) ||
                   voces.find(v => v.lang.startsWith('es') && v.localService) ||
                   voces.find(v => v.lang.startsWith('es')) ||
                   voces.find(v => v.lang.startsWith('en'));

    if (vozEs) {
        utterance.voice = vozEs;
        console.log('[TTS] Usando voz:', vozEs.name, vozEs.lang);
    }

    utterance.lang   = 'es-CO';
    utterance.rate   = 0.85;    // más lento para mayor claridad
    utterance.pitch  = 1.0;
    utterance.volume = 1.0;

    utterance.onerror = (e) => console.warn('[TTS] Error:', e.error);
    utterance.onend   = ()  => console.log('[TTS] ✅ Anuncio completado');

    window.speechSynthesis.speak(utterance);
}

// Fix Chrome: speechSynthesis se pausa solo después de ~15 segundos en algunos navegadores
setInterval(() => {
    if (window.speechSynthesis && window.speechSynthesis.paused && window.speechSynthesis.speaking) {
        window.speechSynthesis.resume();
    }
}, 5000);

// =========================
// HISTORIAL EN PANEL DERECHO
// =========================

let historial = recuperarHistorial();

function agregarAlHistorial(codigo, nombre) {
    const entrada = {
        codigo,
        nombre: nombre || '',
        hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    };

    historial.unshift(entrada);
    if (historial.length > 50) historial = historial.slice(0, 50);

    guardarHistorial(historial);
    renderizarHistorial();
}

// ── NUEVO: limpiar historial completo (llamado desde socket) ──────────────────
function limpiarHistorialScreen() {
    console.log('[TUR] 🧹 Limpiando historial por orden de recepción...');

    historial = [];

    try {
        localStorage.removeItem(STORAGE_HISTORY_KEY);
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}

    window._llamadaPendiente = null;

    // Resetear panel izquierdo (turno actual)
    const idleState   = document.getElementById('idleState');
    const turnoActivo = document.getElementById('turnoActivo');
    const turnoCodigo = document.getElementById('turnoCodigo');
    const turnoNombre = document.getElementById('turnoNombre');
    const turnoLabel  = document.getElementById('turnoLabel');
    const goldDivider = document.getElementById('goldDivider');

    if (turnoActivo)  turnoActivo.style.display = 'none';
    if (idleState)    idleState.classList.remove('hidden');
    if (turnoCodigo)  { turnoCodigo.textContent = '—'; turnoCodigo.classList.remove('visible', 'llamando'); }
    if (turnoNombre)  { turnoNombre.textContent = ''; turnoNombre.classList.remove('visible'); }
    if (turnoLabel)   turnoLabel.classList.remove('visible');
    if (goldDivider)  goldDivider.classList.remove('visible');

    if (window.speechSynthesis) window.speechSynthesis.cancel();

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
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
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
    inicializarTTS();
    renderizarHistorial();
    esperarSocketYRegistrar();

    // Los navegadores requieren interacción del usuario antes de reproducir audio
    // Al primer click/touch en la pantalla, desbloqueamos el contexto de audio
    document.addEventListener('click',      _desbloquearAudio, { once: true });
    document.addEventListener('touchstart', _desbloquearAudio, { once: true });
});

function _desbloquearAudio() {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    console.log('[TTS] 🔓 Contexto de audio desbloqueado');
}

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
// LISTENERS
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
            // Mover turno anterior al historial
            const codigoAnterior = document.getElementById('turnoCodigo')?.textContent?.trim();
            const nombreAnterior = document.getElementById('turnoNombre')?.textContent?.trim();
            if (codigoAnterior && codigoAnterior !== '—' && codigoAnterior != data.codigo) {
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
            const p = window._llamadaPendiente;
            window._llamadaPendiente = null;
            mostrarTurnoLlamado(p.codigo, p.nombre, p.recepcion, true);
            return;
        }
        const guardado = recuperarUltimoLlamado();
        if (guardado) {
            // Restaurar desde localStorage: mostrar sin voz (ya se anunció)
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

/**
 * @param {string}  codigo    - Código del turno
 * @param {string}  nombre    - Nombre del paciente
 * @param {string}  recepcion - Número/nombre de recepción
 * @param {boolean} hablar    - Reproducir anuncio de voz
 */
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

    // Anuncio de voz con pequeño delay para que la animación arranque primero
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