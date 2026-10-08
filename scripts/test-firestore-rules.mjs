import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Deliberately fixed to this local emulator and demo project. Do not make the
// target configurable: these tests must never send Firestore requests to cloud.
const HOST = '127.0.0.1:8180';
const PROJECT_ID = 'demo-store-provisioning';
const DATABASE_ID = 'store-dev';
const BASE_URL = `http://${HOST}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const DEFAULT_BASE_URL = `http://${HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const RULES_URL = `http://${HOST}/emulator/v1/projects/${PROJECT_ID}:securityRules`;
const RULES_PATH = fileURLToPath(new URL('../infra/firestore/store-dev.rules', import.meta.url));
const OWNER_ID = 'rules-test-owner';
const EMULATOR_IAM_BYPASS = 'owner';
const FIXTURE_ID = 'deny-all-rules-existing-fixture';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// The Firestore emulator accepts unsigned JWTs. These are local test identities
// only; production Firebase tokens must always be verified by Firebase Auth.
function emulatorToken(uid, extraClaims = {}) {
  const header = base64url({ alg: 'none', typ: 'JWT' });
  const payload = base64url({
    aud: PROJECT_ID,
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    sub: uid,
    user_id: uid,
    iat: 1,
    exp: 4_102_444_800,
    auth_time: 1,
    firebase: { sign_in_provider: 'custom', identities: {} },
    ...extraClaims,
  });
  return `${header}.${payload}.`;
}

const identities = {
  anonymous: undefined,
  owner: emulatorToken(OWNER_ID),
  other: emulatorToken('rules-test-other'),
  adminUid: emulatorToken('admin'),
  adminClaim: emulatorToken('rules-test-claim-admin', { admin: true, role: 'admin' }),
};

async function requestAt(baseUrl, path, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { response, text, json };
}

function request(path, options) {
  return requestAt(BASE_URL, path, options);
}

async function putRules(content, description) {
  const response = await fetch(RULES_URL, {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      ignore_errors: false,
      rules: { files: [{ name: 'security.rules', content }] },
    }),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  assert(response.ok, `${description}: emulator rules API returned HTTP ${response.status}: ${text}`);
  const errors = (json?.issues ?? []).filter((issue) => issue.severity === 'ERROR');
  assert(errors.length === 0, `${description}: emulator rejected rules: ${JSON.stringify(errors)}`);
}

function document(fields) {
  return { fields };
}

function stringValue(value) {
  return { stringValue: value };
}

function mapValue(fields) {
  return { mapValue: { fields } };
}

