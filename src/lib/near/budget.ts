/** Share of the agent's actual available + confirmed distributed pool; no per-user denominator. */
export function budgetPercent(available: string, distributed: string) {
  try {
    const a = BigInt(available),
      d = BigInt(distributed),
      total = a + d;
    if (a < BigInt(0) || d < BigInt(0) || total === BigInt(0)) return 0;
    return Number((a * BigInt(10000)) / total) / 100;
  } catch {
    return 0;
  }
}
