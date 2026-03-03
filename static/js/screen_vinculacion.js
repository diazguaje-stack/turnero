
const API_URL = window.location.origin;
const SCREEN_API = {
    init:      `${API_URL}/api/screen/init`,
    status:    `${API_URL}/api/screen/status`,
    // 🔧 FIX: endpoint solo lectura para preview (no modifica estado)
    statusById: (id) => `${API_URL}/api/screen/status-by-id/${id}`
};

let deviceFingerprint       = null;
let pantallaData            = null;
let intentoInicializacion   = 0;
let _socket                 = null;
let _socketListo            = false;
let _desconexionIntencional = false;
let _esPreview              = false; // 🔧 FIX: flag global de modo preview

const MAX_INTENTOS    = 5;
const DELAY_REINTENTO = 3000;

window.getSocketScreen = () => (_socketListo ? _socket : null);

// =========================
// ARRANQUE
// =========================

document.addEventListener('DOMContentLoaded', () => {
    // ── 🔧 FIX: Detectar modo PREVIEW ────────────────────────────────────────
    const urlParams  = new URLSearchParams(window.location.search);
    _esPreview       = urlParams.get('preview') === 'true';
    const pantallaId = urlParams.get('pantalla_id');

    if (_esPreview) {
        console.log('[VIN] 👁️ Modo PREVIEW — solo lectura, sin socket ni fingerprint');
        _activarModoPreview(pantallaId);
        return; // ← NO conectar socket, NO llamar init, NO generar fingerprint
    }

    // ── Flujo normal ──────────────────────────────────────────────────────────
    console.log('[VIN] Iniciando módulo de vinculación...');
    deviceFingerprint = generarDeviceFingerprint();
    conectarSocket();
    inicializarPantalla();
});

// 🔧 FIX: beforeunload solo actúa si NO es preview
window.addEventListener('beforeunload', () => {
    if (_esPreview) return; // preview se puede cerrar libremente
    _desconexionIntencional = true;
    if (_socket && !_isRefresh()) {
        _socket.disconnect();
    }
});

function _isRefresh() {
    if (window.performance && window.performance.navigation) {
        return window.performance.navigation.type === 1;
    }
    return true;
}

// =========================
// 🔧 FIX: MODO PREVIEW
// Carga el estado actual de la pantalla por ID via HTTP
// sin crear socket ni fingerprint. Es pura vista.
// =========================

