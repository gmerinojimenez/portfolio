/**
 * Career stages: companies grouped by their `stage` field. The map's trunk
 * is made of them (ADR 0015). Pure, so tests and the browser can use it.
 */

/** A career stage and the ids of its companies. */
export interface StageRef {
  readonly id: string;
  readonly companies: readonly string[];
}

/** Groups companies by `stage`, in id order; the map orders them by date. */
export function stagesOf(
  companies: readonly { id: string; stage?: string | undefined }[],
): StageRef[] {
  const stages = new Map<string, string[]>();
  for (const company of companies) {
    if (!company.stage) continue;
    stages.set(company.stage, [
      ...(stages.get(company.stage) ?? []),
      company.id,
    ]);
  }
  return [...stages]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, ids]) => ({ id, companies: ids.sort() }));
}
