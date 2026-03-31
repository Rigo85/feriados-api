import type { FastifyRequest } from 'fastify';

import type { QueryTraceRecord } from '../types';

const TRACEABLE_ROUTE_PATTERNS = new Set([
  '/v1/holidays',
  '/v1/holidays/:year',
  '/v1/holidays/is/:date',
  '/v1/meta'
]);

const BROWSER_HEADER_NAMES = [
  'user-agent',
  'accept-language',
  'referer',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-ch-ua-platform-version',
  'sec-ch-ua-model',
  'sec-ch-ua-full-version-list',
  'sec-fetch-site',
  'sec-fetch-mode',
  'sec-fetch-dest',
  'cf-connecting-ip',
  'true-client-ip',
  'x-real-ip',
  'x-forwarded-for',
  'forwarded',
  'fly-client-ip',
  'fastly-client-ip',
  'x-client-ip'
] as const;

interface ClientIpResult {
  clientIp: string | null;
  ipSource: string;
  remoteAddress: string | null;
  forwardedFor: string | null;
}

function getHeaderValue(headers: FastifyRequest['headers'], name: string): string | null {
  const headerValue = headers[name];

  if (Array.isArray(headerValue)) {
    return headerValue.join(', ');
  }

  if (typeof headerValue === 'string') {
    return headerValue;
  }

  return null;
}

function normalizeIpCandidate(value: string): string | null {
  const trimmed = value.trim().replace(/^"+|"+$/g, '');

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('[') && trimmed.includes(']')) {
    return trimmed.slice(1, trimmed.indexOf(']'));
  }

  if (trimmed.includes('.') && /:\d+$/.test(trimmed)) {
    return trimmed.replace(/:\d+$/, '');
  }

  return trimmed;
}

function extractFromForwarded(rawValue: string): string | null {
  for (const segment of rawValue.split(';')) {
    const [key, value] = segment.split('=').map((part) => part.trim());
    if (key?.toLowerCase() === 'for' && value) {
      return normalizeIpCandidate(value);
    }
  }

  return null;
}

function extractFromHeader(headerName: string, rawValue: string): string | null {
  if (headerName === 'x-forwarded-for') {
    const first = rawValue.split(',').map((part) => part.trim()).find(Boolean);
    return first ? normalizeIpCandidate(first) : null;
  }

  if (headerName === 'forwarded') {
    return extractFromForwarded(rawValue);
  }

  return normalizeIpCandidate(rawValue);
}

function sanitizeUnknown(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeUnknown(item)])
    );
  }

  return String(value);
}

export function shouldTraceRequest(request: FastifyRequest): boolean {
  return TRACEABLE_ROUTE_PATTERNS.has(request.routeOptions.url || '');
}

export function extractClientIp(request: FastifyRequest, headerOrder: string[]): ClientIpResult {
  const remoteAddress = request.ip || request.socket.remoteAddress || null;
  const forwardedFor = getHeaderValue(request.headers, 'x-forwarded-for');

  for (const headerName of headerOrder) {
    const rawValue = getHeaderValue(request.headers, headerName);
    if (!rawValue) {
      continue;
    }

    const extracted = extractFromHeader(headerName, rawValue);
    if (extracted) {
      return {
        clientIp: extracted,
        ipSource: headerName,
        remoteAddress,
        forwardedFor
      };
    }
  }

  return {
    clientIp: remoteAddress,
    ipSource: remoteAddress ? 'socket' : 'unknown',
    remoteAddress,
    forwardedFor
  };
}

export function selectBrowserHeaders(request: FastifyRequest): Record<string, string> {
  const selectedHeaders: Record<string, string> = {};

  for (const headerName of BROWSER_HEADER_NAMES) {
    const value = getHeaderValue(request.headers, headerName);
    if (value) {
      selectedHeaders[headerName] = value;
    }
  }

  return selectedHeaders;
}

export function buildQueryTraceRecord(
  request: FastifyRequest,
  replyStatusCode: number,
  latencyMs: number,
  realIpHeaderOrder: string[]
): QueryTraceRecord {
  const clientIp = extractClientIp(request, realIpHeaderOrder);
  const rawUrl = request.raw.url || request.url;
  const [requestPath = request.url, queryString = null] = rawUrl.split('?');

  return {
    request_id: request.id,
    method: request.method,
    route_pattern: request.routeOptions.url || request.url,
    request_path: requestPath,
    query_string: queryString,
    status_code: replyStatusCode,
    latency_ms: Number(latencyMs.toFixed(3)),
    client_ip: clientIp.clientIp,
    ip_source: clientIp.ipSource,
    remote_address: clientIp.remoteAddress,
    forwarded_for: clientIp.forwardedFor,
    user_agent: getHeaderValue(request.headers, 'user-agent'),
    browser_headers: selectBrowserHeaders(request),
    params: sanitizeUnknown(request.params || {}) as Record<string, unknown>,
    query_params: sanitizeUnknown(request.query || {}) as Record<string, unknown>
  };
}
