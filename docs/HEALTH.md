# Salud del servicio y alertas de facturación

Si un servicio externo se queda sin crédito o falla, Itay recibe un email
ANTES de que los clientes lo noten. Motivación: en julio 2026 los créditos de
Anthropic se agotaron y la curación con IA estuvo días caída sin que nadie lo
supiera.

## Qué vigila

| Servicio | Detección al fallar | Chequeo diario (~08:15 servidor) |
|---|---|---|
| Anthropic | error de crédito/cuota en cada llamada de curación (`lib/ai/curate.ts`) | ping de 1 token |
| AWS Rekognition | error de facturación/credenciales en cada análisis | DetectFaces con imagen mínima (~$0.001) |
| Stripe | fallo del webhook al desbloquear (500 → Stripe reintenta) y fallo al crear checkout | `balance.retrieve()` |
| Resend | — | uso del mes vs 3.000 gratis (aviso al 80%) |
| Disco (Railway) | — | % del volumen: aviso ≥70%, crítico ≥90% |
| Backup nocturno | catch en `scheduleNightlyBackup` | frescura de `last-backup.json` (>26 h = crítico); sin destino configurado = aviso diario |
| Render de películas | fallo definitivo tras el reintento → email con evento + error | — |

## Cómo avisa

- **CRÍTICO** → email inmediato a `ALERT_EMAIL` (asunto `🔴 OneMoment: [servicio] necesita atención`, botón a la página de facturación). Antirrebote: el mismo incidente no repite email en 6 h.
- **AVISO** → un solo digest diario (`🟡`), sólo si hay algo que avisar. Máx. 1 cada 20 h.
- **Día 1 del mes** → resumen de gastos (`💰`): Anthropic (tokens medidos × precio), Rekognition (imágenes × $0.001), Resend (cuota), ingresos Stripe del mes, links a los dashboards para las cifras exactas. Lo dispara el primer chequeo diario tras el cambio de mes.
- **Respaldo:** si Resend no puede enviar, el incidente queda registrado (`Incident.emailedAt = null`), sale un `console.error` CRÍTICO en los logs, y el panel `/panel` muestra un banner rojo — sólo a la cuenta de `ALERT_EMAIL`.

## Operación

```bash
# Snapshot (incidentes + uso del mes)
curl -H "x-admin-key: $ADMIN_KEY" https://<app>/api/admin/health

# Chequeo diario ahora
curl -X POST -H "x-admin-key: $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"action":"check"}' https://<app>/api/admin/health

# Resumen mensual ahora (force reenvía aunque ya se haya mandado)
curl -X POST ... -d '{"action":"summary","month":"2026-07","force":true}'

# Simulacros (recorren el MISMO camino de código que el fallo real)
curl -X POST ... -d '{"action":"simulate","scenario":"anthropic_quota"}'
curl -X POST ... -d '{"action":"simulate","scenario":"backup_failed"}'
curl -X POST ... -d '{"action":"simulate","scenario":"disk_75"}'
```

Env requerida: `ALERT_EMAIL` (destinatario). Sin ella el sistema registra
incidentes y loguea, pero no envía emails. El chequeo diario sólo se programa
con `NODE_ENV=production` (en dev avisaría del disco del portátil).

Piezas: `lib/alerts.ts` (motor + hooks), `lib/health.ts` (chequeos + digest +
resumen mensual), `lib/usage.ts` (contadores), modelos `Incident`/`UsageStat`.
