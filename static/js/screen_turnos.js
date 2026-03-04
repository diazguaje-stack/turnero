// ============================================================
// screen_turnos.js  v4  — LUXURY BLUE
// Cambios: clase .llamando aplicada también a panel-nombre-paciente
// ============================================================

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

// ── Persistencia ─────────────────────────────────────────

function guardarUltimoLlamado(orden, codigo, nombre, medico) {
    try { localStorage.setItem(`screen_ultimo_${orden}`, JSON.stringify({ codigo, nombre, medico, ts: Date.now() })); } catch(e) {}
}
function recuperarUltimoLlamado(orden) {
    try { const d = localStorage.getItem(`screen_ultimo_${orden}`); return d ? JSON.parse(d) : null; } catch { return null; }
}

// ── Audio ─────────────────────────────────────────────────

function _getAudio() {
    if (!_audioEl) { _audioEl = new Audio(); _audioEl.preload = 'auto'; }
    return _audioEl;
}
function _desbloquearAudio() {
    if (_audioDesbloqueado) return;
    _audioDesbloqueado = true;
    const a = _getAudio();
    a.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
    a.play().catch(() => {});
}
function formatearCodigoParaVoz(codigo) {
    if (!codigo) return '';
    return codigo.split(/[-_]/).map(p => {
        if (/^[A-Za-z]+$/.test(p)) return p.split('').join(' ');
        if (/^\d+$/.test(p))       return parseInt(p, 10).toString();
        return p;
    }).join(', ');
}
function encolarAnuncio(nombre, codigo, recepcion) {
    const codigoHablado = formatearCodigoParaVoz(codigo);
    let texto1 = '';
    if (nombre && nombre.trim()) texto1 += `Paciente ${nombre}. `;
    texto1 += `Código ${codigoHablado}.`;
    const numRecepcion = String(recepcion || '').replace(/recepci[oó]n\s*/i, '').trim();
    const texto2 = numRecepcion ? `Diríjase a recepción ${numRecepcion}.` : null;

    // Cambio 3: 2 beeps de alerta antes del mensaje de voz
    _colaAudio.push({ beep: true });
    _colaAudio.push({ beep: true, pausa: 200 });
    _colaAudio.push({ pausa: 300 });          // pequeña pausa antes de hablar
    _colaAudio.push({ texto: texto1 });
    if (texto2) _colaAudio.push({ texto: texto2, pausa: 800 });

    if (!_reproduciendo) _procesarColaAudio();
}

/* Genera un beep corto con Web Audio API (sin depender de archivo externo) */
function _reproducirBeep() {
    return new Promise(resolve => {
        try {
            const ctx  = new (window.AudioContext || window.webkitAudioContext)();
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type      = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);          // La5 — tono de alerta claro
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
            osc.onended = () => { ctx.close(); resolve(); };
        } catch(e) { resolve(); }
    });
}
async function _procesarColaAudio() {
    if (_colaAudio.length === 0) { _reproduciendo = false; return; }
    _reproduciendo = true;
    const item = _colaAudio.shift();

    if (item.pausa) await new Promise(r => setTimeout(r, item.pausa));

    if (item.beep) {
        await _reproducirBeep();
    } else if (item.texto) {
        await reproducirAudio(item.texto);
    }
    _procesarColaAudio();
}
async function reproducirAudio(texto) {
    try {
        const res  = await fetch('/api/tts', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({texto}) });
        const data = await res.json();
        if (!data.success) return;
        const audio = _getAudio();
        audio.src = data.url + '?t=' + Date.now();
        audio.volume = 1.0;
        return new Promise(resolve => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            setTimeout(finish, 45000);
            audio.addEventListener('ended',          finish, { once:true });
            audio.addEventListener('error',          finish, { once:true });
            audio.addEventListener('abort',          finish, { once:true });
            audio.addEventListener('canplaythrough', () => audio.play().catch(finish), { once:true });
            audio.load();
        });
    } catch(e) { console.error('[TTS]', e); }
}

// ── Construcción de paneles ───────────────────────────────

