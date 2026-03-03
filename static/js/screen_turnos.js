// ============================================================
// screen_turnos.js  v2  — MULTI-PANEL (hasta 4 recepciones)
//
// Arquitectura:
//   - Al recibir 'numero_recepcion' con lista de recepcionistas,
//     se construyen dinámicamente N paneles (1-4).
//   - Cada panel tiene su propio estado (código, nombre, animación).
//   - Los llamados 'llamar_paciente' actualizan el panel correcto
//     usando data.panel_orden o buscando por recepcionista_nombre.
//   - Cola de audio: los anuncios se procesan uno tras otro.
//   - SIN historial en screen (solo en el dashboard de cada recepción).
// ============================================================

// ========== ESTADO GLOBAL ==========
let miRecepcionistas      = [];
let socket                = null;
let _audioEl              = null;
let _audioDesbloqueado    = false;
let _listenersRegistrados = false;
let _colaAudio            = [];
let _reproduciendo        = false;
let _panelesListos        = false;
let _llamadosPendientes   = [];
let panelState            = [];

// ========== PERSISTENCIA ==========

function guardarEstadoPaneles() {
    try {
        localStorage.setItem('screen_paneles_v2', JSON.stringify(panelState));
    } catch (e) {}
}

function recuperarEstadoPaneles() {
    try {
        const d = localStorage.getItem('screen_paneles_v2');
        return d ? JSON.parse(d) : [];
    } catch { return []; }
}

function guardarUltimoLlamado(orden, codigo, nombre) {
    try { localStorage.setItem(`screen_ultimo_${orden}`, JSON.stringify({ codigo, nombre, ts: Date.now() })); } catch(e) {}
}

function recuperarUltimoLlamado(orden) {
    try { const d = localStorage.getItem(`screen_ultimo_${orden}`); return d ? JSON.parse(d) : null; } catch { return null; }
}
// ========== AUDIO ==========

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
    const audio = _getAudio();
    audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
    audio.play().catch(() => {});
}

function formatearCodigoParaVoz(codigo) {
    if (!codigo) return '';
    return codigo.split(/[-_]/).map(p => {
        if (/^[A-Za-z]+$/.test(p)) return p.split('').join(' ');
        if (/^\d+$/.test(p))       return parseInt(p, 10).toString();
        return p;
    }).join(', ');
}

// Encola un anuncio completo (texto ya formateado)
function encolarAnuncio(nombre, codigo, recepcion) {
    const codigoHablado = formatearCodigoParaVoz(codigo);
    let texto1 = '';
    if (nombre && nombre.trim()) texto1 += `Paciente ${nombre}. `;
    texto1 += `Código ${codigoHablado}.`;

    const numRecepcion = String(recepcion || '').replace(/recepci[oó]n\s*/i, '').trim();
    const texto2 = numRecepcion ? `Diríjase a recepción ${numRecepcion}.` : null;

    _colaAudio.push({ texto: texto1 });
    if (texto2) _colaAudio.push({ texto: texto2, pausa: 800 });

    if (!_reproduciendo) _procesarColaAudio();
}

async function _procesarColaAudio() {
    if (_colaAudio.length === 0) { _reproduciendo = false; return; }
    _reproduciendo = true;

    const item = _colaAudio.shift();

    if (item.pausa) {
        await new Promise(r => setTimeout(r, item.pausa));
    }

    await reproducirAudio(item.texto);
    _procesarColaAudio();
}

async function reproducirAudio(texto) {
    try {
        const res  = await fetch('/api/tts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto })
        });
        const data = await res.json();
        if (!data.success) return;
        const audio = _getAudio();
        audio.src   = data.url + '?t=' + Date.now();
        audio.volume = 1.0;
        return new Promise(resolve => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            setTimeout(finish, 45000);
            audio.addEventListener('ended',          finish, { once: true });
            audio.addEventListener('error',          finish, { once: true });
            audio.addEventListener('abort',          finish, { once: true });
            audio.addEventListener('canplaythrough', () => audio.play().catch(finish), { once: true });
            audio.load();
        });
    } catch(e) { console.error('[TTS] Error:', e); }
}

// ========== CONSTRUCCIÓN DE PANELES ==========

