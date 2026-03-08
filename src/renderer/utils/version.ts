export function getMajor(version: string): number {
  return parseInt(version.split('.')[0], 10) || 0
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na !== nb) return na - nb
  }
  return 0
}
