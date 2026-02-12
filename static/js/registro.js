// Registro Dashboard JS - ✅ VERSIÓN CORREGIDA

async function loadDoctorsCards() {
    try {
        console.log('🔄 Cargando doctores...');
        
        const response = await fetch('/registro/doctors/data');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const doctors = await response.json();
        const newJSON = JSON.stringify(doctors);

        // Evitar re-render si no hubo cambios (reduce parpadeo)
        if (window._prevDoctorsJSON === newJSON) {
            console.log('No hay cambios en la lista de doctores - evitando re-render');
            return;
        }
        window._prevDoctorsJSON = newJSON;
        
        console.log(`✅ ${doctors.length} doctores cargados`);
        
        const container = document.getElementById('doctorsCards');
        
        if (doctors.length === 0) {
            container.innerHTML = `
                <div class="loading">
                    <i class="fas fa-user-md" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
                    <p>No hay doctores disponibles</p>
                    <small style="color: #9ca3af; margin-top: 8px; display: block;">
                        Los doctores deben ser creados desde el módulo de Recepción
                    </small>
                </div>
            `;
        } else {
            container.innerHTML = doctors.map(doctor => `
                <div class="card" onclick="showRegisterModal(${doctor.id}, '${doctor.name.replace(/'/g, "\\'")}')">
                    <div class="card-header">
                        <div class="card-title">${doctor.name}</div>
                        <span class="card-badge badge-active">Tipo ${doctor.type}</span>
                    </div>
                    <div class="card-content">
                        <p><strong>Estado:</strong> ${getStatusText(doctor.status)}</p>
                        <p><strong>Pacientes en espera:</strong> ${doctor.patient_count}</p>
                    </div>
                    <div class="card-actions">
                        <button class="btn-primary" onclick="event.stopPropagation(); showRegisterModal(${doctor.id}, '${doctor.name.replace(/'/g, "\\'")}')">
                            <i class="fas fa-user-plus"></i>
                            Registrar Paciente
                        </button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('❌ Error cargando doctores:', error);
        
        const container = document.getElementById('doctorsCards');
        container.innerHTML = `
            <div class="loading">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 16px;"></i>
                <p style="color: #ef4444;">Error de conexión</p>
                <small style="color: #9ca3af; margin-top: 8px; display: block;">
                    ${error.message}
                </small>
                <button class="btn-secondary" onclick="loadDoctorsCards()" style="margin-top: 16px;">
                    <i class="fas fa-sync-alt"></i>
                    Reintentar
                </button>
            </div>
        `;
    }
}

function getStatusText(status) {
    const statusMap = {
        'available': '✅ Disponible',
        'busy': '🔴 Ocupado',
        'paused': '⏸️ En Pausa',
        'unavailable': '❌ No Disponible'
    };
    return statusMap[status] || status;
}

function showRegisterModal(doctorId, doctorName) {
    document.getElementById('selectedDoctorId').value = doctorId;
    document.getElementById('selectedDoctorName').value = doctorName;
    
    // Limpiar el campo de nombre del paciente
    const patientNameInput = document.querySelector('input[name="patient_name"]');
    if (patientNameInput) {
        patientNameInput.value = '';
        patientNameInput.focus();
    }
    
    showModal('registerPatientModal');
}

async function registerPatient(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    const patientName = formData.get('patient_name')?.trim();
    const doctorId = formData.get('doctor_id');
    
    if (!patientName) {
        showFlashMessage('Por favor ingresa el nombre del paciente', 'warning');
        return;
    }
    
    if (!doctorId) {
        showFlashMessage('Doctor no seleccionado', 'error');
        return;
    }
    
    // Deshabilitar botón de envío para evitar doble clic
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
    
    try {
        console.log('📝 Registrando paciente:', { patientName, doctorId });
        
        const response = await fetch('/registro/create-patient', {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: formData
        });

        // Manejar respuestas no OK (por ejemplo redirección a login que devuelve HTML)
        if (!response.ok) {
            // Intentar parsear JSON con detalle de error
            let payload;
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                payload = await response.json();
                showFlashMessage(payload.error || 'Error al registrar paciente', 'danger');
            } else {
                // Probablemente se devolvió HTML (p.ej. página de login)
                const text = await response.text();
                console.error('Respuesta inesperada (HTML):', text.slice(0, 300));
                showFlashMessage('Sesión expirada o redirección inesperada. Serás redirigido al login.', 'danger');
                // Forzar redirección al login
                setTimeout(() => { window.location.href = '/login'; }, 1200);
            }
            return;
        }

        const result = await response.json();

        console.log('Respuesta del servidor:', result);

        if (result.success) {
            showFlashMessage(`✅ Paciente registrado exitosamente con código: ${result.code}`, 'success');
            hideModal('registerPatientModal');
            
            // Mostrar código generado
            document.getElementById('generatedCode').textContent = result.code;
            showModal('codeModal');
            
            // Limpiar formulario
            form.reset();
            
            // Recargar lista de doctores para actualizar contadores
            loadDoctorsCards();
            
            console.log('✅ Paciente registrado:', result.patient);
        } else {
            showFlashMessage(result.error || 'Error registrando paciente', 'danger');
            console.error('Error del servidor:', result.error);
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        showFlashMessage('Error de conexión. Por favor verifica que el servidor esté funcionando.', 'danger');
    } finally {
        // Rehabilitar botón
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

// Cargar doctores al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Módulo de Registro iniciado');
    
    if (document.getElementById('doctorsCards')) {
        loadDoctorsCards();
        
        // Auto-actualizar cada 10 segundos
        setInterval(() => {
            console.log('🔄 Auto-actualización de doctores...');
            loadDoctorsCards();
        }, 10000);
    }
});

console.log('✅ registro.js cargado correctamente');