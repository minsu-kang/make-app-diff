declare module 'pkr' {
  export interface PkrFile {
    path: string
    data: Buffer
  }

  const Pkr: {
    unpackSync(buffer: Buffer): PkrFile[]
  }

  export default Pkr
}
