import { readRepo } from './repo'

// The engine evals, read from evals/mutation and evals/act at build time. check() fails the build if
// the prose numbers below disagree with the result files.
type Mutation = { date: string; commit: string; base_clean: boolean; defects: { total: number; detected: number }; decoys: { total: number; clean: number }; rows: { id: string; kind: string; rule?: string; pass: boolean }[] }
type Act = { date: string; commit: string; cases: number; totals: { failed: number; caught: number; notFailed: number; falseAlarms: number; errors: number }; rules: Record<string, { name: string; engine: string; failed: number; caught: number; notFailed: number; falseAlarms: number }> }

export const mutation = (): Mutation => JSON.parse(readRepo('evals/mutation/result.json'))
export const mutationRound1 = (): Mutation => JSON.parse(readRepo('evals/mutation/result-round1.json'))
export const act = (): Act => JSON.parse(readRepo('evals/act/result.json'))
export const actFirst = (): Act => JSON.parse(readRepo('evals/act/result-first-run.json'))

export const engineSummary = () => {
  const m = mutation(), a = act(), a1 = actFirst(), m1 = mutationRound1()
  return {
    mutation: `Round 2 detected ${m.defects.detected} of ${m.defects.total} planted defects and stayed quiet on ${m.decoys.clean} of ${m.decoys.total} decoys. Round 1 had found ${m1.defects.detected} of ${m1.defects.total} and ${m1.decoys.clean} of ${m1.decoys.total}: two operators did not encode the defect they named, and one engine false positive was fixed.`,
    act: `On the ${Object.keys(a.rules).length} rules the engine covers, it caught ${a.totals.caught} of ${a.totals.failed} failing cases and raised ${a.totals.falseAlarms} false alarms in ${a.totals.notFailed} passing or inapplicable ones. The first run caught ${a1.totals.caught}; the gaps it and a later code review exposed were fixed.`,
  }
}

export const check = () => {
  const m = mutation(), a = act()
  if (m.rows.filter((r) => r.kind === 'defect' && r.pass).length !== m.defects.detected) throw new Error('evals/mutation/result.json: rows and totals disagree')
  const sum = (k: 'caught' | 'failed') => Object.values(a.rules).reduce((n, r) => n + r[k], 0)
  if (sum('caught') !== a.totals.caught || sum('failed') !== a.totals.failed) throw new Error('evals/act/result.json: rules and totals disagree')
}
