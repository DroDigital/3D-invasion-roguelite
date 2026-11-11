export interface CityDef {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Metro population, millions. */
  population: number;
}

export const CITIES: readonly CityDef[] = [
  { id: 'tokyo', name: 'TOKYO', lat: 35.68, lon: 139.69, population: 37.4 },
  { id: 'delhi', name: 'DELHI', lat: 28.61, lon: 77.21, population: 31.0 },
  { id: 'shanghai', name: 'SHANGHAI', lat: 31.23, lon: 121.47, population: 27.1 },
  { id: 'saopaulo', name: 'SAO PAULO', lat: -23.55, lon: -46.63, population: 22.0 },
  { id: 'mexico', name: 'MEXICO CITY', lat: 19.43, lon: -99.13, population: 21.8 },
  { id: 'cairo', name: 'CAIRO', lat: 30.04, lon: 31.24, population: 20.9 },
  { id: 'mumbai', name: 'MUMBAI', lat: 19.08, lon: 72.88, population: 20.4 },
  { id: 'beijing', name: 'BEIJING', lat: 39.9, lon: 116.41, population: 20.5 },
  { id: 'newyork', name: 'NEW YORK', lat: 40.71, lon: -74.01, population: 18.8 },
  { id: 'lagos', name: 'LAGOS', lat: 6.52, lon: 3.38, population: 14.4 },
  { id: 'buenosaires', name: 'BUENOS AIRES', lat: -34.6, lon: -58.38, population: 15.2 },
  { id: 'istanbul', name: 'ISTANBUL', lat: 41.01, lon: 28.98, population: 15.2 },
  { id: 'moscow', name: 'MOSCOW', lat: 55.76, lon: 37.62, population: 12.5 },
  { id: 'losangeles', name: 'LOS ANGELES', lat: 34.05, lon: -118.24, population: 12.4 },
  { id: 'paris', name: 'PARIS', lat: 48.86, lon: 2.35, population: 11.0 },
  { id: 'london', name: 'LONDON', lat: 51.51, lon: -0.13, population: 9.3 },
  { id: 'jakarta', name: 'JAKARTA', lat: -6.21, lon: 106.85, population: 10.6 },
  { id: 'sydney', name: 'SYDNEY', lat: -33.87, lon: 151.21, population: 5.0 },
  { id: 'johannesburg', name: 'JOHANNESBURG', lat: -26.2, lon: 28.05, population: 5.8 },
  { id: 'lima', name: 'LIMA', lat: -12.05, lon: -77.04, population: 10.7 },
];

/** The run ends when total population drops below this fraction of the start. */
export const POPULATION_LOSS_THRESHOLD = 0.25;
export const CITY_MAX_HEALTH = 100;
