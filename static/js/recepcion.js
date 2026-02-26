/**
 * recepcion.js - Página de recepción
 * Requiere: auth.js cargado antes en el HTML
 * Requiere: socket.io cargado antes en el HTML
 */

// ── Estado global ─────────────────────────────────────────
let pacientesData     = {};
let papelera          = [];
let codigosAnteriores = {};
let intervaloRefresco = null;
let socket            = null;
let historialLlamados = [];
const INTERVALO_REFRESCO_MS = 15_000;

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', () => {
    verificarSesion();
    cargarPacientes();
    cargarPapelera();
    conectarSocket();
    intervaloRefresco = setInterval(cargarPacientes, INTERVALO_REFRESCO_MS);
});

window.addEventListener('beforeunload', () => {
    if (intervaloRefresco) clearInterval(intervaloRefresco);
    if (socket) socket.disconnect();
});

// ==================== WEBSOCKET ====================

function conectarSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('🔌 Socket conectado:', socket.id);
        socket.emit('join', { room: 'recepcion' });
    });

    socket.on('joined', (data) => {
        console.log('✅ Unido a sala:', data.room);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Socket desconectado — usando fallback de 15s');
    });

    // ── Nuevo código generado en registro ──
    socket.on('nuevo_codigo', (data) => {
        console.log('📨 Evento nuevo_codigo recibido:', data);
        if (data.tipo === 'nuevo') {
            agregarPacienteEnTiempoReal(data);
        } else if (data.tipo === 'reimpresion') {
            actualizarCodigoEnTiempoReal(data);
        }
    });

    socket.on('usuario_actualizado', (data) => {
        if (data.usuario.rol === 'medico') {
            console.log('📨 Médico actualizado en recepción');
            cargarPacientes();
            mostrarToast(`👨‍⚕️ Datos de médico actualizados`, 'nuevo');
        }
    });

    socket.on('llamar_confirmado', (data) => {
        console.log('✅ Pantalla recibió llamada:', data.codigo);
    });

    socket.on('llamar_paciente', (data) => {
        // ── Si el código ya existe en el historial, no duplicar ──
        const yaExiste = historialLlamados.some(item => item.codigo === data.codigo);
        if (!yaExiste) {
            historialLlamados.unshift({
                codigo: data.codigo,
                nombre: data.nombre,
                hora:   new Date().toLocaleTimeString('es-ES', {
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                })
            });
            if (historialLlamados.length > 100) historialLlamados = historialLlamados.slice(0, 100);
        }
        const badgeEl = document.getElementById('historialBadge');
        if (badgeEl) {
            badgeEl.textContent = historialLlamados.length;
            badgeEl.style.display = 'inline-block';
        }

        const modal = document.getElementById('historialModal');
        if (modal && modal.style.display === 'flex') renderizarHistorialModal();

        console.log(`📋 Llamado registrado: ${data.codigo} — ${data.nombre}`);
    });

    // ── Usuario movido a papelera (soft delete) ───────────────────────────────
    socket.on('usuario_desactivado', (data) => {
        console.log('🗑️ usuario_desactivado recibido en recepción:', data);
        _manejarUsuarioInaccesible(data, 'desactivado');
    });

    // ── Usuario eliminado definitivamente de la BD ────────────────────────────
    socket.on('usuario_eliminado_definitivo', (data) => {
        console.log('💀 usuario_eliminado_definitivo recibido en recepción:', data);
        _manejarUsuarioInaccesible(data, 'eliminado');
    });

    // Limpieza diaria automática — servidor notifica a todas las recepciones
    socket.on('limpieza_diaria', (data) => {
        console.log('[CRON] 🧹 Limpieza diaria recibida:', data.hora);

        // Limpiar historial de llamados
        historialLlamados = [];
        const badgeEl = document.getElementById('historialBadge');
        if (badgeEl) { badgeEl.textContent = '0'; badgeEl.style.display = 'none'; }

        // Limpiar pacientes en pantalla
        pacientesData     = {};
        codigosAnteriores = {};

        const container = document.getElementById('medicosContainer');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>🌙 Nuevo día</h3>
                    <p>Los registros fueron limpiados automáticamente a las 00:00</p>
                </div>`;
        }

        mostrarToast('🌙 Limpieza diaria completada. Sistema listo para el nuevo día.', 'nuevo');
    });
}

// =============================================================================
// MANEJO DE USUARIO INACCESIBLE (desactivado o eliminado)
// Regla 1: Si ES este usuario → cerrar sesión forzada (página cae)
// Regla 2: Si era un médico  → recargar lista de pacientes
// =============================================================================

function _manejarUsuarioInaccesible(data, motivo) {
    // ── Leer sesión exactamente como auth.js la guarda ────────────────────────
    // auth.js usa sessionStorage con claves sueltas: 'usuario', 'jwt_token'
    let miId      = '';
    let miUsuario = sessionStorage.getItem('usuario') || '';

    // Extraer user_id del JWT (auth.js no guarda el ID por separado)
    try {
        const token = sessionStorage.getItem('jwt_token');
        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            miId      = String(payload.user_id || '');
            if (!miUsuario) miUsuario = String(payload.usuario || '');
        }
    } catch (e) {
        console.warn('[Socket] No se pudo decodificar el JWT:', e);
    }

    console.log(`[Socket:${motivo}] Afectado  → id="${data.usuario_id}" usuario="${data.usuario}" rol="${data.rol}"`);
    console.log(`[Socket:${motivo}] Mi sesión → id="${miId}" usuario="${miUsuario}"`);

    const esEsteUsuario =
        (miId      && String(data.usuario_id) === miId)      ||
        (miUsuario && String(data.usuario)    === miUsuario);

    if (esEsteUsuario) {
        // ── REGLA 1: Esta sesión ya no tiene acceso → página cae ─────────────
        console.warn(`⚠️ Esta sesión de recepción fue ${motivo}. Forzando cierre...`);
        _forzarCierreSesion(motivo);
        return;
    }

    // ── REGLA 2: Era un médico → recargar pacientes ───────────────────────────
    if (data.rol === 'medico') {
        console.log('🔄 Médico afectado, recargando pacientes...');
        cargarPacientes();
        mostrarToast(`🗑️ Médico "${data.nombre || data.usuario}" fue dado de baja`, 'reimpresion');
    }
}

/**
 * Cierra sesión forzada cuando el usuario fue desactivado o eliminado.
 * Limpia tokens exactamente como los guarda auth.js y muestra pantalla de bloqueo.
 */
function _forzarCierreSesion(motivo) {
    // Detener intervalos y socket antes de limpiar
    if (intervaloRefresco) clearInterval(intervaloRefresco);
    if (socket) socket.disconnect();

    // Limpiar exactamente lo que auth.js guarda
    const role = sessionStorage.getItem('jwt_role');
    if (role) localStorage.removeItem(`jwt_token_${role}`);

    sessionStorage.removeItem('jwt_token');
    sessionStorage.removeItem('jwt_role');
    sessionStorage.removeItem('usuario');
    sessionStorage.removeItem('rol');
    sessionStorage.removeItem('nombre_completo');

    // También limpiar localStorage por si acaso
    localStorage.removeItem('jwt_token_recepcion');
    localStorage.removeItem('jwt_token_admin');
    localStorage.removeItem('jwt_token_registro');

    const mensajes = {
        desactivado: {
            icono:  '🔒',
            titulo: 'Acceso suspendido',
            cuerpo: 'Tu cuenta de recepción ha sido movida a la papelera por un administrador.',
            sub:    'Contacta al administrador si crees que es un error.',
            color:  '#f59e0b',
        },
        eliminado: {
            icono:  '❌',
            titulo: 'Cuenta eliminada',
            cuerpo: 'Tu cuenta de recepción ha sido eliminada del sistema.',
            sub:    'Solicita una nueva cuenta al administrador.',
            color:  '#dc2626',
        }
    };
    const msg = mensajes[motivo] || mensajes['desactivado'];

    // Mostrar pantalla de bloqueo sobre todo el contenido
    document.body.innerHTML = `
        <div style="
            position:fixed; inset:0; background:#0f172a;
            display:flex; flex-direction:column;
            align-items:center; justify-content:center;
            z-index:99999; font-family:system-ui,sans-serif;
            text-align:center; padding:32px;">
            <div style="
                background:#1e293b; border:2px solid ${msg.color};
                border-radius:16px; padding:48px 40px;
                max-width:440px; width:100%;
                box-shadow:0 25px 50px rgba(0,0,0,0.5);">
                <div style="font-size:3.5rem; margin-bottom:16px">${msg.icono}</div>
                <h2 style="color:${msg.color}; font-size:1.4rem; margin:0 0 16px">
                    ${msg.titulo}
                </h2>
                <p style="color:#cbd5e1; font-size:1rem; margin:0 0 10px; line-height:1.6">
                    ${msg.cuerpo}
                </p>
                <p style="color:#64748b; font-size:0.85rem; margin:0 0 32px">
                    ${msg.sub}
                </p>
                <p style="color:#475569; font-size:0.8rem; margin:0 0 20px">
                    Redirigiendo al inicio en 5 segundos...
                </p>
                <button onclick="location.href='/'"
                    style="
                        background:${msg.color}; color:#fff; border:none;
                        padding:12px 32px; border-radius:8px; cursor:pointer;
                        font-size:1rem; font-weight:600; width:100%">
                    Ir al inicio de sesión
                </button>
            </div>
        </div>`;

    setTimeout(() => { location.href = '/'; }, 5000);
}

// ==================== VERIFICAR SESIÓN ====================

async function verificarSesion() {
    const sessionData = await Auth.verificarSesion('recepcion');
    if (!sessionData) return;

    const nombreCompleto = sessionData.nombre_completo || sessionData.usuario || 'Usuario';

    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = nombreCompleto;

    const userAvatarEl = document.getElementById('userAvatar');
    if (userAvatarEl) userAvatarEl.textContent = nombreCompleto.charAt(0).toUpperCase();

    console.log(`✅ Recepción lista para: ${nombreCompleto}`);
}

function logout() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        if (intervaloRefresco) clearInterval(intervaloRefresco);
        Auth.logout();
    }
}

// ==================== CARGAR / REFRESCO ====================

function filtrarPacientesEliminados(pacientes) {
    if (!pacientes || !papelera.length) return pacientes;
    return pacientes.filter(p => !papelera.some(x => x.id == p.id));
}

async function cargarPacientes() {
    try {
        const response = await Auth.fetch('/api/recepcion/pacientes', { method: 'GET' });
        const data     = await response.json();

        if (!response.ok) {
            console.error('Error al cargar pacientes:', data.message);
            const container = document.getElementById('medicosContainer');
            if (container && !container.querySelector('.medico-card')) {
                mostrarErrorEnContenedor('medicosContainer', data.message || 'Error al cargar pacientes');
            }
            return;
        }

        if (!data.medicos || data.medicos.length === 0) {
            mostrarEmptyState('medicosContainer', 'No hay médicos con pacientes registrados');
            pacientesData = {};
            return;
        }

        const codigosNuevos = {};
        data.medicos.forEach(medico => {
            (medico.pacientes || []).forEach(p => {
                codigosNuevos[p.id] = p.codigo;
            });
        });

        const cambios = {};
        Object.entries(codigosNuevos).forEach(([pid, codigoNuevo]) => {
            const codigoAnterior = codigosAnteriores[pid];
            if (codigoAnterior && codigoAnterior !== codigoNuevo) {
                cambios[pid] = { anterior: codigoAnterior, nuevo: codigoNuevo };
            }
        });

        codigosAnteriores = codigosNuevos;

        pacientesData = {};
        data.medicos.forEach(m => { pacientesData[m.id] = m; });

        renderizarMedicos(data.medicos, cambios);

        if (Object.keys(cambios).length > 0) {
            mostrarNotificacionCambio(cambios);
        }

    } catch (error) {
        console.error('Error al cargar pacientes:', error);
    }
}

// ==================== RENDERIZAR MÉDICOS ====================

function renderizarMedicos(medicos, cambios = {}) {
    const container = document.getElementById('medicosContainer');
    if (!container) return;

    if (!medicos || medicos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>😕 Sin médicos</h3>
                <p>No hay médicos con pacientes registrados</p>
            </div>`;
        return;
    }

    const html = medicos.map(medico => {
        const pacientesFiltrados = filtrarPacientesEliminados(medico.pacientes || []);
        return `
            <div class="medico-card">
                <div class="medico-header">
                    <div class="medico-avatar">${medico.inicial || medico.nombre[0].toUpperCase()}</div>
                    <div>
                        <h3>${medico.nombre}</h3>
                        <span class="badge">${pacientesFiltrados.length} paciente(s)</span>
                    </div>
                </div>
                <div class="pacientes-list" id="pacientes-${medico.id}">
                    ${renderizarPacientes(pacientesFiltrados, medico.id, cambios)}
                </div>
            </div>`;
    }).join('');

    container.innerHTML = html;
}

