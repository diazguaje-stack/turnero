function getAuthHeaders() {
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "/";
        return {};
    }

    return {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
    };
}
// ==========================================
// pantallas.js — Gestión completa de pantallas
// (requiere config.js cargado antes)
// ==========================================

let pantallasList             = [];
let pantallasInterval         = null;
let recepcionistasDisponibles = [];
let usuarioEscribiendo        = false; // 🔒 Pausa el polling mientras se escribe un código

// ── Inicializar / limpiar ─────────────────────────────────────────────────────

function inicializarPantallas() {
    cargarRecepcionistas();
    cargarPantallas();

    // Polling: refrescar cada 5 s mientras la sección esté activa
    // Se pausa automáticamente si el usuario está escribiendo un código
    if (!pantallasInterval) {
        pantallasInterval = setInterval(() => {
            const section = document.getElementById('section-pantallas');
            if (section && section.classList.contains('active') && !usuarioEscribiendo) {
                cargarPantallas();
            }
        }, 5000);
    }
}

function limpiarIntervaloPantallas() {
    if (pantallasInterval) {
        clearInterval(pantallasInterval);
        pantallasInterval = null;
    }
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
        // Solo dígitos, máx 6 caracteres
        input.addEventListener('input', e => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '').substring(0, 6);
        });

        // 🔒 Al enfocar el input → pausar el polling para que no destruya el DOM
        input.addEventListener('focus', () => {
            usuarioEscribiendo = true;
        });

        // 🔓 Al salir del input → reanudar el polling
        input.addEventListener('blur', () => {
            usuarioEscribiendo = false;
        });

        // Enter para vincular
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

    usuarioEscribiendo = false; // 🔓 Liberar antes del fetch

    try {
        const response = await fetch(PANTALLAS_API.vincular(pantallaId), {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
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
            method: 'POST',
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
            headers: { 'Content-Type': 'application/json' },
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
    const opciones = recepcionistasDisponibles.map(r =>
        `<option value="${r.id}" ${r.id === recepcionistaActualId ? 'selected' : ''}>
            ${r.nombre_completo || r.usuario} (ID: ${r.id})
        </option>`
    ).join('');

    document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-asignar-recepcionista" id="modalAsignarRecepcionista">
            <div class="modal-content-small">
                <h3>Asignar Recepcionista</h3>
                <p>Pantalla ${pantallaNumero}</p>
                <select id="selectRecepcionista" class="form-select">
                    <option value="">Sin asignar</option>
                    ${opciones}
                </select>
                <div class="modal-buttons">
                    <button onclick="cerrarModalRecepcionista()" class="btn btn-secondary">Cancelar</button>
                    <button onclick="confirmarAsignacionRecepcionista('${pantallaId}')" class="btn btn-primary">Asignar</button>
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

// Exponer funciones usadas desde el HTML inline (onclick=)
window.mostrarModalAsignarRecepcionista = mostrarModalAsignarRecepcionista;
window.cerrarModalRecepcionista         = cerrarModalRecepcionista;
window.confirmarAsignacionRecepcionista = confirmarAsignacionRecepcionista;