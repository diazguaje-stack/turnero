/**
 * pantallas.js — Gestión completa de pantallas
 *
 * 🔧 FIXES aplicados:
 * 1. Race condition del socketAdmin → espera infinita con backoff
 * 2. cargarRecepcionistas() con reintentos automáticos
 * 3. Doble registro de pantalla_desvinculada eliminado
 * 4. Recarga de recepcionistas en cada evento relevante
 * 5. Indicador visual cuando no hay recepcionistas disponibles
 */

function getAuthHeaders() {
    const token = sessionStorage.getItem('jwt_token')
               || localStorage.getItem('jwt_token_admin')
               || localStorage.getItem('jwt_token_recepcion')
               || localStorage.getItem('jwt_token_registro');
    if (!token) { window.location.href = '/'; return {}; }
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

// ── Estado ────────────────────────────────────────────────────────────────────
let pantallasList             = [];
let recepcionistasDisponibles = [];
let _recepcionistasLoaded     = false; // 🔧 FIX: flag para saber si ya cargaron

function inicializarPantallas() {
    cargarRecepcionistasConReintentos(); // 🔧 FIX: versión robusta
    cargarPantallas();
}

function limpiarIntervaloPantallas() {}

// ── Cargar recepcionistas con reintentos ──────────────────────────────────────
// 🔧 FIX: Si el primer fetch falla o devuelve vacío, reintenta hasta 5 veces
async function cargarRecepcionistasConReintentos(intentosMax = 5, esperaMs = 800) {
    for (let intento = 1; intento <= intentosMax; intento++) {
        try {
            const response = await fetch(RECEPCIONISTAS_API.getAll, { headers: getAuthHeaders() });
            if (response.ok) {
                const data = await response.json();
                const lista = data.recepcionistas || [];

                if (lista.length > 0 || intento === intentosMax) {
                    recepcionistasDisponibles = lista;
                    _recepcionistasLoaded     = true;
                    console.log(`✅ ${lista.length} recepcionistas cargados (intento ${intento})`);
                    // 🔧 FIX: Re-renderizar pantallas para que los selects tengan los datos
                    if (lista.length > 0) renderizarPantallas();
                    return lista;
                }

                // Lista vacía pero no es el último intento — puede ser timing
                console.warn(`⚠️ recepcionistas vacío (intento ${intento}/${intentosMax}), reintentando...`);
            } else {
                console.warn(`⚠️ Error HTTP ${response.status} al cargar recepcionistas (intento ${intento})`);
            }
        } catch (error) {
            console.error(`❌ Error al cargar recepcionistas (intento ${intento}):`, error);
        }

        if (intento < intentosMax) {
            await new Promise(r => setTimeout(r, esperaMs * intento)); // backoff lineal
        }
    }

    console.error('❌ No se pudieron cargar recepcionistas después de todos los intentos');
    return [];
}

// 🔧 FIX: Alias simple para llamadas normales (desde WS events, etc.)
async function cargarRecepcionistas() {
    return cargarRecepcionistasConReintentos(3, 500);
}

// ── Cargar pantallas ──────────────────────────────────────────────────────────
async function cargarPantallas() {
    try {
        const response = await fetch(PANTALLAS_API.getAll, { headers: getAuthHeaders() });
        if (!response.ok) throw new Error('Error al cargar pantallas');
        const data    = await response.json();
        pantallasList = data.pantallas || [];

        // 🔧 FIX: Si aún no tenemos recepcionistas, cargarlos ANTES de renderizar
        if (!_recepcionistasLoaded || recepcionistasDisponibles.length === 0) {
            await cargarRecepcionistasConReintentos(3, 400);
        }

        renderizarPantallas();
    } catch (error) {
        console.error('Error al cargar pantallas:', error);
        mostrarMensajePantallas('Error al cargar las pantallas', 'error');
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
        <div class="pantalla-card ${p.estado}" id="pantalla-card-${p.id}">
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
        const ocupados = new Set(
            pantallasList
                .filter(x => x.estado === 'vinculada' && x.recepcionista_id)
                .map(x => String(x.recepcionista_id))
        );

        // 🔧 FIX: Mensaje claro cuando no hay recepcionistas cargados todavía
        if (!_recepcionistasLoaded) {
            return `
                <div class="instrucciones-vinculacion">📱 Dispositivo conectado — cargando datos...</div>
                <div class="codigo-grande">${p.codigo_vinculacion || '------'}</div>
                <div style="margin-top:10px;padding:10px;background:#fef3c7;border-radius:6px;
                            border:1px solid #fbbf24;text-align:center;font-size:13px;color:#92400e;">
                    ⏳ Cargando recepcionistas...
                    <button onclick="cargarRecepcionistasConReintentos().then(()=>renderizarPantallas())"
                        style="margin-left:8px;padding:3px 10px;background:#f59e0b;color:#fff;
                               border:none;border-radius:4px;cursor:pointer;font-size:12px;">
                        🔄 Reintentar
                    </button>
                </div>`;
        }

        // 🔧 FIX: También mostrar aviso si la lista está vacía aunque ya cargó
        if (recepcionistasDisponibles.length === 0) {
            return `
                <div class="instrucciones-vinculacion">📱 Dispositivo conectado</div>
                <div class="codigo-grande">${p.codigo_vinculacion || '------'}</div>
                <div style="margin-top:10px;padding:10px;background:#fee2e2;border-radius:6px;
                            border:1px solid #fca5a5;text-align:center;font-size:13px;color:#991b1b;">
                    ⚠️ No hay recepcionistas disponibles en el sistema.
                    <button onclick="cargarRecepcionistasConReintentos().then(()=>renderizarPantallas())"
                        style="margin-left:8px;padding:3px 10px;background:#dc2626;color:#fff;
                               border:none;border-radius:4px;cursor:pointer;font-size:12px;">
                        🔄 Recargar
                    </button>
                </div>
                ${p.device_id ? `<div class="device-id-small">Device: ${p.device_id.substring(0,30)}...</div>` : ''}`;
        }

        const opciones = recepcionistasDisponibles.map(r => {
            const estaOcupado = ocupados.has(String(r.id));
            return `<option value="${r.id}" ${estaOcupado ? 'disabled' : ''}>
                ${r.nombre_completo || r.usuario}${estaOcupado ? ' (ocupado)' : ''}
            </option>`;
        }).join('');

        return `
            <div class="instrucciones-vinculacion">📱 Dispositivo conectado — Ingresa el código y asigna recepcionista</div>
            <div class="codigo-grande">${p.codigo_vinculacion || '------'}</div>
            <div class="codigo-input-group">
                <input type="text" class="codigo-input" id="codigo-${p.id}"
                    placeholder="Código de 6 dígitos" maxlength="6" pattern="[0-9]*">
            </div>
            <div style="margin-top:10px;">
                <label style="font-size:12px;color:#dc2626;display:block;margin-bottom:4px;font-weight:600;">
                    👤 Recepcionista (obligatorio) *
                </label>
                <select id="recepcionista-${p.id}" style="
                    width:100%;padding:8px 10px;border:2px solid #fbbf24;
                    border-radius:6px;font-size:13px;background:#fffbeb;color:#374151;
                ">
                    <option value="" disabled selected>— Selecciona recepcionista —</option>
                    ${opciones}
                </select>
            </div>
            ${p.device_id ? `<div class="device-id-small">Device: ${p.device_id.substring(0,30)}...</div>` : ''}`;
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
                <span class="info-value" id="recepcionista-asignado-${p.id}">${recepInfo}</span>
            </div>
            ${p.device_id ? `<div class="device-id-small" style="margin-top:12px;">Device ID: ${p.device_id.substring(0,40)}...</div>` : ''}
            <a href="/screen?preview=true&pantalla_id=${p.id}" target="_blank" class="link-pantalla">🔗 Vista previa</a>`;
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
                <button class="btn btn-danger btn-desvincular"
                    data-id="${p.id}" data-numero="${p.numero}">
                    🔓 Desvincular
                </button>
            </div>`;
    }
    return '';
}

// ── Event listeners ───────────────────────────────────────────────────────────

function agregarEventListenersPantallas() {
    document.querySelectorAll('.btn-vincular').forEach(btn =>
        btn.addEventListener('click', e => vincularPantallaAdmin(e.currentTarget.dataset.id)));

    document.querySelectorAll('.btn-cancelar').forEach(btn =>
        btn.addEventListener('click', e => desvincularPantallaAdmin(e.currentTarget.dataset.id)));

    document.querySelectorAll('.btn-desvincular').forEach(btn =>
        btn.addEventListener('click', e =>
            confirmarDesvincularPantalla(e.currentTarget.dataset.id, e.currentTarget.dataset.numero)));

    document.querySelectorAll('.btn-cambiar-recepcionista').forEach(btn =>
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
        input.addEventListener('keypress', e => {
            if (e.key === 'Enter') vincularPantallaAdmin(input.id.replace('codigo-', ''));
        });
    });
}

