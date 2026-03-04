// ============================================================
// screen_vinculacion.js
// Responsabilidad: comunicación con pantallas.js (admin)
// Maneja: fingerprint, /api/screen/init, estados de vinculación,
//         recepcionista en esquina, sala 'screen'
//
// IMPORTANTE: expone window.getSocketScreen() SOLO cuando el socket
// ya confirmó unirse a la sala 'screen' (evento 'joined').
// screen_turnos.js espera esta confirmación antes de registrar sus listeners.
// ============================================================

const API_URL = window.location.origin;
const SCREEN_API = {
    init:   `${API_URL}/api/screen/init`,
    status: `${API_URL}/api/screen/status`
};

let deviceFingerprint     = null;
let pantallaData          = null;
let intentoInicializacion = 0;
let _socket               = null;
let _socketListo          = false;   // true cuando 'joined' confirmó sala 'screen'
let _desconexionIntencional = false; // flag para distinguir refresh de cierre

const MAX_INTENTOS    = 5;
const DELAY_REINTENTO = 3000;

// ── API pública para screen_turnos.js ──────────────────────
// Devuelve el socket SOLO si ya está en sala 'screen'.
// screen_turnos.js llama esto en loop hasta que sea truthy.
window.getSocketScreen = () => (_socketListo ? _socket : null);

// =========================
// ARRANQUE
// =========================

document.addEventListener('DOMContentLoaded', () => {
    console.log('[VIN] Iniciando módulo de vinculación...');
    // Generar fingerprint ANTES de conectar el socket
    deviceFingerprint = generarDeviceFingerprint();
    conectarSocket();       // ya tiene el fingerprint disponible
    inicializarPantalla();
});

window.addEventListener('beforeunload', () => {
    // Detectar si es refresh (F5, Ctrl+R) vs cierre de pestaña
    // En refresh, el socket se reconectará automáticamente
    // Solo desconectar manualmente si es un cierre intencional
    _desconexionIntencional = true;
    if (_socket && !_isRefresh()) {
        _socket.disconnect();
    }
});

// Detecta si es un refresh en lugar de un cierre
function _isRefresh() {
    // Si hay performance.navigation (deprecated pero útil como fallback)
    if (window.performance && window.performance.navigation) {
        return window.performance.navigation.type === 1; // TYPE_RELOAD
    }
    // En navegadores modernos, asumir que beforeunload + navegación es refresh
    // No hay forma 100% confiable, pero el socket se reconectará de todos modos
    return true;
}

// =========================
// WEBSOCKET
// =========================

function conectarSocket() {
    _socket = io();

    _socket.on('connect', () => {
        console.log('[VIN] Socket conectado:', _socket.id);
        _socketListo = false;                          // resetear en cada reconexión
        _socket.emit('join', { 
            room: 'screen',
            device_fingerprint: deviceFingerprint 
        });     // pedir unirse a la sala
    });
    _socket.on('pantalla_reseteada', (data) => {
        console.log('[VIN] 🔄 pantalla_reseteada recibido:', data.motivo);

        // Limpiar fingerprint del localStorage para forzar nuevo registro
        localStorage.removeItem('screen_device_id');

        // Mostrar mensaje breve y recargar para reiniciar flujo desde cero
        mostrarError(`🔄 ${data.mensaje || 'Reiniciando pantalla...'}`);
        setTimeout(() => location.reload(), 2000);
    });


    // ← join confirmado por el backend → AHORA el socket está en la sala
    _socket.on('joined', (data) => {
        console.log('[VIN] ✅ Unido a sala:', data.room);
        _socketListo = true;

        consultarStatus().then(sd => {
            if (!sd) return;

            if (sd.status === 'vinculada' && sd.pantalla) {
                pantallaData = sd.pantalla;
                actualizarRecepcionista(pantallaData);
                actualizarTimestamp();
                mostrarVinculada(pantallaData);
                console.log('[VIN] ✅ Estado restaurado: vinculada');

                if (pantallaData.id) {
                    _socket.emit('join_screen_propia', {
                        pantalla_id:        pantallaData.id,
                        device_fingerprint: deviceFingerprint
                    });
                }

            } else if (sd.status === 'pendiente' && sd.pantalla) {
                pantallaData = sd.pantalla;
                mostrarPendiente(pantallaData);
                console.log('[VIN] ⏳ Estado restaurado: pendiente');

            } else if (sd.status === 'desvinculada') {
                // El device_id ya no existe en la BD → limpiar y reiniciar
                console.log('[VIN] 🔄 Dispositivo desvinculado → limpiando localStorage');
                localStorage.removeItem('screen_device_id');
                setTimeout(() => location.reload(), 1000);

            } else {
                // Estado 'disponible' u otro inesperado → reiniciar flujo
                console.log('[VIN] 🔄 Estado inesperado:', sd.status, '→ reiniciando');
                localStorage.removeItem('screen_device_id');
                setTimeout(() => location.reload(), 1000);
            }
        }).catch(err => {
            console.error('[VIN] Error restaurando estado:', err);
        });
    });



    _socket.on('disconnect', (reason) => {
        console.log('[VIN] Socket desconectado:', reason);
        _socketListo = false;
        // NO recargar automáticamente en cada desconexión
        // El socket se reconectará automáticamente con socket.io
    });

    // ── Admin vinculó → mostrar pantalla activa ──
    _socket.on('pantalla_vinculada', (data) => {
        console.log('[VIN] pantalla_vinculada:', data);

        // ── Unirse a sala propia usando el nuevo evento dedicado ──
        if (data.pantalla_id) {
            _socket.emit('join_screen_propia', {
                pantalla_id:        data.pantalla_id,
                device_fingerprint: deviceFingerprint
            });
            console.log('[VIN] Solicitando unión a sala propia:', `screen_${data.pantalla_id}`);
        }

        consultarStatus().then(sd => {
            if (sd?.status === 'vinculada') {
                pantallaData = sd.pantalla;
                
                // ← ASEGURAR que se llama actualizarRecepcionista
                console.log('[VIN] Datos de pantalla:', pantallaData);
                actualizarRecepcionista(pantallaData);  // ← AQUÍ
                
                mostrarVinculada(pantallaData);
            }
        }).catch(() => {
            if (_desconexionIntencional === false) {
                location.reload();
            }
        });
    });
    // ── Admin desvinculó → recargar ──
    _socket.on('pantalla_desvinculada', () => {
        console.log('[VIN] pantalla_desvinculada');
        detenerYRecargar('desvinculada', 1500);
    });

        // ── Recepcionista cambiado ──
    _socket.on('recepcionista_asignado', (data) => {
        console.log('[VIN] recepcionista_asignado:', data);
        if (pantallaData) {
            pantallaData.recepcionista_nombre = data.recepcionista_nombre;
            
            console.log('[VIN] Nombre actualizado:', data.recepcionista_nombre);
            
            // ← ASEGURAR que se actualiza el corner
            actualizarRecepcionista(pantallaData);  // ← AQUÍ
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

        // Esperar hasta 3s a que el socket confirme join a sala 'screen'
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

// Espera hasta `maxMs` a que _socketListo sea true
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
// RECEPCIONISTA — esquina superior izquierda
// =========================

function actualizarRecepcionista(pantalla) {
    const nombre   = pantalla?.recepcionista_nombre || '';
    const corner   = document.getElementById('recepcionistaCorner');
    const nameEl   = document.getElementById('cornerName');
    
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