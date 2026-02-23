// screen.js - Sistema de vinculación de pantallas v2
const API_URL = window.location.origin;
const SCREEN_API = {
    init:   `${API_URL}/api/screen/init`,
    status: `${API_URL}/api/screen/status`
};

let deviceFingerprint     = null;
let statusCheckInterval   = null;
let pantallaData          = null;
let intentoInicializacion = 0;
let erroresConsecutivos   = 0;
const MAX_INTENTOS    = 5;
const DELAY_REINTENTO = 3000;

// =========================
// INICIALIZACIÓN
// =========================

// screen.js — reemplaza el final del archivo
document.addEventListener('DOMContentLoaded', () => {
    console.log('📺 Pantalla de turnos iniciando...');
    inicializarPantalla();
    conectarSocketScreen();   // ← ahora junto con la inicialización
});

window.addEventListener('beforeunload', () => {
    if (statusCheckInterval) clearInterval(statusCheckInterval);
    if (socketScreen) socketScreen.disconnect();
});
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
        ctx.fillText('fingerprint', 2, 2);

        deviceId = btoa([
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            canvas.toDataURL(),
            Math.random().toString(36).substring(7)
        ].join('|')).substring(0, 64);

        localStorage.setItem('screen_device_id', deviceId);
    }

    return deviceId;
}

// =========================
// FIX #6 — fetch con timeout real (AbortController)
// El original usaba `timeout: 10000` que fetch ignora silenciosamente
// =========================

function fetchConTimeout(url, opciones = {}, ms = 10000) {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...opciones, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

// =========================
// INICIALIZAR PANTALLA
// =========================

async function inicializarPantalla() {
    try {
        deviceFingerprint = generarDeviceFingerprint();
        mostrarDeviceId();

        console.log(`🔗 Conectando a: ${SCREEN_API.init}`);

        const response = await fetchConTimeout(SCREEN_API.init, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ device_fingerprint: deviceFingerprint })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const data = await response.json();
        console.log('📊 Estado inicial:', data.status);

        if (data.success) {
            pantallaData          = data.pantalla;
            intentoInicializacion = 0;

            // Esperar a que el socket esté en sala 'screen' antes de procesar estado
            await new Promise(resolve => {
                if (socketScreen && socketScreen.connected) {
                    resolve();
                } else {
                    // Dar hasta 2s para que el socket se conecte
                    const t = setTimeout(resolve, 2000);
                    const chk = setInterval(() => {
                        if (socketScreen && socketScreen.connected) {
                            clearInterval(chk);
                            clearTimeout(t);
                            resolve();
                        }
                    }, 100);
                }
            });

            switch (data.status) {
                case 'vinculada':
                    mostrarPantallaTrabajo(pantallaData);
                    iniciarMonitoreo('estado');
                    break;
                case 'pendiente':
                    mostrarEstadoPendiente(pantallaData);
                    iniciarMonitoreo('vinculacion');
                    break;
                default:
                    mostrarError('Estado de pantalla desconocido');
            }
        } else {
            mostrarError(data.message || 'Error al inicializar pantalla');
        }

    } catch (error) {
        intentoInicializacion++;
        console.error('❌ Error al inicializar:', error.message);

        let msg = 'Error de conexión con el servidor';
        if (error.name === 'AbortError')                    msg = 'Timeout — el servidor tardó demasiado';
        else if (error.message.includes('Failed to fetch')) msg = `No se puede conectar a ${API_URL}`;
        else if (error.message.includes('HTTP'))            msg = `Error del servidor: ${error.message}`;

        if (intentoInicializacion < MAX_INTENTOS) {
            mostrarError(`${msg} — Reintentando (${intentoInicializacion}/${MAX_INTENTOS})...`);
            setTimeout(inicializarPantalla, DELAY_REINTENTO);
        } else {
            mostrarError(`${msg}\n\nVerifica que el servidor esté corriendo en ${API_URL}`);
        }
    }
}

