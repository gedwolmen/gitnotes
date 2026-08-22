/**
 * Report assembler for E2E sync scenario results.
 *
 * Takes an array of `ScenarioReport` (one per scenario × per mode) and produces
 * a Markdown table and a JSON serialisation for machine consumers.
 *
 * The Markdown form matches the template in plan §7 and is suitable for pasting
 * into `docs/wiki/e2e-sync-testing.md`.
 */

import type { SyncMode } from '../../src/services/git/syncTiming';
import type { ScenarioReport } from './e2e-runner';
import type { ClonePushTrigger } from './test-notes-fixture';

export interface ReportMeta {
  runAt: string;
  totalMs: number;
  scenarioCount: number;
  modeCount: 2;
  allPassed: boolean;
}

export interface FullReport {
  meta: ReportMeta;
  rows: ScenarioReport[];
  markdown: string;
  json: string;
}

function httpOpsCount(entries: ScenarioReport['timingEntries']): number {
  return entries.filter((e) => e.kind === 'http').length;
}

function fsOpsCount(entries: ScenarioReport['timingEntries']): number {
  return entries.filter((e) => e.kind === 'fs').length;
}

function totalHttpBytes(entries: ScenarioReport['timingEntries']): number {
  return entries
    .filter((e) => e.kind === 'http')
    .reduce((sum, e) => sum + (e.bytes ?? 0), 0);
}

function totalDurationMs(entries: ScenarioReport['timingEntries']): number {
  return entries.reduce((sum, e) => sum + e.durationMs, 0);
}

function pushTriggerLabel(t: ClonePushTrigger): string {
  const labels: Record<ClonePushTrigger, string> = {
    'long-press-floating-btn': 'floating long-press',
    'stage-push-all': 'Stage push-all',
    'stage-per-group-push': 'per-group push',
    '3-min-idle-autopush': '3-min idle',
    'os-bg-task': 'OS bg task',
    'foreground-resume': 'foreground resume',
  };
  return labels[t];
}

function scenarioSection(report: ScenarioReport, mode: SyncMode): string {
  const d = report.checkpoints;
  const http = httpOpsCount(report.timingEntries);
  const fs = fsOpsCount(report.timingEntries);
  const bytes = totalHttpBytes(report.timingEntries);
  const dur = totalDurationMs(report.timingEntries);

  const t1delta = d.t1StageOrEnqueue != null && d.t0SaveStart != null
    ? `+${d.t1StageOrEnqueue - d.t0SaveStart}`
    : '—';
  const t2delta = d.t2GitOpsComplete != null && d.t0SaveStart != null
    ? `+${d.t2GitOpsComplete - d.t0SaveStart}`
    : '—';
  const t3delta = d.t3PushComplete != null && d.t0SaveStart != null
    ? `+${d.t3PushComplete - d.t0SaveStart}`
    : '—';
  const latency = d.t3PushComplete != null && d.t2GitOpsComplete != null
    ? `${d.t3PushComplete - d.t2GitOpsComplete}`
    : '—';

  const pushTrigger = pushTriggerLabel(report.pushTrigger);

  let cloneSpecific = '';
  if (mode === 'clone' && report.clone) {
    const c = report.clone;
    cloneSpecific = `
- Staged before push: ${c.stagedCountBeforePush} item(s)
- Push trigger fired: ${c.pushTriggerFired ? 'YES' : 'NO'}
- Staged cleared after push: ${c.stagedClearedAfterPush ? 'YES' : 'NO'}`;
  }

  let apiSpecific = '';
  if (mode === 'api' && report.api) {
    const a = report.api;
    apiSpecific = `
- Save cycle source: ${a.saveCycleSource ?? 'none'}
- Blocking overlay fired: ${a.blockOverlayFired ? 'YES' : 'NO'}
- Pull-after-push: ${a.pullAfterPushCalled ? 'YES' : 'NO'}`;
  }

  return `## Scenario ${report.scenarioId} — ${report.scenarioName} · Mode ${mode} · ${report.pass ? '✅ PASS' : '❌ FAIL'}

| Checkpoint | Time (ms) | Notes |
|---|---|---|
| T0 save start | ${d.t0SaveStart ?? '—'} | |
| T1 stage/enqueue | ${t1delta} | |
| T2 git ops (http+fs) | ${t2delta} | http:${http} ops, fs:${fs} ops, ${bytes} bytes |
| T3 GitHub visible | ${t3delta} | |
| Push propagation latency | ${latency} | |

- **Push trigger used**: ${pushTrigger}${cloneSpecific}${apiSpecific}
- **Overall**: ${report.pass ? 'PASS' : `FAIL — ${report.checkpointResults.filter((c) => !c.passed).map((c) => `${c.label}: ${c.detail}`).join('; ')}`}`;
}

