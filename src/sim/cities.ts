import { Vector3 } from 'three';
import { latLonToVec3 } from '../core/geo';
import { CITIES, CITY_MAX_HEALTH, POPULATION_LOSS_THRESHOLD } from '../data/cities';

/** City state in the Earth-fixed frame (Earth radius = 1). Struct-of-arrays. */
export class CityState {
  readonly count = CITIES.length;
  /** Unit vectors, xyz interleaved. */
  readonly pos = new Float32Array(this.count * 3);
  readonly population = new Float64Array(this.count);
  readonly maxPopulation = new Float64Array(this.count);
  readonly health = new Float32Array(this.count);
  startPopulation = 0;

  constructor() {
    const v = new Vector3();
    for (let i = 0; i < this.count; i++) {
      const c = CITIES[i];
      latLonToVec3(c.lat, c.lon, 1, v);
      this.pos[i * 3] = v.x;
      this.pos[i * 3 + 1] = v.y;
      this.pos[i * 3 + 2] = v.z;
      this.population[i] = c.population * 1e6;
      this.maxPopulation[i] = this.population[i];
      this.health[i] = CITY_MAX_HEALTH;
      this.startPopulation += this.population[i];
    }
  }

  totalPopulation(): number {
    let t = 0;
    for (let i = 0; i < this.count; i++) t += this.population[i];
    return t;
  }

  isLost(): boolean {
    return this.totalPopulation() < this.startPopulation * POPULATION_LOSS_THRESHOLD;
  }
}
