export interface PerformanceBaseline {
  target: 'android-tv' | 'kepler';
  coldStartMs: number | null;
  apiRequestMs: number | null;
  notes: string;
}
