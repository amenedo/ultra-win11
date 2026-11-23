/** Runtime platform checks for labels and window chrome. The main process
 *  branches on `process.platform`; this is the renderer equivalent. */

export const isWindows =
  typeof navigator !== 'undefined' && /Windows/.test(navigator.userAgent)

export const isMac =
  typeof navigator !== 'undefined' && /Macintosh|Mac OS X/.test(navigator.userAgent)

/** Shortcut glyph. Windows and Linux show Ctrl; macOS shows the command key. */
export const modKeyLabel = isMac ? '⌘' : 'Ctrl'

/** Name of the OS file manager used by "Show in…". */
export const fileManagerName = isWindows ? 'Explorer' : isMac ? 'Finder' : 'Files'

/** Basename of a command, ignoring a Windows path and an .exe/.cmd suffix. */
export function commandName(command: string): string {
  const base = command.trim().split(/\s+/)[0]?.split(/[\\/]/).pop()?.replace(/^-/, '') ?? ''
  return base.replace(/\.(exe|cmd|bat)$/i, '')
}