function renderizarPacientes(pacientes, medicoId, cambios = {}) {
    if (!pacientes || pacientes.length === 0) {
        return '<p class="no-pacientes">No hay pacientes pendientes</p>';
    }

    return `
        <div class="pacientes-horizontal">
            ${pacientes.map(p => {
                const cambiado   = cambios[p.id];
                const badgeNuevo = cambiado ? `<span class="badge-reimpresion">♻️</span>` : '';
                return `
                <div class="paciente-chip" id="paciente-row-${p.id}"
                     onclick="toggleAcciones('${p.id}', '${medicoId}')">
                    <div class="chip-codigo">${p.codigo || '—'} ${badgeNuevo}</div>
                    <div class="chip-nombre">${p.nombre}</div>
                    <div class="chip-acciones" id="acciones-${p.id}" style="display:none;">
                        <button class="btn-llamar"
                                onclick="event.stopPropagation(); llamarPaciente('${p.id}', '${p.codigo}', '${p.nombre}')">
                            📢 Llamar
                        </button>
                        <button class="btn-retirar"
                                onclick="event.stopPropagation(); retirarPaciente('${p.id}', '${medicoId}')">
                            🗑️ Retirar
                        </button>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
}

// ==================== ACCIONES ====================

function toggleAcciones(pacienteId, medicoId) {
    const accionesEl = document.getElementById(`acciones-${pacienteId}`);
    if (!accionesEl) return;

    document.querySelectorAll('.chip-acciones').forEach(el => {
        if (el.id !== `acciones-${pacienteId}`) {
            el.style.display = 'none';
            el.closest('.paciente-chip')?.classList.remove('chip-activo');
        }
    });

    const estaAbierto = accionesEl.style.display === 'flex';
    accionesEl.style.display = estaAbierto ? 'none' : 'flex';
    accionesEl.closest('.paciente-chip')?.classList.toggle('chip-activo', !estaAbierto);
}

