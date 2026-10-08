export interface ApiConfig {
  readonly environment: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  readonly corsOrigins: readonly string[];
  readonly projectId: 'dumaget-me-solar';
  readonly databaseId: 'store-dev';
  readonly firebaseEnabled: boolean;
  readonly authSetupApproved: boolean;
  readonly adminEmailDomains: readonly string[];
}

const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function invalid(name: string): never {
  // Never echo environment values: they may contain credentials or attacker input.
  throw new Error(`Invalid backend configuration: ${name}`);
}

function booleanValue(env: NodeJS.ProcessEnv, name: string): boolean {
  const value = env[name] ?? 'false';
  if (value !== 'true' && value !== 'false') invalid(name);
  return value === 'true';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const environment = env['NODE_ENV'] ?? 'development';
  if (!['development', 'test', 'production'].includes(environment)) invalid('NODE_ENV');
  const host = env['HOST'] ?? '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '0.0.0.0', '::1', '::'].includes(host)) invalid('HOST');
  const portText = env['PORT'] ?? '4400';
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) invalid('PORT');
  const logLevel = env['LOG_LEVEL'] ?? 'info';
  if (!['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(logLevel)) invalid('LOG_LEVEL');
  if ((env['FIREBASE_PROJECT_ID'] ?? 'dumaget-me-solar') !== 'dumaget-me-solar') invalid('FIREBASE_PROJECT_ID');
  if ((env['FIRESTORE_DATABASE_ID'] ?? 'store-dev') !== 'store-dev') invalid('FIRESTORE_DATABASE_ID');

  const firebaseEnabled = booleanValue(env, 'FIREBASE_BACKEND_ENABLED');
  const authSetupApproved = booleanValue(env, 'FIREBASE_AUTH_SETUP_APPROVED');
  if (firebaseEnabled && !authSetupApproved) invalid('FIREBASE_AUTH_SETUP_APPROVED');
  // These make Admin SDK accept emulator identities. Never silently weaken live verification.
  if (env['FIREBASE_AUTH_EMULATOR_HOST'] || env['FIRESTORE_EMULATOR_HOST']) invalid('EMULATOR_HOST');

  const corsOrigins = [...new Set((env['CORS_ORIGINS'] ?? 'http://127.0.0.1:4300,http://localhost:4300')
    .split(',').map((value) => value.trim()).filter(Boolean))];
  for (const origin of corsOrigins) {
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) invalid('CORS_ORIGINS');
    } catch { invalid('CORS_ORIGINS'); }
  }
  const adminEmailDomains = [...new Set((env['ADMIN_EMAIL_DOMAINS'] ?? 'solar.dumaget.me')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (adminEmailDomains.some((domain) => domain.length > 253 || !domainPattern.test(domain))) invalid('ADMIN_EMAIL_DOMAINS');

  return Object.freeze({
    environment: environment as ApiConfig['environment'], host, port,
    logLevel: logLevel as ApiConfig['logLevel'], corsOrigins: Object.freeze(corsOrigins),
    projectId: 'dumaget-me-solar', databaseId: 'store-dev', firebaseEnabled,
    authSetupApproved, adminEmailDomains: Object.freeze(adminEmailDomains),
  });
}
