export function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/** Fire and forget: a launch that fails is logged instead of becoming an unhandled rejection */
export function openExternal(url: string, open: (url: string) => Promise<void>): void {
  open(url).catch((error: unknown) => console.error(`Failed to open ${url}`, error))
}