function llamarPaciente(pacienteId, codigo, nombre, numeroPantalla) {
    mostrarToast(`📢 Llamando: ${codigo} — ${nombre}`, 'nuevo');

    if (socket && socket.connected) {
        let recepcionistaId = null;
        try {
            const token = sessionStorage.getItem('jwt_token');
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                recepcionistaId = payload.user_id || null;
            }
        } catch (e) {
            console.warn('No se pudo leer recepcionistaId del token:', e);
        }

        // ✅ ASEGURAR QUE numRecepcion SIEMPRE TENGA UN VALOR
        const numRecepcion = numeroPantalla || obtenerNumeroRecepcionActual() || '1';
        
        console.log('📢 [DEBUG] numRecepcion final:', numRecepcion);

        // ✅ EMIT CON recepcion GARANTIZADO
        socket.emit('llamar_paciente', {
            pacienteId:      pacienteId,
            codigo:          codigo,
            nombre:          nombre,
            recepcionistaId: recepcionistaId,
            recepcion:       numRecepcion  // ← SIEMPRE TIENE VALOR
        });
        console.log(`📢 Emitido llamar_paciente: ${codigo} — ${nombre} — recepcion: ${numRecepcion}`);
    } else {
        console.warn('⚠️ Socket no conectado — llamada no enviada a pantalla');
    }

    const chip = document.getElementById(`paciente-row-${pacienteId}`);
    if (chip) {
        chip.style.borderColor = '#4f8ef7';
        chip.style.background  = 'rgba(79,142,247,0.08)';
        setTimeout(() => {
            chip.style.borderColor = '';
            chip.style.background  = '';
        }, 4000);
    }
}

