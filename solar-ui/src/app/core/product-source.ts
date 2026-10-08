import { InjectionToken, Signal, signal } from '@angular/core';
import { Product } from './models';

/** Empty by default; application binds the validated public catalog, tests seed fixtures explicitly. */
export const PLANNING_PRODUCTS = new InjectionToken<Signal<readonly Product[]>>('Planning products', {
  providedIn: 'root', factory: () => signal<readonly Product[]>([]).asReadonly(),
});
