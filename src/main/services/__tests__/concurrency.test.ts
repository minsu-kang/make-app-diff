import { describe, it, expect } from 'vitest'
import { createLimiter } from '../concurrency'

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function tracker(): { run: () => Promise<void>; max: () => number } {
  let active = 0
  let maxActive = 0
  return {
    run: async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await delay(3)
      active--
    },
    max: () => maxActive
  }
}

describe('createLimiter', () => {
  it('never runs more than the limit at once', async () => {
    const limit = createLimiter(3)
    const t = tracker()
    await Promise.all(Array.from({ length: 10 }, () => limit(t.run)))
    expect(t.max()).toBe(3)
  })

  it('applies one limit across separate batches that share the limiter', async () => {
    const limit = createLimiter(4)
    const t = tracker()
    const batch = (): Promise<void[]> => Promise.all(Array.from({ length: 6 }, () => limit(t.run)))
    await Promise.all([batch(), batch(), batch(), batch()])
    expect(t.max()).toBe(4)
  })

  it('returns the value of each task', async () => {
    const limit = createLimiter(2)
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => limit(async () => n * 2)))
    expect(results).toEqual([2, 4, 6, 8, 10])
  })

  it('starts queued tasks in the order they were added', async () => {
    const limit = createLimiter(1)
    const order: number[] = []
    await Promise.all([1, 2, 3, 4].map((n) => limit(async () => void order.push(n))))
    expect(order).toEqual([1, 2, 3, 4])
  })

  it('treats a limit below 1 as 1', async () => {
    const limit = createLimiter(0)
    const t = tracker()
    await Promise.all(Array.from({ length: 4 }, () => limit(t.run)))
    expect(t.max()).toBe(1)
  })

  it('rejects for a failing task and keeps running the queue', async () => {
    const limit = createLimiter(1)
    const failing = limit(async () => {
      throw new Error('boom')
    })
    const following = limit(async () => 'ok')
    await expect(failing).rejects.toThrow('boom')
    await expect(following).resolves.toBe('ok')
  })
})
