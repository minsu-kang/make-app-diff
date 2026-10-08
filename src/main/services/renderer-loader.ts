interface RendererWindow {
  loadURL(url: string): Promise<void>
  loadFile(path: string): Promise<void>
}

/** Loads the dev server URL when there is one, otherwise the built file; a failed load goes to `onError` */
export function loadRenderer(
  window: RendererWindow,
  target: { devUrl?: string; file: string },
  onError: (error: unknown) => void
): void {
  const loading = target.devUrl ? window.loadURL(target.devUrl) : window.loadFile(target.file)
  loading.catch(onError)
}
