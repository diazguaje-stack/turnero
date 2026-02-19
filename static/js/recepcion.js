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


// Variables globales
let pacientesData = {};
let pacientesEliminados = [];

// ==================== INICIALIZACIÓN ====================

document.addEventListener("DOMContentLoaded", () => {
    verificarSesion();
    cargarPacientes();
    cargarEliminados();
});

// ==================== VERIFICAR SESIÓN ====================

async function verificarSesion() {
<<<<<<< HEAD
    // Validar que tiene rol 'recepcion' - de lo contrario, redirigirá a login
    const tieneAcceso = await verificarRol('recepcion');
    if (!tieneAcceso) return;
=======
    try {
        const response = await fetch('/api/verify-session', {
            method: 'GET',
            headers:getAuthHeaders()
        });
>>>>>>> d4cd5e5 (updating project whole)

    // Si llegó aquí, tiene acceso. Mostrar nombre del usuario
    const nombreCompleto = window.sessionData.nombre_completo || window.sessionData.usuario || "Usuario";
    
    const userNameElement = document.getElementById("userName");
    if (userNameElement) {
        userNameElement.textContent = nombreCompleto;
    }

    const userAvatarElement = document.getElementById("userAvatar");
    if (userAvatarElement) {
        const inicial = nombreCompleto.charAt(0).toUpperCase();
        userAvatarElement.textContent = inicial;
    }

    console.log(`✅ Página de recepción lista para: ${nombreCompleto} (${window.sessionData.rol})`);
}

function logout() {
    confirmarCierreSesion(); // Función del sessionManager.js
}


// ==================== CARGAR PACIENTES ====================
function filtrarPacientesEliminados(pacientes) {
    const codigosEliminados = pacientesEliminados.map(p => p.codigo);
    return pacientes.filter(p => !codigosEliminados.includes(p.codigo));
}


async function cargarPacientes() {
    try {
        const container = document.getElementById('medicosContainer');
        
        const response = await fetch('/api/recepcion/pacientes', {
            method: 'GET',
            headers: getAuthHeaders()
        });

        const data = await response.json();
        let pacientes=data.pacientes;
        //FILTRAR LOS QUÉ ESTÁN EN PAPELERA
        

        if (!response.ok) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>⚠️ Error</h3>
                    <p>${data.message || 'Error al cargar pacientes'}</p>
                </div>
            `;
            return;
        }

        let medicos = data.medicos;

        // 🔥 FILTRAR PACIENTES QUE ESTÁN EN PAPELERA
        const codigosEliminados = pacientesEliminados.map(p => p.codigo);

        medicos = medicos.map(medico => {
            return {
                ...medico,
                pacientes: medico.pacientes.filter(p =>
                    !codigosEliminados.includes(p.codigo)
                )
            };
        });


        // Guardar datos para búsqueda
        pacientesData = {};
        medicos.forEach(medico => {
            medico.pacientes.forEach(paciente => {
                pacientesData[paciente.codigo] = {
                    ...paciente,
                    medico_id: medico.id,
                    medico_nombre: medico.nombre
                };
            });
        });

        if (!medicos || medicos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>😕 No hay pacientes registrados</h3>
                    <p>Los pacientes aparecerán aquí una vez sean registrados en /registro</p>
                </div>
            `;
            return;
        }

        // Generar HTML
        const html = medicos.map(medico => crearSeccionMedico(medico)).join('');
        container.innerHTML = `<div class="medicos-container">${html}</div>`;

        console.log(`✅ ${medicos.length} médicos cargados con pacientes`);

    } catch (error) {
        console.error('Error al cargar pacientes:', error);
        document.getElementById('medicosContainer').innerHTML = `
            <div class="empty-state">
                <h3>❌ Error de conexión</h3>
                <p>No se pudieron cargar los pacientes. Intenta recargar la página.</p>
            </div>
        `;
    }
}

// ==================== CREAR SECCIÓN DE MÉDICO ====================