function markdownTable(rows: ScenarioReport[]): string {
  const header = `| # | Scenario | Mode | Pass | T1 delta (ms) | T2 delta (ms) | T3 delta (ms) | HTTP ops | FS ops | Push trigger |`;
  const sep = `|---|---|---|---|---|---|---|---|---|---|`;
  const body = rows.map((r) => {
    const d = r.checkpoints;
    const http = httpOpsCount(r.timingEntries);
    const fs = fsOpsCount(r.timingEntries);
    const t1 = d.t1StageOrEnqueue != null && d.t0SaveStart != null
      ? String(d.t1StageOrEnqueue - d.t0SaveStart)
      : '—';
    const t2 = d.t2GitOpsComplete != null && d.t0SaveStart != null
      ? String(d.t2GitOpsComplete - d.t0SaveStart)
      : '—';
    const t3 = d.t3PushComplete != null && d.t0SaveStart != null
      ? String(d.t3PushComplete - d.t0SaveStart)
      : '—';
    return `| ${r.scenarioId} | ${r.scenarioName} | ${r.mode} | ${r.pass ? '✅' : '❌'} | ${t1} | ${t2} | ${t3} | ${http} | ${fs} | ${pushTriggerLabel(r.pushTrigger)} |`;
  });
  return [header, sep, ...body].join('\n');
}

/**
 * Assemble a full report from all scenario × mode results.
 */
export function assembleReport(rows: ScenarioReport[]): FullReport {
  const t0 = rows.reduce(
    (min, r) => Math.min(min, r.checkpoints.t0SaveStart ?? Infinity), Infinity);
  const tEnd = rows.reduce(
    (max, r) => Math.max(max, r.checkpoints.t3PushComplete ?? 0), 0);

  const allPassed = rows.every((r) => r.pass);

  const sections = rows.map((r) => scenarioSection(r, r.mode));
  const tableMd = markdownTable(rows);
  const combinedMarkdown = [
    `# E2E Sync Test Report — ${new Date().toISOString()}`,
    '',
    '## Summary Matrix',
    '',
    tableMd,
    '',
    '## Per-Scenario Detail',
    '',
    ...sections,
  ].join('\n');

  return {
    meta: {
      runAt: new Date().toISOString(),
      totalMs: tEnd - (isFinite(t0) ? t0 : 0),
      scenarioCount: new Set(rows.map((r) => r.scenarioId)).size,
      modeCount: 2,
      allPassed,
    },
    rows,
    markdown: combinedMarkdown,
    json: JSON.stringify({ rows }, null, 2),
  };
}

/**
 * Filtered view: only clone-mode rows.
 */
export function cloneOnly(rows: ScenarioReport[]): ScenarioReport[] {
  return rows.filter((r) => r.mode === 'clone');
}

/**
 * Filtered view: only API-mode rows.
 */
export function apiOnly(rows: ScenarioReport[]): ScenarioReport[] {
  return rows.filter((r) => r.mode === 'api');
}

/**
 * Summary row: total pass/fail across all rows.
 */
export function passRate(rows: ScenarioReport[]): { passed: number; total: number } {
  return {
    passed: rows.filter((r) => r.pass).length,
    total: rows.length,
  };
}
