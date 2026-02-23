/**
 * pantallas.js — Gestión completa de pantallas
 * Requiere: auth.js cargado antes en el HTML
 */

// ── getAuthHeaders: lee el token del lugar correcto ───────────────────────────

function getAuthHeaders() {
    const token = sessionStorage.getItem('jwt_token')
               || localStorage.getItem('jwt_token_admin')
               || localStorage.getItem('jwt_token_recepcion')
               || localStorage.getItem('jwt_token_registro');

    if (!token) {
        window.location.href = '/';
        return {};
    }

    return {
        'Authorization': 'Bearer ' + token,
        'Content-Type':  'application/json'
    };
}

// ── Estado ────────────────────────────────────────────────────────────────────

let pantallasList             = [];
let pantallasInterval         = null;
let recepcionistasDisponibles = [];
let usuarioEscribiendo        = false;

// ── Inicializar / limpiar ─────────────────────────────────────────────────────

function iniciarMonitoreo(modo) {
    // ── Polling eliminado: socket maneja todo en tiempo real ──
    console.log(`✅ Modo socket activo (sin polling): ${modo}`);
}

function inicializarPantallas() {
    cargarRecepcionistas();
    cargarPantallas();
    // Polling eliminado — socket maneja actualizaciones en tiempo real
}

function limpiarIntervaloPantallas() {
}

// ── Cargar datos ──────────────────────────────────────────────────────────────

async function cargarPantallas() {
    try {
        const response = await fetch(PANTALLAS_API.getAll, { headers: getAuthHeaders() });
        if (!response.ok) throw new Error('Error al cargar pantallas');
        const data    = await response.json();
        pantallasList = data.pantallas || [];
        renderizarPantallas();
    } catch (error) {
        console.error('Error al cargar pantallas:', error);
        mostrarMensajePantallas('Error al cargar las pantallas', 'error');
    }
}

async function cargarRecepcionistas() {
    try {
        const response = await fetch(RECEPCIONISTAS_API.getAll, { headers: getAuthHeaders() });
        if (response.ok) {
            const data = await response.json();
            recepcionistasDisponibles = data.recepcionistas || [];
            console.log(`✅ ${recepcionistasDisponibles.length} recepcionistas cargados`);
        }
    } catch (error) {
        console.error('Error al cargar recepcionistas:', error);
    }
}

// ── Renderizado ───────────────────────────────────────────────────────────────

function renderizarPantallas() {
    const grid = document.getElementById('pantallasGrid');
    if (!grid) return;

    if (!pantallasList.length) {
        grid.innerHTML = '<div class="loading-pantallas">No hay pantallas configuradas</div>';
        return;
    }

    grid.innerHTML = pantallasList.map(p => `
        <div class="pantalla-card ${p.estado}">
            <div class="pantalla-numero">${p.numero}</div>
            <div class="pantalla-estado">
                <div class="estado-badge ${p.estado}">${getEstadoTexto(p.estado)}</div>
                <div class="pantalla-nombre">${p.nombre || `Pantalla ${p.numero}`}</div>
            </div>
            <div class="pantalla-info">${renderInfoPantalla(p)}</div>
            ${renderAccionesPantalla(p)}
        </div>
    `).join('');

    agregarEventListenersPantallas();
}

function renderInfoPantalla(p) {
    if (p.estado === 'disponible') {
        return `
            <div style="text-align:center;color:#6b7280;padding:20px 0;">
                <p>⚪ Esperando dispositivo...</p>
                <p style="font-size:12px;margin-top:8px;">Abre <strong>/screen</strong> en un dispositivo</p>
            </div>`;
    }

    if (p.estado === 'pendiente') {
        return `
            <div class="instrucciones-vinculacion">📱 Dispositivo conectado — Ingresa el código</div>
            <div class="codigo-grande">${p.codigo_vinculacion || '------'}</div>
            <div class="codigo-input-group">
                <input type="text" class="codigo-input" id="codigo-${p.id}"
                    placeholder="Ingresa código" maxlength="6" pattern="[0-9]*">
            </div>
            ${p.device_id ? `<div class="device-id-small">Device: ${p.device_id.substring(0, 30)}...</div>` : ''}`;
    }

    if (p.estado === 'vinculada') {
        const recepInfo = p.recepcionista_nombre
            ? `<span style="color:#059669;font-weight:600;">✓ ${p.recepcionista_nombre}</span>`
            : `<span style="color:#9ca3af;">Sin asignar</span>`;

        return `
            <div class="info-item">
                <span class="info-label">Vinculada:</span>
                <span class="info-value">${formatFecha(p.vinculada_at)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Última conexión:</span>
                <span class="info-value">${formatFecha(p.ultima_conexion)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Recepcionista:</span>
                <span class="info-value">${recepInfo}</span>
            </div>
            ${p.device_id ? `<div class="device-id-small" style="margin-top:12px;">Device ID: ${p.device_id.substring(0, 40)}...</div>` : ''}
            <a href="/screen" target="_blank" class="link-pantalla">🔗 Abrir pantalla completa</a>`;
    }

    return '';
}

