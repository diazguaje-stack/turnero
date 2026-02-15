// screen.js - Sistema de vinculación de pantallas v2
const API_URL = window.location.origin;
const SCREEN_API = {
    init: `${API_URL}/api/screen/init`,
    status: `${API_URL}/api/screen/status`
};

let deviceFingerprint = null;
let statusCheckInterval = null;
let pantallaData = null;
let intentoInicializacion = 0;
const MAX_INTENTOS = 5;
const DELAY_REINTENTO = 3000; // 3 segundos

// =========================
// INICIALIZACIÓN
// =========================

document.addEventListener('DOMContentLoaded', function() {
    console.log('📺 Pantalla de turnos iniciando...');
    console.log(`🌐 API URL: ${API_URL}`);
    console.log(`📍 Ubicación: ${window.location.href}`);
    inicializarPantalla();
});

/**
 * Generar fingerprint único del dispositivo
 */
function generarDeviceFingerprint() {
    // Intenta recuperar el ID guardado
    let deviceId = localStorage.getItem('screen_device_id');
    
    if (!deviceId) {
        // Generar nuevo ID único basado en características del navegador
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('fingerprint', 2, 2);
        const canvasData = canvas.toDataURL();
        
        deviceId = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            canvasData,
            Math.random().toString(36).substring(7)
        ].join('|');
        
        // Hash simple
        deviceId = btoa(deviceId).substring(0, 64);
        
        // Guardar para futuras sesiones
        localStorage.setItem('screen_device_id', deviceId);
    }
    
    return deviceId;
}

/**
 * Inicializar la pantalla
 */