function iniciarMonitoreo(modo) {
    // ── Polling eliminado: socket maneja todo en tiempo real ──
    console.log(`✅ Modo socket activo (sin polling): ${modo}`);
}

async function tickVinculacion() {
    try {
        const data = await consultarStatus();
        if (!data) return;

        erroresConsecutivos = 0; // reset en cada respuesta exitosa

        if (data.status === 'desvinculada') {
            console.log('🔌 Cancelado por el administrador durante pendiente');
            detenerYRecargar('desvinculada');
            return;
        }

        if (data.status === 'vinculada') {
            console.log('🎉 ¡Pantalla vinculada!');
            clearInterval(statusCheckInterval);
            statusCheckInterval = null;
            pantallaData = data.pantalla;
            mostrarPantallaTrabajo(pantallaData);
            iniciarMonitoreo('estado');
        }
        // 'pendiente' → seguir esperando, no hacer nada

    } catch (error) {
        erroresConsecutivos++;
        console.warn(`⚠️ Error #${erroresConsecutivos} en vinculación:`, error.message);
        if (erroresConsecutivos >= 5) {
            console.error('❌ Sin conexión durante vinculación — reintentando desde cero');
            detenerYRecargar('error', 4000);
        }
    }
}

// =========================
// FIX #1 #3 #5 — tick de estado con 3 correcciones:
//   #1: detecta desvinculación ANTES de comprobar data.pantalla
//   #3: usa actualizarRecepcionista() (que existía pero nunca se llamaba)
//   #5: llama actualizarUltimaActualizacion() en cada tick
// =========================

async function tickEstado() {
    try {
        const data = await consultarStatus();
        if (!data) return;

        erroresConsecutivos = 0;

        // ── Caso 1: desvinculación explícita ────────────────────────────────
        // El admin pulsó "Desvincular": backend borra device_id y retorna
        // { status:'desvinculada' } SIN campo 'pantalla'.
        if (data.status === 'desvinculada') {
            console.log('🔌 Señal de desvinculación recibida');
            detenerYRecargar('desvinculada');
            return;
        }

        // ── Caso 2: estado 'pendiente' con device_id activo ─────────────────
        // Ocurre cuando el admin usa el botón "Cancelar" en una pantalla
        // PENDIENTE que ya tiene device_id asignado. El backend pone
        // estado='disponible' y borra device_id, pero puede haber un tick
        // de polling que llega justo antes de que la DB confirme el cambio
        // y retorna 'pendiente' aún.
        // → NO recargar ni borrar localStorage: simplemente esperar al
        //   siguiente tick donde ya llegará 'desvinculada'.
        if (data.status === 'pendiente') {
            console.log('⏳ Estado pendiente transitorio — esperando siguiente tick');
            return;
        }

        // ── Caso 3: cualquier otro estado no manejado ────────────────────────
        // (ej: 'disponible') → la pantalla fue liberada de otra forma
        if (data.status !== 'vinculada') {
            console.warn(`⚠️ Estado inesperado: ${data.status} — recargando sin borrar ID`);
            detenerYRecargar('inesperado');
            return;
        }

        // ── Caso 4: sigue vinculada → actualizar UI ──────────────────────────
        if (data.pantalla) {
            const anterior = pantallaData;
            pantallaData   = data.pantalla;

            if (anterior?.recepcionista_nombre !== pantallaData.recepcionista_nombre) {
                console.log('🔄 Recepcionista actualizado:', pantallaData.recepcionista_nombre);
                actualizarRecepcionista(pantallaData);
            }

            actualizarUltimaActualizacion();
        }

    } catch (error) {
        erroresConsecutivos++;
        console.warn(`⚠️ Error #${erroresConsecutivos} al verificar estado:`, error.message);

        if (erroresConsecutivos >= 5) {
            console.error('❌ Demasiados errores — reconectando');
            mostrarError('Conexión perdida. Reconectando...');
            detenerYRecargar('error', 4000);
        }
    }
}

