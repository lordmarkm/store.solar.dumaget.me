/** Trusted operator CLI; never imported by the HTTP server or browser. */
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== '--apply'
    || process.env['STORE_ADMIN_BOOTSTRAP_APPROVED'] !== 'true'
    || process.env['FIREBASE_AUTH_SETUP_APPROVED'] !== 'true'
    || process.env['FIREBASE_AUTH_EMULATOR_HOST'] || process.env['FIRESTORE_EMULATOR_HOST']) {
    throw new Error('Explicit Auth and admin-bootstrap approvals are required; emulator hosts are forbidden.');
  }
  // Intentionally fixed to the approved account/project; no wildcard role grant.
  const app = initializeApp({ projectId: 'dumaget-me-solar', credential: applicationDefault() }, 'store-admin-bootstrap');
  try {
    const auth = getAuth(app);
    const user = await auth.getUserByEmail('mark@solar.dumaget.me');
    if (user.disabled || !user.emailVerified || user.email?.toLowerCase() !== 'mark@solar.dumaget.me') {
      throw new Error('The requested account must exist, be enabled and have a verified email.');
    }
    if (user.customClaims?.['storeAdmin'] !== true) {
      await auth.setCustomUserClaims(user.uid, { ...user.customClaims, storeAdmin: true });
    }
    const verified = await auth.getUser(user.uid);
    if (verified.customClaims?.['storeAdmin'] !== true) throw new Error('Admin claim verification failed.');
    console.log('Store admin claim verified for the explicitly approved account. Sign out/in to refresh the ID token.');
  } finally { await deleteApp(app); }
}
void main().catch(() => {
  // Never print SDK error objects, user profiles, tokens, claims or credentials.
  console.error('Admin bootstrap did not complete. Check approvals, verified account existence and trusted server permissions.');
  process.exitCode = 1;
});