function construirPaneles(recepcionistas) {
    _panelesListos   = false;
    miRecepcionistas = recepcionistas;
    const n          = recepcionistas.length;

    panelState = recepcionistas.map((r, i) => {
        const g = recuperarUltimoLlamado(i);
        return { orden:i, recepcionistaId:r.id, recepcionistaNombre:r.nombre_completo,
                 codigo:g?.codigo||null, nombre:g?.nombre||null, medico:g?.medico||null };
    });

    const cont = document.getElementById('multiPanelContainer');
    if (!cont) { console.warn('[PANEL] #multiPanelContainer no encontrado'); return; }

    const layoutClass = ['','layout-1','layout-2','layout-3','layout-4'][n] || 'layout-4';
    cont.className = `multi-panel-grid ${layoutClass}`;

    cont.innerHTML = recepcionistas.map((r, i) => `
        <div class="recepcion-panel" id="panel-${i}" data-orden="${i}">
            <div class="panel-header">
                <span class="panel-nombre-recepcion">${r.nombre_completo}</span>
            </div>
            <div class="panel-idle" id="panel-idle-${i}">
                <div class="panel-idle-icon">◇</div>
                <div class="panel-idle-text">Esperando llamada</div>
            </div>
            <div class="panel-turno" id="panel-turno-${i}" style="display:none;">
                <div class="panel-turno-label">Turno</div>
                <div class="panel-codigo" id="panel-codigo-${i}">—</div>
                <div class="panel-divider"></div>
                <div class="panel-nombre-paciente" id="panel-nombre-${i}"></div>
                <div class="panel-doctor" id="panel-doctor-${i}"></div>
            </div>
        </div>
    `).join('');

    // Restaurar último turno sin audio
    panelState.forEach(ps => { if (ps.codigo) _renderTurnoEnPanel(ps.orden, ps.codigo, ps.nombre, ps.medico); });

    _panelesListos = true;
    console.log(`[PANEL] ✅ ${n} panel(es) construidos`);

    if (_llamadosPendientes.length > 0) {
        const pendientes = [..._llamadosPendientes];
        _llamadosPendientes = [];
        pendientes.forEach(d => mostrarTurnoEnPanel(d.orden, d.codigo, d.nombre, d.medico, d.hablar));
    }
}

// ── Render de turno ───────────────────────────────────────

function _renderTurnoEnPanel(orden, codigo, nombre, medico) {
    const idleEl   = document.getElementById(`panel-idle-${orden}`);
    const turnoEl  = document.getElementById(`panel-turno-${orden}`);
    const codigoEl = document.getElementById(`panel-codigo-${orden}`);
    const nombreEl = document.getElementById(`panel-nombre-${orden}`);
    const doctorEl = document.getElementById(`panel-doctor-${orden}`);
    const panelEl  = document.getElementById(`panel-${orden}`);
    if (!panelEl || !turnoEl) return false;

    if (idleEl)  idleEl.style.display  = 'none';
    turnoEl.style.display = 'flex';

    if (codigoEl) {
        codigoEl.textContent = codigo || '—';
        codigoEl.classList.remove('llamando');
        // Pequeño delay para que la animación CSS se re-dispare siempre
        requestAnimationFrame(() => setTimeout(() => codigoEl.classList.add('llamando'), 50));
    }
    if (nombreEl) {
        nombreEl.textContent = nombre || '';
        nombreEl.classList.remove('llamando');
        // Mismo delay con offset para que el glow del nombre empiece ligeramente después
        requestAnimationFrame(() => setTimeout(() => nombreEl.classList.add('llamando'), 250));
    }
    if (doctorEl) doctorEl.textContent = medico || '';

    panelEl.classList.add('panel-activo');
    setTimeout(() => panelEl.classList.remove('panel-activo'), 3000);

    const tsEl = document.getElementById('ultimaActualizacion');
    if (tsEl) tsEl.textContent = new Date().toLocaleTimeString('es-ES',
        { hour:'2-digit', minute:'2-digit', second:'2-digit' });

    const dot = document.getElementById('conexionDot');
    if (dot) {
        dot.style.background = '#f0d070'; dot.style.boxShadow = '0 0 14px #f0d070';
        setTimeout(() => { dot.style.background='#22d66e'; dot.style.boxShadow='0 0 8px #22d66e'; }, 1400);
    }
    return true;
}

// ── Mostrar turno (API pública) ───────────────────────────