function renderAccionesPantalla(p) {
    if (p.estado === 'pendiente') {
        return `
            <div class="pantalla-actions">
                <button class="btn btn-primary btn-vincular"   data-id="${p.id}">✓ Vincular</button>
                <button class="btn btn-secondary btn-cancelar" data-id="${p.id}">✗ Cancelar</button>
            </div>`;
    }

    if (p.estado === 'vinculada') {
        return `
            <div class="pantalla-actions">
                <button class="btn btn-primary btn-asignar-recepcionista"
                    data-id="${p.id}" data-numero="${p.numero}"
                    data-recepcionista="${p.recepcionista_id || ''}"
                    style="background:#059669;margin-bottom:8px;width:100%;">
                    👤 Asignar Recepcionista
                </button>
                <button class="btn btn-danger btn-desvincular"
                    data-id="${p.id}" data-numero="${p.numero}">
                    🔓 Desvincular
                </button>
            </div>`;
    }

    return '';
}

// ── Event listeners dinámicos ─────────────────────────────────────────────────

function agregarEventListenersPantallas() {
    document.querySelectorAll('.btn-vincular').forEach(btn =>
        btn.addEventListener('click', e => vincularPantallaAdmin(e.currentTarget.dataset.id)));

    document.querySelectorAll('.btn-cancelar').forEach(btn =>
        btn.addEventListener('click', e => desvincularPantallaAdmin(e.currentTarget.dataset.id)));

    document.querySelectorAll('.btn-desvincular').forEach(btn =>
        btn.addEventListener('click', e =>
            confirmarDesvincularPantalla(e.currentTarget.dataset.id, e.currentTarget.dataset.numero)));

    document.querySelectorAll('.btn-asignar-recepcionista').forEach(btn =>
        btn.addEventListener('click', e =>
            mostrarModalAsignarRecepcionista(
                e.currentTarget.dataset.id,
                e.currentTarget.dataset.numero,
                e.currentTarget.dataset.recepcionista
            )));

    document.querySelectorAll('.codigo-input').forEach(input => {
        input.addEventListener('input', e => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '').substring(0, 6);
        });
        input.addEventListener('focus', () => { usuarioEscribiendo = true; });
        input.addEventListener('blur',  () => { usuarioEscribiendo = false; });
        input.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                usuarioEscribiendo = false;
                vincularPantallaAdmin(input.id.replace('codigo-', ''));
            }
        });
    });
}

// ── Acciones ──────────────────────────────────────────────────────────────────

async function vincularPantallaAdmin(pantallaId) {
    const input  = document.getElementById(`codigo-${pantallaId}`);
    const codigo = input ? input.value.trim() : '';

    if (!codigo || codigo.length !== 6) {
        mostrarMensajePantallas('Por favor ingresa el código de 6 dígitos', 'error');
        if (input) input.focus();
        return;
    }

    usuarioEscribiendo = false;

    try {
        // ✅ headers sin duplicar — usa getAuthHeaders() que ya incluye Content-Type
        const response = await fetch(PANTALLAS_API.vincular(pantallaId), {
            method:  'POST',
            headers: getAuthHeaders(),
            body:    JSON.stringify({ codigo })
        });
        const data = await response.json();
        mostrarMensajePantallas(
            data.success ? '✅ Pantalla vinculada exitosamente' : (data.message || 'Código incorrecto'),
            data.success ? 'success' : 'error'
        );
        if (data.success) cargarPantallas();
    } catch (error) {
        console.error('Error al vincular:', error);
        mostrarMensajePantallas('Error al vincular la pantalla', 'error');
    }
}

