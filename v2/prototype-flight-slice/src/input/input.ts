import type { ControlFrame } from '../core/types';

export class InputController {
  private readonly keys = new Set<string>();
  private activePointerId: number | null = null;
  private pointerSteer = 0;
  private pointerEnergy = 0;
  private pointerType = '';
  private pointerOrigin: { x: number; y: number } | null = null;
  private toggleAltitude = false;
  private fireMissile = false;
  private reset = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    altitudeButton: HTMLButtonElement,
    missileButton: HTMLButtonElement,
    private readonly maneuverStick: HTMLElement
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
    const keyboardEnergy = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const frame: ControlFrame = {
      steer: Math.max(-1, Math.min(1, keyboardSteer + this.pointerSteer)),
      energy: Math.max(-1, Math.min(1, keyboardEnergy + this.pointerEnergy)),
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
    if (event.code === 'Space' || event.code === 'KeyW' || event.code === 'KeyS' || event.code === 'KeyE' || event.code === 'KeyR') event.preventDefault();
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
    this.pointerEnergy = 0;
    this.pointerOrigin = null;
    this.maneuverStick.classList.remove('active');
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (this.activePointerId !== null) return;
    event.preventDefault();
    this.activePointerId = event.pointerId;
    this.pointerType = event.pointerType;
    this.canvas.setPointerCapture(event.pointerId);
    if (event.pointerType === 'mouse') {
      this.updateMouseSteer(event.clientX);
      return;
    }
    this.pointerOrigin = { x: event.clientX, y: event.clientY };
    this.pointerSteer = 0;
    this.pointerEnergy = 0;
    this.showManeuverStick(event.clientX, event.clientY);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    if (this.pointerType === 'mouse') this.updateMouseSteer(event.clientX);
    else this.updateTouchManeuver(event.clientX, event.clientY);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.pointerSteer = 0;
    this.pointerEnergy = 0;
    this.pointerOrigin = null;
    this.pointerType = '';
    this.maneuverStick.classList.remove('active');
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };

  private updateMouseSteer(clientX: number): void {
    const bounds = this.canvas.getBoundingClientRect();
    const normalized = ((clientX - bounds.left) / Math.max(1, bounds.width) - 0.5) * 2;
    const deadZone = 0.1;
    this.pointerSteer = Math.abs(normalized) < deadZone
      ? 0
      : Math.sign(normalized) * Math.min(1, (Math.abs(normalized) - deadZone) / (1 - deadZone));
  }

  private updateTouchManeuver(clientX: number, clientY: number): void {
    if (!this.pointerOrigin) return;
    const maxTravel = 58;
    const deadZone = 9;
    const dx = clientX - this.pointerOrigin.x;
    const dy = clientY - this.pointerOrigin.y;
    const distance = Math.hypot(dx, dy);
    const visualScale = distance > maxTravel ? maxTravel / distance : 1;
    const visualX = dx * visualScale;
    const visualY = dy * visualScale;
    const normalize = (value: number): number => {
      const magnitude = Math.abs(value);
      if (magnitude <= deadZone) return 0;
      return Math.sign(value) * Math.min(1, (magnitude - deadZone) / (maxTravel - deadZone));
    };
    this.pointerSteer = normalize(visualX);
    this.pointerEnergy = -normalize(visualY);
    this.maneuverStick.style.setProperty('--stick-x', `${visualX}px`);
    this.maneuverStick.style.setProperty('--stick-y', `${visualY}px`);
  }

  private showManeuverStick(clientX: number, clientY: number): void {
    const bounds = this.canvas.getBoundingClientRect();
    const edge = 52;
    const x = Math.max(edge, Math.min(bounds.width - edge, clientX - bounds.left));
    const y = Math.max(edge, Math.min(bounds.height - edge, clientY - bounds.top));
    this.maneuverStick.style.left = `${x}px`;
    this.maneuverStick.style.top = `${y}px`;
    this.maneuverStick.style.setProperty('--stick-x', '0px');
    this.maneuverStick.style.setProperty('--stick-y', '0px');
    this.maneuverStick.classList.add('active');
  }
}
