import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedOverlayPositionChange, Overlay, OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';
import { Component, inject, Input } from '@angular/core';

let nextId = 0;
@Component({
  selector: 'app-tooltip',
  imports: [OverlayModule],
  host: { class: 'inline-flex' },
  template: `
    <span class="solar-tooltip-trigger inline-flex" cdkOverlayOrigin #origin="cdkOverlayOrigin"
      [attr.tabindex]="focusable ? 0 : null" [attr.aria-label]="focusable ? label : null"
      [attr.aria-describedby]="focusable ? descriptionId : null"
      (mouseenter)="enter()" (mouseleave)="hovered = false"
      (pointerdown)="dismiss()"
      (click)="dismiss()" (keydown.escape)="dismiss()">
      <ng-content />
    </span>
    @if (focusable) { <span class="sr-only" [id]="descriptionId">{{ label }}</span> }
    <ng-template cdkConnectedOverlay #overlay="cdkConnectedOverlay" [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="hovered && !dismissed" [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayViewportMargin]="8" [cdkConnectedOverlayPush]="true"
      [cdkConnectedOverlayScrollStrategy]="scrollStrategy"
      (positionChange)="positionChanged($event, origin, overlay)" (overlayOutsideClick)="dismiss()">
      <span [id]="tooltipId" role="tooltip" [attr.data-side]="side"
        class="solar-tooltip-bubble pointer-events-none block max-w-56 rounded-md bg-foreground px-2 py-1 text-center text-xs font-bold text-background shadow-lg">
        {{ label }}
        <span class="solar-tooltip-arrow" aria-hidden="true" [style.left.px]="arrowLeft"></span>
      </span>
    </ng-template>
  `,
})
export class Tooltip {
  @Input({ required: true }) label = '';
  @Input() focusable = false;
  readonly tooltipId = `solar-tooltip-${nextId++}`;
  readonly descriptionId = `${this.tooltipId}-description`;
  hovered = false;
  dismissed = false;
  side: 'above' | 'below' = 'above';
  arrowLeft: number | null = null;
  readonly scrollStrategy = inject(Overlay).scrollStrategies.reposition();
  readonly positions: ConnectedPosition[] = [
    { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
    { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
  ];

  enter(): void {
    this.hovered = true;
    this.dismissed = false;
  }

  dismiss(): void {
    this.dismissed = true;
  }

  positionChanged(event: ConnectedOverlayPositionChange, origin: CdkOverlayOrigin, overlay: CdkConnectedOverlay): void {
    this.side = event.connectionPair.overlayY === 'top' ? 'below' : 'above';
    const triggerRect = origin.elementRef.nativeElement.getBoundingClientRect();
    const bubbleRect = overlay.overlayRef.overlayElement.getBoundingClientRect();
    // Keep the pointer aimed at the trigger when CDK pushes a bubble away from a viewport edge.
    this.arrowLeft = bubbleRect.width > 0
      ? Math.max(8, Math.min(bubbleRect.width - 8, triggerRect.left + triggerRect.width / 2 - bubbleRect.left))
      : null;
  }
}
