declare module 'heic2any' {
  type Heic2AnyOptions = {
    blob: Blob
    toType?: string
    quality?: number
    gifInterval?: number
    multiple?: boolean
  }
  export default function heic2any(options: Heic2AnyOptions): Promise<Blob | Blob[]>
}

declare module 'browser-image-compression' {
  type Options = {
    maxSizeMB?: number
    maxWidthOrHeight?: number
    useWebWorker?: boolean
    maxIteration?: number
    exifOrientation?: number
    onProgress?: (progress: number) => void
    fileType?: string
    /**
     * 0–1. Fixed quality for the encode, which is what the target-size search
     * relies on: each attempt must reflect exactly the quality requested, with
     * no internal reduction loop behind it.
     */
    quality?: number
    initialQuality?: number
    alwaysKeepResolution?: boolean
    signal?: AbortSignal
    preserveExif?: boolean
    libURL?: string
  }
  export default function imageCompression(file: File, options?: Options): Promise<File>
  export function getDataUrlFromFile(file: File): Promise<string>
}
