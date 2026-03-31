import type { FastifyRequest } from 'fastify';

import { buildQueryTraceRecord, shouldTraceRequest } from '../lib/request-trace';
import type { QueryTraceRepository } from '../types';

interface QueryTraceServiceDependencies {
  queryTraceRepository?: QueryTraceRepository | null;
  enabled: boolean;
  realIpHeaderOrder: string[];
}

export function createQueryTraceService(dependencies: QueryTraceServiceDependencies) {
  async function record(request: FastifyRequest, statusCode: number, latencyMs: number): Promise<void> {
    if (!dependencies.enabled || !dependencies.queryTraceRepository || !shouldTraceRequest(request)) {
      return;
    }

    const trace = buildQueryTraceRecord(request, statusCode, latencyMs, dependencies.realIpHeaderOrder);
    await dependencies.queryTraceRepository.insertTrace(trace);
  }

  return {
    record
  };
}
