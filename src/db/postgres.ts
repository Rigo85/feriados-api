import { Pool } from 'pg';

import type { EnvConfig } from '../types';

export function createPostgresPool(options: EnvConfig): Pool | null {
  if (!options.databaseUrl) {
    return null;
  }

  return new Pool({
    connectionString: options.databaseUrl,
    max: 10
  });
}