// ── Vincular ──────────────────────────────────────────────────────────────────

async function vincularPantallaAdmin(pantallaId) {
    const input  = document.getElementById(`codigo-${pantallaId}`);
    const codigo = input ? input.value.trim() : '';

    if (!codigo || codigo.length !== 6) {
        mostrarMensajePantallas('Por favor ingresa el código de 6 dígitos', 'error');
        if (input) input.focus();
        return;
    }

    const selectEl        = document.getElementById(`recepcionista-${pantallaId}`);
    const recepcionistaId = selectEl ? (selectEl.value || null) : null;

    if (!recepcionistaId) {
        // 🔧 FIX: Si el select está vacío por falta de datos, intentar recargar
        if (!selectEl || selectEl.options.length <= 1) {
            mostrarMensajePantallas('⏳ Recargando recepcionistas, intenta de nuevo en un momento...', 'warning');
            await cargarRecepcionistasConReintentos(3, 400);
            renderizarPantallas();
            return;
        }
        mostrarMensajePantallas('⚠️ Debes asignar un recepcionista antes de vincular', 'error');
        if (selectEl) {
            selectEl.style.border = '2px solid #ef4444';
            selectEl.focus();
            setTimeout(() => selectEl.style.border = '2px solid #fbbf24', 3000);
        }
        return;
    }

    // Verificar disponibilidad contra backend
    try {
        const checkRes       = await fetch(PANTALLAS_API.getAll, { headers: getAuthHeaders() });
        const checkData      = await checkRes.json();
        const todasPantallas = checkData.pantallas || [];

        const pantallaOcupada = todasPantallas.find(p =>
            String(p.recepcionista_id) === String(recepcionistaId) &&
            p.estado === 'vinculada' &&
            String(p.id) !== String(pantallaId)
        );

        if (pantallaOcupada) {
            const nombreRecep = recepcionistasDisponibles.find(r =>
                String(r.id) === String(recepcionistaId)
            )?.nombre_completo || 'Este recepcionista';

            mostrarMensajePantallas(
                `🚫 "${nombreRecep}" ya está asignado a la Pantalla ${pantallaOcupada.numero}. Selecciona otro.`,
                'error'
            );
            if (selectEl) {
                selectEl.style.border = '2px solid #ef4444';
                setTimeout(() => selectEl.style.border = '2px solid #fbbf24', 3000);
            }
            return;
        }

        pantallasList = todasPantallas;
    } catch (error) {
        console.warn('No se pudo verificar disponibilidad, continuando...', error);
    }

    try {
        const resVincular = await fetch(PANTALLAS_API.vincular(pantallaId), {
            method:  'POST',
            headers: getAuthHeaders(),
            body:    JSON.stringify({ codigo, recepcionista_id: recepcionistaId })
        });
        const dataVincular = await resVincular.json();

        if (!dataVincular.success) {
            mostrarMensajePantallas(dataVincular.message || 'Código incorrecto', 'error');
            return;
        }

        mostrarMensajePantallas('✅ Pantalla vinculada exitosamente', 'success');
        cargarPantallas();
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
        mostrarMensajePantallas('Error al asignar recepcionista', 'error');
    }
}

