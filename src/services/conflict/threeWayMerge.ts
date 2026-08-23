export interface MergeResult {
  merged: string;
  hasConflicts: boolean;
}

interface DiffHunk {
  type: 'equal' | 'insert' | 'delete';
  lines: string[];
  baseStart: number;
  baseEnd: number;
}

function computeDiff(base: string[], changed: string[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const m = base.length;
  const n = changed.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = base[i] === changed[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  let baseStart = 0;

  while (i < m || j < n) {
    if (i < m && j < n && base[i] === changed[j]) {
      if (i > baseStart || j > baseStart) {
        const delLines = base.slice(baseStart, i);
        const insLines = changed.slice(baseStart, j);
        if (delLines.length > 0 && insLines.length === 0) {
          hunks.push({ type: 'delete', lines: delLines, baseStart, baseEnd: i });
        } else if (delLines.length === 0 && insLines.length > 0) {
          hunks.push({ type: 'insert', lines: insLines, baseStart, baseEnd: i });
        } else {
          hunks.push({ type: 'delete', lines: delLines, baseStart, baseEnd: i });
          hunks.push({ type: 'insert', lines: insLines, baseStart, baseEnd: i });
        }
      }
      hunks.push({ type: 'equal', lines: [base[i]], baseStart: i, baseEnd: i + 1 });
      i++;
      j++;
      baseStart = i;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      j++;
    } else {
      i++;
    }
  }

  if (baseStart < m || baseStart < n) {
    const delLines = base.slice(baseStart, m);
    const insLines = changed.slice(baseStart, n);
    if (delLines.length > 0 && insLines.length === 0) {
      hunks.push({ type: 'delete', lines: delLines, baseStart, baseEnd: m });
    } else if (delLines.length === 0 && insLines.length > 0) {
      hunks.push({ type: 'insert', lines: insLines, baseStart, baseEnd: m });
    } else {
      hunks.push({ type: 'delete', lines: delLines, baseStart, baseEnd: m });
      hunks.push({ type: 'insert', lines: insLines, baseStart, baseEnd: m });
    }
  }

  return hunks;
}

export function threeWayMerge(base: string, local: string, remote: string): MergeResult {
  if (local === remote) return { merged: local, hasConflicts: false };
  if (base === local) return { merged: remote, hasConflicts: false };
  if (base === remote) return { merged: local, hasConflicts: false };

  const baseLines = base.split('\n');
  const localLines = local.split('\n');
  const remoteLines = remote.split('\n');

  const localDiff = computeDiff(baseLines, localLines);
  const remoteDiff = computeDiff(baseLines, remoteLines);

  const result: string[] = [];
  let hasConflicts = false;

  const localMap = new Map<number, DiffHunk[]>();
  for (const h of localDiff) {
    if (h.type !== 'equal') {
      // Pure inserts are zero-width; the range loop below would skip them
      // and silently drop the insert. Anchor at baseStart+1.
      const end = h.baseStart === h.baseEnd ? h.baseStart + 1 : h.baseEnd;
      for (let k = h.baseStart; k < end; k++) {
        if (!localMap.has(k)) localMap.set(k, []);
        localMap.get(k)!.push(h);
      }
    }
  }

  const remoteMap = new Map<number, DiffHunk[]>();
  for (const h of remoteDiff) {
    if (h.type !== 'equal') {
      const end = h.baseStart === h.baseEnd ? h.baseStart + 1 : h.baseEnd;
      for (let k = h.baseStart; k < end; k++) {
        if (!remoteMap.has(k)) remoteMap.set(k, []);
        remoteMap.get(k)!.push(h);
      }
    }
  }

  let pos = 0;
  const processedLocal = new Set<DiffHunk>();
  const processedRemote = new Set<DiffHunk>();

  while (pos < baseLines.length) {
    const localHunks = localMap.get(pos);
    const remoteHunks = remoteMap.get(pos);

    if (!localHunks?.length && !remoteHunks?.length) {
      result.push(baseLines[pos]);
      pos++;
      continue;
    }

    const localHunk = localHunks?.[0];
    const remoteHunk = remoteHunks?.[0];

    if (localHunk && !processedLocal.has(localHunk)) {
      processedLocal.add(localHunk);

      if (remoteHunk && !processedRemote.has(remoteHunk) && localHunk.baseEnd >= remoteHunk.baseStart && remoteHunk.baseEnd >= localHunk.baseStart) {
        processedRemote.add(remoteHunk);

        const localChanged = getChangedLines(localDiff, localHunk.baseStart, localHunk.baseEnd);
        const remoteChanged = getChangedLines(remoteDiff, remoteHunk.baseStart, remoteHunk.baseEnd);

        if (arraysEqual(localChanged, remoteChanged)) {
          result.push(...localChanged);
        } else {
          hasConflicts = true;
          result.push('<<<<<<< LOCAL');
          result.push(...localChanged);
          result.push('=======');
          result.push(...remoteChanged);
          result.push('>>>>>>> REMOTE');
        }

        pos = Math.max(localHunk.baseEnd, remoteHunk.baseEnd);
      } else {
        result.push(...getChangedLines(localDiff, localHunk.baseStart, localHunk.baseEnd));
        pos = localHunk.baseEnd;
      }
    } else if (remoteHunk && !processedRemote.has(remoteHunk)) {
      processedRemote.add(remoteHunk);
      result.push(...getChangedLines(remoteDiff, remoteHunk.baseStart, remoteHunk.baseEnd));
      pos = remoteHunk.baseEnd;
    } else {
      result.push(baseLines[pos]);
      pos++;
    }
  }

  const trailingLocal = localDiff.filter(h => h.baseStart >= baseLines.length && !processedLocal.has(h));
  const trailingRemote = remoteDiff.filter(h => h.baseStart >= baseLines.length && !processedRemote.has(h));
  for (const h of trailingLocal) {
    if (h.type === 'insert') result.push(...h.lines);
  }
  for (const h of trailingRemote) {
    if (h.type === 'insert') result.push(...h.lines);
  }

  return { merged: result.join('\n'), hasConflicts };
}

function getChangedLines(diff: DiffHunk[], start: number, end: number): string[] {
  const lines: string[] = [];
  for (const h of diff) {
    if (h.type !== 'equal' && h.baseStart >= start && h.baseStart < end) {
      lines.push(...h.lines);
    }
    if (h.type === 'insert' && h.baseStart === start) {
      lines.push(...h.lines);
    }
  }
  return lines;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
