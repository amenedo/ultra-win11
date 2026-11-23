export interface DraftSnapshot {
  path: string
  draft: string
  /** Contents last read from or written to disk. */
  saved: string
}

/** Keep an unsaved draft, or drop it once it matches what is on disk. */
export function rememberDraft(drafts: Map<string, string>, previous: DraftSnapshot | null): void {
  if (!previous) return
  if (previous.draft !== previous.saved) drafts.set(previous.path, previous.draft)
  else drafts.delete(previous.path)
}
