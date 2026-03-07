import { ExtractedFile } from '../types'
import Pkr from 'pkr'

interface PkrFile {
  path: string
  data: Buffer
}

interface PkrFiles extends Array<PkrFile> {
  find(path: string): PkrFile | null
}

export function extractPkr(buffer: Buffer): ExtractedFile[] {
  const files: PkrFiles = Pkr.unpackSync(buffer)
  const result: ExtractedFile[] = []

  for (const file of files) {
    if (file.path.startsWith('unpacked-app-files/')) continue
    const content = file.data.toString('utf-8')
    result.push({
      path: file.path,
      content
    })
  }

  return result.sort((a, b) => a.path.localeCompare(b.path))
}