async function inicializarPantalla() {
    try {
        // Generar fingerprint del dispositivo
        deviceFingerprint = generarDeviceFingerprint();
        console.log('🔑 Device Fingerprint:', deviceFingerprint);
        
        // Mostrar device ID en la interfaz
        mostrarDeviceId();
        
        // Inicializar con el servidor
        console.log(`🔗 Intentando conectar a: ${SCREEN_API.init}`);
        
        const response = await fetch(SCREEN_API.init, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                device_fingerprint: deviceFingerprint
            }),
            timeout: 10000 // Timeout de 10 segundos
        });
        
        console.log(`📥 Respuesta del servidor: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📊 Datos recibidos:', data);
        
        if (data.success) {
            pantallaData = data.pantalla;
            intentoInicializacion = 0; // Reset intentos
            
            switch (data.status) {
                case 'vinculada':
                    console.log('✅ Pantalla ya vinculada');
                    mostrarPantallaTrabajo(pantallaData);
                    iniciarMonitoreoEstado();
                    break;
                    
                case 'pendiente':
                    console.log('🟡 Pantalla pendiente de vinculación');
                    mostrarEstadoPendiente(pantallaData);
                    iniciarMonitoreoVinculacion();
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
        console.error('   Stack:', error.stack);
        
        // Mensaje de error más informativo
        let mensajeError = `Error de conexión con el servidor`;
        
        if (error.message.includes('Failed to fetch')) {
            mensajeError = `No se puede conectar a ${API_URL} - Verifica que el servidor esté corriendo`;
        } else if (error.message.includes('HTTP')) {
            mensajeError = `Error del servidor: ${error.message}`;
        } else if (error.message.includes('timeout')) {
            mensajeError = `Timeout al conectar con el servidor`;
        }
        
        if (intentoInicializacion < MAX_INTENTOS) {
            console.log(`⏳ Reintentando en ${DELAY_REINTENTO}ms... (intento ${intentoInicializacion}/${MAX_INTENTOS})`);
            mostrarError(`${mensajeError} - Reintentando...`);
            setTimeout(inicializarPantalla, DELAY_REINTENTO);
        } else {
            console.error('❌ Máximo de intentos alcanzado');
            mostrarError(`${mensajeError}\n\nSi el problema persiste:\n1. Verifica que el servidor está corriendo (python app.py)\n2. Intenta acceder a: ${API_URL}\n3. Abre la consola (F12) para ver los detalles del error`);
        }
    }
}

/**
 * Mostrar device ID en la interfaz
 */
function mostrarDeviceId() {
    const deviceIdDisplay = document.getElementById('deviceIdDisplay');
    if (deviceIdDisplay && deviceFingerprint) {
        deviceIdDisplay.textContent = deviceFingerprint;
    }
}

/**
 * Mostrar estado pendiente
 */
function mostrarEstadoPendiente(pantalla) {
    try {
        // Ocultar otros estados
        const connectingState = document.getElementById('connectingState');
        const linkedState = document.getElementById('linkedState');
        const pendingState = document.getElementById('pendingState');
        
        if (connectingState) connectingState.style.display = 'none';
        if (linkedState) linkedState.style.display = 'none';
        
        // Mostrar estado pendiente
        if (pendingState) {
            pendingState.style.display = 'flex';
            
            // Mostrar código de vinculación
            const codigoDisplay = document.getElementById('codigoVinculacion');
            if (codigoDisplay && pantalla.codigo_vinculacion) {
                codigoDisplay.textContent = pantalla.codigo_vinculacion;
            }
            
            console.log('🔑 Código de vinculación:', pantalla.codigo_vinculacion);
        } else {
            console.warn('⚠️ Elemento pendingState no encontrado en el DOM');
        }
    } catch (error) {
        console.error('Error al mostrar estado pendiente:', error);
    }
}

/**
 * Mostrar pantalla de trabajo (vinculada)
 */
function mostrarPantallaTrabajo(pantalla) {
    try {
        console.log('🖥️ Mostrando pantalla de trabajo:', pantalla);
        
        // Ocultar otros estados
        const connectingState = document.getElementById('connectingState');
        const pendingState = document.getElementById('pendingState');
        const linkedState = document.getElementById('linkedState');
        
        if (connectingState) connectingState.style.display = 'none';
        if (pendingState) pendingState.style.display = 'none';
        
        // Mostrar pantalla de trabajo
        if (linkedState) {
            linkedState.style.display = 'flex';
            linkedState.classList.add('active');
            
            // Mostrar nombre del recepcionista
            const recepcionistaName = document.getElementById('recepcionistaName');
            if (recepcionistaName) {
                recepcionistaName.textContent = pantalla.recepcionista_nombre || '-';
            }
            
            console.log('✅ Pantalla de trabajo lista');
        }
    } catch (error) {
        console.error('Error al mostrar pantalla de trabajo:', error);
    }
}

/**
 * Actualizar información del recepcionista
 */
function actualizarRecepcionista(pantalla) {
    const recepcionistaDisplay = document.getElementById('recepcionistaDisplay');
    const recepcionistaIdDisplay = document.getElementById('recepcionistaIdDisplay');
    
    if (pantalla.recepcionista_nombre) {
        // Hay recepcionista asignado
        if (recepcionistaDisplay) {
            recepcionistaDisplay.innerHTML = pantalla.recepcionista_nombre;
        }
        
        if (recepcionistaIdDisplay && pantalla.recepcionista_id) {
            recepcionistaIdDisplay.textContent = `ID: ${pantalla.recepcionista_id}`;
        }
        
        console.log('👤 Recepcionista:', pantalla.recepcionista_nombre);
    } else {
        // Sin recepcionista
        if (recepcionistaDisplay) {
            recepcionistaDisplay.innerHTML = '<span class="sin-recepcionista">Sin asignar</span>';
        }
        
        if (recepcionistaIdDisplay) {
            recepcionistaIdDisplay.textContent = '';
        }
        
        console.log('⚠️ Sin recepcionista asignado');
    }
}

/**
 * Actualizar paciente (por ahora siempre vacío)
 */
function actualizarPaciente() {
    const pacienteDisplay = document.getElementById('pacienteDisplay');
    
    if (pacienteDisplay) {
        // Por ahora siempre muestra "Esperando paciente"
        pacienteDisplay.innerHTML = '<span class="sin-paciente">Esperando paciente...</span>';
    }
}

/**
 * Actualizar última actualización
 */
function actualizarUltimaActualizacion() {
    const ultimaActualizacion = document.getElementById('ultimaActualizacion');
    
    if (ultimaActualizacion) {
        const ahora = new Date();
        const horaActual = ahora.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        ultimaActualizacion.textContent = `Última actualización: ${horaActual}`;
    }
}

/**
 * Iniciar monitoreo de vinculación
 * Verifica cada 3 segundos si la pantalla fue vinculada
 */
function iniciarMonitoreoVinculacion() {
    console.log('👀 Iniciando monitoreo de vinculación...');
    
    statusCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(SCREEN_API.status, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    device_fingerprint: deviceFingerprint
                })
            });
            
            const data = await response.json();
            
            if (data.success && data.status === 'vinculada') {
                console.log('🎉 ¡Pantalla vinculada!');
                clearInterval(statusCheckInterval);
                pantallaData = data.pantalla;
                mostrarPantallaTrabajo(pantallaData);
                iniciarMonitoreoEstado();
            }
            
        } catch (error) {
            console.warn('⚠️ Error temporal al verificar vinculación:', error.message);
            // No mostrar error, solo continuar intentando
        }
    }, 3000); // Cada 3 segundos
}

/**
 * Iniciar monitoreo de estado
 * Mantiene la conexión activa y actualiza información
 */
function iniciarMonitoreoEstado() {
    console.log('📡 Iniciando monitoreo de estado...');
    let erroresConsecutivos = 0;
    
    statusCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(SCREEN_API.status, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    device_fingerprint: deviceFingerprint
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            erroresConsecutivos = 0; // Reset contador de errores
            
            if (data.success && data.pantalla) {
                const pantallaAnterior = pantallaData;
                pantallaData = data.pantalla;
                
                // Si la pantalla fue desvinculada, recargar
                if (data.status !== 'vinculada') {
                    console.log('⚠️ Pantalla desvinculada, recargando...');
                    location.reload();
                    return;
                }
                
                // Verificar si cambió el recepcionista
                if (pantallaAnterior && pantallaAnterior.recepcionista_nombre !== pantallaData.recepcionista_nombre) {
                    console.log('🔄 Recepcionista actualizado:', pantallaData.recepcionista_nombre);
                    const recepcionistaName = document.getElementById('recepcionistaName');
                    if (recepcionistaName) {
                        recepcionistaName.textContent = pantallaData.recepcionista_nombre || '-';
                    }
                }
            }
            
        } catch (error) {
            erroresConsecutivos++;
            console.warn(`⚠️ Error #${erroresConsecutivos} al verificar estado:`, error.message);
            
            // Si hay muchos errores consecutivos, mostrar alerta
            if (erroresConsecutivos > 3) {
                console.error('❌ Múltiples errores de conexión en monitoreo');
                // Podríamos mostrar un error visual o intentar reconectar
            }
        }
    }, 10000); // Cada 10 segundos
}

