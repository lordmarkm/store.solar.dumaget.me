import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { IntegerQuantity } from './integer-quantity';

@Component({ imports: [IntegerQuantity], template: '<input type="number" appIntegerQuantity min="1" />' })
class Host {}

describe('whole-number quantity entry', () => {
  afterEach(() => TestBed.resetTestingModule());
  function field(): HTMLInputElement {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('input');
  }
  it('uses integer steps and a numeric keyboard, blocking decimal/sign/exponent keys', () => {
    const input = field();
    expect(input.step).toBe('1');
    expect(input.inputMode).toBe('numeric');
    for (const key of ['.', ',', 'e', 'E', '-', '+', ' ']) {
      const event = new KeyboardEvent('keydown', { key, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    for (const key of ['0', '7', 'ArrowUp', 'ArrowDown', 'Tab', 'Backspace', 'Delete']) {
      const event = new KeyboardEvent('keydown', { key, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    const selectAll = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, cancelable: true });
    input.dispatchEvent(selectAll);
    expect(selectAll.defaultPrevented).toBe(false);
  });
  it('rejects fractional, signed and exponent paste/drop without rounding or stripping characters', () => {
    const input = field();
    for (const type of ['paste', 'drop']) {
      for (const text of ['1.5', '2,5', '-2', '+3', '1e3', '3 units', '']) {
        const event = new Event(type, { cancelable: true });
        Object.defineProperty(event, type === 'paste' ? 'clipboardData' : 'dataTransfer', { value: { getData: () => text } });
        input.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      }
      const event = new Event(type, { cancelable: true });
      Object.defineProperty(event, type === 'paste' ? 'clipboardData' : 'dataTransfer', { value: { getData: () => '125' } });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });
  it('guards inserted/composed text without blocking deletion', () => {
    const input = field();
    for (const data of ['2.5', '.', '3e2', '-2']) {
      const event = new InputEvent('beforeinput', { inputType: 'insertText', data, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    for (const [inputType, data] of [['insertText', '24'], ['deleteContentBackward', null]]) {
      const event = new InputEvent('beforeinput', { inputType: inputType!, data, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });
});