// =========================
// HELPER: consulta de status centralizada con timeout
// =========================

async function consultarStatus() {
    const response = await fetchConTimeout(SCREEN_API.status, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ device_fingerprint: deviceFingerprint })
    }, 8000);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

// =========================
// HELPER: detener intervalo y recargar.
// motivo='desvinculada' → borra device_id (admin desvinculó, empezar de cero)
// motivo='inesperado' o 'error' → conserva device_id (puede ser transitorio)
// =========================

function detenerYRecargar(motivo = 'desvinculada', delay = 3000) {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        statusCheckInterval = null;
    }

    if (motivo === 'desvinculada') {
        localStorage.removeItem('screen_device_id');
        mostrarError('🔌 Esta pantalla fue desvinculada por el administrador.\n\nRecargando...');
    } else {
        mostrarError('⚠️ Se perdió la conexión con el servidor.\n\nRecargando...');
    }

    setTimeout(() => location.reload(), delay);
}

// =========================
// MOSTRAR ESTADOS
// =========================

function mostrarDeviceId() {
    const el = document.getElementById('deviceIdDisplay');
    if (el && deviceFingerprint) el.textContent = deviceFingerprint;
}

function mostrarEstadoPendiente(pantalla) {
    try {
        const el = document.getElementById('connectingState');
        if (el) el.style.display = 'none';
        const li = document.getElementById('linkedState');
        if (li) li.style.display = 'none';

        const pendingState = document.getElementById('pendingState');
        if (pendingState) {
            pendingState.style.display = 'flex';
            const codigo = document.getElementById('codigoVinculacion');
            if (codigo && pantalla?.codigo_vinculacion) {
                codigo.textContent = pantalla.codigo_vinculacion;
            }
        } else {
            console.warn('⚠️ pendingState no encontrado en el DOM');
        }
    } catch (error) {
        console.error('Error al mostrar estado pendiente:', error);
    }
}

function mostrarPantallaTrabajo(pantalla) {
    try {
        const cs = document.getElementById('connectingState');
        if (cs) cs.style.display = 'none';
        const ps = document.getElementById('pendingState');
        if (ps) ps.style.display = 'none';

        const linkedState = document.getElementById('linkedState');
        if (linkedState) {
            linkedState.style.display = 'flex';
            linkedState.classList.add('active');
            actualizarRecepcionista(pantalla);
            actualizarPaciente();
            actualizarUltimaActualizacion();
        }
    } catch (error) {
        console.error('Error al mostrar pantalla de trabajo:', error);
    }
}

// =========================
// ACTUALIZAR DATOS EN LA UI
// =========================

function actualizarRecepcionista(pantalla) {
    // Elemento principal
    const nombre = document.getElementById('recepcionistaName');
    if (nombre) nombre.textContent = pantalla?.recepcionista_nombre || '-';

    // Elementos adicionales (por si el HTML los usa)
    const display   = document.getElementById('recepcionistaDisplay');
    const idDisplay = document.getElementById('recepcionistaIdDisplay');

    if (pantalla?.recepcionista_nombre) {
        if (display)   display.innerHTML     = pantalla.recepcionista_nombre;
        if (idDisplay) idDisplay.textContent = pantalla.recepcionista_id ? `ID: ${pantalla.recepcionista_id}` : '';
    } else {
        if (display)   display.innerHTML     = '<span class="sin-recepcionista">Sin asignar</span>';
        if (idDisplay) idDisplay.textContent = '';
    }
}

function actualizarPaciente() {
    const el = document.getElementById('pacienteDisplay');
    if (el) el.innerHTML = '<span class="sin-paciente">Esperando paciente...</span>';
}

