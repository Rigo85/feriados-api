import { loadEnv } from './config/env';
import { buildApp } from './lib/build-app';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp(env);

  await app.listen({
    host: env.host,
    port: env.port
  });
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