function crearSeccionMedico(medico) {
    const pacientesHTML = medico.pacientes.length === 0 
        ? '<div style="padding: 20px; text-align: center; color: #999;"><p>Sin pacientes registrados</p></div>'
        : medico.pacientes.map(paciente => `
            <div class="paciente-card" onclick="toggleBotonesPaciente('${paciente.codigo}', event)">
    
                <div class="codigo-display">
                    ${paciente.codigo}
                </div>

                <div class="nombre-display">
                    ${paciente.nombre}
                </div>

                <div class="botones-paciente" id="botones-${paciente.codigo}" style="display: none;">
                    <button class="btn-llamar" onclick="llamarPaciente('${paciente.codigo}', event)">📞</button>
                    <button class="btn-eliminar" onclick="eliminarPaciente('${paciente.codigo}', '${paciente.nombre}', event)">🗑️</button>
                </div>

            </div>

        `).join('');

    return `
        <div class="medico-section">
            <div class="medico-header">
                <div class="medico-avatar">${medico.inicial}</div>
                <div class="medico-info">
                    <h3>${medico.nombre}</h3>
                    <p>👨‍⚕️ Médico</p>
                </div>
            </div>
            
            <div class="pacientes-grid">
                ${pacientesHTML}
            </div>
            
            <div class="medico-footer">
                📊 Total: ${medico.total_pacientes} paciente${medico.total_pacientes !== 1 ? 's' : ''}
            </div>
        </div>
    `;
}

// ==================== TOGGLE BOTONES DINÁMICOS ====================

function toggleBotonesPaciente(codigo, event) {
    event.stopPropagation();
    
    const botonElement = document.getElementById(`botones-${codigo}`);
    
    // Ocultar otros botones abiertos
    document.querySelectorAll('.botones-paciente').forEach(el => {
        if (el.id !== `botones-${codigo}`) {
            el.style.display = 'none';
        }
    });
    
    // Toggle del botón actual
    if (botonElement.style.display === 'none') {
        botonElement.style.display = 'flex';
    } else {
        botonElement.style.display = 'none';
    }
}

// ==================== LLAMAR PACIENTE ====================

function llamarPaciente(codigo, event) {
    event.stopPropagation();
    
    const paciente = pacientesData[codigo];
    
    if (!paciente) {
        alert('Paciente no encontrado');
        return;
    }
    
    // Mostrar notificación
    const notificacion = document.createElement('div');
    notificacion.className = 'notificacion-llamada';
    notificacion.innerHTML = `
        <div class="notificacion-contenido">
            <h3>📞 Llamando Paciente</h3>
            <p><strong>${paciente.nombre}</strong></p>
            <p style="margin-top: 10px; font-size: 13px; color: #999;">
                Código: ${codigo}
            </p>
            <p style="margin-top: 15px; color: #667eea; font-weight: bold;">
                Llamando...
            </p>
        </div>
    `;
    
    document.body.appendChild(notificacion);
    
    // Reproducir sonido de llamada (opcional)
    reproducirSonidoLlamada();
    
    // Ocultar después de 3 segundos
    setTimeout(() => {
        notificacion.remove();
    }, 3000);
    
    // Ocultar botones
    document.getElementById(`botones-${codigo}`).style.display = 'none';
    
    console.log(`📞 Llamando a ${paciente.nombre} (${codigo})`);
}

// ==================== ELIMINAR PACIENTE ====================

