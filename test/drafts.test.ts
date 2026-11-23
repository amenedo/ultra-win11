import { describe, expect, it } from 'vitest'
import { rememberDraft } from '../src/renderer/lib/drafts'

describe('rememberDraft', () => {
  it('keeps a draft that differs from disk and drops one that matches', () => {
    const drafts = new Map<string, string>()
    rememberDraft(drafts, { path: 'C:\\proj\\a.ts', draft: 'edited', saved: 'original' })
    expect(drafts.get('C:\\proj\\a.ts')).toBe('edited')

    rememberDraft(drafts, { path: 'C:\\proj\\a.ts', draft: 'original', saved: 'original' })
    expect(drafts.has('C:\\proj\\a.ts')).toBe(false)
  })
})
