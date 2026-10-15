import { FocusTrap, FocusTrapFactory } from '@angular/cdk/a11y';
import { DOCUMENT } from '@angular/common';
import { AfterViewInit, ApplicationRef, Component, createComponent, ElementRef, EnvironmentInjector, inject, Injectable, Input, OnDestroy, output, signal, ViewChild } from '@angular/core';
import { KTModal } from '@keenthemes/ktui/components/modal';
import { Observable, ReplaySubject } from 'rxjs';

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
}
export interface ConfirmationRef {
  readonly closed: Observable<boolean>;
  close(): void;
}
let nextConfirmation = 0;

/** KTUI owns the popup, backdrop and dismissal; CDK supplies keyboard containment. */
@Component({
  selector: 'app-ktui-confirmation',
  template: `
    <div #modalElement class="kt-modal kt-modal-center hidden" [attr.aria-labelledby]="titleId" [attr.aria-describedby]="messageId">
      <section #content class="kt-modal-content solar-dialog-panel w-full max-w-lg" style="max-height: calc(100dvh - 32px)">
        <header class="kt-modal-header shrink-0"><h2 [id]="titleId" class="kt-modal-title break-words">{{ options.title }}</h2></header>
        <div class="kt-modal-body min-h-0 min-w-0"><p [id]="messageId" class="whitespace-pre-line break-words text-sm leading-6">{{ options.message }}</p></div>
        <footer class="kt-modal-footer shrink-0 flex-wrap justify-end gap-3">
          <button type="button" class="kt-btn kt-btn-light" [disabled]="!ready()" (click)="finish(true)">{{ options.confirmLabel }}</button>
          <button type="button" class="kt-btn kt-btn-light" cdkFocusInitial [disabled]="!ready()" (click)="finish(false)">{{ options.cancelLabel ?? 'Cancel' }}</button>
        </footer>
      </section>
    </div>
  `,
})
export class KtuiConfirmation implements AfterViewInit, OnDestroy {
  @Input({ required: true }) options!: ConfirmationOptions;
  @ViewChild('modalElement', { static: true }) private element!: ElementRef<HTMLElement>;
  @ViewChild('content', { static: true }) private content!: ElementRef<HTMLElement>;
  readonly closed = output<boolean>();
  readonly ready = signal(false);
  readonly titleId = `solar-confirm-title-${nextConfirmation++}`;
  readonly messageId = `${this.titleId}-message`;
  private readonly document = inject(DOCUMENT);
  private readonly trapFactory = inject(FocusTrapFactory);
  private readonly previousFocus = this.document.activeElement as HTMLElement | null;
  private readonly previousOverflow = this.document.body.style.overflow;
  private trap?: FocusTrap;
  private modal?: KTModal;
  private result = false;
  private closing = false;

  ngAfterViewInit(): void {
    this.modal = new KTModal(this.element.nativeElement, {
      backdrop: true, backdropClass: 'kt-modal-backdrop', backdropStatic: false,
      keyboard: true, disableScroll: true, persistent: false, focus: false,
      hiddenClass: 'hidden', zindex: '1100',
    });
    this.modal.on('shown', () => {
      if (this.closing) { this.modal!.hide(); return; }
      this.ready.set(true);
      // Wait for Angular to enable the buttons before choosing the safe default.
      this.trap = this.trapFactory.create(this.content.nativeElement);
      void this.trap.focusInitialElementWhenReady();
    });
    this.modal.on('hidden', () => {
      this.ready.set(false);
      this.restore();
      this.closed.emit(this.result);
    });
    KTModal.init();
    this.modal.show();
  }

  finish(confirmed: boolean): void {
    if (this.closing && confirmed) return;
    this.result = confirmed;
    this.closing = true;
    this.ready.set(false);
    // KTUI ignores hide during its show transition; shown handles that case.
    if (this.modal?.isOpen()) this.modal.hide();
  }

  private restore(): void {
    this.trap?.destroy(); this.trap = undefined;
    this.document.body.style.overflow = this.previousOverflow;
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
  }
  ngOnDestroy(): void { this.restore(); this.modal?.dispose(); }
}

/** A thin Angular lifecycle bridge, not a replacement popup engine. */
@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  private readonly app = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly document = inject(DOCUMENT);
  private active?: ConfirmationRef;

  open(options: ConfirmationOptions): ConfirmationRef {
    const result = new ReplaySubject<boolean>(1);
    if (this.active) { result.next(false); result.complete(); return { closed: result.asObservable(), close() {} }; }
    const host = this.document.createElement('app-ktui-confirmation');
    this.document.body.appendChild(host);
    const component = createComponent(KtuiConfirmation, { hostElement: host, environmentInjector: this.injector });
    component.setInput('options', options);
    const ref: ConfirmationRef = { closed: result.asObservable(), close: () => component.instance.finish(false) };
    this.active = ref;
    component.instance.closed.subscribe(confirmed => {
      this.app.detachView(component.hostView); component.destroy(); host.remove();
      if (this.active === ref) this.active = undefined;
      result.next(confirmed); result.complete();
    });
    this.app.attachView(component.hostView);
    component.changeDetectorRef.detectChanges();
    return ref;
  }
}