function actualizarUltimaActualizacion() {
    const el = document.getElementById('ultimaActualizacion');
    if (el) {
        el.textContent = `Última actualización: ${new Date().toLocaleTimeString('es-ES', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        })}`;
    }
    // Indicador visual de conexión activa (opcional, si el HTML tiene el elemento)
    const dot = document.getElementById('conexionDot');
    if (dot) {
        dot.style.background = '#10b981'; // verde = conectado
        setTimeout(() => { if (dot) dot.style.background = ''; }, 1000);
    }
}

// =========================
// ERRORES
// =========================

function mostrarError(mensaje) {
    try {
        const el = document.getElementById('errorMessage');
        if (el) {
            el.innerHTML = `
                <div style="text-align:center;line-height:1.6;">
                    <div style="font-size:24px;margin-bottom:10px;">⚠️</div>
                    <div>${mensaje.replace(/\n/g, '<br>')}</div>
                </div>`;
            el.classList.add('show');
        }
        const cs = document.getElementById('connectingState');
        if (cs) cs.style.display = 'none';
    } catch (e) {
        console.error('Error al mostrar mensaje:', e);
    }
    console.error('❌', mensaje);
}

// =========================
// UTILIDADES DE FECHA
// =========================

function formatearFecha(fechaISO) {
    if (!fechaISO) return 'N/A';
    try {
        return new Date(fechaISO).toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch { return 'N/A'; }
}

function formatearFechaCorta(fechaISO) {
    if (!fechaISO) return 'N/A';
    try {
        const diff = Math.floor((new Date() - new Date(fechaISO)) / 1000);
        if (diff < 60)    return 'Hace un momento';
        if (diff < 3600)  return `Hace ${Math.floor(diff / 60)} min`;
        if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} hrs`;
        return new Date(fechaISO).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
    } catch { return 'N/A'; }
}

// =========================
// LIMPIEZA AL CERRAR
// =========================
// =========================
// WEBSOCKET — sincronización en tiempo real
// =========================

let socketScreen = null;

function conectarSocketScreen() {
    socketScreen = io();

    socketScreen.on('connect', () => {
        console.log('🔌 Socket screen conectado:', socketScreen.id);
        // Unirse a la sala 'screen' para recibir eventos de vinculación
        socketScreen.emit('join', { room: 'screen' });
    });
    socketScreen.on('joined', (data) => {
        console.log('✅ Confirmado en sala:', data.room);
    });

    socketScreen.on('disconnect', () => {
        console.log('🔌 Socket screen desconectado');
    });

    // ── Admin vinculó esta pantalla → mostrar pantalla de trabajo ──
    socketScreen.on('pantalla_vinculada', (data) => {
        console.log('🎉 Evento pantalla_vinculada recibido:', data);

        // Detener el polling de vinculación
        if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            statusCheckInterval = null;
        }
        
        // Recargar estado desde backend para obtener datos completos
        consultarStatus().then(statusData => {
            if (statusData && statusData.status === 'vinculada') {
                pantallaData = statusData.pantalla;
                mostrarPantallaTrabajo(pantallaData);
                iniciarMonitoreo('estado');
                console.log('✅ Pantalla de trabajo activa vía socket');
            }
        }).catch(() => {
            // Fallback: recargar la página completa
            location.reload();
        });
    });

    // ── Recepcionista asignado → actualizar nombre en pantalla ──
    socketScreen.on('recepcionista_asignado', (data) => {
        console.log('👤 Recepcionista actualizado vía socket:', data);
        if (pantallaData) {
            pantallaData.recepcionista_nombre = data.recepcionista_nombre;
            actualizarRecepcionista(pantallaData);
            actualizarUltimaActualizacion();
        }
    });

    // ── Admin desvinculó esta pantalla → volver al estado inicial ──
    socketScreen.on('pantalla_desvinculada', (data) => {
        console.log('🔌 Evento pantalla_desvinculada recibido:', data);

        // El polling ya detecta esto, pero el socket lo hace instantáneo
        detenerYRecargar('desvinculada', 1500);
    });
}

