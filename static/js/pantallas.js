/**
 * pantallas.js — Gestión completa de pantallas
 *
 * CAMBIOS v2:
 * 1. Pantalla admite hasta 4 recepcionistas (many-to-many)
 * 2. Modal de vinculación con checkboxes (máx 4)
 * 3. Modal de gestión de recepcionistas para pantallas vinculadas
 * 4. Chips visuales de recepcionistas asignados en cada card
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
        return `
            <div style="text-align:center;color:#6b7280;padding:20px 0;">
                <p>⚪ Esperando dispositivo...</p>
                <p style="font-size:12px;margin-top:8px;">Abre <strong>/screen</strong> en un dispositivo</p>
            </div>`;
    }

    if (p.estado === 'pendiente') {
        // IDs ya ocupados en otras pantallas vinculadas
        const ocupados = new Set(
            pantallasList
                .filter(x => x.estado === 'vinculada' && x.id !== p.id)
                .flatMap(x => (x.recepcionistas || []).map(r => String(r.id)))
        );

        const checkboxes = recepcionistasDisponibles.map(r => {
            const estaOcupado = ocupados.has(String(r.id));
            return `
                <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;
                              border-radius:6px;cursor:${estaOcupado ? 'not-allowed' : 'pointer'};
                              background:${estaOcupado ? '#f3f4f6' : '#fffbeb'};
                              border:1px solid ${estaOcupado ? '#e5e7eb' : '#fcd34d'};
                              opacity:${estaOcupado ? '0.5' : '1'}">
                    <input type="checkbox"
                           class="recep-check-${p.id}"
                           value="${r.id}"
                           ${estaOcupado ? 'disabled' : ''}
                           style="width:16px;height:16px;accent-color:#6366f1">
                    <span style="font-size:13px;color:#374151">${r.nombre_completo || r.usuario}</span>
                    ${estaOcupado ? '<span style="font-size:11px;color:#9ca3af">(ocupado)</span>' : ''}
                </label>`;
        }).join('');

        return `
            <div class="instrucciones-vinculacion">
                📱 Dispositivo conectado — Ingresa el código y asigna hasta 4 recepcionistas
            </div>
            <div class="codigo-grande">${p.codigo_vinculacion || '------'}</div>
            <div class="codigo-input-group">
                <input type="text" class="codigo-input" id="codigo-${p.id}"
                    placeholder="Código de 6 dígitos" maxlength="6" pattern="[0-9]*">
            </div>
            <div style="margin-top:12px;">
                <label style="font-size:12px;color:#dc2626;display:block;
                               margin-bottom:6px;font-weight:600;">
                    👥 Recepcionistas (1–4, obligatorio) *
                </label>
                <div id="recepcionistas-checks-${p.id}"
                     style="display:flex;flex-direction:column;gap:4px;
                            max-height:180px;overflow-y:auto;">
                    ${checkboxes}
                </div>
                <p style="font-size:11px;color:#6b7280;margin-top:4px;" id="count-label-${p.id}">
                    0 / 4 seleccionados
                </p>
            </div>
            ${p.device_id ? `<div class="device-id-small">Device: ${p.device_id.substring(0,30)}...</div>` : ''}`;
    }

    if (p.estado === 'vinculada') {
        const receps = p.recepcionistas || [];
        const chipsHtml = receps.length
            ? receps.map((r, i) => `
                <span style="display:inline-flex;align-items:center;gap:4px;
                             background:#ede9fe;color:#5b21b6;border-radius:20px;
                             padding:3px 10px;font-size:12px;font-weight:600;margin:2px;">
                    <span style="background:#7c3aed;color:#fff;border-radius:50%;
                                 width:16px;height:16px;display:inline-flex;
                                 align-items:center;justify-content:center;font-size:10px;">
                        ${i + 1}
                    </span>
                    ${r.nombre_completo}
                </span>`).join('')
            : '<span style="color:#9ca3af;font-size:13px;">Sin asignar</span>';

        return `
            <div class="info-item">
                <span class="info-label">Vinculada:</span>
                <span class="info-value">${formatFecha(p.vinculada_at)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Última conexión:</span>
                <span class="info-value">${formatFecha(p.ultima_conexion)}</span>
            </div>
            <div class="info-item" style="align-items:flex-start;">
                <span class="info-label">Recepciones:</span>
                <span class="info-value" id="recepcionistas-asignados-${p.id}">
                    ${chipsHtml}
                </span>
            </div>
            ${p.device_id ? `<div class="device-id-small" style="margin-top:12px;">
                Device ID: ${p.device_id.substring(0,40)}...</div>` : ''}
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
                <button class="btn btn-info btn-gestionar-recepcionistas"
                    data-id="${p.id}" data-numero="${p.numero}"
                    style="background:#6366f1;color:#fff;">
                    👥 Gestionar recepciones
                </button>
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

    document.querySelectorAll('.btn-gestionar-recepcionistas').forEach(btn =>
        btn.addEventListener('click', e =>
            mostrarModalGestionarRecepcionistas(
                e.currentTarget.dataset.id,
                e.currentTarget.dataset.numero
            )));

    // Contador de checkboxes en estado pendiente
    document.querySelectorAll('[class^="recep-check-"]').forEach(chk => {
        const pantallaId = chk.className.replace('recep-check-', '');
        chk.addEventListener('change', () => actualizarContadorChecks(pantallaId));
    });

    document.querySelectorAll('.codigo-input').forEach(input => {
        input.addEventListener('input', e => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '').substring(0, 6);
        });
        input.addEventListener('keypress', e => {
            if (e.key === 'Enter') vincularPantallaAdmin(input.id.replace('codigo-', ''));
        });
    });
}

function actualizarContadorChecks(pantallaId) {
    const checks  = document.querySelectorAll(`.recep-check-${pantallaId}:checked`);
    const label   = document.getElementById(`count-label-${pantallaId}`);
    const total   = checks.length;
    if (label) label.textContent = `${total} / 4 seleccionados`;

    // Deshabilitar checkboxes sin marcar si ya llegamos a 4
    document.querySelectorAll(`.recep-check-${pantallaId}:not(:checked):not(:disabled)`).forEach(c => {
        c.disabled = total >= 4;
    });
    // Volver a habilitar si bajamos de 4
    if (total < 4) {
        document.querySelectorAll(`.recep-check-${pantallaId}:not(:checked)`).forEach(c => {
            const rid     = c.value;
            const ocupado = pantallasList
                .filter(x => x.estado === 'vinculada')
                .flatMap(x => (x.recepcionistas || []).map(r => String(r.id)))
                .includes(rid);
            if (!ocupado) c.disabled = false;
        });
    }
}

// ── Vincular con múltiples recepcionistas ─────────────────────────────────────

async function vincularPantallaAdmin(pantallaId) {
    const input  = document.getElementById(`codigo-${pantallaId}`);
    const codigo = input ? input.value.trim() : '';

    if (!codigo || codigo.length !== 6) {
        mostrarMensajePantallas('Por favor ingresa el código de 6 dígitos', 'error');
        if (input) input.focus();
        return;
    }

    // Leer checkboxes seleccionados
    const seleccionados = Array.from(
        document.querySelectorAll(`.recep-check-${pantallaId}:checked`)
    ).map(c => c.value);

    if (seleccionados.length === 0) {
        mostrarMensajePantallas('⚠️ Debes seleccionar al menos un recepcionista', 'error');
        return;
    }
    if (seleccionados.length > 4) {
        mostrarMensajePantallas('⚠️ Máximo 4 recepcionistas por pantalla', 'error');
        return;
    }

    try {
        const res  = await fetch(PANTALLAS_API.vincular(pantallaId), {
            method:  'POST',
            headers: getAuthHeaders(),
            body:    JSON.stringify({ codigo, recepcionista_ids: seleccionados })
        });
        const data = await res.json();

        if (!data.success) {
            mostrarMensajePantallas(data.message || 'Código incorrecto', 'error');
            return;
        }

        mostrarMensajePantallas('✅ Pantalla vinculada exitosamente', 'success');
        cargarPantallas();

    } catch (error) {
        console.error('Error al vincular:', error);
        mostrarMensajePantallas('Error al vincular la pantalla', 'error');
    }
}

// ── Modal gestionar recepcionistas (pantalla ya vinculada) ────────────────────

function mostrarModalGestionarRecepcionistas(pantallaId, pantallaNumero) {
    document.getElementById('modalGestionarRecepcionistas')?.remove();

    const pantalla    = pantallasList.find(p => String(p.id) === String(pantallaId));
    const asignados   = new Set((pantalla?.recepcionistas || []).map(r => String(r.id)));

    // IDs ocupados en OTRAS pantallas vinculadas
    const ocupadosOtras = new Set(
        pantallasList
            .filter(x => x.estado === 'vinculada' && String(x.id) !== String(pantallaId))
            .flatMap(x => (x.recepcionistas || []).map(r => String(r.id)))
    );

    const checkboxes = recepcionistasDisponibles.map(r => {
        const rid       = String(r.id);
        const checked   = asignados.has(rid);
        const ocupado   = !checked && ocupadosOtras.has(rid);
        return `
            <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;
                          border-radius:8px;cursor:${ocupado ? 'not-allowed' : 'pointer'};
                          background:${checked ? '#ede9fe' : ocupado ? '#f3f4f6' : '#f9fafb'};
                          border:1px solid ${checked ? '#7c3aed' : ocupado ? '#e5e7eb' : '#e5e7eb'};
                          opacity:${ocupado ? '0.5' : '1'};margin-bottom:4px;">
                <input type="checkbox"
                       class="modal-recep-check"
                       value="${rid}"
                       ${checked ? 'checked' : ''}
                       ${ocupado ? 'disabled' : ''}
                       onchange="actualizarContadorModalGestion()"
                       style="width:16px;height:16px;accent-color:#6366f1">
                <div>
                    <div style="font-size:13px;font-weight:600;color:#1f2937">
                        ${r.nombre_completo || r.usuario}
                    </div>
                    ${ocupado ? '<div style="font-size:11px;color:#9ca3af">Asignado a otra pantalla</div>' : ''}
                </div>
            </label>`;
    }).join('');

    document.body.insertAdjacentHTML('beforeend', `
        <div id="modalGestionarRecepcionistas"
             style="position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;
                    align-items:center;justify-content:center;z-index:9999;">
            <div style="background:#fff;padding:28px;border-radius:14px;
                        min-width:360px;max-width:480px;width:90%;
                        box-shadow:0 8px 32px rgba(0,0,0,.25);">
                <h3 style="margin:0 0 4px;color:#1f2937;">👥 Recepciones asignadas</h3>
                <p style="color:#6b7280;margin:0 0 16px;font-size:13px;">
                    Pantalla ${pantallaNumero} — selecciona 1 a 4 recepcionistas
                </p>
                <div id="modal-recep-list" style="max-height:280px;overflow-y:auto;margin-bottom:12px;">
                    ${checkboxes}
                </div>
                <p style="font-size:12px;color:#6b7280;margin:0 0 16px;"
                   id="modal-recep-count">
                    ${asignados.size} / 4 seleccionados
                </p>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button onclick="cerrarModalGestionarRecepcionistas()"
                        style="padding:9px 18px;border:1px solid #d1d5db;border-radius:8px;
                               background:#fff;cursor:pointer;font-size:14px;">
                        Cancelar
                    </button>
                    <button onclick="confirmarGestionRecepcionistas('${pantallaId}')"
                        style="padding:9px 18px;background:#6366f1;color:#fff;
                               border:none;border-radius:8px;cursor:pointer;
                               font-size:14px;font-weight:600;">
                        Guardar cambios
                    </button>
                </div>
            </div>
        </div>
    `);
}

function actualizarContadorModalGestion() {
    const checks = document.querySelectorAll('.modal-recep-check:checked');
    const total  = checks.length;
    const label  = document.getElementById('modal-recep-count');
    if (label) label.textContent = `${total} / 4 seleccionados`;

    // Limitar a 4
    document.querySelectorAll('.modal-recep-check:not(:checked):not([disabled])').forEach(c => {
        c.disabled = total >= 4;
    });
    if (total < 4) {
        document.querySelectorAll('.modal-recep-check:not(:checked)').forEach(c => {
            if (c.dataset._forzadoDeshabilitado) return;
            c.disabled = false;
        });
    }
}

function cerrarModalGestionarRecepcionistas() {
    document.getElementById('modalGestionarRecepcionistas')?.remove();
}

async function confirmarGestionRecepcionistas(pantallaId) {
    const ids = Array.from(document.querySelectorAll('.modal-recep-check:checked'))
                     .map(c => c.value);

    if (ids.length === 0) {
        alert('Selecciona al menos un recepcionista');
        return;
    }
    if (ids.length > 4) {
        alert('Máximo 4 recepcionistas por pantalla');
        return;
    }

    try {
        const res  = await fetch(`/api/pantallas/${pantallaId}/asignar-recepcionistas`, {
            method:  'POST',
            headers: getAuthHeaders(),
            body:    JSON.stringify({ recepcionista_ids: ids })
        });
        const data = await res.json();

        if (!data.success) {
            mostrarMensajePantallas(data.message || 'Error al asignar', 'error');
            return;
        }

        mostrarMensajePantallas(`✅ ${ids.length} recepcionista(s) asignado(s)`, 'success');
        cerrarModalGestionarRecepcionistas();
        cargarPantallas();

    } catch (e) {
        console.error(e);
        mostrarMensajePantallas('Error de conexión', 'error');
    }
}

// ── Desvincular ───────────────────────────────────────────────────────────────

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

// ── Limpiar recepcionista eliminado ──────────────────────────────────────────

function limpiarRecepcionistaEliminado(usuarioId) {
    pantallasList.forEach(p => {
        if (!p.recepcionistas) return;
        const antes = p.recepcionistas.length;
        p.recepcionistas = p.recepcionistas.filter(r => String(r.id) !== String(usuarioId));

        if (p.recepcionistas.length < antes) {
            const spanEl = document.getElementById(`recepcionistas-asignados-${p.id}`);
            if (spanEl) {
                const card = spanEl.closest('.pantalla-card');
                card?.classList.add('pantalla-alerta');
                setTimeout(() => card?.classList.remove('pantalla-alerta'), 4000);
            }
            console.log(`[PAN] 🔴 Recepcionista ${usuarioId} removido de pantalla ${p.numero}`);
        }
    });

    recepcionistasDisponibles = recepcionistasDisponibles.filter(r => String(r.id) !== String(usuarioId));
    document.querySelectorAll(`option[value="${usuarioId}"]`).forEach(opt => opt.remove());
    // Refrescar la vista
    renderizarPantallas();
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

// Exponer globales requeridos por el HTML inline
window.mostrarModalGestionarRecepcionistas  = mostrarModalGestionarRecepcionistas;
window.cerrarModalGestionarRecepcionistas   = cerrarModalGestionarRecepcionistas;
window.confirmarGestionRecepcionistas       = confirmarGestionRecepcionistas;
window.actualizarContadorModalGestion       = actualizarContadorModalGestion;

// ── WEBSOCKET ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    function registrar(socket) {
        const unirse = () => socket.emit('join', { room: 'admin' });
        if (socket.connected) unirse();
        socket.on('connect', unirse);

        const EVENTOS_PANTALLA = [
            'pantalla_vinculada',
            'pantalla_desvinculada',
            'pantalla_pendiente',
            'recepcionista_asignado',
            'recepcionistas_asignados'   // ← NUEVO evento many-to-many
        ];

        EVENTOS_PANTALLA.forEach(evento => {
            socket.on(evento, () => {
                console.log(`📺 [${evento}] → cargarPantallas()`);
                cargarPantallas();
            });
        });

        socket.on('pantalla_desvinculada', (data) => {
            document.getElementById('modalGestionarRecepcionistas')?.remove();
            cargarPantallas();
            mostrarMensajePantallas(
                `⚠️ Pantalla ${data.numero || '?'} se desconectó`,
                'warning'
            );
        });

        socket.on('usuario_desactivado', (data) => {
            if (data.rol === 'recepcion') limpiarRecepcionistaEliminado(data.usuario_id);
        });

        socket.on('usuario_eliminado', (data) => {
            if (data.rol === 'recepcion') {
                limpiarRecepcionistaEliminado(data.usuario_id);
                cargarRecepcionistas();
            }
        });

        socket.on('usuario_restaurado', (data) => {
            if (data.usuario?.rol === 'recepcion') cargarRecepcionistas();
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
            registrar(io());
        }
    }, 200);
});