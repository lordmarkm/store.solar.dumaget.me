import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('defaults are local, disconnected and explicitly target the store database', () => {
  const config = loadConfig({});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 4400);
  assert.equal(config.projectId, 'dumaget-me-solar');
  assert.equal(config.databaseId, 'store-dev');
  assert.equal(config.firebaseEnabled, false);
  assert.equal(config.authSetupApproved, false);
  assert.deepEqual(config.adminEmailDomains, ['solar.dumaget.me']);
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.adminEmailDomains));
});

test('rejects accidental activation and other project/database destinations', () => {
  for (const env of [
    { FIREBASE_BACKEND_ENABLED: 'true' },
    { FIREBASE_BACKEND_ENABLED: 'yes' },
    { FIREBASE_AUTH_SETUP_APPROVED: '1' },
    { FIREBASE_PROJECT_ID: 'another-project' },
    { FIRESTORE_DATABASE_ID: '(default)' },
    { FIRESTORE_DATABASE_ID: '' },
    { FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' },
    { FIRESTORE_EMULATOR_HOST: 'localhost:8080' },
  ]) assert.throws(() => loadConfig(env), /Invalid backend configuration/);
});

test('requires bounded ports and known logging/environment options', () => {
  for (const port of ['0', '65536', '4400.5', '4400garbage', '-1', '']) {
    assert.throws(() => loadConfig({ PORT: port }), /PORT/);
  }
  assert.equal(loadConfig({ PORT: '4450' }).port, 4450);
  assert.throws(() => loadConfig({ NODE_ENV: 'prod' }), /NODE_ENV/);
  assert.throws(() => loadConfig({ LOG_LEVEL: 'anything' }), /LOG_LEVEL/);
  assert.throws(() => loadConfig({ HOST: 'arbitrary-host' }), /HOST/);
});

test('origin allowlist refuses wildcards, credentials, paths and malformed URLs', () => {
  for (const origin of ['*', 'null', 'https://store.example/path', 'https://user:pass@store.example', 'ftp://store.example']) {
    assert.throws(() => loadConfig({ CORS_ORIGINS: origin }), /CORS_ORIGINS/);
  }
  assert.deepEqual(loadConfig({ CORS_ORIGINS: 'https://store.example,https://store.example' }).corsOrigins, ['https://store.example']);
  assert.deepEqual(loadConfig({ CORS_ORIGINS: '' }).corsOrigins, []);
});

test('admin policy normalizes exact domains and supports deny-all', () => {
  assert.deepEqual(loadConfig({ ADMIN_EMAIL_DOMAINS: 'Solar.Dumaget.Me, another.example,solar.dumaget.me' }).adminEmailDomains,
    ['solar.dumaget.me', 'another.example']);
  assert.deepEqual(loadConfig({ ADMIN_EMAIL_DOMAINS: '' }).adminEmailDomains, []);
  for (const domain of ['*.solar.dumaget.me', '@solar.dumaget.me', 'https://solar.dumaget.me', 'solar dumaget.me']) {
    assert.throws(() => loadConfig({ ADMIN_EMAIL_DOMAINS: domain }), /ADMIN_EMAIL_DOMAINS/);
  }
});

test('configuration failures never echo environment values', () => {
  assert.throws(() => loadConfig({ CORS_ORIGINS: 'secret-token-value' }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'Invalid backend configuration: CORS_ORIGINS');
    assert.ok(!error.message.includes('secret-token-value'));
    return true;
  });
});
