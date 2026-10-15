import { CanDeactivateFn } from '@angular/router';
import { Observable } from 'rxjs';

export interface AdminEditor { canLeave(): boolean | Promise<boolean> | Observable<boolean>; }
export const leaveAdminEditorGuard: CanDeactivateFn<AdminEditor> = component => component.canLeave();