function construirPaneles(recepcionistas) {
    _panelesListos   = false;
    miRecepcionistas = recepcionistas;
    const n          = recepcionistas.length;

    panelState = recepcionistas.map((r, i) => {
        const g = recuperarUltimoLlamado(i);
        return { orden: i, recepcionistaId: r.id, recepcionistaNombre: r.nombre_completo,
                 codigo: g?.codigo || null, nombre: g?.nombre || null };
    });

    const contenedor = document.getElementById('multiPanelContainer');
    if (!contenedor) { console.warn('[PANEL] #multiPanelContainer no encontrado'); return; }

    const layoutClass = ['', 'layout-1', 'layout-2', 'layout-3', 'layout-4'][n] || 'layout-4';
    contenedor.className = `multi-panel-grid ${layoutClass}`;
    contenedor.innerHTML = recepcionistas.map((r, i) => `
        <div class="recepcion-panel" id="panel-${i}" data-orden="${i}">
            <div class="panel-header">
                <span class="panel-numero">${i + 1}</span>
                <span class="panel-nombre-recepcion">${r.nombre_completo}</span>
            </div>
            <div class="panel-idle" id="panel-idle-${i}">
                <div class="panel-idle-icon">◇</div>
                <div class="panel-idle-text">Esperando llamada</div>
            </div>
            <div class="panel-turno" id="panel-turno-${i}" style="display:none;">
                <div class="panel-turno-label">TURNO</div>
                <div class="panel-codigo" id="panel-codigo-${i}">—</div>
                <div class="panel-nombre-paciente" id="panel-nombre-${i}"></div>
            </div>
        </div>
    `).join('');

    // Restaurar último llamado (sin audio)
    panelState.forEach(ps => { if (ps.codigo) _renderTurnoEnPanel(ps.orden, ps.codigo, ps.nombre); });

    // Marcar listos y vaciar cola de pendientes
    _panelesListos = true;
    console.log(`[PANEL] ✅ ${n} panel(es) construidos`);

    if (_llamadosPendientes.length > 0) {
        console.log(`[PANEL] 📬 Procesando ${_llamadosPendientes.length} llamado(s) pendiente(s)`);
        const pendientes = [..._llamadosPendientes];
        _llamadosPendientes = [];
        pendientes.forEach(d => mostrarTurnoEnPanel(d.orden, d.codigo, d.nombre, d.hablar));
    }
}

// ========== MOSTRAR TURNO EN PANEL ==========

