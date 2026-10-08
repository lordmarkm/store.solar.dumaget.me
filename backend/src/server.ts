import { buildApp } from './app.js';
import { loadConfig } from './config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = buildApp(config);
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => process.exit(1), 10_000);
    timeout.unref();
    try { await app.close(); }
    catch { process.exitCode = 1; }
    finally { clearTimeout(timeout); }
  };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
  try { await app.listen({ host: config.host, port: config.port }); }
  catch {
    app.log.error({ code: 'STARTUP_FAILED' }, 'API startup failed');
    await app.close();
    process.exitCode = 1;
  }
}

void main().catch(() => {
  // Do not dump credentials/environment values/SDK exceptions on startup failures.
  console.error('Backend startup failed. Check configuration and port availability.');
  process.exitCode = 1;
});
