# ─────────────────────────────────────────
# Dockerfile — Turnero Médico
# Flask + Flask-SocketIO + PostgreSQL
# ─────────────────────────────────────────

FROM python:3.11-slim

# Variables de entorno base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_ENV=production \
    PORT=5000

# Dependencias del sistema necesarias para psycopg2 y cryptography
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Directorio de trabajo
WORKDIR /app

# Copiar e instalar dependencias Python primero (cache de capas)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el resto del proyecto
COPY . .

# Puerto expuesto
EXPOSE 5000

# Comando de arranque con gunicorn + eventlet para SocketIO
# --worker-class eventlet es CRÍTICO para Flask-SocketIO
# ── Notas sobre los flags ─────────────────────────────────
# --timeout 0          → desactiva timeout (eventlet lo maneja internamente)
# --graceful-timeout 30 → da 30s al worker para terminar antes de matar
# --keep-alive 65       → mayor que el timeout del load balancer de Render (60s)
# --worker-connections 100 → conexiones simultáneas por worker
# ─────────────────────────────────────────────────────────
CMD ["gunicorn", \
     "--worker-class", "eventlet", \
     "--workers", "1", \
     "--worker-connections", "100", \
     "--bind", "0.0.0.0:5000", \
     "--timeout", "0", \
     "--graceful-timeout", "30", \
     "--keep-alive", "65", \
     "--log-level", "info", \
     "app:app"]