async function eliminarPaciente(codigo, nombre, event) {
    event.stopPropagation();
    
    const paciente = pacientesData[codigo];
    
    if (!confirm(`¿Estás seguro de que deseas eliminar el código ${codigo} de ${nombre}?`)) {
        return;
    }
    
    try {
<<<<<<< HEAD
        // ✅ AQUÍ ESTÁ EL CAMBIO: NO deletear de la BD, solo agregar a papelera
        // La papelera es LOCAL (localStorage), no elimina de la BD
=======
        const response = await fetch(`/api/recepcion/paciente/${paciente.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
>>>>>>> d4cd5e5 (updating project whole)
        
        // Agregar a papelera LOCAL (sin eliminar de la BD)
        pacientesEliminados.push({
            codigo: codigo,
            nombre: nombre,
            medico: paciente.medico_nombre,
            motivo: paciente.motivo,
            id: paciente.id,
            fecha_eliminacion: new Date().toISOString()
        });
        
        // Guardar en localStorage
        guardarEliminados();
        
        // Remover del DOM (pero no de la BD)
        // Recargar la tabla para actualizar visualmente
        cargarPacientes();
        
        // Mostrar notificación
        mostrarNotificacion(`🗑️ ${nombre} movido a papelera`, 'success');
        
        console.log(`🗑️ Paciente movido a papelera (ID: ${paciente.id})`);
        
    } catch (error) {
        console.error('Error al mover a papelera:', error);
        mostrarNotificacion('Error al eliminar', 'error');
    }
}

// ==================== PAPELERA DE ELIMINADOS ====================

function guardarEliminados() {
    localStorage.setItem('pacientesEliminados', JSON.stringify(pacientesEliminados));
}

function cargarEliminados() {
    const datos = localStorage.getItem('pacientesEliminados');
    pacientesEliminados = datos ? JSON.parse(datos) : [];
    console.log(`📂 Papelera cargada: ${pacientesEliminados.length} pacientes`);
}

function abrirPapelera() {
    const modal = document.getElementById('papelaModal');
    
    if (pacientesEliminados.length === 0) {
        modal.querySelector('.modal-body').innerHTML = `
            <div style="text-align: center; padding: 40px; color: #999;">
                <h3>🗂️ Papelera Vacía</h3>
                <p>No hay códigos eliminados</p>
            </div>
        `;
        modal.classList.add('active');
        return;
    }
    
    const html = pacientesEliminados.map((paciente, index) => `
        <div class="papelera-item">
            <div class="papelera-info">
                <strong>${paciente.nombre}</strong>
                <p style="font-size: 12px; color: #999;">
                    Código: ${paciente.codigo}
                </p>
                <p style="font-size: 12px; color: #999;">
                    Médico: ${paciente.medico}
                </p>
                <p style="font-size: 11px; color: #ccc; margin-top: 5px;">
                    Eliminado: ${new Date(paciente.fecha_eliminacion).toLocaleString('es-ES')}
                </p>
            </div>
            <div class="papelera-acciones">
                <button class="btn-restaurar" onclick="restaurarPaciente(${index})">
                    ↩️ Restaurar
                </button>
                <button class="btn-eliminar-permanente" onclick="eliminarPermanente(${index})">
                    🗑️ Eliminar Permanente
                </button>
            </div>
        </div>
    `).join('');
    
    modal.querySelector('.modal-body').innerHTML = html;
    modal.classList.add('active');
}

function cerrarPapelera() {
    document.getElementById('papelaModal').classList.remove('active');
}

function restaurarPaciente(index) {
    const paciente = pacientesEliminados[index];
    
    if (confirm(`¿Restaurar a ${paciente.nombre} (${paciente.codigo})?`)) {
        // Remover de papelera
        pacientesEliminados.splice(index, 1);
        guardarEliminados();
        
        // Recargar pacientes para mostrar el restaurado
        cargarPacientes();
        
        // Actualizar papelera
        abrirPapelera();
        
        mostrarNotificacion(`✅ ${paciente.nombre} restaurado`, 'success');
        console.log(`↩️ Paciente restaurado: ${paciente.codigo}`);
    }
}

async function eliminarPermanente(index) {
    const paciente = pacientesEliminados[index];
    
    if (confirm(`¿Eliminar permanentemente a ${paciente.nombre}? Esta acción no se puede deshacer.`)) {
        try {
            console.log("Eliminado ID",paciente.id);
            // ✅ AQUÍ SÍ ELIMINAMOS DE LA BD
            const response = await fetch(`/api/recepcion/paciente/${paciente.id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                mostrarNotificacion(`Error: ${data.message || 'No se pudo eliminar'}`, 'error');
                return;
            }
            
            // Remover de papelera local
            pacientesEliminados.splice(index, 1);
            guardarEliminados();
            
            // Actualizar papelera
            abrirPapelera();
            
            mostrarNotificacion(`🗑️ ${paciente.nombre} eliminado permanentemente`, 'error');
            console.log(`🗑️ Paciente eliminado permanentemente de BD: ${paciente.id}`);
            
        } catch (error) {
            console.error('Error al eliminar de BD:', error);
            mostrarNotificacion('Error al eliminar permanentemente', 'error');
        }
    }
}

function vaciarPapelera() {
    if (confirm('¿Vaciar toda la papelera? Esta acción no se puede deshacer.')) {
        pacientesEliminados = [];
        guardarEliminados();
        mostrarNotificacion('🗑️ Papelera vaciada', 'error');
        cerrarPapelera();
    }
}

