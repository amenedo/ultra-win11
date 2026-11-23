import { execFile } from 'child_process'
import { foregroundLabel } from './process-name'

export interface WinProcessRow {
  pid: number
  ppid: number
  rssKb: number
  /** Kernel + user time, in 100-nanosecond units, for CPU deltas. */
  cpu100ns: number
  name: string
  command: string
}

export interface WinProcessSample extends WinProcessRow {
  /** Percent of one core since the previous sample. 0 on the first snapshot. */
  cpu: number
}

const SEP = '\x1f'

const SCRIPT = [
  "$sep = [char]31",
  "Get-CimInstance Win32_Process | ForEach-Object {",
  "  $cmd = if ($_.CommandLine) { ([string]$_.CommandLine) -replace '[\\r\\n]', ' ' -replace $sep, ' ' } else { '' }",
  "  $cpu = [int64]$_.KernelModeTime + [int64]$_.UserModeTime",
  "  $rss = [math]::Round($_.WorkingSetSize / 1KB)",
  "  '{0}{1}{2}{1}{3}{1}{4}{1}{5}{1}{6}' -f $_.ProcessId, $sep, $_.ParentProcessId, $rss, $cpu, $_.Name, $cmd",
  "}"
].join(' ')

/** Parse the unit-separated process dump produced by `readWinProcesses`. */
export function parseWinProcessDump(stdout: string): WinProcessRow[] {
  const rows: WinProcessRow[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    const parts = line.split(SEP)
    if (parts.length < 6) continue
    const pid = Number(parts[0])
    const ppid = Number(parts[1])
    const rssKb = Number(parts[2])
    const cpu100ns = Number(parts[3])
    if (!Number.isInteger(pid) || pid <= 0) continue
    rows.push({
      pid,
      ppid: Number.isFinite(ppid) ? ppid : 0,
      rssKb: Number.isFinite(rssKb) ? Math.max(0, rssKb) : 0,
      cpu100ns: Number.isFinite(cpu100ns) ? Math.max(0, cpu100ns) : 0,
      name: parts[4] || '',
      command: parts.slice(5).join(SEP)
    })
  }
  return rows
}

/** Turn two snapshots into a per-process CPU percent (100 = one full core). */
export function assignCpu(
  rows: WinProcessRow[],
  previous: Map<number, { cpu100ns: number; at: number }> | null,
  at: number
): { rows: WinProcessSample[]; snapshot: Map<number, { cpu100ns: number; at: number }> } {
  const snapshot = new Map<number, { cpu100ns: number; at: number }>()
  const out = rows.map((row) => {
    snapshot.set(row.pid, { cpu100ns: row.cpu100ns, at })
    const old = previous?.get(row.pid)
    let cpu = 0
    if (old && at > old.at && row.cpu100ns >= old.cpu100ns) {
      const usedMs = (row.cpu100ns - old.cpu100ns) / 10_000
      cpu = (usedMs / (at - old.at)) * 100
    }
    return { ...row, cpu }
  })
  return { rows: out, snapshot }
}

const HOSTS = new Set(['conhost', 'openconsole', 'fontdrvhost', 'csrss'])

/**
 * The command a PTY is actually running: the deepest descendant of `rootPid`,
 * skipping the ConPTY host processes Windows inserts beside the shell.
 * Returns null when the shell is idle.
 */
export function foregroundWinProcess(rows: WinProcessRow[], rootPid: number): string | null {
  const children = new Map<number, WinProcessRow[]>()
  for (const row of rows) {
    const list = children.get(row.ppid)
    if (list) list.push(row)
    else children.set(row.ppid, [row])
  }

  const base = (name: string): string => name.replace(/\.exe$/i, '').toLowerCase()
  const best: { depth: number; row: WinProcessRow | null } = { depth: 0, row: null }

  const walk = (pid: number, depth: number): void => {
    const kids = (children.get(pid) ?? []).filter((kid) => !HOSTS.has(base(kid.name)))
    for (const kid of kids) {
      const nextDepth = depth + 1
      if (!best.row || nextDepth >= best.depth) {
        best.row = kid
        best.depth = nextDepth
      }
      walk(kid.pid, nextDepth)
    }
  }
  walk(rootPid, 0)
  if (!best.row) return null

  const command = best.row.command.trim() || best.row.name
  const fallback = base(best.row.name) || best.row.name
  return foregroundLabel(command, fallback)
}

let cache: { at: number; rows: WinProcessSample[] } | null = null
let pending: Promise<WinProcessSample[]> | null = null
let previous: Map<number, { cpu100ns: number; at: number }> | null = null
const TTL_MS = 800

/** One Windows process snapshot, cached briefly so the poller and panels share it. */
export function readWinProcesses(): Promise<WinProcessSample[]> {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) return Promise.resolve(cache.rows)
  if (pending) return pending

  pending = new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', SCRIPT],
      { windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 8000 },
      (err, stdout) => {
        const at = Date.now()
        const parsed = err ? [] : parseWinProcessDump(String(stdout ?? ''))
        const assigned = assignCpu(parsed, previous, at)
        previous = assigned.snapshot
        cache = { at, rows: assigned.rows }
        pending = null
        resolve(assigned.rows)
      }
    )
  })
  return pending
}
