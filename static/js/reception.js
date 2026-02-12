// Reception Dashboard JS - ✅ VERSIÓN ULTRA-ROBUSTA

// ============================================================
// GESTIÓN DE DOCTORES
// ============================================================

async function loadDoctors() {
    const grid = document.getElementById('doctorsGrid');
    try {
        const response = await fetch('/reception/doctors/data', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        if (!response.ok) {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const payload = await response.json();
                console.error('Error cargando doctores (JSON):', payload);
                showFlashMessage(payload.error || 'Error cargando doctores', 'danger');
            } else {
                const text = await response.text();
                console.error('Error cargando doctores (HTML):', text.slice(0,300));
                showFlashMessage('Sesión expirada o redirección inesperada. Serás redirigido al login.', 'danger');
                setTimeout(() => { window.location.href = '/login'; }, 1200);
            }
            return;
        }

        const doctors = await response.json();

        if (!grid) return;

        if (!Array.isArray(doctors) || doctors.length === 0) {
            grid.innerHTML = '<div class="loading">No hay doctores registrados</div>';
            return;
        }

        grid.innerHTML = doctors.map(doctor => `
            <div class="card">
                <div class="card-header">
                    <div>
                        <div class="card-title">${doctor.name}</div>
                        <div style="color: #6b7280; font-size: 13px;">
                            Tipo: ${doctor.type === 'I' ? 'Información (I)' : 'Consulta (C)'}
                        </div>
                    </div>
                    <span class="card-badge ${doctor.is_active ? 'badge-active' : 'badge-inactive'}">
                        ${doctor.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                </div>
                <div class="card-content">
                    <p><strong>Estado:</strong> ${getStatusText(doctor.status)}</p>
                    <p><strong>Pacientes:</strong> ${doctor.patient_count || 0}</p>
                </div>
                <div class="card-actions">
                    <button class="btn-secondary ${doctor.is_active ? 'btn-danger' : 'btn-success'}" onclick="toggleDoctor(${doctor.id})">
                        ${doctor.is_active ? 'Deshabilitar' : 'Habilitar'}
                    </button>
                    <button class="btn-secondary btn-danger" onclick="deleteDoctor(${doctor.id}, '${doctor.name.replace(/'/g, "\\'")}')">
                        Eliminar
                    </button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error cargando doctores:', error);
        showFlashMessage('Error cargando doctores', 'danger');
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

async function createDoctor(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    const name = formData.get('name');
    const type = formData.get('type');
    
    if (!name || !type) {
        showFlashMessage('Completa todos los campos', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/reception/create-doctor', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage(`✅ Doctor "${name}" creado exitosamente`, 'success');
            hideModal('createDoctorModal');
            form.reset();
            loadDoctors();
        } else {
            showFlashMessage(result.error || 'Error creando doctor', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

async function toggleDoctor(doctorId) {
    try {
        const response = await fetch(`/reception/toggle-doctor/${doctorId}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage('Estado actualizado', 'success');
            loadDoctors();
        } else {
            showFlashMessage(result.error || 'Error', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

async function deleteDoctor(doctorId, doctorName) {
    if (!confirm(`¿Estás seguro de eliminar al doctor "${doctorName}"?\n\nEsta acción NO se puede deshacer.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/reception/delete-doctor/${doctorId}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage(`✅ Doctor "${doctorName}" eliminado`, 'success');
            loadDoctors();
        } else {
            showFlashMessage(result.error || 'Error', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

// ============================================================
// GESTIÓN DE PACIENTES - ✅ ULTRA-ROBUSTA
// ============================================================

async function loadPatients() {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 CARGANDO PACIENTES DESDE FRONTEND');
    console.log('='.repeat(60));
    
    const list = document.getElementById('patientsList');

    // Si la lista está vacía mostramos un indicador; si ya contiene elementos,
    // evitamos reemplazar inmediatamente su contenido para prevenir parpadeo.
    const wasEmpty = !list || !list.innerHTML.trim();
    if (wasEmpty) {
        list.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner fa-spin" style="font-size: 32px; color: #667eea;"></i>
                <p>Cargando pacientes...</p>
            </div>
        `;
    }
    
    try {
        console.log('[1/5] Haciendo petición a /reception/patients/data...');
        
        const response = await fetch('/reception/patients/data');
        
        console.log(`[2/5] Respuesta recibida - Status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        console.log('[3/5] Parseando JSON...');
        const patients = await response.json();
        
        console.log(`[4/5] Datos recibidos:`);
        console.log(`  - Tipo: ${Array.isArray(patients) ? 'Array' : typeof patients}`);
        console.log(`  - Cantidad: ${Array.isArray(patients) ? patients.length : 'N/A'}`);
        
        // Verificar si hay error en la respuesta
        if (patients.error) {
            console.error('❌ Error en respuesta del servidor:');
            console.error(`  - Mensaje: ${patients.message}`);
            console.error(`  - Detalles: ${patients.details}`);
            
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 16px;"></i>
                    <p style="color: #ef4444;">Error del servidor</p>
                    <small style="color: #9ca3af; margin-top: 8px; display: block;">
                        ${patients.message || 'Error desconocido'}
                    </small>
                    <button class="btn-secondary" onclick="loadPatients()" style="margin-top: 16px;">
                        <i class="fas fa-sync-alt"></i>
                        Reintentar
                    </button>
                </div>
            `;
            return;
        }
        
        // Actualizar timestamp
        updateTimestamp();

        console.log('[5/5] Renderizando pacientes...');

        // Si la respuesta no es array o está vacía, renderizar estado vacío
        if (!Array.isArray(patients) || patients.length === 0) {
            console.log('  ⚠️  Sin pacientes para mostrar');
            const emptyHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-clock" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
                    <p>No hay pacientes registrados</p>
                    <small style="color: #9ca3af; margin-top: 8px; display: block;">
                        Los pacientes registrados desde el módulo de Registro aparecerán aquí
                    </small>
                </div>
            `;

            // Evitar re-render si ya está vacío
            if (window._prevPatientsJSON === JSON.stringify(patients)) {
                console.log('No hay cambios en pacientes (vacío) - evitando re-render');
                return;
            }

            window._prevPatientsJSON = JSON.stringify(patients);
            list.innerHTML = emptyHTML;
            console.log('='.repeat(60) + '\n');
            return;
        }

        // Evitar re-render si no hay cambios
        const newJSON = JSON.stringify(patients);
        if (window._prevPatientsJSON === newJSON) {
            console.log('No hay cambios en pacientes - evitando re-render');
            return;
        }
        window._prevPatientsJSON = newJSON;

        // Agrupar pacientes por doctor
        const patientsByDoctor = {};
        
        patients.forEach((patient, idx) => {
            console.log(`  - Paciente ${idx + 1}: ${patient.code} - ${patient.name} (Doctor ID: ${patient.doctor_id})`);
            
            const doctorKey = patient.doctor_id || 'sin_doctor';
            
            if (!patientsByDoctor[doctorKey]) {
                patientsByDoctor[doctorKey] = {
                    doctor_id: patient.doctor_id,
                    doctor_name: patient.doctor_name || 'Sin Doctor',
                    doctor_type: patient.doctor_type || '?',
                    patients: []
                };
            }
            
            patientsByDoctor[doctorKey].patients.push(patient);
        });
        
        // Ordenar pacientes dentro de cada grupo por código
        Object.values(patientsByDoctor).forEach(group => {
            group.patients.sort((a, b) => a.code.localeCompare(b.code));
        });
        
        // Renderizar grupos de doctores
        list.innerHTML = Object.values(patientsByDoctor).map(group => `
            <div class="doctor-group">
                <div class="doctor-group-header">
                    <h4>
                        <i class="fas fa-user-md"></i>
                        ${group.doctor_name}
                        <span class="type-badge type-${group.doctor_type}">${group.doctor_type}</span>
                    </h4>
                    <span class="patient-count">
                        <i class="fas fa-users"></i>
                        ${group.patients.length} paciente${group.patients.length !== 1 ? 's' : ''}
                    </span>
                </div>
                        <div class="patients-row">
                            ${group.patients.map(patient => `
                                <div class="patient-item">
                                    <div class="patient-name">${patient.name || ''}</div>
                                    <button class="patient-code-btn ${patient.is_called ? 'called' : ''}"
                                            onclick="deletePatient(${patient.id}, '${patient.code}', '${(patient.name||'').replace(/'/g, "\\'")}')">
                                        <div class="code">${patient.code}</div>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
            </div>
        `).join('');
        
        console.log(`✅ ${patients.length} pacientes renderizados exitosamente`);
        console.log('='.repeat(60) + '\n');
        
    } catch (error) {
        console.error('\n❌ ERROR CRÍTICO EN FRONTEND:');
        console.error(`  - Tipo: ${error.name}`);
        console.error(`  - Mensaje: ${error.message}`);
        console.error('  - Stack:', error.stack);
        console.log('='.repeat(60) + '\n');
        
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 16px;"></i>
                <p style="color: #ef4444;">Error cargando pacientes</p>
                <small style="color: #9ca3af; margin-top: 8px; display: block;">
                    ${error.message}
                </small>
                <div style="margin-top: 16px; padding: 12px; background: #fef3c7; border-radius: 8px; text-align: left;">
                    <strong style="color: #92400e;">💡 Posibles causas:</strong>
                    <ul style="margin: 8px 0 0 20px; color: #78350f; font-size: 13px;">
                        <li>El servidor Flask no está corriendo</li>
                        <li>Error en la base de datos</li>
                        <li>Problema de conexión de red</li>
                    </ul>
                </div>
                <button class="btn-secondary" onclick="loadPatients()" style="margin-top: 16px;">
                    <i class="fas fa-sync-alt"></i>
                    Reintentar
                </button>
            </div>
        `;
        
        showFlashMessage('Error cargando pacientes. Ver consola para más detalles.', 'danger');
    }
}

function renderPatientCard(patient) {
    return `
        <div class="patient-card-code ${patient.is_called ? 'called' : ''}" 
             data-patient-id="${patient.id}"
             oncontextmenu="showPatientMenu(event, ${patient.id}, '${patient.code}', '${patient.name.replace(/'/g, "\\'")}', ${patient.is_called})">
            
            <div class="patient-code-badge ${patient.is_called ? 'code-called' : 'code-waiting'}">
                ${patient.code}
            </div>
            
            <div class="patient-name-display">
                ${patient.name}
            </div>
            
            <div class="patient-status-badge">
                ${patient.is_called ? 
                    `<span class="status-called"><i class="fas fa-bell"></i> Llamado</span>` : 
                    `<span class="status-waiting"><i class="fas fa-clock"></i> En espera</span>`
                }
            </div>
            
            <div class="patient-time-info">
                <i class="fas fa-clock"></i>
                ${patient.created_at}
            </div>
        </div>
    `;
}

// ============================================================
// MENÚ CONTEXTUAL (CLIC DERECHO)
// ============================================================

let activePatientMenu = null;

function showPatientMenu(event, patientId, patientCode, patientName, isCalled) {
    event.preventDefault();
    
    // Remover menú anterior si existe
    if (activePatientMenu) {
        activePatientMenu.remove();
    }
    
    // Crear menú contextual
    const menu = document.createElement('div');
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    
    menu.innerHTML = `
        <div class="context-menu-header">
            <strong>${patientCode}</strong> - ${patientName}
        </div>
        ${!isCalled ? `
            <div class="context-menu-item" onclick="callPatientFromMenu(${patientId}, '${patientCode}')">
                <i class="fas fa-bell"></i>
                Llamar Paciente
            </div>
        ` : `
            <div class="context-menu-item disabled">
                <i class="fas fa-check-circle"></i>
                Ya fue llamado
            </div>
        `}
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" onclick="deletePatientFromMenu(${patientId}, '${patientCode}', '${patientName.replace(/'/g, "\\'")}')">
            <i class="fas fa-trash"></i>
            Eliminar Paciente
        </div>
    `;
    
    document.body.appendChild(menu);
    activePatientMenu = menu;
    
    // Cerrar menú al hacer clic fuera
    setTimeout(() => {
        document.addEventListener('click', closeContextMenu);
    }, 10);
}

function closeContextMenu() {
    if (activePatientMenu) {
        activePatientMenu.remove();
        activePatientMenu = null;
    }
    document.removeEventListener('click', closeContextMenu);
}

async function callPatientFromMenu(patientId, patientCode) {
    closeContextMenu();
    
    try {
        const response = await fetch(`/reception/call-patient/${patientId}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage(`🔔 Paciente ${patientCode} llamado exitosamente`, 'success');
            loadPatients();
        } else {
            showFlashMessage(result.error || 'Error llamando paciente', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

async function deletePatientFromMenu(patientId, patientCode, patientName) {
    closeContextMenu();
    
    if (!confirm(`¿Eliminar al paciente?\n\nCódigo: ${patientCode}\nNombre: ${patientName}\n\nEsta acción NO se puede deshacer.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/reception/delete-patient/${patientId}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage(`Paciente ${patientCode} eliminado`, 'success');
            loadPatients();
        } else {
            showFlashMessage(result.error || 'Error eliminando paciente', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

// Eliminar paciente (botón directo)
async function deletePatient(patientId, patientCode, patientName) {
    if (!confirm(`¿Eliminar al paciente?\n\nCódigo: ${patientCode}\nNombre: ${patientName}\n\nEsta acción NO se puede deshacer.`)) {
        return;
    }

    try {
        const response = await fetch(`/reception/delete-patient/${patientId}`, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        if (!response.ok) {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const payload = await response.json();
                showFlashMessage(payload.error || 'Error eliminando paciente', 'danger');
            } else {
                showFlashMessage('Sesión expirada o redirección inesperada. Serás redirigido al login.', 'danger');
                setTimeout(() => { window.location.href = '/login'; }, 1000);
            }
            return;
        }

        const result = await response.json();
        if (result.success) {
            showFlashMessage(`Paciente ${patientCode} eliminado`, 'success');
            loadPatients();
        } else {
            showFlashMessage(result.error || 'Error eliminando paciente', 'danger');
        }
    } catch (error) {
        console.error('Error eliminando paciente:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

// ============================================================
// GESTIÓN DE MULTIMEDIA
// ============================================================

async function loadMultimedia() {
    try {
        const response = await fetch('/reception/multimedia/data');
        const media = await response.json();
        
        const grid = document.getElementById('multimediaGrid');
        
        if (media.length === 0) {
            grid.innerHTML = '<div class="loading">No hay archivos multimedia</div>';
        } else {
            grid.innerHTML = media.map(item => `
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">
                            <i class="fas fa-${item.type === 'image' ? 'image' : 'video'}"></i>
                            ${item.filename}
                        </div>
                        <span class="card-badge ${item.is_active ? 'badge-active' : 'badge-inactive'}">
                            ${item.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                    </div>
                    <div class="card-content">
                        <p><strong>Tipo:</strong> ${item.type === 'image' ? 'Imagen' : 'Video'}</p>
                        <p><strong>Subido:</strong> ${item.created_at}</p>
                    </div>
                    <div class="card-actions">
                        <button class="btn-secondary btn-danger" onclick="deleteMedia(${item.id}, '${item.filename}')">
                            Eliminar
                        </button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error cargando multimedia:', error);
        showFlashMessage('Error cargando multimedia', 'danger');
    }
}

async function uploadMedia(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    try {
        const response = await fetch('/reception/upload-media', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage('✅ Archivo subido exitosamente', 'success');
            hideModal('uploadMediaModal');
            form.reset();
            loadMultimedia();
        } else {
            showFlashMessage(result.error || 'Error subiendo archivo', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

async function deleteMedia(mediaId, filename) {
    if (!confirm(`¿Eliminar "${filename}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/reception/delete-media/${mediaId}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage('Archivo eliminado', 'success');
            loadMultimedia();
        } else {
            showFlashMessage(result.error || 'Error', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

// ============================================================
// UTILIDADES
// ============================================================

function showCreateDoctorModal() {
    showModal('createDoctorModal');
}

function showUploadMediaModal() {
    showModal('uploadMediaModal');
}

function refreshScreenPreview() {
    const iframe = document.getElementById('screenPreviewFrame');
    if (iframe) {
        iframe.src = iframe.src;
        showFlashMessage('Vista previa actualizada', 'success');
    }
}

function updateTimestamp() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const elem = document.getElementById('lastUpdate');
    if (elem) {
        elem.textContent = `Última actualización: ${timeStr}`;
    }
}

// ============================================================
// INICIALIZACIÓN Y AUTO-ACTUALIZACIÓN
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Módulo de Recepción iniciado');
    
    const tab = document.querySelector('.tab-content.active');
    
    if (tab) {
        if (tab.id === 'patients-tab') {
            loadPatients();
        } else if (tab.id === 'doctors-tab') {
            loadDoctors();
        } else if (tab.id === 'multimedia-tab') {
            loadMultimedia();
        }
    }
});

// Sobrescribir switchTab para cargar datos
const originalSwitchTab = window.switchTab;
window.switchTab = function(tabName) {
    originalSwitchTab(tabName);
    
    if (tabName === 'patients') {
        loadPatients();
    } else if (tabName === 'doctors') {
        loadDoctors();
    } else if (tabName === 'multimedia') {
        loadMultimedia();
    }
};

// Auto-refrescar pacientes cada 5 segundos
setInterval(() => {
    const patientsTab = document.getElementById('patients-tab');
    if (patientsTab && patientsTab.classList.contains('active')) {
        console.log('🔄 Auto-actualización de pacientes...');
        loadPatients();
    }
}, 5000);

console.log('✅ Reception.js ultra-robusto cargado correctamente');