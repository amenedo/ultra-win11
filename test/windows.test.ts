import { describe, expect, it } from 'vitest'
import { parseNetstat } from '../src/main/system-service'
import {
  assignCpu,
  foregroundWinProcess,
  parseWinProcessDump,
  type WinProcessRow
} from '../src/main/win-processes'

const SEP = '\x1f'

function row(
  pid: number,
  ppid: number,
  name: string,
  command = name,
  rssKb = 1024,
  cpu100ns = 0
): string {
  return [pid, ppid, rssKb, cpu100ns, name, command].join(SEP)
}

describe('parseNetstat', () => {
  it('parses IPv4 and IPv6 listening rows and collapses wildcard addresses', () => {
    const out = [
      '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1200',
      '  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       1300',
      '  TCP    [::]:3000              [::]:0                 LISTENING       1200',
      '  TCP    [::1]:8080             [::]:0                 LISTENING       1400',
      '  UDP    0.0.0.0:53             *:*                                    4'
    ].join('\r\n')
    const names = new Map([
      [1200, 'node'],
      [1300, 'node'],
      [1400, 'python']
    ])
    expect(parseNetstat(out, names)).toEqual([
      { port: 3000, address: '*', pid: 1200, command: 'node' },
      { port: 5173, address: '127.0.0.1', pid: 1300, command: 'node' },
      { port: 8080, address: '[::1]', pid: 1400, command: 'python' }
    ])
  })
})

describe('parseWinProcessDump', () => {
  it('parses the unit-separated snapshot and keeps spaces in the command', () => {
    const out = [
      row(10, 1, 'powershell.exe', 'powershell.exe -NoLogo', 2048, 1000),
      row(11, 10, 'node.exe', 'node C:\\tools\\claude.js --print', 4096, 5000)
    ].join('\n')
    expect(parseWinProcessDump(out)).toEqual([
      {
        pid: 10,
        ppid: 1,
        rssKb: 2048,
        cpu100ns: 1000,
        name: 'powershell.exe',
        command: 'powershell.exe -NoLogo'
      },
      {
        pid: 11,
        ppid: 10,
        rssKb: 4096,
        cpu100ns: 5000,
        name: 'node.exe',
        command: 'node C:\\tools\\claude.js --print'
      }
    ])
  })
})

describe('assignCpu', () => {
  it('computes percent of one core from the 100ns delta', () => {
    const rows: WinProcessRow[] = [
      { pid: 1, ppid: 0, rssKb: 1, cpu100ns: 1_000_000, name: 'a', command: 'a' }
    ]
    const first = assignCpu(rows, null, 1_000)
    expect(first.rows[0].cpu).toBe(0)
    const later = assignCpu(
      [{ ...rows[0], cpu100ns: 1_000_000 + 5_000_000 }],
      first.snapshot,
      2_000
    )
    // 5_000_000 * 100ns = 500ms of CPU over 1000ms => 50%.
    expect(later.rows[0].cpu).toBeCloseTo(50)
  })
})

describe('foregroundWinProcess', () => {
  const proc = (
    pid: number,
    ppid: number,
    name: string,
    command = name
  ): WinProcessRow => ({ pid, ppid, rssKb: 0, cpu100ns: 0, name, command })

  it('returns null while the shell has no real child', () => {
    const rows = [proc(10, 1, 'powershell.exe'), proc(11, 10, 'conhost.exe')]
    expect(foregroundWinProcess(rows, 10)).toBeNull()
  })

  it('names the deepest descendant and unwraps node to the script', () => {
    const rows = [
      proc(10, 1, 'powershell.exe'),
      proc(11, 10, 'conhost.exe'),
      proc(12, 10, 'node.exe', 'node C:\\tools\\claude.js --print'),
      proc(13, 12, 'cmd.exe', 'cmd.exe /d /s /c git status')
    ]
    expect(foregroundWinProcess(rows, 10)).toBe('git')
  })

  it('reports a native agent executable directly', () => {
    const rows = [proc(10, 4, 'cmd.exe'), proc(20, 10, 'claude.exe', 'claude')]
    expect(foregroundWinProcess(rows, 10)).toBe('claude')
  })
})
