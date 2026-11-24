import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compressVideo } from '@/lib/engines/video'
import { processAudio } from '@/lib/engines/audio'
import { compressGif } from '@/lib/engines/gif'

// These are orchestration/policy tests. Real codec output is verified separately
// by the local pinned-core harness and browser/download checks.
const state = vi.hoisted(() => ({ source: {} as object, output: {} as object, bytes: new Uint8Array(), probes: new Map<string, Uint8Array>(), probeInputs: new Map<string, string>(), inspectedOutput: false, handlers: new Set<(event: { progress: number }) => void>(), probeExit: 0, exec: vi.fn(), deleted: [] as string[] }))
vi.mock('@/lib/ffmpeg/loader', () => {
  const ffmpeg = {
    on: (_event: string, handler: (event: { progress: number }) => void) => { state.handlers.add(handler) },
    off: (_event: string, handler: (event: { progress: number }) => void) => { state.handlers.delete(handler) },
    exec: state.exec,
    ffprobe: async (args: string[]) => {
      const filename = args[args.indexOf('-o') - 1]
      const metadata = /^(vout|out|aout)_/.test(filename) ? state.output : state.source
      state.probes.set(args[args.length - 1], new TextEncoder().encode(JSON.stringify(metadata)))
      state.probeInputs.set(args[args.length - 1], filename)
      for (const handler of state.handlers) handler({ progress: 0 })
      return state.probeExit
    },
    readFile: async (name: string) => {
      if (/^(vout|out|aout)_/.test(state.probeInputs.get(name) ?? '')) state.inspectedOutput = true
      return state.probes.get(name) ?? state.bytes
    },
    deleteFile: async (name: string) => { state.deleted.push(name) },
  }
  return { getFFmpeg: async () => ffmpeg, writeInputFile: async () => {}, toBytes: (value: Uint8Array) => value, isFFmpegLoaded: () => true, terminateFFmpeg: vi.fn() }
})

function mp4(size: number, mov = false): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size)
  bytes.set([0, 0, 0, 24, ...new TextEncoder().encode(`ftyp${mov ? 'qt  ' : 'isom'}`), 0, 0, 0, 0, ...new TextEncoder().encode('isommp42')])
  return bytes
}
function mp3(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size)
  bytes.set([73, 68, 51, 3, 0, 0, 0, 0, 0, 0])
  return bytes
}
const videoInfo = (width = 320, height = 240) => ({ streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', width, height }, { index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2, sample_rate: '44100' }], format: { duration: '2' } })
const audioInfo = (codec = 'mp3', channels = 2, duration = '2') => ({ streams: [{ index: 0, codec_type: 'audio', codec_name: codec, channels, sample_rate: '44100' }], format: { duration } })
beforeEach(() => {
  state.exec.mockReset().mockImplementation(async () => {
    for (const progress of [0, 0.7, 0.2, 1]) for (const handler of state.handlers) handler({ progress })
    return 0
  })
  state.probes.clear()
  state.probeInputs.clear()
  state.inspectedOutput = false
  state.handlers.clear()
  state.probeExit = 0
  state.deleted.length = 0
  state.source = videoInfo()
  state.output = videoInfo()
  state.bytes = mp4(100)
})

function tinyGif(): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    ...new TextEncoder().encode('GIF89a'), 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255,
    0x21, 0xff, 11, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1, 2, 0, 0,
    0x21, 0xf9, 4, 0, 10, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0, 0x3b,
  ])
}

