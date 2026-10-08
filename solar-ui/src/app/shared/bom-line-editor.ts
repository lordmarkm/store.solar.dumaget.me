import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { afterNextRender, Component, effect, ElementRef, inject, Injector, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FreeTextInput, freeTextInput, validateFreeText } from '../core/project-bom';
import { FreeTextBomItem } from '../core/models';
import { ProjectService } from '../core/project.service';
import { CustomerAccessService } from '../core/customer-access.service';
import { projectUiRequest, projectUiSession } from './project-ui-session';

export interface BomLineEditorData { readonly projectId: string; readonly item?: FreeTextBomItem }

@Component({
  selector: 'app-bom-line-editor',
  imports: [FormsModule],
  templateUrl: './bom-line-editor.html',
})
export class BomLineEditor {
  private readonly access = inject(CustomerAccessService);
  readonly data = inject<BomLineEditorData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly projects = inject(ProjectService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly requestId = projectUiRequest();
  private readonly owner = this.access.projectSessionKey();
  private readonly session = projectUiSession(() => this.ref.close(), { cleanupOnDestroy: false });
  readonly draft = signal<FreeTextInput>(freeTextInput(this.data.item));
  readonly attempted = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  constructor() { effect(() => { if (!this.access.canAccessProjects()) this.ref.close(); }); }

  update<K extends keyof FreeTextInput>(key: K, value: FreeTextInput[K]): void {
    if (this.saving() || !this.session.current(this.owner)) return;
    this.draft.update(draft => ({ ...draft, [key]: value }));
    this.saveError.set(null);
  }

  error(field: keyof FreeTextInput): string | null {
    return this.attempted() ? validateFreeText(this.draft())[field] ?? null : null;
  }

  async save(): Promise<void> {
    if (!this.session.current(this.owner)) return;
    if (this.saving()) return;
    this.attempted.set(true);
    if (Object.keys(validateFreeText(this.draft())).length) {
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), { injector: this.injector });
      return;
    }

    this.saving.set(true);
    this.ref.disableClose = true;
    try {
      const input = { ...this.draft() };
      const result = await this.projects.saveFreeText(this.data.projectId, input, this.requestId([this.data.projectId, this.data.item?.id, input]), this.data.item?.id);
      if (!this.session.current(this.owner)) return;
      if (result.ok) this.ref.close(true);
      else this.saveError.set(result.message);
    } catch {
      if (this.session.current(this.owner)) this.saveError.set('Unable to save this line. Your input is preserved; retry unchanged details.');
    } finally {
      if (this.session.current(this.owner)) { this.saving.set(false); this.ref.disableClose = false; }
    }
  }

  cancel(): void { if (!this.saving()) this.ref.close(false); }
}
