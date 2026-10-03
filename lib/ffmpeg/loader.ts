import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { ProcessingError } from '../types'

/**
 * Single-instance FFmpeg WASM manager.
 *
 * Nothing here is imported from a non-media route's initial bundle: engines
 * `await import()` this module only when a user actually starts a video, audio
 * or GIF job, and `@ffmpeg/ffmpeg` itself is imported dynamically below.
 */
let ffmpegInstance: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null

/**
 * The core (`.wasm` + its JS shim) is a build-time dependency and is served
 * from our own origin. Serving it ourselves keeps processing genuinely
 * self-hosted and lets the browser cache it, instead of depending on a CDN at
 * the exact moment a user starts a 30-second transcode.
 */
const CORE_BASE = '/ffmpeg-core'

/**
 * The `@ffmpeg/*` packages are loaded through static dynamic-import specifiers at
 * module scope, deliberately.
 *
 * Writing these as `await import('@ffmpeg/ffmpeg')` inside the async factory
 * below looks equivalent, but it is not: a dynamic import whose specifier sits
 * inside a closure is not statically analysable, and Turbopack fails the build
 * at runtime with "Cannot find module as expression is too dynamic". The result
 * is that every media tool fails to start at the moment of use — which is
 * exactly when the user is least able to work around it. Hoisting the specifiers
 * to a top-level binding gives the bundler a literal to code-split against, and
 * still keeps the ~30 MB engine out of any route that never starts a media job.
 */
const ffmpegModule = () => import('@ffmpeg/ffmpeg')
const utilModule = () => import('@ffmpeg/util')

export class FFmpegUnavailableError extends ProcessingError {
  constructor(message: string) {
    super(message, 'ffmpeg-unavailable')
    this.name = 'FFmpegUnavailableError'
  }
}

/**
 * Load (and memoise) FFmpeg.
 *
 * The first call downloads and compiles a ~30 MB WebAssembly core. Callers
 * should show a "loading engine" state before awaiting this, since there is no
 * progress reporting available through the ffmpeg.wasm API itself.
 *
 * @throws FFmpegUnavailableError with a user-facing message when the browser
 *   cannot run the core at all (no WebAssembly, blocked workers, out of memory).
 */
export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance
  if (loading) return loading

  loading = (async () => {
    if (typeof window === 'undefined') {
      throw new FFmpegUnavailableError('The media engine can only run in a browser.')
    }
    if (typeof WebAssembly === 'undefined') {
      throw new FFmpegUnavailableError(
        'This browser does not support WebAssembly, which the video and audio engines require.'
      )
    }

    const { FFmpeg: FFmpegClass } = await ffmpegModule()
    const { toBlobURL } = await utilModule()

    const ffmpeg = new FFmpegClass()
    await ffmpeg.load({
      // Absolute, same-origin URL for the class worker. Passing this explicitly
      // is what keeps the engine startable under Turbopack: without it the
      // library resolves `./worker.js` against `import.meta.url` at runtime,
      // which the bundler rejects as a dynamic expression.
      classWorkerURL: `${location.origin}${CORE_BASE}/worker.js`,
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    ffmpegInstance = ffmpeg
    return ffmpeg
  })()

  try {
    return await loading
  } catch (e) {
    loading = null
    ffmpegInstance = null
    if (e instanceof ProcessingError) throw e
    // The user-facing message below is deliberately vague, which is right for a
    // visitor but useless for support. The underlying exception is logged so it
    // is diagnosable in the console without ever reaching the page.
    console.warn(
      '[filecompresser] media engine failed to start:',
      e instanceof Error ? e.stack || e.message : e
    )
    throw new FFmpegUnavailableError(
      'The media engine could not start in this browser. Try Chrome, Edge or Safari with enough free memory.'
    )
  } finally {
    loading = null
  }
}

/**
 * Kill the running FFmpeg instance.
 *
 * This is the only way to stop an in-flight `exec()` — the WASM loop does not
 * poll for flags. Terminating and reloading is expensive, so callers cancel
 * only when a user explicitly asks.
 */
export async function terminateFFmpeg(): Promise<void> {
  const instance = ffmpegInstance
  ffmpegInstance = null
  loading = null
  if (!instance) return
  try {
    instance.terminate()
  } catch {
    // Terminating an already-dead instance is not an error worth surfacing.
  }
}

export function isFFmpegLoaded(): boolean {
  return ffmpegInstance !== null
}

/** Decode whatever `readFile` returned into bytes without stringifying binary data. */
export function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  throw new ProcessingError('The media engine returned an unexpected result.')
}

/**
 * Read a file into the FFmpeg virtual FS. Kept as a helper so engines share
 * the same failure message for a copy failure.
 */
export async function writeInputFile(ffmpeg: FFmpeg, name: string, file: Blob): Promise<void> {
  const { fetchFile } = await utilModule()
  try {
    await ffmpeg.writeFile(name, await fetchFile(file))
  } catch {
    throw new ProcessingError(
      'This file could not be loaded into the media engine. It may be too large for this device to process.'
    )
  }
}