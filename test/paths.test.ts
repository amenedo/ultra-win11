import { describe, it, expect } from 'vitest'
import { relTo, basename, joinChild } from '../src/renderer/lib/paths'

describe('relTo', () => {
  it('returns the path relative to root', () => {
    expect(relTo('/a/b', '/a/b/c.ts')).toBe('c.ts')
    expect(relTo('/a/b', '/a/b/sub/c.ts')).toBe('sub/c.ts')
  })

  it('ignores a trailing slash on root', () => {
    expect(relTo('/a/b/', '/a/b/c.ts')).toBe('c.ts')
  })

  it('returns the absolute path when outside root', () => {
    expect(relTo('/a/b', '/x/y.ts')).toBe('/x/y.ts')
  })

  it('does not treat a sibling prefix as a child', () => {
    // "/a/bc.ts" starts with "/a/b" but is not inside "/a/b/"
    expect(relTo('/a/b', '/a/bc.ts')).toBe('/a/bc.ts')
  })

  it('returns the path unchanged when root is empty', () => {
    expect(relTo('', '/a.ts')).toBe('/a.ts')
  })

  it('handles Windows paths and drive-letter case', () => {
    expect(relTo('C:\\proj', 'C:\\proj\\src\\a.ts')).toBe('src/a.ts')
    expect(relTo('C:\\Proj', 'c:\\proj\\src\\a.ts')).toBe('src/a.ts')
    expect(relTo('C:\\proj', 'D:\\other\\a.ts')).toBe('D:/other/a.ts')
  })
})

describe('joinChild', () => {
  it('keeps the separator of the root', () => {
    expect(joinChild('C:\\proj', 'notes.md')).toBe('C:\\proj\\notes.md')
    expect(joinChild('/proj/', 'notes.md')).toBe('/proj/notes.md')
    expect(joinChild('C:\\proj', '\\nested\\a.txt')).toBe('C:\\proj\\nested\\a.txt')
  })
})

describe('basename', () => {
  it('returns the last segment of a Windows path', () => {
    expect(basename('C:\\Users\\me\\proj\\file.ts')).toBe('file.ts')
    expect(basename('C:\\Users\\me\\proj\\')).toBe('proj')
  })
})

describe('basename', () => {
  it('returns the last segment', () => {
    expect(basename('/a/b/c.ts')).toBe('c.ts')
    expect(basename('file.ts')).toBe('file.ts')
  })

  it('ignores trailing slashes', () => {
    expect(basename('/a/b/')).toBe('b')
  })
})