function confirmarDesvincularPantalla(pantallaId, numero) {
    if (confirm(`¿Desvincular la Pantalla ${numero}?\n\nEl dispositivo perderá acceso.`)) {
        desvincularPantallaAdmin(pantallaId);
    }
}

async function desvincularPantallaAdmin(pantallaId) {
    try {
        const response = await fetch(PANTALLAS_API.desvincular(pantallaId), {
            method:  'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();
        mostrarMensajePantallas(
            data.success ? '✅ Pantalla desvinculada exitosamente' : (data.message || 'Error al desvincular'),
            data.success ? 'success' : 'error'
        );
        if (data.success) cargarPantallas();
    } catch (error) {
        console.error('Error al desvincular:', error);
        mostrarMensajePantallas('Error al desvincular la pantalla', 'error');
    }
}

async function asignarRecepcionista(pantallaId, recepcionistaId) {
    try {
        const response = await fetch(PANTALLAS_API.asignarRecepcionista(pantallaId), {
            method:  'POST',
            headers: getAuthHeaders(),
            body:    JSON.stringify({ recepcionista_id: recepcionistaId })
        });
        const data = await response.json();
        mostrarMensajePantallas(
            data.success
                ? (recepcionistaId ? '✅ Recepcionista asignado' : '✅ Recepcionista desasignado')
                : (data.message || 'Error al asignar recepcionista'),
            data.success ? 'success' : 'error'
        );
        if (data.success) cargarPantallas();
    } catch (error) {
        console.error('Error al asignar recepcionista:', error);
        mostrarMensajePantallas('Error al asignar recepcionista', 'error');
    }
}

// ── Modal recepcionista ───────────────────────────────────────────────────────

function mostrarModalAsignarRecepcionista(pantallaId, pantallaNumero, recepcionistaActualId) {
    // Eliminar modal anterior si existe
    document.getElementById('modalAsignarRecepcionista')?.remove();

    const opciones = recepcionistasDisponibles.map(r =>
        `<option value="${r.id}" ${r.id === recepcionistaActualId ? 'selected' : ''}>
            ${r.nombre_completo || r.usuario}
        </option>`
    ).join('');

    document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-asignar-recepcionista" id="modalAsignarRecepcionista"
             style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;">
            <div class="modal-content-small"
                 style="background:#fff;padding:24px;border-radius:12px;min-width:320px;box-shadow:0 4px 24px rgba(0,0,0,.2);">
                <h3 style="margin:0 0 8px">Asignar Recepcionista</h3>
                <p style="color:#6b7280;margin:0 0 16px">Pantalla ${pantallaNumero}</p>
                <select id="selectRecepcionista" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:16px;">
                    <option value="">Sin asignar</option>
                    ${opciones}
                </select>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button onclick="cerrarModalRecepcionista()"
                        style="padding:8px 16px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">
                        Cancelar
                    </button>
                    <button onclick="confirmarAsignacionRecepcionista('${pantallaId}')"
                        style="padding:8px 16px;background:#6366f1;color:#fff;border:none;border-radius:6px;cursor:pointer;">
                        Asignar
                    </button>
                </div>
            </div>
        </div>
    `);
}

function cerrarModalRecepcionista() {
    document.getElementById('modalAsignarRecepcionista')?.remove();
}

function confirmarAsignacionRecepcionista(pantallaId) {
    const id = document.getElementById('selectRecepcionista').value || null;
    asignarRecepcionista(pantallaId, id);
    cerrarModalRecepcionista();
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function getEstadoTexto(estado) {
    return { disponible: '⚪ Disponible', pendiente: '🟡 Pendiente', vinculada: '🟢 Vinculada' }[estado] || estado;
}

function formatFecha(fechaISO) {
    if (!fechaISO) return 'N/A';
    try {
        const fecha = new Date(fechaISO);
        const diff  = Math.floor((new Date() - fecha) / 1000);
        if (diff < 60)    return 'Hace un momento';
        if (diff < 3600)  return `Hace ${Math.floor(diff / 60)} min`;
        if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} hrs`;
        return fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return 'N/A'; }
}

function mostrarMensajePantallas(mensaje, tipo) {
    const container = document.getElementById('pantallasMessageContainer');
    if (!container) return;
    container.innerHTML = `<div class="pantallas-message ${tipo}">${mensaje}</div>`;
    setTimeout(() => { container.innerHTML = ''; }, tipo === 'error' ? 5000 : 3000);
}

// Exponer funciones usadas desde onclick en HTML inline
window.mostrarModalAsignarRecepcionista  = mostrarModalAsignarRecepcionista;
window.cerrarModalRecepcionista          = cerrarModalRecepcionista;
window.confirmarAsignacionRecepcionista  = confirmarAsignacionRecepcionista;

// ── WEBSOCKET: actualizar grid de pantallas en tiempo real ──
// ── WEBSOCKET: actualizar grid cuando lleguen eventos de pantallas ──
// ── WEBSOCKET propio para pantallas.js ──────────────────────────────────────

let socketPantallas = null;

function conectarSocketPantallas() {
    // Reusar socketAdmin si ya existe (cargado por usuarios.js),
    // o crear uno nuevo si pantallas.js se carga solo.
    if (typeof socketAdmin !== 'undefined' && socketAdmin) {
        socketPantallas = socketAdmin;
        console.log('✅ Reutilizando socketAdmin para pantallas');
        registrarEventosPantallas(socketPantallas);
        return;
    }

    socketPantallas = io();

    socketPantallas.on('connect', () => {
        console.log('🔌 Socket pantallas conectado:', socketPantallas.id);
        socketPantallas.emit('join', { room: 'admin' });
    });

    socketPantallas.on('disconnect', () => {
        console.log('🔌 Socket pantallas desconectado');
    });

    registrarEventosPantallas(socketPantallas);
}

function registrarEventosPantallas(socket) {
    // Asegurarse de estar en sala admin
    if (socket.connected) {
        socket.emit('join', { room: 'admin' });
    } else {
        socket.on('connect', () => socket.emit('join', { room: 'admin' }));
    }

    socket.on('pantalla_vinculada',     () => {
        console.log('📺 pantalla_vinculada recibido → recargando grid');
        cargarPantallas();
    });
    socket.on('pantalla_desvinculada',  () => {
        console.log('📺 pantalla_desvinculada recibido → recargando grid');
        cargarPantallas();
    });
    socket.on('recepcionista_asignado', () => {
        console.log('👤 recepcionista_asignado recibido → recargando grid');
        cargarPantallas();
    });

    socketAdmin.on('pantalla_pendiente', () => {
        console.log('🟡 pantalla_pendiente → recargando grid');
        cargarPantallas();
    });


    console.log('✅ Eventos de pantallas registrados en socket');
}

// Reemplaza el DOMContentLoaded anterior
// ── WEBSOCKET ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    const EVENTOS = [
        'pantalla_vinculada',
        'pantalla_desvinculada',
        'pantalla_pendiente',       // ← screen recargó y está esperando código
        'recepcionista_asignado'
    ];

    function registrar(socket) {
        // Unirse a sala admin
        const unirse = () => socket.emit('join', { room: 'admin' });
        if (socket.connected) unirse();
        socket.on('connect', unirse);   // reconexiones automáticas

        // Un solo handler para todos los eventos relevantes
        EVENTOS.forEach(evento => {
            socket.on(evento, () => {
                console.log(`📺 Socket [${evento}] → cargarPantallas()`);
                cargarPantallas();
            });
        });

        console.log('✅ pantallas.js: eventos socket registrados');
    }

    // Intentar reutilizar socketAdmin (usuarios.js), si no crear uno propio
    let intentos = 0;
    const esperar = setInterval(() => {
        intentos++;

        if (typeof socketAdmin !== 'undefined' && socketAdmin) {
            clearInterval(esperar);
            registrar(socketAdmin);

        } else if (intentos > 15) {
            clearInterval(esperar);
            console.warn('⚠️ socketAdmin no encontrado — creando socket propio');
            const s = io();
            registrar(s);
        }
    }, 200);
});