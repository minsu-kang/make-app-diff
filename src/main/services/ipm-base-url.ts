const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** MAKEDIFF_IPM_URL is the E2E suite's hook: an unpackaged app accepts it, and only for a local http server */
export function resolveIpmBaseUrl(isPackaged: boolean, env: NodeJS.ProcessEnv): string | undefined {
  const value = env.MAKEDIFF_IPM_URL?.trim()
  if (isPackaged || !value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname) ? url.origin : undefined
  } catch {
    return undefined
  }
}
