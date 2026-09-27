import { seeded, shuffle, beta, mean } from './math';
export function numericExperiment(values: number[], n: number, seed: number, policy: string) {
  if (policy !== 'uniform')
    return Array(300).fill(
      mean(
        values
          .slice()
          .sort((a, b) => b - a)
          .slice(0, n),
      ),
    );
  return Array.from({ length: 300 }, (_, i) =>
    mean(shuffle(values, seeded(i * 79 + seed)).slice(0, n)),
  );
}
export function referenceExperiment(
  cells: number[][],
  labels: Record<number, number>,
  observed: number[],
  priorA: number,
  priorB: number,
  round: number,
) {
  const known = new Set(observed),
    rng = seeded(671 + round),
    out: number[] = [];
  const bands = cells.map((cell) => {
    const sample = cell.filter((i) => known.has(i));
    return { n: cell.length, k: sample.length, s: sample.reduce((a, i) => a + labels[i], 0) };
  });
  const size = cells.reduce((s, c) => s + c.length, 0);
  for (let draw = 0; draw < 600; draw++) {
    let positives = 0;
    for (const b of bands) {
      const q = beta(priorA + b.s, priorB + b.k - b.s, rng);
      positives += b.s;
      for (let j = 0; j < b.n - b.k; j++) if (rng() < q) positives++;
    }
    out.push(positives / Math.max(1, size));
  }
  return out;
}