describe('media progress through inspection, encoding and validation', () => {
  it.each(['video', 'audio', 'gif'] as const)('%s progress stays nondecreasing even when codec events regress', async engine => {
    const progress: { value: number; stage?: string; inspected: boolean }[] = []
    const onProgress = (value: number, stage?: string) => { progress.push({ value, stage, inspected: state.inspectedOutput }) }
    if (engine === 'audio') {
      state.source = audioInfo(); state.output = audioInfo(); state.bytes = mp3(100)
      await processAudio(new File([mp3(1000)], 'sound.mp3'), {}, onProgress)
    } else if (engine === 'video') {
      await compressVideo(new File([mp4(1000)], 'video.mp4'), {}, onProgress)
    } else {
      const gif = tinyGif()
      state.bytes = gif
      const larger = new Uint8Array([...gif.slice(0, -1), 0x21, 0xfe, 64, ...new Array(64).fill(65), 0, 0x3b])
      await compressGif(new File([larger], 'animated.gif'), {}, onProgress)
    }
    expect(progress.every((entry, index) => !index || entry.value >= progress[index - 1].value)).toBe(true)
    expect(progress.filter(entry => entry.value === 100)).toHaveLength(1)
    expect(progress.at(-1)?.value).toBe(100)
    if (engine !== 'gif') expect(progress.at(-1)?.inspected).toBe(true)
    expect(progress.some(entry => /Finishing/.test(entry.stage ?? ''))).toBe(true)
    expect(state.handlers.size).toBe(0)
  })
  it.each(['video', 'audio', 'gif'] as const)('%s never announces completion when output validation fails', async engine => {
    const progress: number[] = []
    const onProgress = (value: number) => { progress.push(value) }
    let operation: Promise<unknown>
    if (engine === 'audio') {
      state.source = audioInfo(); state.output = audioInfo('mp3', 1); state.bytes = mp3(100)
      operation = processAudio(new File([mp3(1000)], 'sound.mp3'), {}, onProgress)
    } else if (engine === 'video') {
      state.output = videoInfo(318, 240)
      operation = compressVideo(new File([mp4(1000)], 'video.mp4'), {}, onProgress)
    } else {
      state.bytes = new Uint8Array([1, 2, 3])
      operation = compressGif(new File([tinyGif()], 'animated.gif'), {}, onProgress)
    }
    await expect(operation).rejects.toThrow()
    expect(progress).not.toContain(100)
    expect(state.handlers.size).toBe(0)
  })
})

describe('video dimension and result policy', () => {
  it('preserves even original dimensions without a scale filter', async () => {
    const result = await compressVideo(new File([mp4(1000)], 'video.mp4'))
    expect(result.outcome).toBe('reduced')
    expect(state.exec.mock.calls[0][0]).not.toContain('-vf')
    expect(result.mimeType).toBe('video/mp4')
    expect(state.deleted.some(name => name.startsWith('probe_'))).toBe(true)
  })
  it('refuses odd dimensions before encoding when Keep original was requested', async () => {
    state.source = videoInfo(321, 241)
    await expect(compressVideo(new File([mp4(1000)], 'odd.mp4'))).rejects.toThrow(/321 × 241.*even dimensions.*explicit Max resolution/)
    expect(state.exec).not.toHaveBeenCalled()
  })
  it('retains an explicit even-pixel resize even when it increases file size', async () => {
    state.source = videoInfo(321, 241)
    state.bytes = mp4(1000)
    const result = await compressVideo(new File([mp4(100)], 'odd.mp4'), { resolution: '720' })
    expect(result.outcome).toBe('resized')
    expect(result.blob.size).toBe(1000)
    expect(state.exec.mock.calls[0][0]).toContain('scale=320:240')
    expect(result.note).toMatch(/rounded down to even pixels/)
  })
  it('retains a larger explicit MOV-to-MP4 conversion with an accurate outcome', async () => {
    state.bytes = mp4(1000)
    const result = await compressVideo(new File([mp4(100, true)], 'source.mov'))
    expect(result.outcome).toBe('converted')
    expect(result.blob.size).toBe(1000)
    expect(result.filename).toMatch(/\.mp4$/)
  })
  it('returns exact original bytes/name for a non-beneficial MP4 reduction', async () => {
    state.bytes = mp4(1000)
    const original = new File([mp4(100)], 'already-efficient.mp4')
    const result = await compressVideo(original)
    expect(result.outcome).toBe('unchanged')
    expect(result.filename).toBe(original.name)
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(new Uint8Array(await original.arrayBuffer()))
  })
  it('rejects an unexpected encoded dimension change', async () => {
    state.output = videoInfo(318, 240)
    await expect(compressVideo(new File([mp4(1000)], 'video.mp4'))).rejects.toThrow(/changed the video dimensions/)
  })
  it('selects the actual video stream rather than an attached cover image', async () => {
    state.source = { streams: [{ index: 0, codec_type: 'video', codec_name: 'mjpeg', width: 600, height: 600, disposition: { attached_pic: 1 } }, { index: 2, codec_type: 'video', codec_name: 'h264', width: 320, height: 240 }, { index: 3, codec_type: 'audio', codec_name: 'aac', channels: 2 }], format: { duration: '2' } }
    await compressVideo(new File([mp4(1000)], 'video.mp4'))
    expect(state.exec.mock.calls[0][0]).toContain('0:2')
  })
})

