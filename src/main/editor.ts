import { spawn } from 'child_process'
import os from 'os'

function quoteCmd(value: string): string {
  if (!/[\s"&|<>^]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * Open a path in the user's configured editor command (e.g. `code`, `cursor`,
 * `zed`, `subl`). Unix runs through a login shell so the editor CLI resolves
 * on PATH. Windows goes through cmd.exe so `code.cmd` shims are found.
 */
export function openInEditor(command: string, path: string): boolean {
  const cmd = command.trim()
  if (!cmd) return false
  try {
    if (os.platform() === 'win32') {
      spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `${cmd} ${quoteCmd(path)}`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref()
    } else {
      const shell = process.env.SHELL || '/bin/zsh'
      spawn(shell, ['-l', '-c', `${cmd} "${path.replace(/"/g, '\\"')}"`], {
        detached: true,
        stdio: 'ignore'
      }).unref()
    }
    return true
  } catch {
    return false
  }
}
