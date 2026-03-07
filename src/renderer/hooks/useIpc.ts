import { useState, useCallback } from 'react'

interface IpcResult<T> {
  success: boolean
  data?: T
  error?: string
}

export function useIpcCall<T, A extends unknown[]>(fn: (...args: A) => Promise<IpcResult<T>>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(
    async (...args: A) => {
      setLoading(true)
      setError(null)
      try {
        const result = await fn(...args)
        if (result.success && result.data !== undefined) {
          setData(result.data)
          return result.data
        } else {
          setError(result.error || 'Unknown error')
          return null
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        return null
      } finally {
        setLoading(false)
      }
    },
    [fn]
  )

  return { data, loading, error, execute, setData }
}