function _renderTurnoEnPanel(orden, codigo, nombre) {
    const idleEl   = document.getElementById(`panel-idle-${orden}`);
    const turnoEl  = document.getElementById(`panel-turno-${orden}`);
    const codigoEl = document.getElementById(`panel-codigo-${orden}`);
    const nombreEl = document.getElementById(`panel-nombre-${orden}`);
    const panelEl  = document.getElementById(`panel-${orden}`);
    if (!panelEl || !turnoEl) return false;

    if (idleEl) idleEl.style.display = 'none';
    turnoEl.style.display = 'flex';
    if (codigoEl) {
        codigoEl.textContent = codigo || '—';
        codigoEl.classList.remove('llamando');
        requestAnimationFrame(() => setTimeout(() => codigoEl.classList.add('llamando'), 50));
    }
    if (nombreEl) nombreEl.textContent = nombre || '';
    panelEl.classList.add('panel-activo');
    setTimeout(() => panelEl.classList.remove('panel-activo'), 3000);

    const tsEl = document.getElementById('ultimaActualizacion');
    if (tsEl) tsEl.textContent = new Date().toLocaleTimeString('es-ES',
        { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const dot = document.getElementById('conexionDot');
    if (dot) {
        dot.style.background = '#facc15'; dot.style.boxShadow = '0 0 12px #facc15';
        setTimeout(() => { dot.style.background = '#22c55e'; dot.style.boxShadow = '0 0 8px #22c55e'; }, 1000);
    }
    return true;
}

function mostrarTurnoEnPanel(orden, codigo, nombre, hablar = true) {
    if (orden === undefined || orden === null || orden < 0) return;

    if (panelState[orden]) { panelState[orden].codigo = codigo; panelState[orden].nombre = nombre; }
    guardarUltimoLlamado(orden, codigo, nombre);

    if (!_panelesListos) {
        console.warn(`[PANEL] ⏳ Panel ${orden} no listo aún — encolando`);
        _llamadosPendientes.push({ orden, codigo, nombre, hablar });
        return;
    }

    const ok = _renderTurnoEnPanel(orden, codigo, nombre);
    if (!ok) { console.warn(`[PANEL] Panel ${orden} no existe en el DOM`); return; }

    if (hablar) {
        const recepNombre = panelState[orden]?.recepcionistaNombre || String(orden + 1);
        setTimeout(() => encolarAnuncio(nombre, codigo, recepNombre), 500);
    }
}
function resolverOrdenPanel(data) {
    // Prioridad 1: panel_orden explícito del servidor
    if (data.panel_orden !== undefined && data.panel_orden !== null) return data.panel_orden;
    // Prioridad 2: buscar por recepcionista_id
    if (data.recepcionista_id) {
        const idx = miRecepcionistas.findIndex(r => r.id === data.recepcionista_id);
        if (idx >= 0) return idx;
    }
    // Prioridad 3: buscar por nombre
    const nombre = data.recepcionista_nombre || data.recepcion || '';
    if (nombre) {
        const idx = miRecepcionistas.findIndex(r => r.nombre_completo === nombre);
        if (idx >= 0) return idx;
    }
    console.warn(`[PANEL] No se pudo resolver panel para recepcionista, usando 0`);
    return 0;
}

// ========== LIMPIAR PANTALLA ==========

function limpiarPantalla() {
    panelState.forEach((ps, i) => {
        ps.codigo = null; ps.nombre = null;
        localStorage.removeItem(`screen_ultimo_${i}`);
        const idleEl   = document.getElementById(`panel-idle-${i}`);
        const turnoEl  = document.getElementById(`panel-turno-${i}`);
        const codigoEl = document.getElementById(`panel-codigo-${i}`);
        const nombreEl = document.getElementById(`panel-nombre-${i}`);
        if (idleEl)   idleEl.style.display  = 'flex';
        if (turnoEl)  turnoEl.style.display = 'none';
        if (codigoEl) { codigoEl.textContent = '—'; codigoEl.classList.remove('llamando'); }
        if (nombreEl) nombreEl.textContent = '';
    });
    _colaAudio = []; _reproduciendo = false;
    console.log('[PANEL] 🧹 Pantalla limpiada');
}

// ========== LISTENERS ==========

function registrarListeners(socketInstance) {
    if (_listenersRegistrados) return;
    _listenersRegistrados = true;
    socket = socketInstance;
    console.log('[TURNOS] 📡 Registrando listeners...');

    socket.on('numero_recepcion', (data) => {
        console.log('[TURNOS] numero_recepcion recibido:', data);
        const receps = data.recepcionistas;
        if (receps && receps.length > 0) {
            construirPaneles(receps);
        } else if (data.numRecepcion) {
            construirPaneles([{ id: null, nombre_completo: data.numRecepcion, orden: 0 }]);
        }
    });

    socket.on('recepcionistas_asignados', (data) => {
        console.log('[TURNOS] recepcionistas_asignados:', data);
        if (data.recepcionistas && data.recepcionistas.length > 0) {
            construirPaneles(data.recepcionistas);
        }
    });

    socket.on('llamar_paciente', (data) => {
        console.log('[TURNOS] llamar_paciente recibido:', data);
        const orden = resolverOrdenPanel(data);
        mostrarTurnoEnPanel(orden, data.codigo, data.nombre, true);
    });

    socket.on('limpiar_historial',   () => limpiarPantalla());
    socket.on('limpieza_completada', () => limpiarPantalla());

    socket.emit('pedir_numero_recepcion');

    console.log('[TURNOS] ✅ Listeners registrados');
}

// ========== INIT ==========

document.addEventListener('DOMContentLoaded', () => {
    console.log('[TURNOS] Inicializando módulo multipanel...');
    esperarSocketYRegistrar();
    document.addEventListener('click',      _desbloquearAudio, { once: true });
    document.addEventListener('touchstart', _desbloquearAudio, { once: true });
});

function esperarSocketYRegistrar() {
    const s = window.getSocketScreen ? window.getSocketScreen() : null;
    if (s) { registrarListeners(s); }
    else   { setTimeout(esperarSocketYRegistrar, 100); }
}

window.limpiarPantalla       = limpiarPantalla;
window.debugScreenMultipanel = () => {
    console.log('Recepcionistas:', miRecepcionistas);
    console.log('PanelState:',    panelState);
    console.log('PanelesListos:', _panelesListos);
    console.log('Pendientes:',    _llamadosPendientes.length);
    console.log('Cola audio:',    _colaAudio.length);
};
