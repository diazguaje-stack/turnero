# Solución: Error "Ocurrió un error" al Enviar Correos en Render

## Problema
Cuando intenta usar "Forgot Password" en Render, aparece el mensaje:
```
Hubo un error al enviar el correo. Por favor intenta nuevamente.
```

## Causa Probable
Las variables de entorno `MAIL_USERNAME` y `MAIL_PASSWORD` **no están configuradas** en Render.

---

## Solución Paso a Paso

### 1. Generar Contraseña de Aplicación en Gmail

Esta contraseña es diferente a tu contraseña normal de Gmail y es obligatoria si tienes 2-Step Verification activado.

**Si NO tienes 2-Step Verification:**
- Abre https://myaccount.google.com/apppasswords
- Si te pide activarlo, haz clic en "Get started"
- Sigue los pasos para activar 2FA

**Una vez tengas 2FA activado:**
1. Ve a https://myaccount.google.com/apppasswords
2. En el dropdown "Select the app", elige **Mail**
3. En el dropdown "Select the device", elige **Windows Computer** (aplica a cualquier dispositivo)
4. Haz clic en "Generate"
5. Google generará una contraseña de **16 caracteres** → **cópiala sin espacios**

**Ejemplo:**
```
worm jebh fheu kjwe  
copiado como: wormjebhfheukjwe (sin espacios)
```

---

### 2. Agregar Variables en Render

1. Abre tu aplicación en [render.com](https://render.com)
2. Ve al servicio **Web Service** de turnero-medico
3. Haz clic en la pestaña **Environment**
4. Haz clic en **+ Add Environment Variable**

Agrega estas 5 variables:

| Clave | Valor |
|-------|-------|
| `MAIL_SERVER` | `smtp.gmail.com` |
| `MAIL_PORT` | `587` |
| `MAIL_USE_TLS` | `True` |
| `MAIL_USERNAME` | `tu-correo@gmail.com` |
| `MAIL_PASSWORD` | `los-16-caracteres-generados` |

**Ejemplo completo:**
```
MAIL_SERVER = smtp.gmail.com
MAIL_PORT = 587
MAIL_USE_TLS = True
MAIL_USERNAME = diazguaje@gmail.com
MAIL_PASSWORD = wormjebhfheukjwe
```

5. Haz clic en **Save, rebuild, and deploy**
6. Espera a que la app redeploy (verás el estado en el panel)

---

### 3. Verificar Configuración

**Opción A: Render Shell (más preciso)**

1. En Render, ve a tu Web Service
2. Abre la pestaña **Shell**
3. Ejecuta:
   ```bash
   python scripts/check_mail_config.py
   ```
4. Observa el resultado:
   - ✅ Si dice "Conexión SMTP exitosa", está configurado correctamente
   - ❌ Si dice "Error de autenticación", verifica la contraseña
   - ❌ Si dice "Variables no configuradas", vuelve al paso 2

**Opción B: Navegador (desde la UI)**

1. Inicia sesión en Render con el admin (admin@turnero.com)
2. Ve a Panel Administración
3. Si existe una sección "Diagnóstico", búscalo (o pide al equipo que lo agregue)

---

### 4. Probar Envío de Correo

1. Descarga la sesión del admin
2. Abre http://tu-app-render.com/forgot-password
3. Ingresa el correo del admin (ej: admin@turnero.com)
4. Selecciona "Modo Normal" (no modo de prueba)
5. Haz clic en "Enviar"
6. Si ves "✅ Si el correo existe en nuestro sistema, recibirás un enlace", mira tu bandeja
7. Si recibiste el correo, ¡funciona! 🎉

---

## Notas Importantes

⚠️ **1. Contraseña de Aplicación vs Contraseña de Cuenta**
- **Contraseña de aplicación**: 16 caracteres generados por Google (para MAIL_PASSWORD)
- **Contraseña de cuenta**: tu contraseña de login de Gmail (NO uses esto aquí)

⚠️ **2. Los espacios en MAIL_PASSWORD**
- Si la contraseña es `worm jebh fheu kjwe`, cópiala **sin espacios**: `wormjebhfheukjwe`

⚠️ **3. Gmail puede rechazar IPs nuevas**
- Si ves "Inicio de sesión bloqueado", abre https://myaccount.google.com/device-activity
- Busca la actividad de Render y autorízala

⚠️ **4. SIEMPRE usa TLS**
- `MAIL_USE_TLS = True` es obligatorio para Gmail en puerto 587

---

## Troubleshooting

### "Contraseña o usuario incorrectos"
- Verifica que `MAIL_USERNAME` sea tu correo Gmail completo
- Verifica que `MAIL_PASSWORD` sea la contraseña de **aplicación** (16 caracteres), no tu contraseña de cuenta

### "Error de conexión"
- Verifica que `MAIL_SERVER = smtp.gmail.com` y `MAIL_PORT = 587`
- Verifica que `MAIL_USE_TLS = True`

### No recibo correo pero sin error
- Revisa tu carpeta de SPAM
- Crea un filtro en Gmail para que los correos de tu app no vayan a SPAM

### "Conexión rechazada en puerto 587"
- Algunas redes corporativas bloquean SMTP
- Intenta puerto 465 (SSL): cambiar `MAIL_PORT = 465` y `MAIL_USE_TLS = False`
  (Aunque esto no es recomendado, es alternativa en caso de bloqueo de puerto)

---

## Archivos Relevantes

- **Diagnóstico**: `scripts/check_mail_config.py`
- **Configuración**: `app.py` (líneas 24-34)
- **Envío de correos**: `utils/email_sender.py`
- **Rutas**: `routes/auth.py` (forgot_password)
- **Variables de entorno**: `ENV_VARIABLES.md`

---

¿Preguntas o necesitas ayuda? Contacta al equipo de desarrollo.