// ── Limpiar recepcionista eliminado/desactivado en cards ──────────────────────

function limpiarRecepcionistaEliminado(usuarioId) {
    pantallasList.forEach(p => {
        if (String(p.recepcionista_id) === String(usuarioId)) {
            p.recepcionista_id     = null;
            p.recepcionista_nombre = null;

            const spanEl = document.getElementById(`recepcionista-asignado-${p.id}`);
            if (spanEl) {
                spanEl.innerHTML = `<span style="color:#ef4444;font-weight:600;">⚠️ Recepcionista eliminado</span>`;
                spanEl.closest('.pantalla-card')?.classList.add('pantalla-alerta');
                setTimeout(() => {
                    spanEl.innerHTML = `<span style="color:#9ca3af;">Sin asignar</span>`;
                    spanEl.closest('.pantalla-card')?.classList.remove('pantalla-alerta');
                }, 4000);
            }

            console.log(`[PAN] 🔴 Recepcionista ${usuarioId} removido de pantalla ${p.numero}`);
        }
    });

    recepcionistasDisponibles = recepcionistasDisponibles.filter(r => String(r.id) !== String(usuarioId));
    document.querySelectorAll(`option[value="${usuarioId}"]`).forEach(opt => opt.remove());
}

// ── Modal cambiar recepcionista ───────────────────────────────────────────────

