// Doctor Dashboard JS

async function loadDoctorPatients() {
    try {
        const response = await fetch('/doctor/patients/data');
        const patients = await response.json();
        
        const list = document.getElementById('doctorPatients');
        
        if (patients.length === 0) {
            list.innerHTML = '<div class="loading">No hay pacientes en espera</div>';
        } else {
            list.innerHTML = patients.map(patient => `
                <div class="card">
                    <div class="card-header">
                        <div>
                            <div class="card-title">${patient.name}</div>
                            <div style="color: #6b7280; font-size: 13px;">Código: ${patient.code}</div>
                        </div>
                        <span class="card-badge badge-active">Tipo ${patient.type}</span>
                    </div>
                    <div class="card-content">
                        <p><strong>Hora de llegada:</strong> ${patient.created_at}</p>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error cargando pacientes:', error);
    }
}

async function updateDoctorStatus(newStatus) {
    const formData = new FormData();
    formData.append('status', newStatus);
    
    try {
        const response = await fetch('/doctor/update-status', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showFlashMessage(`Estado actualizado a: ${newStatus}`, 'success');
        } else {
            showFlashMessage(result.error || 'Error actualizando estado', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showFlashMessage('Error de conexión', 'danger');
    }
}

async function loadCurrentStatus() {
    try {
        const response = await fetch('/doctor/status');
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('doctorStatus').value = result.status;
        }
    } catch (error) {
        console.error('Error cargando estado:', error);
    }
}

// Cargar datos al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('doctorPatients')) {
        loadCurrentStatus();
        loadDoctorPatients();
        setInterval(loadDoctorPatients, 5000); // Actualizar cada 5 segundos
    }
});
