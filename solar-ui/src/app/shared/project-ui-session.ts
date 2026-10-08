import { DestroyRef, effect, inject, untracked } from '@angular/core';
import { CustomerAccessService } from '../core/customer-access.service';

/** UI-only result fencing; server/session-safe project services enforce ownership. */
export function projectUiSession(onChange: () => void, options: { cleanupOnDestroy?: boolean } = {}) {
  const access = inject(CustomerAccessService);
  const destroy = inject(DestroyRef);
  let key = access.projectSessionKey();
  let disposed = false;
  destroy.onDestroy(() => {
    disposed = true;
    // A dialog is already being disposed by CDK before its result is emitted.
    // Re-closing that same dialog here would emit undefined and erase success.
    if (options.cleanupOnDestroy !== false) onChange();
  });
  effect(() => {
    const next = access.projectSessionKey();
    const allowed = access.canAccessProjects();
    if (next !== key || !allowed) {
      key = next;
      untracked(onChange);
    }
  });
  return {
    capture: () => access.projectSessionKey(),
    current: (captured: string) => !disposed && access.canAccessProjects() && access.projectSessionKey() === captured,
  };
}

/** A retry identity changes when the reviewed payload/destination changes. */
export function projectUiRequest() {
  let previous: string | undefined;
  let requestId = '';
  return (payload: unknown) => {
    const key = JSON.stringify(payload);
    if (key !== previous) { previous = key; requestId = crypto.randomUUID(); }
    return requestId;
  };
}