function mostrarModalAsignarRecepcionista(pantallaId, pantallaNumero, recepcionistaActualId) {
    document.getElementById('modalAsignarRecepcionista')?.remove();

    const opciones = recepcionistasDisponibles.map(r =>
        `<option value="${r.id}" ${r.id === recepcionistaActualId ? 'selected' : ''}>
            ${r.nombre_completo || r.usuario}
        </option>`
    ).join('');

    document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-asignar-recepcionista" id="modalAsignarRecepcionista"
             style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;
                    align-items:center;justify-content:center;z-index:9999;">
            <div style="background:#fff;padding:24px;border-radius:12px;
                        min-width:320px;box-shadow:0 4px 24px rgba(0,0,0,.2);">
                <h3 style="margin:0 0 8px">Cambiar Recepcionista</h3>
                <p style="color:#6b7280;margin:0 0 16px">Pantalla ${pantallaNumero}</p>
                <select id="selectRecepcionista" style="width:100%;padding:8px;
                    border:1px solid #d1d5db;border-radius:6px;margin-bottom:16px;">
                    <option value="">Sin asignar</option>
                    ${opciones}
                </select>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button onclick="cerrarModalRecepcionista()"
                        style="padding:8px 16px;border:1px solid #d1d5db;border-radius:6px;
                               background:#fff;cursor:pointer;">Cancelar</button>
                    <button onclick="confirmarAsignacionRecepcionista('${pantallaId}')"
                        style="padding:8px 16px;background:#6366f1;color:#fff;
                               border:none;border-radius:6px;cursor:pointer;">Asignar</button>
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
        return fecha.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    } catch { return 'N/A'; }
}

function mostrarMensajePantallas(mensaje, tipo) {
    const container = document.getElementById('pantallasMessageContainer');
    if (!container) return;
    container.innerHTML = `<div class="pantallas-message ${tipo}">${mensaje}</div>`;
    setTimeout(() => { container.innerHTML = ''; }, tipo === 'error' ? 5000 : 3000);
}

window.mostrarModalAsignarRecepcionista  = mostrarModalAsignarRecepcionista;
window.cerrarModalRecepcionista          = cerrarModalRecepcionista;
window.confirmarAsignacionRecepcionista  = confirmarAsignacionRecepcionista;

