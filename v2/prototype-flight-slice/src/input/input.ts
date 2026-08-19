import type { ControlFrame } from '../core/types';

export class InputController {
  private readonly keys = new Set<string>();
  private activePointerId: number | null = null;
  private pointerSteer = 0;
  private toggleAltitude = false;
  private fireMissile = false;
  private reset = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    altitudeButton: HTMLButtonElement,
    missileButton: HTMLButtonElement
  ) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerUp);

    altitudeButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleAltitude = true;
      navigator.vibrate?.(12);
    });
    missileButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.fireMissile = true;
      navigator.vibrate?.(8);
    });
  }

  consumeFrame(): ControlFrame {
    const keyboardSteer = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const frame: ControlFrame = {
      steer: Math.max(-1, Math.min(1, keyboardSteer + this.pointerSteer)),
      toggleAltitude: this.toggleAltitude,
      fireMissile: this.fireMissile,
      reset: this.reset
    };
    this.toggleAltitude = false;
    this.fireMissile = false;
    this.reset = false;
    return frame;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space' || event.code === 'KeyE' || event.code === 'KeyR') event.preventDefault();
    if (event.repeat) {
      this.keys.add(event.code);
      return;
    }
    this.keys.add(event.code);
    if (event.code === 'Space') this.toggleAltitude = true;
    if (event.code === 'KeyE') this.fireMissile = true;
    if (event.code === 'KeyR') this.reset = true;
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly handleBlur = (): void => {
    this.keys.clear();
    this.activePointerId = null;
    this.pointerSteer = 0;
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (this.activePointerId !== null) return;
    event.preventDefault();
    this.activePointerId = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.updatePointerSteer(event.clientX);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.updatePointerSteer(event.clientX);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.pointerSteer = 0;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };

  private updatePointerSteer(clientX: number): void {
    const bounds = this.canvas.getBoundingClientRect();
    const normalized = ((clientX - bounds.left) / Math.max(1, bounds.width) - 0.5) * 2;
    const deadZone = 0.1;
    this.pointerSteer = Math.abs(normalized) < deadZone
      ? 0
      : Math.sign(normalized) * Math.min(1, (Math.abs(normalized) - deadZone) / (1 - deadZone));
  }
}
