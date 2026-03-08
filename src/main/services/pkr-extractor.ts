import { ExtractedFile } from '../types'
import Pkr from 'pkr'

interface PkrFile {
  path: string
  data: Buffer
}

interface PkrFiles extends Array<PkrFile> {
  find(path: string): PkrFile | null
}

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

export function extractPkr(buffer: Buffer): ExtractedFile[] {
  const files: PkrFiles = Pkr.unpackSync(buffer)
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
