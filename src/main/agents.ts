import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'

/**
 * Probe whether an agent command is available on PATH.
 * Uses a login shell so it sees the same PATH the user's terminal would.
 */
export function probeCommand(command: string): Promise<boolean> {
  const bin = command.trim().split(/\s+/)[0]?.replace(/^"|"$/g, '')
  if (!bin) return Promise.resolve(false)

  // An explicit path is a file check. `where` only searches PATH.
  if (/[\\/]/.test(bin) || /^[a-zA-Z]:/.test(bin)) {
    return Promise.resolve(fs.existsSync(bin))
  }

  return new Promise((resolve) => {
    if (os.platform() === 'win32') {
      execFile('where.exe', [bin], { windowsHide: true }, (err, stdout) => {
        resolve(!err && String(stdout ?? '').trim().length > 0)
      })
      return
    }
    const shell = process.env.SHELL || '/bin/zsh'
    execFile(shell, ['-l', '-c', `command -v ${bin}`], (err, stdout) => {
      resolve(!err && stdout.trim().length > 0)
    })
  })
}