/**
 * Mostrar error
 */
function mostrarError(mensaje) {
    try {
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) {
            // Mejorar formato del mensaje de error
            const mensajeFormateado = mensaje.replace(/\n/g, '<br>');
            errorMessage.innerHTML = `
                <div style="text-align: center; line-height: 1.6;">
                    <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
                    <div>${mensajeFormateado}</div>
                </div>
            `;
            errorMessage.classList.add('show');
        }
        
        // Ocultar loading
        const connectingState = document.getElementById('connectingState');
        if (connectingState) {
            connectingState.style.display = 'none';
        }
    } catch (error) {
        console.error('Error al mostrar mensaje de error:', error);
    }
    
    console.error('❌', mensaje);
}

/**
 * Formatear fecha completa
 */
function formatearFecha(fechaISO) {
    if (!fechaISO) return 'N/A';
    
    try {
        const fecha = new Date(fechaISO);
        return fecha.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return 'N/A';
    }
}

/**
 * Formatear fecha corta
 */
function formatearFechaCorta(fechaISO) {
    if (!fechaISO) return 'N/A';
    
    try {
        const fecha = new Date(fechaISO);
        const ahora = new Date();
        const diff = Math.floor((ahora - fecha) / 1000); // segundos
        
        if (diff < 60) return 'Hace un momento';
        if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
        if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} hrs`;
        
        return fecha.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit'
        });
    } catch (e) {
        return 'N/A';
    }
}

// Limpiar intervalo al cerrar la página
window.addEventListener('beforeunload', () => {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
});