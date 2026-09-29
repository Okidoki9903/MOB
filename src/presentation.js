// Reveal rewards near the action rather than advertising the entire conveyor.
export const REVEAL_Z = -21;
const STAGES = [null, { time: 0, wave: 0 }, { time: 12, wave: 2 }, { time: 28, wave: 3 }, { time: 44, wave: 4 }];
export function upgradeAvailable(item, elapsed, wave) {
  if (item.kind !== 'gate') return true;
  const stage = STAGES[item.tier] || STAGES[4];
  return elapsed >= stage.time && wave >= stage.wave;
}
export function emergence(progress) {
  const t = Math.max(0, Math.min(1, progress));
  return 1 - Math.pow(1 - t, 3);
}
