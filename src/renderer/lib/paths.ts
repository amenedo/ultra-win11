/** Last path segment. Accepts Windows and POSIX separators. */
export const basename = (p: string): string => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p

/** True for http(s) links, which are pinned as context alongside file paths. */
export const isUrl = (s: string): boolean => /^https?:\/\//i.test(s)

function toPosix(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Path relative to a root dir, for terminal @mentions. Absolute if outside root. */
export function relTo(root: string, p: string): string {
  const r = toPosix(root)
  const child = toPosix(p)
  if (!r) return child || p
  const rl = r.toLowerCase()
  const cl = child.toLowerCase()
  if (cl === rl) return ''
  if (cl.startsWith(rl + '/')) return child.slice(r.length + 1)
  return child
}

/** Join a new file or folder name onto a project root, keeping the root's separator. */
export function joinChild(root: string, name: string): string {
  const clean = name.replace(/^[\\/]+/, '')
  const sep = /\\/.test(root) && !root.startsWith('/') ? '\\' : '/'
  return `${root.replace(/[\\/]+$/, '')}${sep}${clean}`
}
