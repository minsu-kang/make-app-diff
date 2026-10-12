import { useCallback, type MutableRefObject } from 'react'
import type { AppInfo, DiffResult, IpcResult } from '../../shared/types'
import { showToast } from '../../shared/ui/Toast'
import { getApi } from '../../shared/api/electron-api'

interface DiffRequestDeps {
  appInfo: AppInfo | null
  fromVersion: string
  toVersion: string
  diffResult: DiffResult | null
  decompile: boolean
  requestIdRef: MutableRefObject<number>
  setViewMode: (value: 'diff' | 'show') => void
  setLoading: (value: boolean) => void
  setError: (value: string | null) => void
  setSelectedFile: (value: string | null) => void
  setDiffResult: (value: DiffResult | null) => void
  setDecompile: (value: boolean) => void
}

export function useDiffRequest({
  appInfo,
  fromVersion,
  toVersion,
  diffResult,
  decompile,
  requestIdRef,
  setViewMode,
  setLoading,
  setError,
  setSelectedFile,
  setDiffResult,
  setDecompile
}: DiffRequestDeps) {
  const run = useCallback(
    async (
      mode: 'diff' | 'show',
      request: (flag: boolean) => Promise<IpcResult<DiffResult>>,
      failure: string,
      decompileFlag?: boolean
    ) => {
      const flag = typeof decompileFlag === 'boolean' ? decompileFlag : decompile
      const requestId = ++requestIdRef.current
      setViewMode(mode)
      setLoading(true)
      setError(null)
      setSelectedFile(null)

      try {
        const result = await request(flag)
        if (requestId !== requestIdRef.current) return
        if (result.success && result.data) {
          setDiffResult(result.data)
        } else {
          setError(result.error || failure)
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) return
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
      } finally {
        if (requestId === requestIdRef.current) setLoading(false)
      }
    },
    [decompile, requestIdRef, setViewMode, setLoading, setError, setSelectedFile, setDiffResult]
  )

  const handleCompare = useCallback(
    async (decompileFlag?: boolean) => {
      if (!appInfo || !fromVersion || !toVersion) return
      await run(
        'diff',
        (flag) => getApi().ipm.getDiff(appInfo.name, fromVersion, toVersion, flag),
        'Compare failed',
        decompileFlag
      )
    },
    [appInfo, fromVersion, toVersion, run]
  )

  const handleShow = useCallback(
    async (version: string, decompileFlag?: boolean) => {
      if (!appInfo) return
      await run('show', (flag) => getApi().ipm.showVersion(appInfo.name, version, flag), 'Show failed', decompileFlag)
    },
    [appInfo, run]
  )

  const handleDecompileToggle = useCallback(() => {
    const newDecompile = !decompile
    setDecompile(newDecompile)
    if (toVersion) handleShow(toVersion, newDecompile)
  }, [decompile, toVersion, handleShow, setDecompile])

  const handleOpenVscode = useCallback(async () => {
    if (!appInfo || !diffResult || !toVersion) return
    const files = diffResult.diffs.flatMap((d) => (d.newContent ? [{ path: d.filePath, content: d.newContent }] : []))
    try {
      const result = await getApi().editor.openInVscode({
        appName: appInfo.name,
        version: toVersion,
        files
      })
      if (!result.success) {
        showToast(result.error || 'Failed to open VS Code', 'error')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to open VS Code', 'error')
    }
  }, [appInfo, diffResult, toVersion])

  return { handleCompare, handleShow, handleDecompileToggle, handleOpenVscode }
}