<<<<<<< HEAD
=======
// ==================== BÚSQUEDA ====================

async function buscarPaciente() {
    const codigo = document.getElementById('searchInput').value.trim().toUpperCase();

    if (!codigo) {
        alert('Por favor ingresa un código de paciente');
        return;
    }

    // Si existe en datos cargados, mostrar
    if (pacientesData[codigo]) {
        mostrarDetalles(codigo);
        return;
    }

    // Si no, buscar en el servidor
    try {
        const response = await fetch(`/api/recepcion/paciente/${codigo}`, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (!response.ok) {
            alert(`❌ ${data.message || 'Paciente no encontrado'}`);
            return;
        }

        mostrarDetallesModal(data.paciente);

    } catch (error) {
        console.error('Error en búsqueda:', error);
        alert('Error al buscar paciente');
    }
}

>>>>>>> d4cd5e5 (updating project whole)
// ==================== MOSTRAR DETALLES ====================

function mostrarDetalles(codigo) {
    const paciente = pacientesData[codigo];
    
    if (!paciente) {
        alert('Paciente no encontrado');
        return;
    }

    mostrarDetallesModal(paciente);
}

function mostrarDetallesModal(paciente) {
    const modal = document.getElementById('detallesModal');
    const contenido = document.getElementById('detallesContent');

    const fechaRegistro = new Date(paciente.created_at);
    const fechaFormato = fechaRegistro.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    contenido.innerHTML = `
        <p>
            <strong>👤 Nombre:</strong>
            <span class="valor">${paciente.nombre || 'N/A'}</span>
        </p>
        
        <p>
            <strong>📌 Código:</strong>
            <span class="valor" style="font-family: 'Courier New', monospace; font-size: 16px;">${paciente.codigo}</span>
        </p>
        
        <p>
            <strong>🆔 ID Paciente:</strong>
            <span class="valor" style="font-size: 12px; font-family: monospace;">${paciente.id.substring(0, 8)}...</span>
        </p>
        
        <p>
            <strong>👨‍⚕️ Médico:</strong>
            <span class="valor">${paciente.medico_nombre || 'Sin asignar'}</span>
        </p>
        
        <p>
            <strong>📋 Motivo:</strong>
            <span class="valor">${paciente.motivo || 'N/A'}</span>
        </p>
        
        <p>
            <strong>📄 Documento:</strong>
            <span class="valor">${paciente.documento || 'N/A'}</span>
        </p>
        
        <p>
            <strong>📅 Fecha de Registro:</strong>
            <span class="valor">${fechaFormato}</span>
        </p>
    `;

    modal.classList.add('active');
}

function cerrarModal() {
    const modal = document.getElementById('detallesModal');
    modal.classList.remove('active');
}

// Cerrar modal al hacer click fuera
document.addEventListener('click', (e) => {
    const modal = document.getElementById('detallesModal');
    if (e.target === modal) {
        cerrarModal();
    }
});

// ==================== NOTIFICACIONES ====================

function mostrarNotificacion(mensaje, tipo = 'success') {
    const notificacion = document.createElement('div');
    notificacion.className = `notificacion ${tipo}`;
    notificacion.textContent = mensaje;
    notificacion.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${tipo === 'success' ? '#d4edda' : '#f8d7da'};
        color: ${tipo === 'success' ? '#155724' : '#721c24'};
        border-radius: 4px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 999;
        animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(notificacion);
    
    setTimeout(() => {
        notificacion.remove();
    }, 3000);
}

// ==================== SONIDO DE LLAMADA ====================

function reproducirSonidoLlamada() {
    // Crear sonido de timbre (beep-beep)
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
        console.log('Audio no disponible');
    }
}

// ==================== LOGOUT ====================

function logout() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        fetch('/logout', { method: 'POST', headers: getAuthHeaders() })
            .then(() => window.location.href = '/')
            .catch(err => console.error('Error al cerrar sesión:', err));
    }
}

// Cerrar papelera al hacer click fuera
document.addEventListener('click', (e) => {
    const modal = document.getElementById('papelaModal');
    if (e.target === modal) {
        cerrarPapelera();
    }
});