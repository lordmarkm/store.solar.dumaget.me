import { Directive } from '@angular/core';

/** Planning quantities use whole units. Do not apply to prices or electrical ratings. */
@Directive({
  selector: 'input[appIntegerQuantity]',
  host: {
    inputmode: 'numeric',
    step: '1',
    '(keydown)': 'key($event)',
    '(beforeinput)': 'beforeInput($event)',
    '(paste)': 'paste($event)',
    '(drop)': 'drop($event)',
  },
})
export class IntegerQuantity {
  key(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.length === 1 && !/^\d$/.test(event.key)) event.preventDefault();
  }
  beforeInput(event: InputEvent): void {
    if (!event.inputType.startsWith('insert')) return;
    const text = event.data ?? event.dataTransfer?.getData('text/plain');
    if (text != null && !/^\d+$/.test(text)) event.preventDefault();
  }
  paste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain');
    if (text != null && !/^\d+$/.test(text)) event.preventDefault();
  }
  drop(event: DragEvent): void {
    const text = event.dataTransfer?.getData('text/plain');
    if (text != null && !/^\d+$/.test(text)) event.preventDefault();
  }
}
