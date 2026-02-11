# Variables de Entorno - Turnero Médico

## Variables Obligatorias

### 1. **RENDER** (Render Cloud Only)
- **Descripción**: Indicador para ejecutar en modo producción con Postgres.
- **Valor**: `1`
- **Uso**: Detecta en `config/database.py` para usar `DATABASE_URL` (PostgreSQL) en lugar de SQLite.
- **Ejemplo**:
  ```
  RENDER=1
  ```

### 2. **DATABASE_URL** (Render Cloud)
- **Descripción**: URL de conexión a la base de datos PostgreSQL.
- **Formato**: `postgresql://usuario:contraseña@host:puerto/nombre_base_datos`
- **Ejemplo**:
  ```
  DATABASE_URL=postgresql://turnero_user:abc123xyz@dpg-abc123.render.com:5432/turnero_db
  ```
- **Dónde obtenerlo en Render**: 
  - Crea un servicio PostgreSQL desde Render.
  - La URL está en el tab "Connections".
- **Nota**: La URL comienza con `postgres://`. Si es así, el código la convierte automáticamente a `postgresql://` para SQLAlchemy.

### 3. **SECRET_KEY** (Seguridad)
- **Descripción**: Clave secreta para firmar sesiones y tokens de Flask.
- **Requerido**: Sí (aunque Flask genera uno por defecto en desarrollo, **DEBE ser fuerte en producción**).
- **Longitud recomendada**: 32+ caracteres (azarosos).
- **Generador rápido**:
  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(32))"
  ```
- **Ejemplo**:
  ```
  SECRET_KEY=F7kP9mX2qL5wN8jR3tV6yB1zD4sE0hIaJc
  ```

---

## Variables Opcionales

### Correo Electrónico (EMAIL)

Estos variables se usan en `app.py` y `utils/email_sender.py` para enviar correos de recuperación de contraseña y bienvenida.

#### **MAIL_SERVER**
- **Descripción**: Servidor SMTP para envío de correos.
- **Valor por defecto**: `smtp.gmail.com`
- **Otros valores comunes**: 
  - `smtp.office365.com` (Outlook)
  - `smtp.sendgrid.net` (SendGrid)
  - Tu servidor SMTP personalizado

#### **MAIL_PORT**
- **Descripción**: Puerto del servidor SMTP.
- **Valor por defecto**: `587`
- **Otros valores**: 
  - `465` (SSL, para Gmail)
  - `25` (estándar, rara vez usado)

#### **MAIL_USE_TLS**
- **Descripción**: Usar cifrado TLS en la conexión SMTP.
- **Valor por defecto**: `True`
- **Valores válidos**: `True` o `False`

#### **MAIL_USERNAME**
- **Descripción**: Correo electrónico del remitente.
- **Ejemplo** (Gmail):
  ```
  MAIL_USERNAME=tu-correo@gmail.com
  ```
- **Para Gmail con 2FA**: Usa **contraseña de aplicación**, no tu contraseña de cuenta.

#### **MAIL_PASSWORD**
- **Descripción**: Contraseña o token del correo.
- **IMPORTANTE**: 
  - Para Gmail: usa **[Contraseña de aplicación](https://myaccount.google.com/apppasswords)** (no la contraseña de tu cuenta).
  - Para Office 365: usa tu contraseña normal o una **contraseña de aplicación**.
  - Stores seguros: Nunca guardes esto en el repo — siempre en Render → Environment.
- **Ejemplo** (Gmail con app password de tu cuenta):
  ```
  MAIL_PASSWORD=uvadtlstdtrnqhjx
  ```

**Ejemplo completo (Gmail)**:
```
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=True
MAIL_USERNAME=tu-correo@gmail.com
MAIL_PASSWORD=tu-contraseña-de-aplicación
```

---

### Opcional: FLASK_ENV
- **Descripción**: Modo de ejecución (desarrollo vs. producción).
- **Valores**:
  - `development` (default en local) → Debug activado, reloader automático.
  - `production` (default en Render) → Debug desactivado, sin reloader.
- **Ejemplo**:
  ```
  FLASK_ENV=production
  ```

### Opcional: DEBUG
- **Descripción**: Activar/desactivar el debugger de Flask.
- **Valores**: `True` o `False`
- **Nota**: En Render, si no está definido, se infiere de `FLASK_ENV`.

### Opcional: PORT
- **Descripción**: Puerto en el que escucha la app.
- **Valor por defecto**: `5000` (local) o asignado por Render.
- **En Render**: Render ignora este valor e inyecta `$PORT` automáticamente en el `Procfile`.

---

## Resumen para Render

### Mínimo para funcionar:
```
RENDER=1
DATABASE_URL=postgresql://turnero_user:password@host:5432/turnero_db
SECRET_KEY=F7kP9mX2qL5wN8jR3tV6yB1zD4sE0hIaJc
```

### Completo (con correo):
```
RENDER=1
DATABASE_URL=postgresql://turnero_user:password@host:5432/turnero_db
SECRET_KEY=F7kP9mX2qL5wN8jR3tV6yB1zD4sE0hIaJc
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=True
MAIL_USERNAME=diazguaje@gmail.com
MAIL_PASSWORD=uvadtlstdtrnqhjx
```

---

## Dónde configurar en Render

1. Ve a tu servicio **Web Service** en Render.
2. Tab: **Environment**.
3. Haz clic en **+ Add Environment Variable**.
4. Completa `KEY` y `VALUE` para cada variable.
5. Haz clic en **Save, rebuild, and deploy**.

---

## Archivos relevantes en el código

| Archivo | Usa | Variables |
|---------|-----|-----------|
| `app.py` | Flask config | `SECRET_KEY`, `MAIL_*`, `PORT` |
| `config/database.py` | Conexión DB | `RENDER`, `DATABASE_URL` |
| `utils/email_sender.py` | Correos | `MAIL_*` (indirecto vía `app.config`) |
| `routes/auth.py` | Reset de contraseña | `MAIL_*` (indirecto) |

---

## Notas de seguridad

- ✅ **NUNCA** guardes `SECRET_KEY`, `MAIL_PASSWORD`, o `DATABASE_URL` en el repositorio.
- ✅ Usa `.env` **localmente** (está en `.gitignore`).
- ✅ En Render, guarda todas las secretas en **Environment Variables**, no en código.
- ✅ Cambia el admin por defecto (`admin@turnero.com`) tan pronto como despliegues.

---

## Solución de problemas

### "Error conectando a la base de datos"
- Verifica que `DATABASE_URL` esté correcto.
- Confirma que `RENDER=1` está seteado.
- Comprueba en Render Logs si hay errores de conexión.

### "Error enviando correos"
- Verifica credenciales SMTP (`MAIL_USERNAME`, `MAIL_PASSWORD`).
- Si usas Gmail con 2FA, confirma que usaste **contraseña de aplicación**.
- Comprueba en Render Logs si hay errores de SMTP.
- Ejecuta en Render Shell: `python scripts/check_mail_config.py` para diagnosticar.

**Pasos para configurar Gmail en Render:**
1. Ve a [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Si no ves esa opción, activa **2-Step Verification** primero.
3. Selecciona `Mail` y `Windows Computer` (aplica a cualquier dispositivo).
4. Google generará una contraseña de 16 caracteres → **cópiala**.
5. En Render → Environment Variables:
   - `MAIL_SERVER` = `smtp.gmail.com`
   - `MAIL_PORT` = `587`
   - `MAIL_USE_TLS` = `True`
   - `MAIL_USERNAME` = `tu-correo@gmail.com`
   - `MAIL_PASSWORD` = `[los 16 caracteres generados]` (sin espacios)
6. Haz clic en "Save, rebuild, and deploy".
7. Espera a que Render redeploy la app.
8. Prueba la recuperación de contraseña.

### "Sesión no persiste / Login no funciona"
- Verifica que `SECRET_KEY` esté seteado (e igual en todas las instancias si usas múltiples dynos).

---

## Checklist para despliegue

- [ ] `RENDER=1` configurado.
- [ ] `DATABASE_URL` apunta a Postgres en Render.
- [ ] `SECRET_KEY` es una cadena fuerte y única.
- [ ] `MAIL_*` variables configuradas (si necesitas correos).
- [ ] `.env` **NO** está en Git (confirmar `.gitignore`).
- [ ] Cambiar contraseña del admin por defecto tras primer login.