function obtenerNumeroRecepcionActual() {
    console.log('🔍 obtenerNumeroRecepcionActual() - buscando número...');
    
    // Intento 1: Variable global
    if (window._numeroPantallaRecepcion) {
        console.log('✅ Encontrado en window._numeroPantallaRecepcion:', window._numeroPantallaRecepcion);
        return window._numeroPantallaRecepcion;
    }
    console.log('❌ window._numeroPantallaRecepcion no existe');
    
    // Intento 2: Del JWT
    try {
        const token = sessionStorage.getItem('jwt_token');
        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.numero_recepcion) {
                console.log('✅ Encontrado en JWT:', payload.numero_recepcion);
                return payload.numero_recepcion;
            }
        }
    } catch (e) {
        console.log('❌ No se pudo leer JWT');
    }
    
    // Intento 3: Del nombre completo en sessionStorage
    const nombreCompleto = sessionStorage.getItem('nombre_completo') || '';
    console.log('nombre_completo en sessionStorage:', nombreCompleto);
    const match = nombreCompleto.match(/\d+/);
    if (match) {
        console.log('✅ Encontrado en nombre_completo:', match[0]);
        return match[0];
    }
    console.log('❌ No hay números en nombre_completo');
    
    // Intento 4: Del elemento userName del DOM
    const userNameEl = document.getElementById('userName');
    if (userNameEl) {
        console.log('userName elemento encontrado:', userNameEl.textContent);
        const domMatch = userNameEl.textContent.match(/\d+/);
        if (domMatch) {
            console.log('✅ Encontrado en userName DOM:', domMatch[0]);
            return domMatch[0];
        }
    }
    console.log('❌ No hay números en userName DOM');
    
    // ✅ FALLBACK: Si no se encuentra nada, retornar '1' en lugar de null
    console.warn('⚠️ No se pudo obtener número de recepción, usando fallback: "1"');
    return '1';
}


