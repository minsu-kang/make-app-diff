export type Limiter = <T>(fn: () => Promise<T>) => Promise<T>

/** Returns a function that runs tasks with at most `limit` in flight at once; share one limiter across pools to cap them together */
export function createLimiter(limit: number): Limiter {
  const max = Math.max(1, limit)
  let active = 0
  const queue: (() => void)[] = []

  const next = (): void => {
    active--
    queue.shift()?.()
  }

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = (): void => {
        active++
        fn().then(resolve, reject).finally(next)
      }
      if (active < max) run()
      else queue.push(run)
    })
}