async function _activarModoPreview(pantallaId) {
    // Mostrar banner de preview para que el admin sepa que es solo lectura
    _mostrarBannerPreview();

    if (!pantallaId) {
        mostrarError('Vista previa: pantalla_id no especificado');
        return;
    }

    try {
        const token    = sessionStorage.getItem('jwt_token')
                      || localStorage.getItem('jwt_token_admin');
        const headers  = token
            ? { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
            : { 'Content-Type': 'application/json' };

        const response = await fetchConTimeout(SCREEN_API.statusById(pantallaId), {
            method: 'GET',
            headers
        }, 8000);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (!data.success || !data.pantalla) {
            mostrarError('Vista previa: no se pudo obtener el estado de la pantalla');
            return;
        }

        pantallaData = data.pantalla;

        const nombreRecepcion = pantallaData.recepcionista_nombre 
                             || String(pantallaData.numero);
        window._previewNumeroRecepcion = nombreRecepcion;
        console.log('[VIN] Preview recepcion asignada:', nombreRecepcion);

        if (data.status === 'vinculada') {
            mostrarVinculada(pantallaData);
            
            // FIX: Forzar restauración del turno después de que el DOM esté visible
            setTimeout(() => {
                const numRec = window._previewNumeroRecepcion;
                if (!numRec) return;
                
                // Buscar en localStorage con la key normalizada
                const key = numRec.toLowerCase()
                    .replace(/recepci[oó]n\s*/i, '')
                    .trim() || numRec;
                
                const guardadoRaw = localStorage.getItem(`screen_ultimo_llamado_${key}`);
                if (guardadoRaw) {
                    try {
                        const guardado = JSON.parse(guardadoRaw);
                        console.log('[VIN/PREVIEW] 🔄 Restaurando turno desde preview:', guardado);
                        if (typeof mostrarTurnoLlamado === 'function') {
                            mostrarTurnoLlamado(guardado.codigo, guardado.nombre, guardado.recepcion || null, false);
                        }
                    } catch(e) {
                        console.warn('[VIN/PREVIEW] Error parseando turno guardado:', e);
                    }
                } else {
                    console.log('[VIN/PREVIEW] Sin turno guardado para recepción:', numRec);
                }
            }, 800); // esperar a que screen_turnos.js esté listo
            
        } else if (data.status === 'pendiente') {
            mostrarPendiente(pantallaData);
        } else {
            mostrarError(`Vista previa — estado: ${data.status}`);
        }

        _suscribirPreviewSoloLectura(pantallaId);

    } catch (error) {
        console.error('[VIN] Error en modo preview:', error);
        mostrarError(`Vista previa — Error: ${error.message}`);
    }
}

function _mostrarBannerPreview() {
    const banner = document.createElement('div');
    banner.id    = 'previewBanner';
    banner.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0;
        background: rgba(99, 102, 241, 0.92);
        color: #fff;
        text-align: center;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.5px;
        z-index: 9999;
        pointer-events: none;
    `;
    banner.textContent = '👁️ MODO VISTA PREVIA — Solo lectura | Esta ventana no afecta la pantalla real';
    document.body.appendChild(banner);
}

function _suscribirPreviewSoloLectura(pantallaId) {
    try {
        const s = io({ 
            reconnection: false,
            transports: ['websocket']
        });
        
        _socket = s;
        _socketListo = true;
        s.on('connect', () => {
            s.emit('join', { room: 'admin' });
            s.emit('join', { room: `screen_${pantallaId}` });
            console.log('[VIN/PREVIEW] 👁️ Conectado como observador pasivo');
            s.emit('pedir_numero_recepcion_preview', { pantalla_id: pantallaId });
        });


        s.on('recepcionista_asignado', (data) => {
            if (String(data.pantalla_id) === String(pantallaId) && pantallaData) {
                pantallaData.recepcionista_nombre = data.recepcionista_nombre;
                actualizarRecepcionista(pantallaData);
                window._previewNumeroRecepcion=data.recepcionista_nombre;
                console.log('[VIN/PREVIEW] Recepcionista actualizado en preview:', data.recepcionista_nombre);
            }
        });

        // Si la pantalla real se desvincula, mostrar estado actualizado
        s.on('pantalla_desvinculada', (data) => {
            if (String(data.pantalla_id) === String(pantallaId)) {
                mostrarError('La pantalla real fue desvinculada');
            }
        });

        // NO escuchar 'disconnect' para recargar — el preview puede quedarse abierto
        s.on('disconnect', () => {
            console.log('[VIN/PREVIEW] Observador desconectado (normal al cerrar)');
        });

    } catch (e) {
        // Si falla la suscripción pasiva, el preview sigue funcionando en modo estático
        console.warn('[VIN/PREVIEW] No se pudo suscribir a eventos en tiempo real:', e);
    }
}

// =========================
// WEBSOCKET (solo flujo normal)
// =========================

function conectarSocket() {
    _socket = io();

    _socket.on('connect', () => {
        console.log('[VIN] Socket conectado:', _socket.id);
        _socketListo = false;
        _socket.emit('join', {
            room: 'screen',
            device_fingerprint: deviceFingerprint
        });
    });

    _socket.on('joined', (data) => {
        console.log('[VIN] ✅ Unido a sala:', data.room);
        _socketListo = true;
        consultarStatus().then(sd => {
            if (sd?.status === 'vinculada' && sd.pantalla) {
                pantallaData = sd.pantalla;
                actualizarRecepcionista(pantallaData);
                actualizarTimestamp();
                mostrarVinculada(pantallaData);
                console.log('[VIN] ✅ Estado restaurado después de reconexión');
            }
        }).catch(err => {
            console.error('[VIN] Error restaurando estado:', err);
        });
    });

    _socket.on('disconnect', (reason) => {
        console.log('[VIN] Socket desconectado:', reason);
        _socketListo = false;
    });

    _socket.on('pantalla_vinculada', (data) => {
        console.log('[VIN] pantalla_vinculada:', data);
        if (data.pantalla_id) {
            _socket.emit('join_screen_propia', {
                pantalla_id:        data.pantalla_id,
                device_fingerprint: deviceFingerprint
            });
        }
        consultarStatus().then(sd => {
            if (sd?.status === 'vinculada') {
                pantallaData = sd.pantalla;
                actualizarRecepcionista(pantallaData);
                mostrarVinculada(pantallaData);
            }
        }).catch(() => {
            if (!_desconexionIntencional) location.reload();
        });
    });

    _socket.on('pantalla_desvinculada', () => {
        console.log('[VIN] pantalla_desvinculada');
        detenerYRecargar('desvinculada', 1500);
    });

    _socket.on('recepcionista_asignado', (data) => {
        console.log('[VIN] recepcionista_asignado:', data);
        if (pantallaData) {
            pantallaData.recepcionista_nombre = data.recepcionista_nombre;
            actualizarRecepcionista(pantallaData);
            actualizarTimestamp();
        }
    });
}

// =========================
// FETCH CON TIMEOUT
// =========================

function fetchConTimeout(url, opts = {}, ms = 10000) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal })
        .finally(() => clearTimeout(timer));
}

// =========================
// INIT HTTP
// =========================

async function inicializarPantalla() {
    try {
        deviceFingerprint = generarDeviceFingerprint();

        const response = await fetchConTimeout(SCREEN_API.init, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ device_fingerprint: deviceFingerprint })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        console.log('[VIN] Estado inicial:', data.status);

        if (!data.success) {
            mostrarError(data.message || 'Error al inicializar');
            return;
        }

        pantallaData          = data.pantalla;
        intentoInicializacion = 0;

        await esperarSocketListo(3000);

        switch (data.status) {
            case 'vinculada': mostrarVinculada(pantallaData); break;
            case 'pendiente': mostrarPendiente(pantallaData); break;
            default: mostrarError('Estado de pantalla desconocido');
        }

    } catch (error) {
        intentoInicializacion++;
        let msg = 'Error de conexión';
        if (error.name === 'AbortError')                    msg = 'Timeout del servidor';
        else if (error.message.includes('Failed to fetch')) msg = `Sin conexión a ${API_URL}`;
        else if (error.message.includes('HTTP'))            msg = error.message;

        if (intentoInicializacion < MAX_INTENTOS) {
            mostrarError(`${msg} — Reintentando (${intentoInicializacion}/${MAX_INTENTOS})...`);
            setTimeout(inicializarPantalla, DELAY_REINTENTO);
        } else {
            mostrarError(`${msg}\n\nVerifica el servidor en ${API_URL}`);
        }
    }
}

function esperarSocketListo(maxMs = 3000) {
    return new Promise(resolve => {
        if (_socketListo) return resolve();
        const t   = setTimeout(resolve, maxMs);
        const chk = setInterval(() => {
            if (_socketListo) { clearInterval(chk); clearTimeout(t); resolve(); }
        }, 50);
    });
}

// =========================
// CONSULTAR STATUS
// =========================

async function consultarStatus() {
    const r = await fetchConTimeout(SCREEN_API.status, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ device_fingerprint: deviceFingerprint })
    }, 8000);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}

// =========================
// DETENER Y RECARGAR
// =========================

function detenerYRecargar(motivo = 'desvinculada', delay = 3000) {
    if (motivo === 'desvinculada') {
        localStorage.removeItem('screen_device_id');
        mostrarError('🔌 Pantalla desvinculada por el administrador.\n\nRecargando...');
    } else {
        mostrarError('⚠️ Conexión perdida.\n\nRecargando...');
    }
    setTimeout(() => location.reload(), delay);
}

// =========================
// MOSTRAR ESTADOS
// =========================

function mostrarPendiente(pantalla) {
    document.getElementById('connectingState').style.display = 'none';
    document.getElementById('linkedState').style.display     = 'none';
    const ps = document.getElementById('pendingState');
    if (ps) ps.style.display = 'flex';
    const el = document.getElementById('codigoVinculacion');
    if (el && pantalla?.codigo_vinculacion) el.textContent = pantalla.codigo_vinculacion;
    console.log('[VIN] Estado: pendiente');
}

function mostrarVinculada(pantalla) {
    document.getElementById('connectingState').style.display = 'none';
    const ps = document.getElementById('pendingState');
    if (ps) ps.style.display = 'none';
    const ls = document.getElementById('linkedState');
    if (ls) ls.style.display = 'flex';
    actualizarRecepcionista(pantalla);
    actualizarTimestamp();
    console.log('[VIN] Estado: vinculada ✅');
}

// =========================
// RECEPCIONISTA
// =========================

function actualizarRecepcionista(pantalla) {
    const nombre = pantalla?.recepcionista_nombre || '';
    const corner = document.getElementById('recepcionistaCorner');
    const nameEl = document.getElementById('cornerName');
    console.log('[VIN] Actualizando recepcionista:', nombre);
    if (nameEl) {
        nameEl.textContent = nombre || 'Sin asignar';
        console.log('[VIN] ✅ cornerName actualizado:', nombre);
    }
    if (corner) {
        corner.classList.toggle('visible', !!nombre);
        console.log('[VIN] ✅ corner visible:', !!nombre);
    }
}

// =========================
// TIMESTAMP / DOT
// =========================

function actualizarTimestamp() {
    const el = document.getElementById('ultimaActualizacion');
    if (el) el.textContent = new Date().toLocaleTimeString('es-ES', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const dot = document.getElementById('conexionDot');
    if (dot) {
        dot.style.background = '#4ade80';
        dot.style.boxShadow  = '0 0 10px #4ade80';
        setTimeout(() => {
            if (dot) { dot.style.background = '#22c55e'; dot.style.boxShadow = '0 0 8px #22c55e'; }
        }, 800);
    }
}

// =========================
// ERROR
// =========================

function mostrarError(msg) {
    const el = document.getElementById('errorMessage');
    if (el) {
        el.innerHTML = `<div style="text-align:center;line-height:1.7;">
            <div style="font-size:28px;margin-bottom:10px;">⚠️</div>
            <div>${msg.replace(/\n/g, '<br>')}</div>
        </div>`;
        el.classList.add('show');
    }
    const cs = document.getElementById('connectingState');
    if (cs) cs.style.display = 'none';
    console.error('[VIN]', msg);
}
// =========================
// FINGERPRINT
// =========================

function generarDeviceFingerprint() {
    let deviceId = localStorage.getItem('screen_device_id');
    if (!deviceId) {
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font         = '14px Arial';
        ctx.fillText('fp', 2, 2);
        deviceId = btoa([
            navigator.userAgent, navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            canvas.toDataURL(),
            Math.random().toString(36).substring(7)
        ].join('|')).substring(0, 64);
        localStorage.setItem('screen_device_id', deviceId);
    }
    return deviceId;
}