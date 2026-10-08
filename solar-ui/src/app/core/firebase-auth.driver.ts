import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { browserPopupRedirectResolver, browserSessionPersistence, GoogleAuthProvider, initializeAuth, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import type { AuthDriver } from './auth-session.service';
import { STOREFRONT_FIREBASE_CONFIG } from './firebase-config';

/** Only the SDK owns credentials. Sessions never imply access to the synthetic project repository. */
export function createFirebaseAuthDriver(): AuthDriver | null {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return null;
  try {
    const app = getApps().find(app => app.name === 'solar-storefront')
      ?? initializeApp(STOREFRONT_FIREBASE_CONFIG, 'solar-storefront');
    const auth = initializeAuth(app, {
      persistence: browserSessionPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    const google = new GoogleAuthProvider();
    google.setCustomParameters({ prompt: 'select_account' });
    return {
      observe(next, failure) {
        return onAuthStateChanged(auth, user => next(user
          ? { customerId: user.uid, displayName: user.displayName, source: 'firebase' }
          : null), failure);
      },
      async signInGoogle() { await signInWithPopup(auth, google); },
      async signOut() { await signOut(auth); },
      async getIdToken(customerId, forceRefresh) {
        const user = auth.currentUser;
        if (!user || user.uid !== customerId) return null;
        const token = await user.getIdToken(forceRefresh);
        return auth.currentUser === user && user.uid === customerId ? token : null;
      },
    };
  } catch { return null; }
}
