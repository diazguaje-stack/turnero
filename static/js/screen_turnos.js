// ============================================================
// screen_turnos.js (HISTORIAL INDEPENDIENTE POR RECEPCIÓN)
// - Turno actual → panel izquierdo
// - Historial de llamados → panel derecho (SOLO de ESTA recepción)
// - Text-to-Speech: via servidor gTTS (MP3)
// - SIN DUPLICACIÓN DE LISTENERS
// ============================================================

// ========== CONSTANTES ==========
const STORAGE_BASE_KEY = 'screen_historial_'; // Base para keys con número de recepción

// ========== ESTADO GLOBAL ==========
let miNumeroRecepcion = null;   // ← CRÍTICO: Número de recepción de esta pantalla
let miHistorial       = [];     // ← Historial SOLO de esta recepción
let socket            = null;
let _audioEl          = null;
let _audioDesbloqueado = false;
let _listenersRegistrados = false;

// =========================
// PERSISTENCIA LOCAL (POR RECEPCIÓN)
// =========================

/**
 * Obtiene la clave de storage para el historial de una recepción específica
 * Ej: "screen_historial_1", "screen_historial_2"
 */
function getStorageKeyParaRecepcion(numRecepcion) {
    return `${STORAGE_BASE_KEY}${numRecepcion}`;
}

function guardarHistorialDeRecepcion(numRecepcion, historial) {
    try {
        const key = getStorageKeyParaRecepcion(numRecepcion);
        localStorage.setItem(key, JSON.stringify(historial));
        console.log(`[HIST] 💾 Historial de recepción ${numRecepcion} guardado: ${historial.length} items`);
    } catch (e) {
        console.warn(`[HIST] ⚠️ No se pudo guardar historial de recepción ${numRecepcion}:`, e);
    }
}

function recuperarHistorialDeRecepcion(numRecepcion) {
    try {
        const key = getStorageKeyParaRecepcion(numRecepcion);
        const data = localStorage.getItem(key);
        if (data) {
            const historial = JSON.parse(data);
            console.log(`[HIST] ✅ Historial de recepción ${numRecepcion} recuperado: ${historial.length} items`);
            return historial;
        }
    } catch (e) {
        console.warn(`[HIST] ⚠️ Error al recuperar historial de recepción ${numRecepcion}:`, e);
    }
    return [];
}

function guardarUltimoLlamadoDeRecepcion(numRecepcion, codigo, nombre) {
    try {
        const key = `screen_ultimo_llamado_${numRecepcion}`;
        localStorage.setItem(key, JSON.stringify({ codigo, nombre, timestamp: Date.now() }));
        console.log(`[HIST] 💾 Último llamado de recepción ${numRecepcion}: ${codigo}`);
    } catch (e) {
        console.warn(`[HIST] ⚠️ No se pudo guardar último llamado:`, e);
    }
}