async function verifyMockOwnerAndRestoreDefault(denyAllRules) {
  // The project's :securityRules endpoint controls the default database.
  // Keep this temporary fixture rule away from the configured named database.
  const seedRules = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents/{document=**} {\n    allow read, write: if request.auth != null && request.auth.uid == '${OWNER_ID}';\n  }\n}\n`;
  let restoreError;
  try {
    await putRules(seedRules, 'load temporary owner-only fixture rules');
    const anonymous = await requestAt(DEFAULT_BASE_URL, 'customers?documentId=anonymous-control', {
      method: 'POST',
      body: document({ ownerUid: stringValue(OWNER_ID) }),
    });
    assert(
      anonymous.response.status === 403 && anonymous.json?.error?.status === 'PERMISSION_DENIED',
      `default-database anonymous control expected 403 PERMISSION_DENIED, got ${anonymous.response.status}: ${anonymous.text}`,
    );

    const write = await requestAt(DEFAULT_BASE_URL, `customers?documentId=${encodeURIComponent(FIXTURE_ID)}`, {
      method: 'POST',
      token: identities.owner,
      body: document({
        ownerUid: stringValue(OWNER_ID),
        schemaVersion: { integerValue: '1' },
        createdAt: { timestampValue: '2026-01-01T00:00:00Z' },
      }),
    });
    assert(write.response.status === 200, `owner fixture create failed (${write.response.status}): ${write.text}`);

    const control = await requestAt(DEFAULT_BASE_URL, `customers/${encodeURIComponent(FIXTURE_ID)}`, {
      token: identities.owner,
    });
    assert(
      control.response.status === 200 && control.json?.fields?.ownerUid?.stringValue === OWNER_ID,
      `owner token control read failed (${control.response.status}): ${control.text}`,
    );
    console.log('PASS default database controls: anonymous denied; mock owner accepted and fixture read');
  } finally {
    try {
      await putRules(denyAllRules, 'restore deny-all rules');
    } catch (error) {
      restoreError = error;
    }
  }
  if (restoreError) throw restoreError;
}

async function seedNamedFixture() {
  // The emulator's literal Bearer owner token is its local IAM bypass. This
  // seeds the named database without changing its startup-loaded rules.
  const write = await request(`customers?documentId=${encodeURIComponent(FIXTURE_ID)}`, {
    method: 'POST',
    token: EMULATOR_IAM_BYPASS,
    body: document({
      ownerUid: stringValue(OWNER_ID),
      schemaVersion: { integerValue: '1' },
      createdAt: { timestampValue: '2026-01-01T00:00:00Z' },
    }),
  });
  assert(write.response.status === 200, `named database IAM-bypass fixture create failed (${write.response.status}): ${write.text}`);

  const control = await request(`customers/${encodeURIComponent(FIXTURE_ID)}`, {
    token: EMULATOR_IAM_BYPASS,
  });
  assert(
    control.response.status === 200 && control.json?.fields?.ownerUid?.stringValue === OWNER_ID,
    `named database IAM-bypass control read failed (${control.response.status}): ${control.text}`,
  );
  console.log('PASS named store-dev fixture seeded/read through emulator-only Bearer owner bypass');
}

const denyRules = await readFile(RULES_PATH, 'utf8');
assert(
  denyRules.includes('allow read, write: if false;'),
  'configured rules file does not contain the expected deny-all rule',
);

const sourceHash = createHash('sha256').update(denyRules).digest('hex');
console.log(`Configured store-dev rules SHA-256: ${sourceHash}`);
// Firebase CLI's startup config loads the configured source for store-dev.
// Never change named-database rules here: :securityRules is project-scoped and
// a temporary update there is only used for the separate default-database auth
// controls below. Those default rules are restored before testing store-dev.
await verifyMockOwnerAndRestoreDefault(denyRules);
await seedNamedFixture();

const existing = `customers/${encodeURIComponent(FIXTURE_ID)}`;
const fresh = `customers/${encodeURIComponent('deny-all-rules-new-document')}`;
const oversized = 'x'.repeat(20_000);
const validProfile = {
  ownerUid: stringValue(OWNER_ID),
  schemaVersion: { integerValue: '1' },
  profile: mapValue({ displayName: stringValue('Test owner') }),
};
const testCases = [
  ['anonymous get existing document', () => request(existing)],
  ['owner get existing document', () => request(existing, { token: identities.owner })],
  ['other user get existing document', () => request(existing, { token: identities.other })],
  ['admin UID get existing document', () => request(existing, { token: identities.adminUid })],
  ['admin claim get existing document', () => request(existing, { token: identities.adminClaim })],
  ['anonymous list customers', () => request('customers')],
  ['owner list customers', () => request('customers', { token: identities.owner })],
  ['other user list customers', () => request('customers', { token: identities.other })],
  ['admin UID list customers', () => request('customers', { token: identities.adminUid })],
  ['admin claim list customers', () => request('customers', { token: identities.adminClaim })],
  ['anonymous create document', () => request(`customers?documentId=${encodeURIComponent('anon-create')}`, {
    method: 'POST', body: document(validProfile),
  })],
  ['owner create document', () => request(`customers?documentId=${encodeURIComponent('owner-create')}`, {
    method: 'POST', token: identities.owner, body: document(validProfile),
  })],
  ['other user create document', () => request(`customers?documentId=${encodeURIComponent('other-create')}`, {
    method: 'POST', token: identities.other, body: document(validProfile),
  })],
  ['admin UID create document', () => request(`customers?documentId=${encodeURIComponent('admin-create')}`, {
    method: 'POST', token: identities.adminUid, body: document(validProfile),
  })],
  ['admin claim create document', () => request(`customers?documentId=${encodeURIComponent('claim-admin-create')}`, {
    method: 'POST', token: identities.adminClaim, body: document(validProfile),
  })],
  ['owner update existing document', () => request(existing, {
    method: 'PATCH', token: identities.owner, body: document(validProfile),
  })],
  ['owner delete existing document', () => request(existing, { method: 'DELETE', token: identities.owner })],
  ['owner get nested orphan document', () => request('customers/orphan/private/data', { token: identities.owner })],
  ['owner create nested orphan document', () => request('customers/orphan/private?documentId=data', {
    method: 'POST', token: identities.owner, body: document(validProfile),
  })],
  ['owner create role pollution', () => request(`customers?documentId=${encodeURIComponent('role-pollution')}`, {
    method: 'POST', token: identities.owner,
    body: document({ ...validProfile, role: stringValue('admin'), isAdmin: { booleanValue: true } }),
  })],
  ['owner create owner pollution', () => request(`customers?documentId=${encodeURIComponent('owner-pollution')}`, {
    method: 'POST', token: identities.owner,
    body: document({ ...validProfile, ownerUid: stringValue('rules-test-other') }),
  })],
  ['owner create invalid timestamp', () => request(`customers?documentId=${encodeURIComponent('invalid-timestamp')}`, {
    method: 'POST', token: identities.owner,
    body: document({ ...validProfile, createdAt: stringValue('not-a-timestamp') }),
  })],
  ['owner create invalid field type', () => request(`customers?documentId=${encodeURIComponent('invalid-type')}`, {
    method: 'POST', token: identities.owner,
    body: document({ ...validProfile, schemaVersion: { booleanValue: true } }),
  })],
  ['owner create oversized bounded string', () => request(`customers?documentId=${encodeURIComponent('oversized')}`, {
    method: 'POST', token: identities.owner,
    body: document({ ...validProfile, profile: mapValue({ displayName: stringValue(oversized) }) }),
  })],
  ['owner create valid control-shaped document', () => request(`customers?documentId=${encodeURIComponent('valid-control')}`, {
    method: 'POST', token: identities.owner, body: document(validProfile),
  })],
  ['owner get nonexistent document', () => request(fresh, { token: identities.owner })],
];

let failed = 0;
for (const [label, run] of testCases) {
  try {
    const { response, text, json } = await run();
    const error = json?.error;
    assert(
      response.status === 403 && error?.status === 'PERMISSION_DENIED',
      `${label}: expected HTTP 403 PERMISSION_DENIED, got HTTP ${response.status} ${error?.status ?? '(no status)'}: ${text}`,
    );
    console.log(`PASS ${label}: 403 PERMISSION_DENIED`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${label}: ${error.message}`);
  }
}

assert(failed === 0, `${failed} of ${testCases.length} Firestore rules checks failed`);
console.log(`All ${testCases.length} Firestore deny-all REST checks passed for ${PROJECT_ID}/${DATABASE_ID}.`);