describe('audio output integrity and conversion policy', () => {
  beforeEach(() => { state.source = audioInfo(); state.output = audioInfo(); state.bytes = mp3(100) })
  it('detects a same-format MP3 from bytes rather than a misleading source suffix', async () => {
    const result = await processAudio(new File([mp3(1000)], 'misnamed.wav'))
    expect(result.outcome).toBe('reduced')
    expect(result.filename).toBe('misnamed-compressed.mp3')
  })
  it('returns original MP3 bytes/name instead of offering a larger re-encode', async () => {
    state.bytes = mp3(1000)
    const source = new File([mp3(100)], 'small.mp3')
    const result = await processAudio(source)
    expect(result.outcome).toBe('unchanged')
    expect(result.filename).toBe('small.mp3')
    expect(await result.blob.arrayBuffer()).toEqual(await source.arrayBuffer())
  })
  it('preserves a genuine WAV-to-MP3 conversion even if a tiny source grows', async () => {
    const wav = new Uint8Array(100)
    wav.set([...new TextEncoder().encode('RIFF'), 92, 0, 0, 0, ...new TextEncoder().encode('WAVE')])
    state.source = audioInfo('pcm_s16le')
    state.bytes = mp3(1000)
    const result = await processAudio(new File([wav], 'tiny.wav'))
    expect(result.outcome).toBe('converted')
    expect(result.filename).toBe('tiny.mp3')
    expect(result.blob.size).toBe(1000)
  })
  it('does not offer an output with the wrong real format', async () => {
    state.bytes = mp4(100)
    await expect(processAudio(new File([mp3(1000)], 'sound.mp3'))).rejects.toThrow(/wrong output format/)
  })
  it('refuses an output which loses audio channels', async () => {
    state.output = audioInfo('mp3', 1)
    await expect(processAudio(new File([mp3(1000)], 'stereo.mp3'))).rejects.toThrow(/stream integrity/)
  })
  it('refuses an output with a materially shortened duration', async () => {
    state.source = audioInfo('mp3', 2, '5')
    await expect(processAudio(new File([mp3(1000)], 'sound.mp3'))).rejects.toThrow(/duration changed/)
  })
  it('accepts the pinned-core -1 sentinel only with valid fresh inspection JSON', async () => {
    state.probeExit = -1
    const result = await processAudio(new File([mp3(1000)], 'sound.mp3'))
    expect(result.outcome).toBe('reduced')
  })
  it('rejects empty stream data even when the core returns the -1 sentinel', async () => {
    state.probeExit = -1
    state.source = { streams: [], format: {} }
    await expect(processAudio(new File([mp3(1000)], 'sound.mp3'))).rejects.toThrow(/no supported streams/)
    expect(state.exec).not.toHaveBeenCalled()
  })
  it('rejects a real probe error even if a JSON payload exists', async () => {
    state.probeExit = 1
    await expect(processAudio(new File([mp3(1000)], 'sound.mp3'))).rejects.toThrow(/could not be inspected/)
    expect(state.exec).not.toHaveBeenCalled()
  })
})