function mostrarTurnoEnPanel(orden, codigo, nombre, medico, hablar = true) {
    if (orden === undefined || orden === null || orden < 0) return;
    if (panelState[orden]) {
        panelState[orden].codigo = codigo;
        panelState[orden].nombre = nombre;
        panelState[orden].medico = medico;
    }
    guardarUltimoLlamado(orden, codigo, nombre, medico);

    if (!_panelesListos) {
        _llamadosPendientes.push({ orden, codigo, nombre, medico, hablar });
        return;
    }
    const ok = _renderTurnoEnPanel(orden, codigo, nombre, medico);
    if (!ok) return;
    if (hablar) {
        const recepNombre = panelState[orden]?.recepcionistaNombre || String(orden + 1);
        setTimeout(() => encolarAnuncio(nombre, codigo, recepNombre), 500);
    }
}

function resolverOrdenPanel(data) {
    if (data.panel_orden !== undefined && data.panel_orden !== null) return data.panel_orden;
    if (data.recepcionista_id) {
        const idx = miRecepcionistas.findIndex(r => r.id === data.recepcionista_id);
        if (idx >= 0) return idx;
    }
    const nombre = data.recepcionista_nombre || data.recepcion || '';
    if (nombre) {
        const idx = miRecepcionistas.findIndex(r => r.nombre_completo === nombre);
        if (idx >= 0) return idx;
    }
    return 0;
}

// ── Limpiar ───────────────────────────────────────────────

function limpiarPantalla() {
    panelState.forEach((ps, i) => {
        ps.codigo=null; ps.nombre=null; ps.medico=null;
        localStorage.removeItem(`screen_ultimo_${i}`);
        const idleEl   = document.getElementById(`panel-idle-${i}`);
        const turnoEl  = document.getElementById(`panel-turno-${i}`);
        const codigoEl = document.getElementById(`panel-codigo-${i}`);
        const nombreEl = document.getElementById(`panel-nombre-${i}`);
        const doctorEl = document.getElementById(`panel-doctor-${i}`);
        if (idleEl)   idleEl.style.display  = 'flex';
        if (turnoEl)  turnoEl.style.display = 'none';
        if (codigoEl) { codigoEl.textContent='—'; codigoEl.classList.remove('llamando'); }
        if (nombreEl) { nombreEl.textContent=''; nombreEl.classList.remove('llamando'); }
        if (doctorEl) doctorEl.textContent = '';
    });
    _colaAudio=[]; _reproduciendo=false;
}

// ── Listeners ─────────────────────────────────────────────

function registrarListeners(socketInstance) {
    if (_listenersRegistrados) return;
    _listenersRegistrados = true;
    socket = socketInstance;

    socket.on('numero_recepcion', (data) => {
        const receps = data.recepcionistas;
        if (receps && receps.length > 0) construirPaneles(receps);
        else if (data.numRecepcion) construirPaneles([{ id:null, nombre_completo:data.numRecepcion, orden:0 }]);
    });

    socket.on('recepcionistas_asignados', (data) => {
        if (data.recepcionistas && data.recepcionistas.length > 0) construirPaneles(data.recepcionistas);
    });

    socket.on('llamar_paciente', (data) => {
        const orden  = resolverOrdenPanel(data);
        const medico = data.medico || data.medico_nombre || null;
        mostrarTurnoEnPanel(orden, data.codigo, data.nombre, medico, true);
    });

    socket.on('limpiar_historial',   () => limpiarPantalla());
    socket.on('limpieza_completada', () => limpiarPantalla());

    socket.emit('pedir_numero_recepcion');
}

// ── Init ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    esperarSocketYRegistrar();
    document.addEventListener('click',      _desbloquearAudio, { once:true });
    document.addEventListener('touchstart', _desbloquearAudio, { once:true });
});

function esperarSocketYRegistrar() {
    const s = window.getSocketScreen ? window.getSocketScreen() : null;
    if (s) registrarListeners(s);
    else   setTimeout(esperarSocketYRegistrar, 100);
}

window.limpiarPantalla = limpiarPantalla;
window.debugScreen = () => ({
    recepcionistas: miRecepcionistas, panelState,
    panelesListos: _panelesListos,
    pendientes: _llamadosPendientes.length,
    colaAudio: _colaAudio.length
});