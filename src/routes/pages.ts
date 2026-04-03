import type { FastifyInstance, FastifyReply } from 'fastify';
import type { LandingSummary } from '../types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatSpanishDate(date: string): string {
  const parts = date.split('-');
  if (parts.length !== 3) {
    return date;
  }

  const [yearPart, monthPart, dayPart] = parts;
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return date;
  }

  const formatter = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  return formatter.format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function renderHolidayPulse(summary: LandingSummary): string {
  if (summary.today.is_holiday && summary.today.holiday && summary.next_holiday) {
    return `
      <p class="pulse-kicker">Panorama de hoy</p>
      <h2>Hoy es feriado por ${escapeHtml(summary.today.holiday.name)}</h2>
      <p>El próximo feriado es ${escapeHtml(formatSpanishDate(summary.next_holiday.date))} por ${escapeHtml(summary.next_holiday.name)}.</p>
    `;
  }

  if (summary.today.is_holiday && summary.today.holiday) {
    return `
      <p class="pulse-kicker">Panorama de hoy</p>
      <h2>Hoy es feriado por ${escapeHtml(summary.today.holiday.name)}</h2>
      <p>No hay otro feriado cargado después de hoy en el dataset actual.</p>
    `;
  }

  if (summary.next_holiday) {
    return `
      <p class="pulse-kicker">Próximo feriado</p>
      <h2>${escapeHtml(formatSpanishDate(summary.next_holiday.date))}</h2>
      <p>Corresponde a ${escapeHtml(summary.next_holiday.name)}.</p>
    `;
  }

  return `
    <p class="pulse-kicker">Próximo feriado</p>
    <h2>Sin feriados cargados</h2>
    <p>No hay datos disponibles para calcular el próximo feriado.</p>
  `;
}

function renderLandingPage(summary: LandingSummary): string {
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Feriados Perú API</title>
    <style>
      :root {
        --bg: #f3efe3;
        --panel: #fff9ef;
        --ink: #1a1c1d;
        --muted: #5c615d;
        --accent: #9d2b25;
        --line: #dccfb8;
      }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(157, 43, 37, 0.14), transparent 32%),
          linear-gradient(180deg, #f7f1e6 0%, var(--bg) 100%);
      }
      main {
        max-width: 920px;
        margin: 0 auto;
        padding: 48px 20px 72px;
      }
      .hero, .panel {
        background: rgba(255, 249, 239, 0.9);
        border: 1px solid var(--line);
        border-radius: 20px;
        box-shadow: 0 18px 50px rgba(58, 37, 22, 0.08);
      }
      .hero {
        padding: 32px;
        margin-bottom: 24px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(2.4rem, 7vw, 4.8rem);
        line-height: 0.95;
      }
      p {
        color: var(--muted);
        font-size: 1.05rem;
      }
      .links {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 20px;
      }
      .links a, button {
        border-radius: 999px;
        border: 1px solid var(--accent);
        background: var(--accent);
        color: white;
        padding: 12px 18px;
        text-decoration: none;
        cursor: pointer;
      }
      .links a.secondary {
        background: transparent;
        color: var(--accent);
      }
      .panel {
        padding: 24px;
      }
      .pulse {
        margin-bottom: 24px;
      }
      .pulse h2 {
        margin: 0 0 10px;
        font-size: clamp(1.7rem, 4vw, 2.5rem);
        line-height: 1.05;
      }
      .pulse-kicker {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.78rem;
        color: var(--accent);
        margin: 0 0 10px;
      }
      form {
        display: grid;
        gap: 12px;
      }
      input {
        padding: 14px 16px;
        border-radius: 12px;
        border: 1px solid var(--line);
        font: inherit;
      }
      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        background: #201917;
        color: #f5efe8;
        border-radius: 14px;
        padding: 16px;
        min-height: 84px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p>API publica de consulta</p>
        <h1>Feriados nacionales del Perú</h1>
        <p>Lee desde cache o base de datos, y se alimenta de snapshots auditables del sitio oficial del Estado peruano.</p>
        <div class="links">
          <a href="/docs">Docs</a>
          <a class="secondary" href="/status">Status</a>
          <a class="secondary" href="/v1/holidays">JSON</a>
        </div>
      </section>
      <section class="panel pulse">
        ${renderHolidayPulse(summary)}
      </section>
      <section class="panel">
        <h2>Validar fecha</h2>
        <form id="holiday-form">
          <input id="date" type="date" required />
          <button type="submit">Consultar</button>
        </form>
        <pre id="result">Esperando consulta...</pre>
      </section>
    </main>
    <script>
      const form = document.getElementById('holiday-form');
      const result = document.getElementById('result');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const date = document.getElementById('date').value;
        if (!date) {
          return;
        }
        result.textContent = 'Consultando...';
        const response = await fetch('/v1/holidays/is/' + date);
        const payload = await response.json();
        result.textContent = JSON.stringify(payload, null, 2);
      });
    </script>
  </body>
</html>`;
}

export default async function pageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (_request, reply: FastifyReply) => {
    const summary = await app.holidayService.getLandingSummary();
    reply.type('text/html').send(renderLandingPage(summary));
  });

  app.get('/status', {
    schema: {
      tags: ['status'],
      summary: 'Runtime status and current snapshot metadata',
      response: {
        200: {
          type: 'object',
          required: ['service', 'status', 'now', 'checks', 'snapshot', 'cache_strategy', 'docs_url'],
          properties: {
            service: { type: 'string' },
            status: { type: 'string', enum: ['ok', 'degraded'] },
            now: { type: 'string' },
            checks: {
              type: 'object',
              required: ['postgres', 'redis'],
              properties: {
                postgres: { type: 'string' },
                redis: { type: 'string' }
              }
            },
            snapshot: {
              type: 'object',
              required: ['snapshot_id', 'updated_at'],
              properties: {
                snapshot_id: { type: ['string', 'null'] },
                updated_at: { type: ['string', 'null'] },
                record_count: { type: 'integer' },
                source_url: { type: 'string' },
                parser_version: { type: 'string' }
              }
            },
            cache_strategy: { type: 'string', const: 'redis_then_postgres' },
            docs_url: { type: 'string' }
          }
        },
        403: {
          type: 'object',
          required: ['error', 'request_id'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'status_code'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                status_code: { type: 'integer' }
              }
            },
            request_id: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          required: ['error', 'request_id'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'status_code'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                status_code: { type: 'integer' }
              }
            },
            request_id: { type: 'string' }
          }
        }
      }
    },
    preHandler: async (request, reply) => {
      const access = app.opsAccess.ensureStatusAccess(request);
      if (!access.allowed) {
        const statusCode = access.statusCode === 404 ? 404 : 403;

        return reply.code(statusCode).send({
          error: {
            code: statusCode === 404 ? 'NOT_FOUND' : 'FORBIDDEN',
            message: statusCode === 404 ? 'Not Found' : 'Forbidden',
            status_code: statusCode
          },
          request_id: request.id
        });
      }
    }
  }, async () => app.holidayService.getStatusSummary());

  app.get('/openapi.json', {
    schema: {
      tags: ['docs'],
      summary: 'OpenAPI specification enriched with current snapshot metadata'
    }
  }, async () => {
    const spec = app.swagger();
    const summary = await app.holidayService.getStatusSummary();

    return {
      ...spec,
      info: {
        ...spec.info,
        description: 'API publica de feriados nacionales del Perú. Incluye metadata operativa y del snapshot actual.'
      },
      'x-runtime-status': {
        checks: summary.checks,
        snapshot: summary.snapshot,
        cache_strategy: summary.cache_strategy
      }
    };
  });
}
