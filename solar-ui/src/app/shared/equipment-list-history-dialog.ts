import { DatePipe } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { ProjectService } from '../core/project.service';
import { GuestEquipmentList } from '../core/models';
import { CustomerAccessService } from '../core/customer-access.service';

export interface EquipmentListHistoryDialogData {
  readonly mode: 'history' | 'start-new';
}

@Component({
  selector: 'app-equipment-list-history-dialog',
  imports: [DatePipe],
  templateUrl: './equipment-list-history-dialog.html',
})
export class EquipmentListHistoryDialog {
  private readonly access = inject(CustomerAccessService);
  readonly data = inject<EquipmentListHistoryDialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly service = inject(ProjectService);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  private readonly requestId = crypto.randomUUID();
  private readonly owner = this.access.projectSessionKey();
  private readonly destroy = inject(DestroyRef);
  constructor() { effect(() => { if (this.access.projectSessionKey() !== this.owner) this.ref.close(false); }); }
  private current(): boolean { return !this.destroy.destroyed && this.access.projectSessionKey() === this.owner; }

  close(): void {
    if (!this.saving()) this.ref.close(false);
  }

  async reopen(list: GuestEquipmentList): Promise<void> {
    if (!this.current()) return;
    if (this.saving() || list.id === this.service.guestHistory()?.currentListId) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.service.reopenGuestList(list.id);
      if (!this.current()) return;
      if (result.ok) this.ref.close(true);
      else this.error.set(result.message);
    } catch { if (this.current()) this.error.set('Unable to reopen this local cart. Retry.'); }
    finally {
      if (this.current()) this.saving.set(false);
    }
  }

  async startNew(): Promise<void> {
    if (!this.current()) return;
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.service.startNewGuestList(this.requestId);
      if (!this.current()) return;
      if (result.ok) this.ref.close(true);
      else this.error.set(result.message);
    } catch { if (this.current()) this.error.set('Unable to start a new local cart. Your existing cart is preserved.'); }
    finally {
      if (this.current()) this.saving.set(false);
    }
  }

  linkedProjectName(list: GuestEquipmentList): string {
    if (!this.access.canAccessProjects() || list.state !== 'linked' || list.copyReceipt.customerId !== this.access.customerId()) return 'Linked cart (project unavailable)';
    const project = this.service.projects().find(candidate =>
      candidate.id === list.copyReceipt.projectId && candidate.customerId === this.access.customerId());
    return project ? `Linked to ${project.name}` : 'Linked cart (project unavailable)';
  }
}
