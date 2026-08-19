import { describe, expect, it } from 'vitest';
import { FlightSliceSimulation } from '../src/core/simulation';
import type { ControlFrame } from '../src/core/types';

const idle: ControlFrame = { steer: 0, toggleAltitude: false, fireMissile: false, reset: false };

function clearCurrentWave(simulation: FlightSliceSimulation): void {
  const ids = simulation.state.enemies.map((enemy) => enemy.id);
  for (const id of ids) {
    const enemy = simulation.state.enemies.find((candidate) => candidate.id === id);
    if (!enemy) throw new Error(`Missing enemy ${id}`);
    enemy.hp = 1;
    enemy.fireCooldown = 99;
    simulation.state.player.position.x = enemy.position.x;
    simulation.state.player.position.z = enemy.position.z - 7;
    simulation.state.player.position.y = enemy.kind === 'aa' || enemy.kind === 'radar' ? 8 : 34;
    simulation.state.player.altitudeMode = enemy.kind === 'aa' || enemy.kind === 'radar' ? 'LOW' : 'HIGH';
    simulation.state.player.heading = 0;
    simulation.state.player.gunCooldown = 0;
    simulation.step(1 / 60, idle);
  }
}

describe('flight slice simulation', () => {
  it('turns an altitude toggle into a real continuous climb with an energy cost', () => {
    const simulation = new FlightSliceSimulation();
    simulation.step(1 / 60, { ...idle, toggleAltitude: true });
    const startSpeed = simulation.state.player.speed;
    for (let index = 0; index < 60; index += 1) simulation.step(1 / 60, idle);

    expect(simulation.state.player.altitudeMode).toBe('HIGH');
    expect(simulation.state.player.position.y).toBeGreaterThan(18);
    expect(simulation.state.player.speed).toBeLessThan(startSpeed);
  });

  it('keeps ground AA unable to damage a high-altitude player', () => {
    const simulation = new FlightSliceSimulation();
    simulation.state.player.position.y = 34;
    simulation.state.player.altitudeMode = 'HIGH';
    simulation.state.player.position.x = 34;
    simulation.state.player.position.z = 45;
    const hp = simulation.state.player.hp;
    for (let index = 0; index < 240; index += 1) simulation.step(1 / 60, idle);

    expect(simulation.state.player.hp).toBe(hp);
  });

  it('distinguishes a low-altitude AA heavy hit from a successful altitude graze', () => {
    const heavyHit = new FlightSliceSimulation();
    const heavyAa = heavyHit.state.enemies.find((enemy) => enemy.kind === 'aa');
    if (!heavyAa) throw new Error('Missing AA');
    heavyHit.state.player.position = { x: heavyAa.position.x, y: 8, z: heavyAa.position.z - 13 };
    heavyHit.state.player.heading = Math.PI / 2;
    heavyAa.fireCooldown = 0;
    const heavyEvents: string[] = [];
    for (let index = 0; index < 75; index += 1) {
      heavyHit.step(1 / 60, idle);
      heavyEvents.push(...heavyHit.state.events.map((event) => event.type));
    }
    expect(heavyEvents).toContain('heavyDamage');

    const graze = new FlightSliceSimulation();
    const grazeAa = graze.state.enemies.find((enemy) => enemy.kind === 'aa');
    if (!grazeAa) throw new Error('Missing AA');
    graze.state.player.position = { x: grazeAa.position.x, y: 8, z: grazeAa.position.z - 13 };
    graze.state.player.heading = Math.PI / 2;
    grazeAa.fireCooldown = 0;
    const grazeEvents: string[] = [];
    graze.step(1 / 60, idle);
    graze.step(1 / 60, { ...idle, toggleAltitude: true });
    for (let index = 0; index < 74; index += 1) {
      graze.step(1 / 60, idle);
      grazeEvents.push(...graze.state.events.map((event) => event.type));
    }
    expect(grazeEvents).toContain('graze');
    expect(grazeEvents).not.toContain('heavyDamage');
  });

  it('resets the encounter deterministically', () => {
    const simulation = new FlightSliceSimulation();
    for (let index = 0; index < 90; index += 1) simulation.step(1 / 60, { ...idle, steer: 1 });
    simulation.step(1 / 60, { ...idle, reset: true });

    expect(simulation.state.elapsed).toBe(0);
    expect(simulation.state.player.position).toEqual({ x: -26, y: 8, z: -54 });
    expect(simulation.state.enemies).toHaveLength(2);
    expect(simulation.state.phase).toBe('INFILTRATION');
  });

  it('runs one authored mission through all three altitude-focused phases', () => {
    const simulation = new FlightSliceSimulation();

    clearCurrentWave(simulation);
    expect(simulation.state.phase).toBe('INTERCEPT');
    expect(simulation.state.enemies.every((enemy) => enemy.kind === 'interceptor')).toBe(true);

    clearCurrentWave(simulation);
    expect(simulation.state.phase).toBe('COMBINED');
    expect(simulation.state.enemies.map((enemy) => enemy.kind)).toEqual(['aa', 'ace']);

    clearCurrentWave(simulation);
    expect(simulation.state.outcome).toBe('SUCCESS');
    expect(simulation.state.ended).toBe(true);
    expect(simulation.state.kills).toBe(6);
  });

  it('ends in a timeout when the player does not clear the authored waves', () => {
    const simulation = new FlightSliceSimulation();
    for (let index = 0; index < 4300; index += 1) simulation.step(0.05, { ...idle, steer: 0.35 });

    expect(simulation.state.outcome).toBe('TIMEOUT');
    expect(simulation.state.phase).toBe('FAILED');
    expect(simulation.state.ended).toBe(true);
  });
});
