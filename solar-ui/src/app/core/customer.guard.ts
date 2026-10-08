import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CustomerAccessService, safeCustomerReturnUrl } from './customer-access.service';
import { AuthSessionService } from './auth-session.service';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
export const customerGuard: CanActivateFn = (_route, state) => {
  const access = inject(CustomerAccessService);
  const auth = inject(AuthSessionService);
  const router = inject(Router);
  if (access.canAccessProjects()) return true;
  const decide = () => {
    if (access.canAccessProjects()) return true;
    const returnUrl = safeCustomerReturnUrl(state.url);
    if (!access.pending() || access.pending()?.kind === 'route') access.retain({ kind: 'route', returnUrl });
    return router.createUrlTree(['/sign-in'], { queryParams: { returnUrl } });
  };
  return auth.status() === 'initializing'
    ? toObservable(auth.status).pipe(filter(status => status !== 'initializing'), take(1), map(decide))
    : decide();
};
