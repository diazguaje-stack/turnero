// screen.js - Sistema de vinculación de pantallas

const API_URL = window.location.origin;
const SCREEN_API = {
    init: `${API_URL}/api/screen/init`,
    status: `${API_URL}/api/screen/status`
};

let deviceFingerprint = null;
let statusCheckInterval = null;
let pantallaData = null;

// =========================
// INICIALIZACIÓN
// =========================

document.addEventListener('DOMContentLoaded', function() {
    console.log('📺 Pantalla de turnos iniciando...');
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
        const response = await fetch(SCREEN_API.init, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                device_fingerprint: deviceFingerprint
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            pantallaData = data.pantalla;
            
            switch (data.status) {
                case 'vinculada':
                    console.log('✅ Pantalla ya vinculada');
                    mostrarEstadoVinculada(pantallaData);
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
        console.error('❌ Error al inicializar:', error);
        mostrarError('Error de conexión con el servidor');
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
    // Ocultar otros estados
    document.getElementById('connectingState').style.display = 'none';
    document.getElementById('linkedState').style.display = 'none';
    
    // Mostrar estado pendiente
    const pendingState = document.getElementById('pendingState');
    pendingState.style.display = 'block';
    
    // Mostrar código de vinculación
    const codigoDisplay = document.getElementById('codigoVinculacion');
    if (codigoDisplay && pantalla.codigo_vinculacion) {
        codigoDisplay.textContent = pantalla.codigo_vinculacion;
    }
    
    console.log('🔑 Código de vinculación:', pantalla.codigo_vinculacion);
}

/**
 * Mostrar estado vinculada
 */
function mostrarEstadoVinculada(pantalla) {
    // Ocultar otros estados
    document.getElementById('connectingState').style.display = 'none';
    document.getElementById('pendingState').style.display = 'none';
    
    // Mostrar estado vinculada
    const linkedState = document.getElementById('linkedState');
    linkedState.style.display = 'block';
    linkedState.classList.add('active');
    
    // Actualizar información
    const pantallaNumero = document.getElementById('pantallaNumero');
    const pantallaNombre = document.getElementById('pantallaNombre');
    const vinculadaAt = document.getElementById('vinculadaAt');
    const recepcionistaAsignado = document.getElementById('recepcionistaAsignado');
    
    if (pantallaNumero) {
        pantallaNumero.textContent = `Pantalla ${pantalla.numero}`;
    }
    
    if (pantallaNombre) {
        pantallaNombre.textContent = pantalla.nombre || `Pantalla ${pantalla.numero}`;
    }
    
    if (vinculadaAt && pantalla.vinculada_at) {
        vinculadaAt.textContent = formatearFecha(pantalla.vinculada_at);
    }
    
    // Aquí se mostrará el recepcionista asignado cuando esté implementado
    if (recepcionistaAsignado) {
        if (pantalla.recepcionista_nombre) {
            recepcionistaAsignado.textContent = pantalla.recepcionista_nombre;
        } else {
            recepcionistaAsignado.textContent = 'Sin asignar';
        }
    }
    
    console.log('✅ Pantalla vinculada:', pantalla);
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
                mostrarEstadoVinculada(pantallaData);
                iniciarMonitoreoEstado();
            }
            
        } catch (error) {
            console.error('Error al verificar estado:', error);
        }
    }, 3000); // Cada 3 segundos
}

/**
 * Iniciar monitoreo de estado
 * Mantiene la conexión activa y actualiza última conexión
 */
function iniciarMonitoreoEstado() {
    console.log('📡 Iniciando monitoreo de estado...');
    
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
            
            if (data.success) {
                pantallaData = data.pantalla;
                
                // Si la pantalla fue desvinculada, recargar
                if (data.status !== 'vinculada') {
                    console.log('⚠️ Pantalla desvinculada, recargando...');
                    location.reload();
                }
            }
            
        } catch (error) {
            console.error('Error al verificar estado:', error);
        }
    }, 10000); // Cada 10 segundos
}

/**
 * Mostrar error
 */
function mostrarError(mensaje) {
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
        errorMessage.textContent = mensaje;
        errorMessage.classList.add('show');
    }
    
    // Ocultar loading
    document.getElementById('connectingState').style.display = 'none';
    
    console.error('❌', mensaje);
}

/**
 * Formatear fecha
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

// Limpiar intervalo al cerrar la página
window.addEventListener('beforeunload', () => {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
});