// ── WEBSOCKET ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    function registrar(socket) {
        const unirse = () => socket.emit('join', { room: 'admin' });
        if (socket.connected) unirse();
        socket.on('connect', () => {
            unirse();
            // 🔧 FIX: Al reconectar, recargar datos frescos (puede haber cambios perdidos)
            console.log('[PAN] 🔌 Reconectado — recargando datos');
            cargarRecepcionistas().then(() => cargarPantallas());
        });

        socket.on('disconnect', () => {
            console.warn('[PAN] ⚠️ Socket desconectado');
        });

        // ── EVENTOS DE PANTALLA ───────────────────────────────────────────────
        // 🔧 FIX: Un solo handler por evento, sin duplicados
        const EVENTOS_SOLO_PANTALLA = [
            'pantalla_vinculada',
            'pantalla_pendiente',
            'recepcionista_asignado'
        ];

        EVENTOS_SOLO_PANTALLA.forEach(evento => {
            socket.on(evento, (data) => {
                console.log(`📺 [${evento}]`, data);
                cargarPantallas();
            });
        });

        // pantalla_desvinculada — un solo handler con lógica completa
        socket.on('pantalla_desvinculada', (data) => {
            console.log('[PAN] 📺 pantalla_desvinculada:', data);
            document.getElementById('modalAsignarRecepcionista')?.remove();
            cargarPantallas();
            mostrarMensajePantallas(
                `⚠️ Pantalla ${data?.numero || '?'} se desconectó (${data?.motivo || 'desconocido'})`,
                'warning'
            );
        });

        // ── EVENTOS DE USUARIO ────────────────────────────────────────────────
        socket.on('usuario_creado', (data) => {
            // 🔧 FIX: Si es recepcionista nuevo, recargar la lista
            if (data?.usuario?.rol === 'recepcion') {
                console.log('[PAN] 👤 Nuevo recepcionista, recargando lista');
                cargarRecepcionistas().then(() => renderizarPantallas());
            }
        });

        socket.on('usuario_actualizado', (data) => {
            // 🔧 FIX: Si cambió el rol de/hacia recepcion, recargar
            if (data?.usuario?.rol === 'recepcion' || data?.rolAnterior === 'recepcion') {
                cargarRecepcionistas().then(() => renderizarPantallas());
            }
        });

        socket.on('usuario_desactivado', (data) => {
            console.log('[PAN] usuario_desactivado:', data);
            if (data?.rol === 'recepcion') {
                limpiarRecepcionistaEliminado(data.usuario_id);
            }
        });

        socket.on('usuario_eliminado', (data) => {
            console.log('[PAN] usuario_eliminado:', data);
            if (data?.rol === 'recepcion') {
                limpiarRecepcionistaEliminado(data.usuario_id);
                cargarRecepcionistas();
            }
        });

        socket.on('usuario_restaurado', (data) => {
            if (data?.usuario?.rol === 'recepcion') {
                cargarRecepcionistas().then(() => renderizarPantallas());
            }
        });

        console.log('✅ pantallas.js: todos los eventos socket registrados');
    }

    // 🔧 FIX: Espera robusta con backoff exponencial (sin límite fijo de intentos)
    // Se detiene en cuanto socketAdmin existe y está conectado, o tras 10 segundos
    let intentos = 0;
    const MAX_MS = 10000;
    const inicio = Date.now();

    const esperar = setInterval(() => {
        intentos++;
        const tiempoTranscurrido = Date.now() - inicio;

        if (typeof socketAdmin !== 'undefined' && socketAdmin) {
            clearInterval(esperar);
            console.log(`[PAN] ✅ socketAdmin encontrado en intento ${intentos} (${tiempoTranscurrido}ms)`);
            registrar(socketAdmin);
            return;
        }

        if (tiempoTranscurrido >= MAX_MS) {
            clearInterval(esperar);
            console.warn(`[PAN] ⚠️ socketAdmin no encontrado tras ${MAX_MS}ms — creando socket propio`);
            const s = io();
            registrar(s);
        }
    }, 200);
});