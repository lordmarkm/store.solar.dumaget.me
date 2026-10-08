import type { FirebaseOptions } from 'firebase/app';

/** Approved local Google-only activation on 2026-10-07; no production deployment implied. */
export const STOREFRONT_AUTH_ENABLED = true;

/** Public browser identifiers, not Admin SDK credentials. No Analytics/Storage initialization. */
export const STOREFRONT_FIREBASE_CONFIG: FirebaseOptions = {
  apiKey: 'AIzaSyDZOb-SYvopIxypuhUYjHCsdSoche0n4wU',
  authDomain: 'dumaget-me-solar.firebaseapp.com',
  projectId: 'dumaget-me-solar',
  appId: '1:177959719186:web:1f99f7ab52c55a889723cb',
};