// ── Actualizar badge de contador del médico ────────────────
function actualizarBadgeContador(medicoId) {
    const listaEl = document.getElementById(`pacientes-${medicoId}`);
    if (!listaEl) return;
    const total   = listaEl.querySelectorAll('.paciente-item').length;
    const badgeEl = listaEl.closest('.medico-card')?.querySelector('.badge');
    if (badgeEl) badgeEl.textContent = `${total} paciente(s)`;
}

// ── Agregar paciente nuevo sin recargar la página ──────────
function agregarPacienteEnTiempoReal(data) {
    const medicoId   = data.paciente.medico_id;
    const listaEl    = document.getElementById(`pacientes-${medicoId}`);

    if (!listaEl) { cargarPacientes(); return; }

    const noHay = listaEl.querySelector('.no-pacientes');
    if (noHay) noHay.remove();

    const nuevaFila     = document.createElement('div');
    nuevaFila.className = 'paciente-chip nuevo-ingreso';
    nuevaFila.id        = `paciente-row-${data.paciente.id}`;
    nuevaFila.setAttribute('onclick', `toggleAcciones('${data.paciente.id}', '${medicoId}')`);
    nuevaFila.innerHTML = `
        <div class="chip-codigo">
            ${data.codigo_turno}
            <span class="badge-reimpresion" style="background:#28a745;">🆕</span>
        </div>
        <div class="chip-nombre">${data.paciente.nombre}</div>
        <div class="chip-acciones" id="acciones-${data.paciente.id}" style="display:none;">
            <button class="btn-llamar"
                    onclick="event.stopPropagation(); llamarPaciente('${data.paciente.id}', '${data.codigo_turno}', '${data.paciente.nombre}')">
                📢 Llamar
            </button>
            <button class="btn-retirar"
                    onclick="event.stopPropagation(); retirarPaciente('${data.paciente.id}', '${medicoId}')">
                🗑️ Retirar
            </button>
        </div>`;

    let horizontalEl = listaEl.querySelector('.pacientes-horizontal');
    if (!horizontalEl) {
        horizontalEl = document.createElement('div');
        horizontalEl.className = 'pacientes-horizontal';
        listaEl.appendChild(horizontalEl);
    }
    horizontalEl.appendChild(nuevaFila);

    if (pacientesData[medicoId]) {
        pacientesData[medicoId].pacientes.push({
            id:     data.paciente.id,
            nombre: data.paciente.nombre,
            codigo: data.codigo_turno,
            motivo: data.paciente.motivo
        });
    }

    actualizarBadgeContador(medicoId);
    setTimeout(() => nuevaFila.classList.remove('nuevo-ingreso'), 3000);
    mostrarToast(`🆕 Nuevo paciente: ${data.paciente.nombre} — ${data.codigo_turno}`, 'nuevo');
    console.log(`✅ Paciente agregado en tiempo real: ${data.codigo_turno}`);
}

