/** Rejects path separators and `..`/`.` so a name or version can't escape the folder or URL path it is joined into */
export function assertPathSegment(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._@-]+$/.test(value) || value === '.' || value === '..') {
    throw new Error(`Invalid ${name}`)
  }
}
