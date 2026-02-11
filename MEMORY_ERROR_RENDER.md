# Error de Memoria en Render - Solución

## El Problema
```
[ERROR] Worker (pid:61) was sent SIGKILL! Perhaps out of memory?
```

Significa que Render **mató el proceso** porque se quedó sin memoria RAM.

---

## La Causa
Tu `Procfile` estaba configurado con **2 workers de gunicorn**:
```
web: gunicorn app:app --bind 0.0.0.0:$PORT --workers 2
```

Cada worker de gunicorn consume ~150-200MB de RAM. Con 2 workers en el plan gratuito de Render (512MB), rápidamente se agota la memoria.

---

## La Solución (YA APLICADA)
Cambié `Procfile` a optimizado para bajo consumo de memoria:
```
web: gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --worker-class sync --max-requests 1000 --timeout 30
```

**Qué cambió:**
- `--workers 1` → Solo 1 worker (ahorra ~150MB)
- `--worker-class sync` → Usa modelo síncrono (más eficiente para aplicaciones pequeñas)
- `--max-requests 1000` → Reinicia el worker cada 1000 requests (limpia memoria)
- `--timeout 30` → Timeout de 30 segundos (evita hung workers)

---

## Próximos Pasos

1. **Haz git commit y push:**
   ```bash
   git add Procfile
   git commit -m "Optimizar Procfile para bajo consumo de memoria"
   git push origin main
   ```

2. **En Render**, haz "Manual Deploy" o espera a que detecte el cambio

3. **Prueba again:**
   - Forgot-password debería funcionar ahora
   - Revisa los nuevos logs

---

## Si sigue dando el error

Puede haber otras causas de consumo excesivo de memoria:

### Opción 1: Revisar si hay imports pesados
En `app.py`, algunos imports pueden cargar librerías grandes.

### Opción 2: Revisar si creaste un loop infinito
Si hay código que carga datos infinitamente o sin límite, también consume memoria.

### Opción 3: Aumentar plan en Render
Si nada funciona, puedes:
- Cambiar a plan de pago (más RAM disponible)
- O cambiar `--workers 0` y usar `gunicorn app:app --bind 0.0.0.0:$PORT` (mínimo absoluto)

---

## Monitoreo

Para ver cuánta memoria usa tu app en Render:
1. Ve a tu service
2. Tab: **Metrics**
3. Observa Memory usage

Si sigue subiendo constantemente, es un leak de memoria en tu código.

---

¿Ya hiciste git push del Procfile actualizado? Una vez hecho, Render redeploy automáticamente y debería funcionar el forgot-password.