// ── Actualizar código de paciente re-registrado ────────────
function actualizarCodigoEnTiempoReal(data) {
    const pacienteId = data.paciente.id;
    const filaEl     = document.getElementById(`paciente-row-${pacienteId}`);

    if (!filaEl) { cargarPacientes(); return; }

    filaEl.style.borderLeft = '4px solid #ffc107';
    filaEl.style.background = '#fffbf0';

    const codigoEl = filaEl.querySelector('.paciente-codigo');
    if (codigoEl) {
        codigoEl.innerHTML = `
            🎫 <strong>${data.codigo_turno}</strong>
            <span style="background:#ffc107;color:#333;font-size:0.72em;font-weight:bold;
                         padding:2px 7px;border-radius:10px;margin-left:6px;">♻️ NUEVO CÓDIGO</span>
            <br>
            <span style="font-size:0.78em;color:#856404;">
                Anterior: <s>${data.codigo_anterior || '—'}</s>
            </span>`;
    }

    const medicoId = data.paciente.medico_id;
    if (pacientesData[medicoId]) {
        const p = pacientesData[medicoId].pacientes.find(x => x.id === pacienteId);
        if (p) p.codigo = data.codigo_turno;
    }
    codigosAnteriores[pacienteId] = data.codigo_turno;

    mostrarToast(`♻️ Código actualizado: ${data.paciente.nombre} → ${data.codigo_turno}`, 'reimpresion');
    console.log(`♻️ Código actualizado: ${data.codigo_anterior} → ${data.codigo_turno}`);
}

// ==================== PAPELERA ====================

function retirarPaciente(pacienteId, medicoId) {
    const medico = pacientesData[medicoId];
    if (!medico) return;

    const paciente = medico.pacientes.find(p => p.id == pacienteId);
    if (!paciente) return;

    papelera.push({
        id: paciente.id, nombre: paciente.nombre,
        codigo: paciente.codigo, medicoId: medicoId
    });
    localStorage.setItem('papelera', JSON.stringify(papelera));

    const row = document.getElementById(`paciente-row-${pacienteId}`);
    if (row) row.remove();

    actualizarBadgeContador(medicoId);
}

function cargarPapelera() {
    const guardado = localStorage.getItem('papelera');
    if (guardado) papelera = JSON.parse(guardado);
}

