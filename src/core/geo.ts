import type { Vector3 } from 'three';

const DEG = Math.PI / 180;

/** Lat/long in degrees -> point on a sphere, matching the UV layout of
 *  THREE.SphereGeometry with an equirectangular map (lon -180 at u=0). */
export function latLonToVec3(lat: number, lon: number, radius: number, out: Vector3): Vector3 {
  const la = lat * DEG;
  const lo = lon * DEG;
  const c = Math.cos(la);
  return out.set(radius * c * Math.cos(lo), radius * Math.sin(la), -radius * c * Math.sin(lo));
}
