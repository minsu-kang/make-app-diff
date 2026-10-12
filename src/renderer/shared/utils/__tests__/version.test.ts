import { describe, it, expect } from 'vitest'
import { getMajor, compareSemver } from '../version'

describe('getMajor', () => {
  it('extracts major version from semver string', () => {
    expect(getMajor('1.2.3')).toBe(1)
  })

  it('returns 0 for 0.x versions', () => {
    expect(getMajor('0.1.0')).toBe(0)
  })

  it('returns 0 for non-numeric input', () => {
    expect(getMajor('abc')).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(getMajor('')).toBe(0)
  })

  it('handles large major versions', () => {
    expect(getMajor('42.0.1')).toBe(42)
  })
})

describe('compareSemver', () => {
  it('returns 0 for identical versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0)
  })

  it('compares by major version', () => {
    expect(compareSemver('2.0.0', '1.0.0')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0)
  })

  it('compares by minor version', () => {
    expect(compareSemver('1.3.0', '1.2.0')).toBeGreaterThan(0)
    expect(compareSemver('1.1.0', '1.2.0')).toBeLessThan(0)
  })

  it('compares by patch version', () => {
    expect(compareSemver('1.2.4', '1.2.3')).toBeGreaterThan(0)
    expect(compareSemver('1.2.2', '1.2.3')).toBeLessThan(0)
  })

  it('handles versions with different lengths', () => {
    expect(compareSemver('1.2', '1.2.0')).toBe(0)
    expect(compareSemver('1.2.1', '1.2')).toBeGreaterThan(0)
  })

  it('handles single-segment versions', () => {
    expect(compareSemver('2', '1')).toBeGreaterThan(0)
    expect(compareSemver('1', '1.0.0')).toBe(0)
  })
})