function abrirPapelera() {
    const modal = document.getElementById('papeleraModal');
    const body  = document.getElementById('papeleraBody');

    body.innerHTML = !papelera.length
        ? '<p>No hay códigos en la papelera</p>'
        : papelera.map(p => `
            <div class="papelera-item">
                <span>🎫 ${p.codigo} - ${p.nombre}</span>
                <div>
                    <button onclick="restaurarPaciente('${p.id}')">Restaurar</button>
                    <button onclick="eliminarDefinitivo('${p.id}')">Eliminar</button>
                </div>
            </div>`).join('');

    modal.style.display = 'flex';
}

function restaurarPaciente(pacienteId) {
    papelera = papelera.filter(p => p.id != pacienteId);
    localStorage.setItem('papelera', JSON.stringify(papelera));
    cerrarPapelera();
    cargarPacientes();
}

async function eliminarDefinitivo(pacienteId) {
    if (!confirm('¿Eliminar definitivamente este código?')) return;
    try {
        const response = await Auth.fetch(`/api/recepcion/paciente/${pacienteId}`, { method: 'DELETE' });
        const data     = await response.json();
        if (response.ok && data.success) {
            papelera = papelera.filter(p => p.id != pacienteId);
            localStorage.setItem('papelera', JSON.stringify(papelera));
            abrirPapelera();
        } else {
            alert(data.message || 'Error al eliminar');
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

function cerrarPapelera() {
    document.getElementById('papeleraModal').style.display = 'none';
}

async function vaciarPapelera() {
    if (!confirm('¿Eliminar todos definitivamente?')) return;
    for (let p of papelera) {
        await Auth.fetch(`/api/recepcion/paciente/${p.id}`, { method: 'DELETE' });
    }
    papelera = [];
    localStorage.removeItem('papelera');
    abrirPapelera();
}

// ==================== BUSCAR PACIENTE ====================

async function buscarPaciente() {
    const input    = document.getElementById('buscarCodigo');
    const codigo   = input ? input.value.trim() : '';
    const resultEl = document.getElementById('resultadoBusqueda');

    if (!codigo) {
        if (resultEl) resultEl.innerHTML = '<p style="color:#dc3545">Ingresa un código para buscar</p>';
        return;
    }

    try {
        const response = await Auth.fetch(`/api/recepcion/paciente/${codigo}`, { method: 'GET' });
        const data     = await response.json();

        if (!response.ok || !data.success) {
            if (resultEl) resultEl.innerHTML =
                `<p style="color:#dc3545">❌ ${data.message || 'Paciente no encontrado'}</p>`;
            return;
        }

        const p = data.paciente;
        if (resultEl) {
            resultEl.innerHTML = `
                <div class="paciente-resultado">
                    <p><strong>👤 Nombre:</strong> ${p.nombre_completo || p.nombre}</p>
                    <p><strong>🎫 Código de turno activo:</strong>
                        <strong style="color:#1565c0">${p.codigo || '—'}</strong></p>
                    <p><strong>🔖 Código paciente:</strong> ${p.codigo_paciente || '—'}</p>
                    <p><strong>📋 Motivo:</strong> ${p.motivo || '—'}</p>
                    <p><strong>👨‍⚕️ Médico:</strong> ${p.medico || '—'}</p>
                </div>`;
        }
    } catch (error) {
        if (resultEl) resultEl.innerHTML = '<p style="color:#dc3545">❌ Error de conexión</p>';
    }
}

// ==================== TOAST / NOTIFICACIONES ====================

function mostrarToast(msg, tipo = 'nuevo') {
    const colores = {
        nuevo:       { bg: '#d4edda', color: '#155724', border: '#28a745' },
        reimpresion: { bg: '#fff3cd', color: '#856404', border: '#ffc107' }
    };
    const c = colores[tipo] || colores.nuevo;

    let toast = document.getElementById('toastCambio');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastCambio';
        toast.style.cssText = `
            position:fixed; top:16px; right:16px; z-index:9999;
            border-radius:8px; padding:12px 20px;
            font-size:0.9em; font-weight:500;
            box-shadow:0 4px 12px rgba(0,0,0,0.15);
            transition:opacity 0.4s ease; max-width:320px;`;
        document.body.appendChild(toast);
    }

    toast.style.background = c.bg;
    toast.style.color      = c.color;
    toast.style.border     = `1px solid ${c.border}`;
    toast.textContent      = msg;
    toast.style.opacity    = '1';

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 5000);
}

function mostrarNotificacionCambio(cambios) {
    const n   = Object.keys(cambios).length;
    const msg = n === 1
        ? '♻️ 1 paciente re-registró su turno.'
        : `♻️ ${n} pacientes re-registraron su turno.`;
    mostrarToast(msg, 'reimpresion');
}

// ==================== HELPERS ====================

function mostrarErrorEnContenedor(containerId, mensaje) {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = `
        <div class="empty-state"><h3>❌ Error</h3><p>${mensaje}</p></div>`;
}

function mostrarEmptyState(containerId, mensaje) {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = `
        <div class="empty-state"><h3>😕 Sin datos</h3><p>${mensaje}</p></div>`;
}

// ==================== HISTORIAL ====================

function abrirHistorialLlamados() {
    const modal = document.getElementById('historialModal');
    if (!modal) return;
    renderizarHistorialModal();
    modal.style.display = 'flex';
}

function cerrarHistorialLlamados() {
    const modal = document.getElementById('historialModal');
    if (modal) modal.style.display = 'none';
}

function renderizarHistorialModal() {
    const body = document.getElementById('historialBody');
    if (!body) return;

    if (!historialLlamados.length) {
        body.innerHTML = `
            <div style="text-align:center; padding:48px 0; opacity:0.5;">
                <div style="font-size:40px; margin-bottom:12px;">◇</div>
                <p style="font-size:14px; letter-spacing:0.1em; color:#888;">
                    Aún no se han llamado pacientes
                </p>
            </div>`;
        return;
    }

    body.innerHTML = historialLlamados.map((item, idx) => `
        <div class="historial-item" style="
            display:flex; align-items:center; gap:16px;
            padding:14px 20px;
            background: ${idx === 0 ? 'rgba(79,142,247,0.08)' : 'rgba(255,255,255,0.03)'};
            border: 1px solid ${idx === 0 ? 'rgba(79,142,247,0.25)' : 'rgba(255,255,255,0.07)'};
            border-radius:6px; margin-bottom:8px;
            animation: fadeInItem 0.3s ease both;
            animation-delay: ${idx * 0.03}s;">
            <span style="font-size:11px; color:#4f8ef7; font-weight:600;
                         min-width:28px; text-align:center;
                         background:rgba(79,142,247,0.1); padding:3px 6px; border-radius:20px;">
                ${historialLlamados.length - idx}
            </span>
            <span style="font-family:'Georgia',serif; font-size:22px; font-weight:700;
                         color:#f0f4ff; letter-spacing:2px; flex:1;">
                ${item.codigo}
            </span>
            <span style="font-size:13px; color:rgba(240,244,255,0.55);
                         max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${item.nombre || '—'}
            </span>
            <span style="font-size:11px; color:rgba(240,244,255,0.3);
                         min-width:52px; text-align:right; font-variant-numeric:tabular-nums;">
                ${item.hora}
            </span>
        </div>`).join('');
}

function limpiarHistorialLlamados() {
    if (!confirm('¿Limpiar todo el historial de llamados?\nEsto también limpiará la pantalla de turnos.')) return;
    
    historialLlamados = [];
    
    const badgeEl = document.getElementById('historialBadge');
    if (badgeEl) { badgeEl.textContent = '0'; badgeEl.style.display = 'none'; }
    
    renderizarHistorialModal();

    // ── NUEVO: notificar al servidor para que limpie screen ──
    // DESPUÉS:
    if (socket && socket.connected) {
        // Leer recepcionistaId del JWT para limpiar solo SU pantalla
        let recepcionistaId = null;
        try {
            const token = sessionStorage.getItem('jwt_token');
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                recepcionistaId = payload.user_id || null;
            }
        } catch (e) {}

        socket.emit('limpiar_historial', { recepcionistaId });
        console.log('🧹 Historial limpiado — notificado solo a pantalla propia:', recepcionistaId);
    }
}