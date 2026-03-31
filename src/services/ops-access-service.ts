import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

import { extractClientIp } from '../lib/request-trace';
import type { OpsAccessService } from '../types';

interface OpsAccessOptions {
  nodeEnv: string;
  statusEnabled: boolean;
  metricsEnabled: boolean;
  opsAccessToken: string;
  opsIpAllowlist: string[];
  realIpHeaderOrder: string[];
}

function getHeaderValue(request: FastifyRequest, headerName: string): string {
  const value = request.headers[headerName];

  if (Array.isArray(value)) {
    return value[0] || '';
  }

  return typeof value === 'string' ? value : '';
}

function isProtectedEnvironment(options: OpsAccessOptions): boolean {
  return options.nodeEnv === 'production';
}

function matchesOpsToken(accessToken: string, expectedToken: string): boolean {
  if (!accessToken || !expectedToken) {
    return false;
  }

  const provided = Buffer.from(accessToken);
  const expected = Buffer.from(expectedToken);

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}

export function createOpsAccessService(options: OpsAccessOptions): OpsAccessService {
  function isAllowed(request: FastifyRequest): boolean {
    if (!isProtectedEnvironment(options)) {
      return true;
    }

    const accessToken = getHeaderValue(request, 'x-ops-token');
    if (matchesOpsToken(accessToken, options.opsAccessToken)) {
      return true;
    }

    const clientIp = extractClientIp(request, options.realIpHeaderOrder).clientIp;
    if (clientIp && options.opsIpAllowlist.includes(clientIp)) {
      return true;
    }

    return false;
  }

  function buildAccessResponse(enabled: boolean, request: FastifyRequest): {
    allowed: boolean;
    statusCode: 200 | 403 | 404;
  } {
    if (!enabled) {
      return {
        allowed: false,
        statusCode: 404
      };
    }

    if (!isAllowed(request)) {
      return {
        allowed: false,
        statusCode: 403
      };
    }

    return {
      allowed: true,
      statusCode: 200
    };
  }

  return {
    ensureStatusAccess(request) {
      return buildAccessResponse(options.statusEnabled, request);
    },
    ensureMetricsAccess(request) {
      return buildAccessResponse(options.metricsEnabled, request);
    }
  };
}
