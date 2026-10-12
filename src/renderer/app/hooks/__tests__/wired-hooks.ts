import { useAppSelection } from '../use-app-selection'
import type { AppInfo } from '../../../shared/types'
import { useDiffRequest } from '../use-diff-request'
import { useDiffState } from '../use-diff-state'

export function useWiredHooks() {
  const state = useDiffState()
  const selection = useAppSelection({
    invalidateRequests: state.invalidateRequests,
    setDiffResult: state.setDiffResult,
    setSelectedFile: state.setSelectedFile,
    setError: state.setError,
    setDecompile: state.setDecompile
  })
  const requests = useDiffRequest({
    appInfo: selection.appInfo,
    fromVersion: selection.fromVersion,
    toVersion: selection.toVersion,
    diffResult: state.diffResult,
    decompile: state.decompile,
    requestIdRef: state.requestIdRef,
    setViewMode: state.setViewMode,
    setLoading: state.setLoading,
    setError: state.setError,
    setSelectedFile: state.setSelectedFile,
    setDiffResult: state.setDiffResult,
    setDecompile: state.setDecompile
  })
  return { state, selection, requests }
}

export function appOf(name: string, label: string, versions: string[]): AppInfo {
  return { name, label, description: label, version: versions[0], versions }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
