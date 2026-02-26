// ============================================================
// screen_turnos.js (VERSIÓN CORREGIDA)
// - Turno actual → panel izquierdo
// - Historial de llamados → panel derecho
// - Text-to-Speech: via servidor gTTS (MP3) — compatible Smart TV y Android
// - FIX: Esperar a que el audio esté completamente cargado antes de reproducir
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
let miPantallaid= null;

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

    // Reproducir silencio para "despertar" el contexto de audio
    const audio = _getAudio();
    audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
    audio.play().catch(() => {});

    // Si hay audio pendiente, reproducirlo ahora
    if (window._audioPendiente) {
        console.log('[TTS] 🎬 Reproduciendo audio pendiente que estaba bloqueado');
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
 * Reproduce audio secuencial: primero "Paciente X Código Y"
 * Luego, si existe recepción: "Diríjase a recepción Z"
 */
async function anunciarTurno(nombre, codigo, recepcion) {
    const codigoHablado = formatearCodigoParaVoz(codigo);
    
    console.log('[TTS] ═══════════════════════════════════════════════════════');
    console.log('[TTS] INICIANDO ANUNCIO COMPLETO');
    console.log('[TTS] ═══════════════════════════════════════════════════════');
    
    // 1️⃣ PRIMER AUDIO: Paciente + Código
    let texto1 = '';
    if (nombre && nombre.trim()) texto1 += `Paciente ${nombre}. `;
    texto1 += `Código ${codigoHablado}.`;
    
    console.log('[TTS] ');
    console.log('[TTS] 📢 PARTE 1/2: PACIENTE + CÓDIGO');
    console.log('[TTS] Texto:', texto1);
    console.log('[TTS] Iniciando reproducción...');
    const t1 = Date.now();
    await reproducirAudio(texto1);
    const t1_elapsed = Date.now() - t1;
    console.log(`[TTS] ✅ PARTE 1 finalizada (${t1_elapsed}ms)`);
    
    // 2️⃣ PAUSA ESTRATÉGICA
    console.log('[TTS] ');
    console.log('[TTS] ⏸️ PAUSA de 800ms entre audios (para Smart TV)');
    await new Promise(resolve => setTimeout(resolve, 800));
    console.log('[TTS] ✅ Pausa completada');
    
    // 3️⃣ SEGUNDO AUDIO: Recepción
    console.log('[TTS] ');
    if (recepcion) {
        const numRecepcion = String(recepcion).replace(/recepci[oó]n\s*/i, '').trim();
        if (numRecepcion) {
            const texto2 = `Diríjase a recepción ${numRecepcion}.`;
            console.log('[TTS] 📢 PARTE 2/2: INSTRUCCIÓN DE RECEPCIÓN');
            console.log('[TTS] Texto:', texto2);
            console.log('[TTS] Iniciando reproducción...');
            const t2 = Date.now();
            await reproducirAudio(texto2);
            const t2_elapsed = Date.now() - t2;
            console.log(`[TTS] ✅ PARTE 2 finalizada (${t2_elapsed}ms)`);
        } else {
            console.warn('[TTS] ⚠️ recepcion vacío después de limpiar');
        }
    } else {
        console.warn('[TTS] ⚠️ recepcion es NULL/UNDEFINED - omitiendo segunda parte');
    }
    
    console.log('[TTS] ');
    console.log('[TTS] ═══════════════════════════════════════════════════════');
    console.log('[TTS] ✅ ANUNCIO COMPLETO FINALIZADO');
    console.log('[TTS] ═══════════════════════════════════════════════════════');
}

/**
 * Reproduce un fragmento de audio de forma confiable en Smart TV.
 * Espera a que esté completamente cargado antes de reproducir.
 */
async function reproducirAudio(texto) {
    console.log('[TTS] 🔊 Solicitando audio:', texto);
    
    try {
        const res = await fetch('/api/tts', {
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
        const audioUrl = data.url + '?t=' + Date.now();
        audio.src = audioUrl;
        audio.volume = 1.0;
        
        console.log('[TTS] 📥 URL del audio:', audioUrl);
        console.log('[TTS] Estado inicial del audio:', audio.readyState, 'HAVE_NOTHING=0, HAVE_METADATA=1, HAVE_CURRENT_DATA=2, HAVE_FUTURE_DATA=3, HAVE_ENOUGH_DATA=4');
        
        // Esperar a que el audio esté COMPLETAMENTE listo y reproducirlo
        return new Promise((resolve, reject) => {
            let playStarted = false;
            let hasEnded = false;
            let timedOut = false;
            
            // Timeout de 45 segundos (por si falla todo)
            const timeoutId = setTimeout(() => {
                timedOut = true;
                console.warn('[TTS] ⏱️ TIMEOUT: Audio no se reprodujo en 45 segundos');
                cleanup();
                resolve(); // resolver sin error para que continúe
            }, 45000);
            
            const cleanup = () => {
                clearTimeout(timeoutId);
                audio.removeEventListener('loadstart', onLoadStart);
                audio.removeEventListener('durationchange', onDurationChange);
                audio.removeEventListener('loadeddata', onLoadedData);
                audio.removeEventListener('canplay', onCanPlay);
                audio.removeEventListener('canplaythrough', onCanPlayThrough);
                audio.removeEventListener('playing', onPlaying);
                audio.removeEventListener('progress', onProgress);
                audio.removeEventListener('ended', onEnded);
                audio.removeEventListener('error', onError);
                audio.removeEventListener('abort', onAbort);
            };
            
            const onLoadStart = () => {
                console.log('[TTS] 📡 loadstart: Comenzó la descarga');
            };
            
            const onProgress = () => {
                if (audio.buffered.length > 0) {
                    const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
                    const duration = audio.duration;
                    if (duration > 0) {
                        const percent = (bufferedEnd / duration * 100).toFixed(1);
                        console.log(`[TTS] 📊 Progress: ${percent}% descargado (${bufferedEnd.toFixed(1)}s / ${duration.toFixed(1)}s)`);
                    }
                }
            };
            
            const onDurationChange = () => {
                console.log('[TTS] ⏱️ durationchange: Duración =', audio.duration, 's');
            };
            
            const onLoadedData = () => {
                console.log('[TTS] 📦 loadeddata: Datos cargados, readyState=', audio.readyState);
            };
            
            const onCanPlay = () => {
                console.log('[TTS] ▶️ canplay: Puede iniciar, readyState=', audio.readyState);
            };
            
            const onCanPlayThrough = () => {
                console.log('[TTS] ✅ canplaythrough: Completamente listo para reproducir sin buffering');
                if (!playStarted && !timedOut) {
                    playStarted = true;
                    console.log('[TTS] 🎬 INICIANDO REPRODUCCIÓN');
                    
                    const playPromise = audio.play();
                    if (playPromise) {
                        playPromise
                            .then(() => {
                                console.log('[TTS] 🔊 REPRODUCCIÓN INICIADA EXITOSAMENTE');
                            })
                            .catch(err => {
                                console.warn('[TTS] ⚠️ Autoplay bloqueado:', err.message);
                                console.log('[TTS] Guardando audio como pendiente para reproducir después de interacción');
                                window._audioPendiente = audio;
                                cleanup();
                                resolve();
                            });
                    }
                }
            };
            
            const onPlaying = () => {
                console.log('[TTS] ▶️ REPRODUCIÉNDOSE ahora');
            };
            
            const onEnded = () => {
                if (!hasEnded) {
                    hasEnded = true;
                    console.log('[TTS] ✅ AUDIO FINALIZADO COMPLETAMENTE');
                    cleanup();
                    resolve();
                }
            };
            
            const onError = () => {
                console.error('[TTS] ❌ ERROR EN AUDIO:', audio.error?.message || audio.error);
                console.error('[TTS] Código de error:', audio.error?.code);
                console.error('[TTS] URL intentada:', audioUrl);
                cleanup();
                resolve(); // resolver sin error para continuar
            };
            
            const onAbort = () => {
                console.warn('[TTS] ⚠️ ABORTADO');
                cleanup();
                resolve();
            };
            
            // Registrar todos los listeners
            audio.addEventListener('loadstart', onLoadStart);
            audio.addEventListener('progress', onProgress);
            audio.addEventListener('durationchange', onDurationChange);
            audio.addEventListener('loadeddata', onLoadedData);
            audio.addEventListener('canplay', onCanPlay);
            audio.addEventListener('canplaythrough', onCanPlayThrough);
            audio.addEventListener('playing', onPlaying);
            audio.addEventListener('ended', onEnded);
            audio.addEventListener('error', onError);
            audio.addEventListener('abort', onAbort);
            
            // Forzar carga
            console.log('[TTS] 🔄 Llamando a audio.load()');
            audio.load();
        });
        
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

    socket.on('pantalla_vinculada', (data) => {
        console.log('[TURNOS] Pantalla vinculada:', data);
        miPantallaId = data.pantalla_id;  // ← GUARDAR el ID
        console.log('[TURNOS] Mi pantalla_id:', miPantallaId);
    });

    socket.on('joined_screen_propia', (data) => {
        console.log('[TURNOS] Unido a sala propia:', data);
        // Si viene en este evento, también guardar
        if (data.pantalla_id) {
            miPantallaId = data.pantalla_id;
            console.log('[TURNOS] Mi pantalla_id (desde joined_screen_propia):', miPantallaId);
        }
    });


    socket.on('llamar_paciente', (data) => {
        console.log('=== SOCKET llamar_paciente RECIBIDO ===');
        console.log('DATA COMPLETO:');
        console.log(JSON.stringify(data, null, 2));
        console.log('data.pantalla_id:', data.pantalla_id);
        console.log('miPantallaId:', miPantallaId);
        console.log('========================================');
        
        // ── VALIDACIÓN: ¿Es esta llamada para MI pantalla? ──────────────────────
        if (data.pantalla_id && miPantallaId && data.pantalla_id !== miPantallaId) {
            console.log(`[TURNOS] ⚠️ Llamada es para otra pantalla (${data.pantalla_id} ≠ ${miPantallaId}) - ignorando`);
            return;  // ← IGNORAR si no es para esta pantalla
        }
        
        console.log('[TURNOS] ✅ Llamada ES PARA ESTA PANTALLA - procesando');
        
        // ── Resto del código original ──────────────────────────────────────────
        guardarUltimoLlamado(data.codigo, data.nombre);

        const linkedState   = document.getElementById('linkedState');
        const estaVinculada = linkedState && linkedState.style.display !== 'none';

        if (estaVinculada) {
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

    socket.on('historial_llamada', (data) => {
        console.log('[TURNOS] Historial de llamada recibido:', data);
        // Aquí puedes actualizar un historial visual si quieres
        // pero sin reproducir sonido
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
    console.log(`[TUR] === mostrarTurnoLlamado ===`);
    console.log(`[TUR] codigo: ${codigo}`);
    console.log(`[TUR] nombre: ${nombre}`);
    console.log(`[TUR] recepcion: ${recepcion}`);
    console.log(`[TUR] typeof recepcion: ${typeof recepcion}`);
    console.log(`[TUR] hablar: ${hablar}`);
    console.log(`[TUR] ===========================`);

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
        console.log(`[TUR] Llamando a anunciarTurno con: nombre="${nombre}", codigo="${codigo}", recepcion="${recepcion}"`);
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
