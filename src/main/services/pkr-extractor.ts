import { ExtractedFile } from '../types'
import Pkr from 'pkr'

const BINARY_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  bmp: 'image/bmp'
}

function getBinaryMime(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return BINARY_MIME[ext] || null
}

const IMAGE_DATA_URI = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=]*)$/i

/** Content to write to disk or a ZIP: image data URIs from extractPkr become bytes, everything else stays text */
export function toFileData(filePath: string, content: string): Buffer | string {
  if (!getBinaryMime(filePath)) return content
  const match = IMAGE_DATA_URI.exec(content)
  return match ? Buffer.from(match[1], 'base64') : content
}

export function extractPkr(buffer: Buffer): ExtractedFile[] {
  const files = Pkr.unpackSync(buffer)
  const result: ExtractedFile[] = []

  for (const file of files) {
    if (file.path.startsWith('unpacked-app-files/')) continue
    const mime = getBinaryMime(file.path)
    const content = mime ? `data:${mime};base64,${file.data.toString('base64')}` : file.data.toString('utf-8')
    result.push({
      path: file.path,
      content
    })
  }

  return result.sort((a, b) => a.path.localeCompare(b.path))
}
