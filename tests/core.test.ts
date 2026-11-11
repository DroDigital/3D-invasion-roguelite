import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { RunRng } from '../src/core/rng';
import { latLonToVec3 } from '../src/core/geo';
import { CITIES } from '../src/data/cities';
import { CityState } from '../src/sim/cities';

describe('rng', () => {
  it('reproduces a sequence from the same seed', () => {
    const a = new RunRng('SEED1').stream('waves');
    const b = new RunRng('SEED1').stream('waves');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('keeps streams independent of each other', () => {
    const r1 = new RunRng('SEED1');
    const r2 = new RunRng('SEED1');
    r1.stream('shop').next();
    r1.stream('shop').next();
    expect(r1.stream('waves').next()).toBe(r2.stream('waves').next());
  });

  it('differs across seeds and stays in [0,1)', () => {
    const a = new RunRng('A').stream('x');
    const b = new RunRng('B').stream('x');
    let same = 0;
    for (let i = 0; i < 1000; i++) {
      const v = a.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      if (v === b.next()) same++;
    }
    expect(same).toBeLessThan(5);
  });
});

describe('geo', () => {
  it('maps poles and the prime meridian', () => {
    const v = new Vector3();
    expect(latLonToVec3(90, 0, 1, v).y).toBeCloseTo(1);
    latLonToVec3(0, 0, 1, v);
    expect(v.x).toBeCloseTo(1);
    latLonToVec3(0, 90, 1, v);
    expect(v.z).toBeCloseTo(-1);
  });
});

describe('cities', () => {
  it('has about 20 unique, valid cities', () => {
    expect(CITIES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length);
    for (const c of CITIES) {
      expect(Math.abs(c.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(c.lon)).toBeLessThanOrEqual(180);
      expect(c.population).toBeGreaterThan(0);
    }
  });

  it('is lost once population falls below the threshold', () => {
    const s = new CityState();
    expect(s.isLost()).toBe(false);
    for (let i = 0; i < s.count; i++) s.population[i] *= 0.2;
    expect(s.isLost()).toBe(true);
  });
});
