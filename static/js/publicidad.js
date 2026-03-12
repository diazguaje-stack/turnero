
'use strict';

const Publicidad = (() => {

    /* ── Estado ──────────────────────────────────────────── */
    let _archivos = [];    // lista completa desde servidor
    let _activoId = null;  // id del archivo visible en pantallas
    let _socket   = null;
    let _subiendo = false;

    /* ── Helpers ─────────────────────────────────────────── */
    const $ = (id) => document.getElementById(id);

    function _token() {
        return sessionStorage.getItem('jwt_token')
            || localStorage.getItem('jwt_token_admin')
            || localStorage.getItem('jwt_token_recepcion')
            || localStorage.getItem('jwt_token_registro')
            || localStorage.getItem('authToken')
            || sessionStorage.getItem('authToken')
            || '';
    }
    function _fmtSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024)    return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    }

    function _msg(txt, cls = '') {
        const el = $('pub-upload-msg');
        if (!el) return;
        el.textContent = txt;
        el.className   = `pub-upload-msg ${cls}`;
    }

    function _progreso(pct) {
        const bar = $('pub-progress-fill');
        if (bar) bar.style.width = `${pct}%`;
    }

    /* ── Init ────────────────────────────────────────────── */
    function init(socketInstance) {
        _socket = socketInstance;
        _bindDropzone();
        _bindFileInput();
        cargarArchivos();

        if (_socket) {
            _socket.on('publicidad_cambiada', (data) => {
                _activoId = data.activo ? (data.archivo_id || null) : null;
                _renderLista();
            });
        }
    }
    /* ── Cargar lista del servidor ───────────────────────── */
    async function cargarArchivos() {
        _renderCargando();
        try {
            const res  = await fetch('/api/publicidad/archivos', {
                headers: { Authorization: `Bearer ${_token()}` }
            });
            const data = await res.json();
            if (data.success) {
                _archivos  = data.archivos  || [];
                _activoId  = data.activo_id || null;
                _renderLista();
            } else {
                _renderError(data.message);
            }
        } catch (e) {
            _renderError('Error de conexión');
        }
    }

    /* ── Subir archivo ───────────────────────────────────── */
    async function subirArchivo(file) {
        if (_subiendo) return;
        if (!_validar(file)) return;

        _subiendo = true;
        _msg('Subiendo…', 'uploading');
        _progreso(0);

        const fd  = new FormData();
        fd.append('archivo', file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/publicidad/subir');
        xhr.setRequestHeader('Authorization', `Bearer ${_token()}`);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable)
                _progreso(Math.round(e.loaded / e.total * 100));
        };

        xhr.onload = () => {
            _subiendo = false;
            try {
                const data = JSON.parse(xhr.responseText);
                if (data.success) {
                    _msg('✓ Archivo subido correctamente', 'ok');
                    _progreso(100);
                    setTimeout(() => { _msg(''); _progreso(0); }, 2500);
                    cargarArchivos();
                } else {
                    _msg(`✗ ${data.message}`, 'error');
                    _progreso(0);
                }
            } catch (e) {
                _msg('✗ Error al procesar respuesta', 'error');
            }
        };

        xhr.onerror = () => {
            _subiendo = false;
            _msg('✗ Error de red al subir', 'error');
            _progreso(0);
        };

        xhr.send(fd);
    }

    /* ── Activar archivo en pantallas ────────────────────── */
    async function activar(id) {
        try {
            const res  = await fetch(`/api/publicidad/activar/${id}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${_token()}` }
            });
            const data = await res.json();
            if (data.success) {
                _activoId = id;
                _renderLista();
                showToast('Publicidad activada en pantallas', 'success');
            } else {
                showToast(data.message || 'Error al activar', 'error');
            }
        } catch (e) {
            showToast('Error de conexión', 'error');
        }
    }

    /* ── Desactivar publicidad ───────────────────────────── */
    async function desactivar() {
        try {
            const res  = await fetch('/api/publicidad/desactivar', {
                method: 'POST',
                headers: { Authorization: `Bearer ${_token()}` }
            });
            const data = await res.json();
            if (data.success) {
                _activoId = null;
                _renderLista();
                showToast('Publicidad desactivada', 'success');
            } else {
                showToast(data.message || 'Error al desactivar', 'error');
            }
        } catch (e) {
            showToast('Error de conexión', 'error');
        }
    }

    /* ── Eliminar archivo ────────────────────────────────── */
    async function eliminar(id) {
        if (!confirm('¿Eliminar este archivo?\nEsta acción no se puede deshacer.')) return;
        try {
            const res  = await fetch(`/api/publicidad/eliminar/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${_token()}` }
            });
            const data = await res.json();
            if (data.success) {
                if (_activoId === id) _activoId = null;
                showToast('Archivo eliminado', 'success');
                cargarArchivos();
            } else {
                showToast(data.message || 'Error al eliminar', 'error');
            }
        } catch (e) {
            showToast('Error de conexión', 'error');
        }
    }

    /* ── Render: lista de archivos ───────────────────────── */
    function _renderLista() {
        const lista = $('pub-lista');
        const count = $('pub-count');
        if (!lista) return;
        if (count) count.textContent = _archivos.length;

        if (_archivos.length === 0) {
            lista.innerHTML = `<div class="pub-empty">
                <p>No hay archivos todavía.<br>Sube una imagen o video para comenzar.</p>
            </div>`;
            return;
        }

        lista.innerHTML = _archivos.map(a => {
            const esActivo = a.id === _activoId;
            const esVideo  = a.tipo === 'video';

            const thumb = esVideo
                ? `<div class="pub-thumb-video">🎬</div>`
                : `<img src="${a.url}" alt="" onerror="this.style.display='none'">`;

            const boton = esActivo
                ? `<button class="pub-btn-stop-item" onclick="Publicidad.desactivar()">
                       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                           <rect x="6" y="4" width="4" height="16"></rect>
                           <rect x="14" y="4" width="4" height="16"></rect>
                       </svg>Detener</button>`
                : `<button class="pub-btn-show" onclick="Publicidad.activar('${a.id}')">
                       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                           <polygon points="5 3 19 12 5 21 5 3"></polygon>
                       </svg>Mostrar</button>`;

            return `
            <div class="pub-item ${esActivo ? 'activo' : ''}">
                <div class="pub-thumb">
                    ${thumb}
                    ${esActivo ? '<div class="pub-thumb-badge">EN PANTALLA</div>' : ''}
                </div>
                <div class="pub-item-info">
                    <div class="pub-item-name" title="${a.nombre}">${a.nombre}</div>
                    <div class="pub-item-meta">
                        <span class="pub-badge ${a.tipo}">${esVideo ? '🎬 Video' : '🖼 Imagen'}</span>
                        <span class="pub-item-size">${_fmtSize(a.tamaño)}</span>
                    </div>
                </div>
                <div class="pub-item-actions">
                    ${boton}
                    <button class="pub-btn-del"
                            onclick="Publicidad.eliminar('${a.id}')"
                            title="Eliminar archivo">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>`;
        }).join('');
    }


    /* ── Estados de la lista ─────────────────────────────── */
    function _renderCargando() {
        const lista = $('pub-lista');
        if (lista) lista.innerHTML = `
            <div class="pub-loading">
                <div class="pub-spinner"></div>
                <p>Cargando archivos…</p>
            </div>`;
    }
    function _renderError(msg) {
        const lista = $('pub-lista');
        if (lista) lista.innerHTML = `<div class="pub-empty"><p>⚠️ ${msg}</p></div>`;
    }

    /* ── Dropzone (drag & drop + clic) ──────────────────── */
    function _bindDropzone() {
        const zone  = $('pub-dropzone');
        const input = $('pub-file-input');
        if (!zone || !input) return;

        zone.addEventListener('dragenter', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', ()  => zone.classList.remove('dragover'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const f = e.dataTransfer?.files?.[0];
            if (f) subirArchivo(f);
        });
        // ← SIN listener de click, el <label for> lo maneja nativamente
    }

    function _bindFileInput() {
        const input = document.getElementById('pub-file-input');
        if (!input) {
            console.warn('[Publicidad] pub-file-input no encontrado');
            return;
        }

        input.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) subirArchivo(file);
            input.value = '';
        });

        console.log('[Publicidad] _bindFileInput OK');
    }
    /* ── Validación ──────────────────────────────────────── */
    const TIPOS_OK  = ['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm'];
    const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

    function _validar(file) {
        if (!TIPOS_OK.includes(file.type)) {
            _msg('✗ Tipo no permitido. Usa JPG, PNG, GIF, WEBP, MP4 o WEBM.', 'error');
            return false;
        }
        if (file.size > MAX_BYTES) {
            _msg('✗ El archivo supera el límite de 100 MB.', 'error');
            return false;
        }
        return true;
    }

    /* ── API pública ─────────────────────────────────────── */
    return { init, cargarArchivos, activar, desactivar, eliminar };

})();

// Exponer en window para los onclick del HTML
window.Publicidad = Publicidad;