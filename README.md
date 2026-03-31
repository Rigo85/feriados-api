# feriados-api

Servicio Fastify público para consultar feriados nacionales del Perú usando Redis como caché y PostgreSQL como respaldo.

## Que expone

- API REST versionada
- landing con validador de fecha
- docs Swagger en `/docs`
- OpenAPI en `/openapi.json`
- endpoints de salud y estado operativo

## Endpoints principales

- `GET /v1/holidays`
- `GET /v1/holidays/:year`
- `GET /v1/holidays/is/:date`
- `GET /v1/meta`
- `GET /healthz`
- `GET /readyz`
- `GET /status`
- `GET /metrics`

## Estrategia de lectura

- intenta leer desde Redis
- si Redis falla o no tiene la clave, cae a PostgreSQL
- la respuesta deja rastro del origen en `meta.source`
- el dataset activo refleja el anio disponible en el snapshot vigente de `gob.pe`

## Características operativas

- `x-request-id` en cada respuesta
- errores JSON con `request_id`
- `@fastify/helmet`
- `@fastify/rate-limit`
- logging con Pino y redaction de headers sensibles
- `/metrics` con contadores de requests, errores, caché y latencia por ruta
- traza de consultas en PostgreSQL con IP, `user-agent`, headers de navegador y timestamp
- validacion estricta de fechas para evitar `YYYY-MM-DD` invalidos semanticos
- `/status` y `/metrics` pueden protegerse con token o allowlist de IP en produccion

## Variables de entorno

Tomadas de [`.env.example`](/media/work/OneDrive/Personal-Git/feriados-api/feriados-api/.env.example):

- `PORT`
- `HOST`
- `LOG_LEVEL`
- `DATABASE_URL`
- `REDIS_URL`
- `RATE_LIMIT_MAX`
- `RATE_LIMIT_WINDOW`
- `TRUST_PROXY`
- `QUERY_TRACE_ENABLED`
- `REAL_IP_HEADER_ORDER`
- `STATUS_ENABLED`
- `METRICS_ENABLED`
- `OPS_ACCESS_TOKEN`
- `OPS_IP_ALLOWLIST`
- `CORS_ENABLED`
- `CORS_ORIGINS`
- `CORS_METHODS`
- `CORS_HEADERS`
- `CORS_CREDENTIALS`
- `CORS_MAX_AGE_SECONDS`

## Comandos útiles

```bash
npm run build
npm test
npm start
```

Con `pm2`:

```bash
pm2 startOrReload ecosystem.config.cjs --update-env
```

## Ejemplo de respuesta

```json
{
  "data": {
    "date": "2026-07-28",
    "is_holiday": true,
    "holiday": {
      "name": "Fiestas Patrias",
      "scope": "national"
    }
  },
  "meta": {
    "source": "redis",
    "snapshot_id": "1",
    "updated_at": "2026-03-31T15:00:00.000Z"
  }
}
```

## Testing

- unitarios del servicio de consulta
- integración con `fastify.inject()`
- smoke tests contra PG y Redis reales

## Estado actual

Servicio operativo, con contrato OpenAPI y fallback Redis -> PostgreSQL ya validados.

Nota de modelo actual:

- el snapshot activo representa el anio vigente publicado por `gob.pe`
- no existe historico multi-anio servido por el API en esta version
