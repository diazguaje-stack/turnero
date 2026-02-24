/**
 * pantallas.js — Gestión completa de pantallas
 * 
 * CAMBIOS:
 * 1. Selección de recepcionista AL VINCULAR (no después)
 * 2. Escucha usuario_eliminado / usuario_desactivado → limpia asignación en card
 * 3. Propaga cambio a /screen via websocket
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

function inicializarPantallas() {
    cargarRecepcionistas();
    cargarPantallas();
}

function limpiarIntervaloPantallas() {}

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
        // ── Sin label de recepcionista aquí, aún no hay dispositivo ──
        return `
            <div style="text-align:center;color:#6b7280;padding:20px 0;">
                <p>⚪ Esperando dispositivo...</p>
                <p style="font-size:12px;margin-top:8px;">Abre <strong>/screen</strong> en un dispositivo</p>
            </div>`;
    }

    if (p.estado === 'pendiente') {
        // Filtrar recepcionistas ya ocupados en otras pantallas vinculadas
        const ocupados = new Set(
            pantallasList
                .filter(x => x.estado === 'vinculada' && x.recepcionista_id)
                .map(x => String(x.recepcionista_id))
        );

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

    // ... resto igual

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
    // Vincular — ahora también lee el select de recepcionista
    document.querySelectorAll('.btn-vincular').forEach(btn =>
        btn.addEventListener('click', e => vincularPantallaAdmin(e.currentTarget.dataset.id)));

    document.querySelectorAll('.btn-cancelar').forEach(btn =>
        btn.addEventListener('click', e => desvincularPantallaAdmin(e.currentTarget.dataset.id)));

    document.querySelectorAll('.btn-desvincular').forEach(btn =>
        btn.addEventListener('click', e =>
            confirmarDesvincularPantalla(e.currentTarget.dataset.id, e.currentTarget.dataset.numero)));

    // Cambiar recepcionista (solo en pantallas ya vinculadas)
    // Cambiar recepcionista (solo en pantallas ya vinculadas)
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

// ── Vincular — ahora asigna recepcionista en el mismo paso ───────────────────

async function vincularPantallaAdmin(pantallaId) {
    const input  = document.getElementById(`codigo-${pantallaId}`);
    const codigo = input ? input.value.trim() : '';

    if (!codigo || codigo.length !== 6) {
        mostrarMensajePantallas('Por favor ingresa el código de 6 dígitos', 'error');
        if (input) input.focus();
        return;
    }

    // ── VALIDACIÓN 1: Recepcionista obligatorio ──────────────────
    const selectEl        = document.getElementById(`recepcionista-${pantallaId}`);
    const recepcionistaId = selectEl ? (selectEl.value || null) : null;

    if (!recepcionistaId) {
        mostrarMensajePantallas('⚠️ Debes asignar un recepcionista antes de vincular', 'error');
        if (selectEl) {
            selectEl.style.border = '2px solid #ef4444';
            selectEl.focus();
            setTimeout(() => selectEl.style.border = '2px solid #fbbf24', 3000);
        }
        return;
    }

    // ── VALIDACIÓN 2: Recepcionista ocupado — consultar backend directamente ──
    // NO confiar en pantallasList local porque recepcionista_id puede estar ausente
    try {
        const checkRes  = await fetch(PANTALLAS_API.getAll, { headers: getAuthHeaders() });
        const checkData = await checkRes.json();
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

        // También actualizar pantallasList con data fresca
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

// ── Actualizar card en tiempo real cuando un usuario es eliminado/desactivado ─

/**
 * Llamado cuando llega el evento usuario_desactivado o usuario_eliminado.
 * Si el usuario era recepcionista asignado a alguna pantalla,
 * limpia la asignación en la card SIN recargar todo.
 */
function limpiarRecepcionistaEliminado(usuarioId) {
    pantallasList.forEach(p => {
        if (String(p.recepcionista_id) === String(usuarioId)) {
            p.recepcionista_id     = null;
            p.recepcionista_nombre = null;

            // Actualizar solo el span del recepcionista en la card ya renderizada
            const spanEl = document.getElementById(`recepcionista-asignado-${p.id}`);
            if (spanEl) {
                spanEl.innerHTML = `<span style="color:#ef4444;font-weight:600;">⚠️ Recepcionista eliminado</span>`;
                // Animar brevemente para llamar la atención
                spanEl.closest('.pantalla-card')?.classList.add('pantalla-alerta');
                setTimeout(() => {
                    spanEl.innerHTML = `<span style="color:#9ca3af;">Sin asignar</span>`;
                    spanEl.closest('.pantalla-card')?.classList.remove('pantalla-alerta');
                }, 4000);
            }

            console.log(`[PAN] 🔴 Recepcionista ${usuarioId} removido de pantalla ${p.numero}`);
        }
    });

    // También quitar del select en pantallas pendientes
    recepcionistasDisponibles = recepcionistasDisponibles.filter(r => String(r.id) !== String(usuarioId));
    document.querySelectorAll(`option[value="${usuarioId}"]`).forEach(opt => opt.remove());
}

// ── Modal cambiar recepcionista (solo para pantallas ya vinculadas) ───────────

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

// ── WEBSOCKET ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const EVENTOS_PANTALLA = [
        'pantalla_vinculada',
        'pantalla_desvinculada',
        'pantalla_pendiente',
        'recepcionista_asignado'
    ];

    function registrar(socket) {
        const unirse = () => socket.emit('join', { room: 'admin' });
        if (socket.connected) unirse();
        socket.on('connect', unirse);

        EVENTOS_PANTALLA.forEach(evento => {
            socket.on(evento, () => {
                console.log(`📺 [${evento}] → cargarPantallas()`);
                cargarPantallas();
            });
        });

        // ── NUEVO: usuario eliminado o desactivado ──
        socket.on('usuario_desactivado', (data) => {
            console.log('[PAN] usuario_desactivado recibido:', data);
            if (data.rol === 'recepcion') {
                limpiarRecepcionistaEliminado(data.usuario_id);
            }
        });

        socket.on('usuario_eliminado', (data) => {
            console.log('[PAN] usuario_eliminado recibido:', data);
            if (data.rol === 'recepcion') {
                limpiarRecepcionistaEliminado(data.usuario_id);
                // Recargar recepcionistas disponibles
                cargarRecepcionistas();
            }
        });

        // Cuando se restaura un recepcionista, volver a cargarlo en los selects
        socket.on('usuario_restaurado', (data) => {
            if (data.usuario?.rol === 'recepcion') {
                cargarRecepcionistas().then(() => {
                    // Re-renderizar solo selects de pantallas pendientes
                    document.querySelectorAll('[id^="recepcionista-"]').forEach(sel => {
                        if (sel.tagName === 'SELECT') {
                            const yaExiste = Array.from(sel.options).some(o => o.value === String(data.usuario.id));
                            if (!yaExiste) {
                                const opt = document.createElement('option');
                                opt.value       = data.usuario.id;
                                opt.textContent = data.usuario.nombre_completo;
                                sel.appendChild(opt);
                            }
                        }
                    });
                });
            }
        });

        console.log('✅ pantallas.js: todos los eventos socket registrados');
    }

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