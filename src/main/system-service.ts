import { execFile } from 'child_process'
import os from 'os'
import { readWinProcesses } from './win-processes'

export interface PortInfo {
  port: number
  /** Bind address as reported by lsof, e.g. `*`, `127.0.0.1`, `[::1]`. */
  address: string
  pid: number
  command: string
}

export interface ProcessInfo {
  pid: number
  ppid: number
  /** %CPU as reported by ps (can exceed 100 on multi-core). */
  cpu: number
  /** Resident set size in KB. */
  rssKb: number
  command: string
}

export interface SystemStats {
  loadAvg: number
  cpuCount: number
  totalMemKb: number
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(bin, args, { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : String(stdout ?? ''))
    })
  })
}

/**
 * Parse `lsof -F pcn` field output (one field per line: p<pid>, c<command>,
 * n<address>). Field output is stable to parse regardless of spaces in
 * command names, unlike lsof's columnar default.
 * Pure (no I/O) so it can be unit-tested directly.
 */
export function parseLsofPorts(stdout: string): PortInfo[] {
  const ports: PortInfo[] = []
  const seen = new Set<string>()
  let pid = 0
  let command = ''
  for (const line of stdout.split('\n')) {
    const tag = line[0]
    const value = line.slice(1)
    if (tag === 'p') pid = Number(value)
    else if (tag === 'c') command = value
    else if (tag === 'n') {
      const sep = value.lastIndexOf(':')
      if (sep < 0) continue
      const port = Number(value.slice(sep + 1))
      const address = value.slice(0, sep)
      const key = `${pid}:${port}`
      if (!Number.isInteger(port) || port <= 0 || seen.has(key)) continue
      seen.add(key)
      ports.push({ port, address, pid, command })
    }
  }
  return ports.sort((a, b) => a.port - b.port || a.pid - b.pid)
}

/**
 * Parse `netstat -ano -p tcp` lines. IPv4 and IPv6 listening rows both count.
 * `0.0.0.0` and `[::]` collapse to `*` so the ports panel matches the lsof shape.
 */
export function parseNetstat(stdout: string, names: Map<number, string> = new Map()): PortInfo[] {
  const ports: PortInfo[] = []
  const seen = new Set<string>()
  for (const line of stdout.split(/\r?\n/)) {
    const match = line
      .trim()
      .match(/^TCP\s+(\[[^\]]+\]|[\d.]+):(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i)
    if (!match) continue
    const rawAddress = match[1]
    const address = rawAddress === '0.0.0.0' || rawAddress === '[::]' || rawAddress === '::' ? '*' : rawAddress
    const port = Number(match[2])
    const pid = Number(match[3])
    const key = `${pid}:${port}`
    if (!Number.isInteger(port) || port <= 0 || seen.has(key)) continue
    seen.add(key)
    ports.push({ port, address, pid, command: names.get(pid) ?? '' })
  }
  return ports.sort((a, b) => a.port - b.port || a.pid - b.pid)
}

/** Listening TCP ports. Windows uses netstat; other platforms use lsof. */
export async function listPorts(): Promise<PortInfo[]> {
  if (os.platform() === 'win32') {
    const procs = await readWinProcesses()
    const names = new Map(procs.map((p) => [p.pid, p.name.replace(/\.exe$/i, '')]))
    return parseNetstat(await run('netstat.exe', ['-ano', '-p', 'tcp']), names)
  }
  return parseLsofPorts(await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn']))
}

/** Parse `ps -axo pid=,ppid=,pcpu=,rss=,comm=` output. Pure for unit tests. */
export function parsePs(stdout: string): ProcessInfo[] {
  const all: ProcessInfo[] = []
  for (const line of stdout.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/)
    if (!m) continue
    all.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      cpu: Number(m[3]),
      rssKb: Number(m[4]),
      command: m[5].trim()
    })
  }
  return all
}

/** Group a full process list into the trees rooted at each session's PTY pid,
 *  in depth-first order so children directly follow their parent. */
export function groupBySessionTree(
  all: ProcessInfo[],
  roots: { id: string; pid: number }[]
): Record<string, ProcessInfo[]> {
  const children = new Map<number, ProcessInfo[]>()
  for (const p of all) {
    const list = children.get(p.ppid)
    if (list) list.push(p)
    else children.set(p.ppid, [p])
  }
  const byPid = new Map(all.map((p) => [p.pid, p]))
  const groups: Record<string, ProcessInfo[]> = {}
  for (const { id, pid } of roots) {
    const tree: ProcessInfo[] = []
    const walk = (cur: number): void => {
      const proc = byPid.get(cur)
      if (proc) tree.push(proc)
      for (const child of children.get(cur) ?? []) walk(child.pid)
    }
    walk(pid)
    groups[id] = tree
  }
  return groups
}

/** One process snapshot, grouped per session (the shell + everything it spawned). */
export async function listSessionProcesses(
  roots: { id: string; pid: number }[]
): Promise<Record<string, ProcessInfo[]>> {
  if (roots.length === 0) return {}
  if (os.platform() === 'win32') {
    const procs = await readWinProcesses()
    const all: ProcessInfo[] = procs.map((p) => ({
      pid: p.pid,
      ppid: p.ppid,
      cpu: p.cpu,
      rssKb: p.rssKb,
      command: p.command || p.name
    }))
    return groupBySessionTree(all, roots)
  }
  const out = await run('ps', ['-axo', 'pid=,ppid=,pcpu=,rss=,comm='])
  return groupBySessionTree(parsePs(out), roots)
}

export function killProcess(pid: number): boolean {
  // Never signal init or a process group (pid 0 / negative).
  if (!Number.isInteger(pid) || pid <= 1) return false
  try {
    process.kill(pid, 'SIGTERM')
    return true
  } catch {
    return false
  }
}

let lastCpu: { idle: number; total: number } | null = null

export function systemStats(): SystemStats {
  const cpus = os.cpus()
  let idle = 0
  let total = 0
  for (const cpu of cpus) {
    const times = cpu.times
    idle += times.idle
    total += times.user + times.nice + times.sys + times.idle + times.irq
  }

  // os.loadavg() is always 0 on Windows. Derive a load-average-shaped number
  // from the CPU time delta so the resources panel still has a scale.
  let loadAvg = os.loadavg()[0]
  if (os.platform() === 'win32') {
    if (lastCpu && total > lastCpu.total) {
      const idleDelta = idle - lastCpu.idle
      const totalDelta = total - lastCpu.total
      const busy = totalDelta > 0 ? 1 - idleDelta / totalDelta : 0
      loadAvg = Math.max(0, busy) * cpus.length
    }
    lastCpu = { idle, total }
  }

  return {
    loadAvg,
    cpuCount: cpus.length,
    totalMemKb: Math.round(os.totalmem() / 1024)
  }
}
