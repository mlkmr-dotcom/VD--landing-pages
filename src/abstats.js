// Statistiques de décision pour faibles volumes (identique dans les deux dépôts).
// - bayes() : probabilité que B batte A, perte attendue, écart relatif avec intervalle de crédibilité.
//   Lois a priori Beta(1, 1) ; tirages Monte-Carlo avec un générateur à graine fixe : la page affiche
//   toujours le même résultat pour les mêmes données.
// - srm() : contrôle du partage du trafic (« sample ratio mismatch ») : si p < 0,01, la répartition
//   observée ne correspond pas aux poids configurés → résultat du test non fiable, chercher la cause.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(r) {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Marsaglia-Tsang (forme ≥ 1) ; renforcement pour forme < 1.
function gamma(shape, r) {
  if (shape < 1) return gamma(shape + 1, r) * Math.pow(r(), 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(r); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function beta(a, b, r) {
  const x = gamma(a, r), y = gamma(b, r);
  return x / (x + y);
}

export function bayes(cA, nA, cB, nB, draws = 20000) {
  if (!nA || !nB || cA > nA || cB > nB) return null;
  const r = rng(0x5eed + cA * 31 + nA * 17 + cB * 13 + nB * 7);
  let wins = 0, lossB = 0, lossA = 0;
  const lifts = new Float64Array(draws);
  for (let i = 0; i < draws; i++) {
    const pA = beta(1 + cA, 1 + nA - cA, r), pB = beta(1 + cB, 1 + nB - cB, r);
    if (pB > pA) wins++;
    lossB += Math.max(pA - pB, 0);
    lossA += Math.max(pB - pA, 0);
    lifts[i] = (pB - pA) / pA;
  }
  lifts.sort();
  const q = (p) => lifts[Math.min(draws - 1, Math.floor(p * draws))];
  return {
    probBBeatsA: wins / draws,
    expectedLossB: lossB / draws, // perte attendue (en points de taux) si l'on choisit B
    expectedLossA: lossA / draws, // perte attendue si l'on garde A
    liftMedian: q(0.5), liftLow: q(0.025), liftHigh: q(0.975)
  };
}

function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

// Khi carré d'adéquation (1 degré de liberté pour deux variantes).
export function srm(counts, weights) {
  const keys = Object.keys(weights).filter((k) => weights[k] > 0);
  if (keys.length < 2) return null;
  const total = keys.reduce((s, k) => s + (counts[k] || 0), 0);
  if (total < 50) return null;
  const wsum = keys.reduce((s, k) => s + weights[k], 0);
  let chi = 0;
  for (const k of keys) {
    const exp = total * weights[k] / wsum;
    chi += ((counts[k] || 0) - exp) ** 2 / exp;
  }
  // df = 1 pour deux variantes : p = 2·(1 − Φ(√χ²)). Au-delà de deux variantes, approximation prudente.
  const p = keys.length === 2 ? 2 * (1 - normCdf(Math.sqrt(chi))) : Math.exp(-chi / 2);
  return { chi, pValue: p, total };
}