function recuperarUltimoLlamadoDeRecepcion(numRecepcion) {
    try {
        const key = `screen_ultimo_llamado_${numRecepcion}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

// =========================
// TEXT-TO-SPEECH
// =========================

function _getAudio() {
    if (!_audioEl) {
        _audioEl         = new Audio();
        _audioEl.preload = 'auto';
    }
    return _audioEl;
}

function _desbloquearAudio() {
    if (_audioDesbloqueado) return;
    _audioDesbloqueado = true;
    console.log('[TTS] 🔓 Audio desbloqueado por interacción del usuario');

    const audio = _getAudio();
    audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
    audio.play().catch(() => {});

    if (window._audioPendiente) {
        console.log('[TTS] 🎬 Reproduciendo audio pendiente');
        window._audioPendiente.play().catch(() => {});
        window._audioPendiente = null;
    }
}

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

async function anunciarTurno(nombre, codigo, recepcion) {
    const codigoHablado = formatearCodigoParaVoz(codigo);
    
    console.log('[TTS] ═══════════════════════════════════════════════════════');
    console.log('[TTS] INICIANDO ANUNCIO COMPLETO');
    console.log('[TTS] ═══════════════════════════════════════════════════════');
    
    // 1️⃣ PRIMER AUDIO: Paciente + Código
    let texto1 = '';
    if (nombre && nombre.trim()) texto1 += `Paciente ${nombre}. `;
    texto1 += `Código ${codigoHablado}.`;
    
    console.log('[TTS] 📢 PARTE 1/2: PACIENTE + CÓDIGO');
    console.log('[TTS] Texto:', texto1);
    const t1 = Date.now();
    await reproducirAudio(texto1);
    const t1_elapsed = Date.now() - t1;
    console.log(`[TTS] ✅ PARTE 1 finalizada (${t1_elapsed}ms)`);
    
    // 2️⃣ PAUSA ESTRATÉGICA
    console.log('[TTS] ⏸️ PAUSA de 800ms');
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // 3️⃣ SEGUNDO AUDIO: Recepción
    console.log('[TTS] 📢 PARTE 2/2: INSTRUCCIÓN DE RECEPCIÓN');
    if (recepcion) {
        const numRecepcion = String(recepcion).replace(/recepci[oó]n\s*/i, '').trim();
        if (numRecepcion) {
            const texto2 = `Diríjase a recepción ${numRecepcion}.`;
            console.log('[TTS] Texto:', texto2);
            const t2 = Date.now();
            await reproducirAudio(texto2);
            const t2_elapsed = Date.now() - t2;
            console.log(`[TTS] ✅ PARTE 2 finalizada (${t2_elapsed}ms)`);
        } else {
            console.warn('[TTS] ⚠️ recepcion sin número');
        }
    } else {
        console.warn('[TTS] ⚠️ recepcion es NULL - omitiendo segunda parte');
    }
    
    console.log('[TTS] ═══════════════════════════════════════════════════════');
    console.log('[TTS] ✅ ANUNCIO COMPLETO FINALIZADO');
    console.log('[TTS] ═══════════════════════════════════════════════════════');
}

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
        
        console.log('[TTS] 📥 URL:', audioUrl);
        
        return new Promise((resolve) => {
            let playStarted = false;
            let hasEnded = false;
            let timedOut = false;
            
            const timeoutId = setTimeout(() => {
                timedOut = true;
                console.warn('[TTS] ⏱️ TIMEOUT: Audio no se reprodujo en 45 segundos');
                cleanup();
                resolve();
            }, 45000);
            
            const cleanup = () => {
                clearTimeout(timeoutId);
                audio.removeEventListener('loadstart', onLoadStart);
                audio.removeEventListener('progress', onProgress);
                audio.removeEventListener('durationchange', onDurationChange);
                audio.removeEventListener('loadeddata', onLoadedData);
                audio.removeEventListener('canplay', onCanPlay);
                audio.removeEventListener('canplaythrough', onCanPlayThrough);
                audio.removeEventListener('playing', onPlaying);
                audio.removeEventListener('ended', onEnded);
                audio.removeEventListener('error', onError);
                audio.removeEventListener('abort', onAbort);
            };
            
            const onLoadStart = () => console.log('[TTS] 📡 loadstart');
            const onProgress = () => {
                if (audio.buffered.length > 0) {
                    const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
                    const duration = audio.duration;
                    if (duration > 0) {
                        const percent = (bufferedEnd / duration * 100).toFixed(1);
                        console.log(`[TTS] 📊 Progress: ${percent}%`);
                    }
                }
            };
            const onDurationChange = () => console.log('[TTS] ⏱️ durationchange:', audio.duration, 's');
            const onLoadedData = () => console.log('[TTS] 📦 loadeddata');
            const onCanPlay = () => console.log('[TTS] ▶️ canplay');
            
            const onCanPlayThrough = () => {
                console.log('[TTS] ✅ canplaythrough - LISTO PARA REPRODUCIR');
                if (!playStarted && !timedOut) {
                    playStarted = true;
                    console.log('[TTS] 🎬 INICIANDO REPRODUCCIÓN');
                    
                    const playPromise = audio.play();
                    if (playPromise) {
                        playPromise
                            .then(() => console.log('[TTS] 🔊 REPRODUCCIÓN INICIADA EXITOSAMENTE'))
                            .catch(err => {
                                console.warn('[TTS] ⚠️ Autoplay bloqueado:', err.message);
                                window._audioPendiente = audio;
                                cleanup();
                                resolve();
                            });
                    }
                }
            };
            
            const onPlaying = () => console.log('[TTS] ▶️ REPRODUCIÉNDOSE');
            
            const onEnded = () => {
                if (!hasEnded) {
                    hasEnded = true;
                    console.log('[TTS] ✅ AUDIO FINALIZADO');
                    cleanup();
                    resolve();
                }
            };
            
            const onError = () => {
                console.error('[TTS] ❌ ERROR EN AUDIO:', audio.error?.message);
                cleanup();
                resolve();
            };
            
            const onAbort = () => {
                console.warn('[TTS] ⚠️ ABORTADO');
                cleanup();
                resolve();
            };
            
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
            
            console.log('[TTS] 🔄 Llamando a audio.load()');
            audio.load();
        });
        
    } catch (err) {
        console.error('[TTS] ❌ Error al obtener audio:', err);
    }
}

// =========================
// HISTORIAL EN PANEL DERECHO (POR RECEPCIÓN)
// =========================

function agregarAlHistorial(codigo, nombre) {
    if (!miNumeroRecepcion) {
        console.warn('[HIST] ⚠️ No se conoce miNumeroRecepcion, no se puede agregar al historial');
        return;
    }
    
    console.log(`[HIST] Agregando al historial de recepción ${miNumeroRecepcion}: ${codigo} - ${nombre}`);
    
    const entrada = {
        codigo,
        nombre: nombre || '',
        hora:   new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    };

    miHistorial.unshift(entrada);
    
    if (miHistorial.length > 50) {
        miHistorial = miHistorial.slice(0, 50);
        console.log('[HIST] ⚠️ Historial limitado a 50 items');
    }

    guardarHistorialDeRecepcion(miNumeroRecepcion, miHistorial);
    console.log(`[HIST] ✅ Historial guardado (${miHistorial.length} items)`);
    
    renderizarHistorial();
}

function limpiarHistorialScreen() {
    console.log(`[HIST] 🧹 Iniciando limpieza COMPLETA de screen (recepción: ${miNumeroRecepcion})...`);
    
    // ===== 1. LIMPIAR TURNO ACTUAL =====
    console.log('[HIST] Limpiando turno actual...');
    
    if (miNumeroRecepcion) {
        try {
            localStorage.removeItem(`screen_ultimo_llamado_${miNumeroRecepcion}`);
            console.log(`[HIST] ✅ localStorage limpiado: screen_ultimo_llamado_${miNumeroRecepcion}`);
        } catch (error) {
            console.error('[HIST] ❌ Error al limpiar último llamado:', error);
        }
    }
    
    window._ultimo_llamado = null;
    window._llamadaPendiente = null;
    console.log('[HIST] ✅ Variables globales limpiadas');
    
    const turnoActivo = document.getElementById('turnoActivo');
    const idleState = document.getElementById('idleState');
    
    if (turnoActivo) {
        turnoActivo.style.display = 'none';
        console.log('[HIST] ✅ Panel de turno actual ocultado');
    }
    
    if (idleState) {
        idleState.classList.remove('hidden');
        console.log('[HIST] ✅ Panel "Esperando llamada" mostrado');
    }
    
    const turnoCodigo = document.getElementById('turnoCodigo');
    const turnoNombre = document.getElementById('turnoNombre');
    const turnoLabel = document.getElementById('turnoLabel');
    const goldDivider = document.getElementById('goldDivider');
    
    if (turnoCodigo) {
        turnoCodigo.textContent = '—';
        turnoCodigo.classList.remove('visible', 'llamando');
    }
    
    if (turnoNombre) {
        turnoNombre.textContent = '';
        turnoNombre.classList.remove('visible');
    }
    
    if (turnoLabel) turnoLabel.classList.remove('visible');
    if (goldDivider) goldDivider.classList.remove('visible');
    
    // ===== 2. LIMPIAR HISTORIAL DE ESTA RECEPCIÓN =====
    console.log(`[HIST] Limpiando historial de recepción ${miNumeroRecepcion}...`);
    
    miHistorial = [];
    console.log('[HIST] ✅ Array historial limpiado');
    
    if (miNumeroRecepcion) {
        try {
            const key = getStorageKeyParaRecepcion(miNumeroRecepcion);
            localStorage.removeItem(key);
            console.log(`[HIST] ✅ localStorage limpiado: ${key}`);
        } catch (error) {
            console.error('[HIST] ❌ Error al limpiar historial:', error);
        }
    }
    
    renderizarHistorial();
    console.log('[HIST] ✅ UI del historial actualizada');
    
    // ===== 3. CERRAR MODALES =====
    const historialModal = document.getElementById('historialModal');
    if (historialModal && historialModal.style.display !== 'none') {
        cerrarHistorialModal();
    }
    
    // ===== 4. ACTUALIZAR TIMESTAMP =====
    const tsEl = document.getElementById('ultimaActualizacion');
    if (tsEl) {
        tsEl.textContent = new Date().toLocaleTimeString('es-ES', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }
    
    // ===== 5. INDICADOR DE CONEXIÓN =====
    const dot = document.getElementById('conexionDot');
    if (dot) {
        dot.style.background = '#ef4444';
        dot.style.boxShadow = '0 0 12px #ef4444';
        setTimeout(() => {
            if (dot) { 
                dot.style.background = '#22c55e'; 
                dot.style.boxShadow = '0 0 8px #22c55e'; 
            }
        }, 1500);
    }
    
    console.log('[HIST] ═══════════════════════════════════════════════════════');
    console.log('[HIST] ✅ LIMPIEZA COMPLETADA');
    console.log('[HIST] ═══════════════════════════════════════════════════════');
}

function renderizarHistorial() {
    const listEl  = document.getElementById('historyList');
    const countEl = document.getElementById('historyCount');
    const emptyEl = document.getElementById('historyEmpty');

    if (!listEl) return;
    if (countEl) countEl.textContent = miHistorial.length;

    if (miHistorial.length === 0) {
        if (emptyEl) emptyEl.style.display = 'flex';
        Array.from(listEl.children).forEach(c => { if (c.id !== 'historyEmpty') c.remove(); });
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    Array.from(listEl.children).forEach(c => { if (c.id !== 'historyEmpty') c.remove(); });

    miHistorial.forEach((item, idx) => {
        const div       = document.createElement('div');
        div.className   = 'history-item';
        div.innerHTML   = `
            <span class="history-item-num">${miHistorial.length - idx}</span>
            <span class="history-item-code">${item.codigo}</span>
            <span class="history-item-name">${item.nombre}</span>
            <span class="history-item-time">${item.hora}</span>
        `;
        listEl.appendChild(div);
    });
}

function cerrarHistorialModal() {
    const modal = document.getElementById('historialModal');
    if (modal) {
        modal.style.display = 'none';
        console.log('[HIST] ✅ Modal cerrado');
    }
}

// =========================
// MOSTRAR TURNO LLAMADO
// =========================

function mostrarTurnoLlamado(codigo, nombre, recepcion = null, hablar = true) {
    console.log(`[TUR] === mostrarTurnoLlamado ===`);
    console.log(`[TUR] codigo: ${codigo}`);
    console.log(`[TUR] nombre: ${nombre}`);
    console.log(`[TUR] recepcion: ${recepcion}`);
    console.log(`[TUR] hablar: ${hablar}`);

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
        console.log(`[TUR] Reproduciendo audio`);
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

// =========================
// REGISTRAR LISTENERS (UNA SOLA VEZ)
// =========================

function registrarListeners(socketInstance) {
    if (_listenersRegistrados) {
        console.log('[TURNOS] ⚠️ Listeners ya registrados, ignorando...');
        return;
    }
    _listenersRegistrados = true;
    console.log('[TURNOS] 📡 Registrando listeners de socket (UNA SOLA VEZ)...');
    
    socket = socketInstance;
    
    // ==================== LISTENER: limpiar_historial ====================
    socket.on('limpiar_historial', (data) => {
        console.log(`[HIST] 📢 Evento limpiar_historial recibido:`, data);
        console.log(`[HIST] miNumeroRecepcion: ${miNumeroRecepcion}`);
        
        if (data.motivo === 'limpieza_diaria') {
            console.log('[HIST] ⏰ LIMPIEZA DIARIA PROGRAMADA');
            limpiarHistorialScreen();
            return;
        }
        
        // ← IMPORTANTE: Validar que la limpieza es SOLO para esta recepción
        if (data.numRecepcion && miNumeroRecepcion && data.numRecepcion !== miNumeroRecepcion) {
            console.log(`[HIST] ⚠️ Limpieza es para recepción ${data.numRecepcion}, esta es ${miNumeroRecepcion} - ignorando`);
            return;
        }
        
        console.log(`[HIST] 🧹 Limpieza de historial de recepción ${miNumeroRecepcion}`);
        limpiarHistorialScreen();
    });
    
    // ==================== LISTENER: limpieza_completada ====================
    socket.on('limpieza_completada', (data) => {
        console.log('[HIST] 📢 Limpieza completada recibida');
        limpiarHistorialScreen();
    });

    // ==================== LISTENER: llamar_paciente ====================
    socket.on('llamar_paciente', (data) => {
        console.log('[TURNOS] 📢 Evento llamar_paciente recibido:', data);
        console.log(`[TURNOS] miNumeroRecepcion: ${miNumeroRecepcion}, data.numRecepcion: ${data.numRecepcion}`);
        
        // ← CRÍTICO: Validar que el llamado es SOLO para esta recepción
        if (data.numRecepcion && miNumeroRecepcion && data.numRecepcion !== miNumeroRecepcion) {
            console.log(`[TURNOS] ⚠️ Llamada es para recepción ${data.numRecepcion}, esta es ${miNumeroRecepcion} - ignorando`);
            return;
        }
        
        console.log(`[TURNOS] ✅ Llamada ES PARA ESTA RECEPCIÓN (${miNumeroRecepcion})`);
        
        if (miNumeroRecepcion) {
            guardarUltimoLlamadoDeRecepcion(miNumeroRecepcion, data.codigo, data.nombre);
        }

        const linkedState   = document.getElementById('linkedState');
        const estaVinculada = linkedState && linkedState.style.display !== 'none';

        if (estaVinculada) {
            const codigoAnterior = document.getElementById('turnoCodigo')?.textContent?.trim();
            const nombreAnterior = document.getElementById('turnoNombre')?.textContent?.trim();
            
            // Agregar al historial si hay un código anterior diferente
            if (codigoAnterior && codigoAnterior !== '—' && codigoAnterior !== data.codigo) {
                agregarAlHistorial(codigoAnterior, nombreAnterior);
            }
            
            mostrarTurnoLlamado(data.codigo, data.nombre, data.recepcion, true);
        } else {
            console.log('[TURNOS] ⚠️ Pantalla no vinculada, guardando como pendiente');
            window._llamadaPendiente = data;
        }
    });

    // ==================== LISTENER: historial_llamada ====================
    socket.on('historial_llamada', (data) => {
        console.log('[TURNOS] 📢 Historial de llamada recibido:', data);
    });

    // ==================== LISTENER: numero_recepcion ====================
    socket.on('numero_recepcion', (data) => {
        miNumeroRecepcion = data.numRecepcion || data.numero_recepcion;
        console.log(`[HIST] 📢 Número de recepción asignado: ${miNumeroRecepcion}`);
        
        // Cargar historial de ESTA recepción específica
        miHistorial = recuperarHistorialDeRecepcion(miNumeroRecepcion);
        renderizarHistorial();
        console.log(`[HIST] ✅ Historial de recepción ${miNumeroRecepcion} cargado: ${miHistorial.length} items`);
    });

    // Pedir número de recepción
    socket.emit('pedir_numero_recepcion');
    console.log('[TURNOS] ✅ Listeners registrados correctamente (SIN DUPLICACIÓN)');

    // ==================== OBSERVER DE VINCULACIÓN ====================
    const linkedState = document.getElementById('linkedState');
    if (!linkedState) {
        console.warn('[TURNOS] ⚠️ linkedState no encontrado');
        return;
    }

    function intentarRestaurar() {
        if (linkedState.style.display === 'none') return;
        
        if (window._llamadaPendiente) {
            console.log('[TURNOS] Restaurando llamada pendiente');
            const p = window._llamadaPendiente;
            window._llamadaPendiente = null;
            mostrarTurnoLlamado(p.codigo, p.nombre, p.recepcion, true);
            return;
        }
        
        if (miNumeroRecepcion) {
            const guardado = recuperarUltimoLlamadoDeRecepcion(miNumeroRecepcion);
            if (guardado) {
                console.log('[TURNOS] Restaurando último llamado guardado:', guardado);
                mostrarTurnoLlamado(guardado.codigo, guardado.nombre, null, false);
            }
        }
    }

    new MutationObserver(intentarRestaurar)
        .observe(linkedState, { attributes: true, attributeFilter: ['style'] });

    setTimeout(intentarRestaurar, 200);
}

// =========================
// INIT
// =========================

document.addEventListener('DOMContentLoaded', () => {
    console.log('[TURNOS] ═══════════════════════════════════════════════════════');
    console.log('[TURNOS] INICIALIZANDO MÓDULO DE TURNOS');
    console.log('[TURNOS] ═══════════════════════════════════════════════════════');
    console.log('[TURNOS] Esperando socket y número de recepción...');
    
    // Esperar a que el socket esté disponible Y miNumeroRecepcion esté asignado
    esperarSocketYRegistrar();

    // Desbloquear audio en primer tap/click
    document.addEventListener('click',      _desbloquearAudio, { once: true });
    document.addEventListener('touchstart', _desbloquearAudio, { once: true });
    
    console.log('[TURNOS] ═══════════════════════════════════════════════════════');
});

function esperarSocketYRegistrar() {
    const socketInstance = window.getSocketScreen ? window.getSocketScreen() : null;
    
    if (socketInstance) {
        console.log('[TURNOS] ✅ Socket obtenido');
        registrarListeners(socketInstance);
        
        // ← NUEVO: Esperar a que miNumeroRecepcion sea asignado por el servidor
        esperarNumeroRecepcion();
    } else {
        console.log('[TURNOS] ⏳ Socket no disponible aún, reintentando en 100ms...');
        setTimeout(esperarSocketYRegistrar, 100);
    }
}

/**
 * Espera a que el servidor asigne miNumeroRecepcion (via evento 'numero_recepcion')
 * Una vez asignado, restaura el turno anterior si existe.
 */
function esperarNumeroRecepcion() {
    const maxIntentosEspera = 50; // 5 segundos máximo (50 * 100ms)
    let intentos = 0;
    
    const checkNumero = setInterval(() => {
        intentos++;
        
        if (miNumeroRecepcion) {
            console.log(`[TURNOS] ✅ miNumeroRecepcion asignado: ${miNumeroRecepcion}`);
            clearInterval(checkNumero);
            
            // ← AHORA sí, intentar restaurar el turno anterior
            intentarRestaurarTurnoAnterior();
            return;
        }
        
        if (intentos >= maxIntentosEspera) {
            console.warn('[TURNOS] ⚠️ Timeout esperando miNumeroRecepcion');
            clearInterval(checkNumero);
            return;
        }
    }, 100);
}

/**
 * Intenta restaurar el turno anterior del último llamado guardado en localStorage
 */
function intentarRestaurarTurnoAnterior() {
    if (!miNumeroRecepcion) {
        console.log('[TURNOS] ⚠️ No se puede restaurar — miNumeroRecepcion es null');
        return;
    }
    
    const guardado = recuperarUltimoLlamadoDeRecepcion(miNumeroRecepcion);
    
    if (guardado) {
        console.log('[TURNOS] ↩️ Restaurando turno anterior:', guardado);
        
        const linkedState = document.getElementById('linkedState');
        const estaVinculada = linkedState && linkedState.style.display !== 'none';
        
        if (estaVinculada) {
            // ← Restaurar SIN reproducir audio (false)
            mostrarTurnoLlamado(guardado.codigo, guardado.nombre, null, false);
            console.log('[TURNOS] ✅ Turno anterior restaurado sin audio');
        } else {
            console.log('[TURNOS] ℹ️ Pantalla no vinculada — turno guardado pero no mostrado');
        }
    } else {
        console.log('[TURNOS] ℹ️ Sin turno anterior guardado');
    }
}

// =========================
// FUNCIONES GLOBALES DE DEBUG
// =========================

window.limpiarHistorialScreen = limpiarHistorialScreen;

window.debugScreenCompleto = () => {
    console.log('═══════════════════════════════════════════════');
    console.log('DEBUG SCREEN COMPLETO');
    console.log('═══════════════════════════════════════════════');
    console.log('Número de recepción:', miNumeroRecepcion);
    console.log('Turno actual (DOM):', {
        codigo: document.getElementById('turnoCodigo')?.textContent,
        nombre: document.getElementById('turnoNombre')?.textContent,
        visible: document.getElementById('turnoActivo')?.style.display !== 'none'
    });
    console.log('Historial (memoria):', miHistorial.length, 'items');
    console.log('Socket conectado:', socket ? socket.connected : false);
    console.log('Listeners registrados:', _listenersRegistrados);
    console.log('localStorage (actual recepción):', {
        historial: miNumeroRecepcion ? localStorage.getItem(getStorageKeyParaRecepcion(miNumeroRecepcion)) : 'N/A',
        ultimo_llamado: miNumeroRecepcion ? localStorage.getItem(`screen_ultimo_llamado_${miNumeroRecepcion}`) : 'N/A'
    });
    console.log('═══════════════════════════════════════════════');
};

window.debugScreenCompleto();