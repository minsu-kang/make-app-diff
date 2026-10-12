import { useCallback, useMemo, useRef, useState } from 'react'
import type { DiffResult } from '../../shared/types'
import { filterDiffs, countChanges, type TabType } from '../../features/diff/filter-diffs'

export function useDiffState() {
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('app')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'diff' | 'show'>('diff')
  const [decompile, setDecompile] = useState(true)
  // Bumped whenever a Show/Compare starts or the selected app changes, so a response for an older request is dropped
  const requestIdRef = useRef(0)

  const invalidateRequests = useCallback(() => {
    requestIdRef.current++
    setLoading(false)
  }, [])

  const currentDiffs = useMemo(() => {
    if (!diffResult) return []
    return filterDiffs(diffResult.diffs, activeTab)
  }, [diffResult, activeTab])

  const summaries = useMemo(() => {
    if (!diffResult) return { app: null, account: null, hook: null }
    return {
      app: countChanges(filterDiffs(diffResult.diffs, 'app')),
      account: countChanges(filterDiffs(diffResult.diffs, 'account')),
      hook: countChanges(filterDiffs(diffResult.diffs, 'hook'))
    }
  }, [diffResult])

  return {
    diffResult,
    setDiffResult,
    activeTab,
    setActiveTab,
    loading,
    setLoading,
    error,
    setError,
    selectedFile,
    setSelectedFile,
    viewMode,
    setViewMode,
    decompile,
    setDecompile,
    requestIdRef,
    invalidateRequests,
    currentDiffs,
    summaries
  }
}
