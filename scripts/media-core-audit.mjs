/**
 * Execute the real video/audio orchestration against the shipped WASM core in
 * Node/V8, then independently probe and decode every output with native FFmpeg.
 * This is codec evidence, not browser UI or real-device certification.
 *
 * PW_TOOLS=/path/to/isolated/qa node scripts/media-core-audit.mjs [recording.webm]
 * Only the 18 low-sample-rate bitrate boundaries:
 * PW_TOOLS=/path/to/isolated/qa MEDIA_CASE_FILTER='Low-rate WAV' MEDIA_AUDIT_REPORT=audio-low-rate-core-audit.json node scripts/media-core-audit.mjs
 * QA tools: ffmpeg-static, ffprobe-static. esbuild is a local development tool.
 * Fixtures/results stay outside public/ and are never uploaded.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = process.cwd()
const qa = createRequire(path.join(process.env.PW_TOOLS || path.join(process.env.HOME, 'pwtools'), 'qa.cjs'))
const nativeFfmpeg = process.env.FFMPEG_PATH || qa('ffmpeg-static')
const nativeFfprobe = process.env.FFPROBE_PATH || qa('ffprobe-static').path
const directory = mkdtempSync(path.join(tmpdir(), 'filecompresser-media-core-'))
const evidenceDirectory = path.resolve(process.env.QA_RESULTS || '.qa-results')
mkdirSync(evidenceDirectory, { recursive: true })
const generate = (name, args) => {
  const file = path.join(directory, name)
  execFileSync(nativeFfmpeg, ['-v', 'error', '-y', ...args, file], { timeout: 30000 })
  return file
}
const sourceVideo = ['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=12', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1.5']
const vp8 = generate('vp8.webm', [...sourceVideo, '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus'])
const vp9 = generate('vp9.webm', [...sourceVideo, '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus'])
const vfr = generate('unknown-duration-vfr.webm', ['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=12', '-t', '1.5', '-vf', 'select=not(eq(mod(n\\,3)\\,1))', '-fps_mode', 'vfr', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-live', '1'])
const compatible = generate('compatible-recording.webm', [...sourceVideo, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'matroska', '-live', '1'])
const mp4 = generate('video.mp4', [...sourceVideo, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac'])
const mov = generate('video.mov', ['-i', mp4, '-c', 'copy'])
const hevc = generate('hevc.mp4', ['-i', mp4, '-c:v', 'libx265', '-crf', '40', '-preset', 'ultrafast', '-x265-params', 'pools=none:frame-threads=1:log-level=error', '-c:a', 'copy', '-threads', '1'])
const vp9Mp4 = generate('vp9.mp4', ['-i', mp4, '-c:v', 'libvpx-vp9', '-crf', '42', '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'copy', '-threads', '1'])
const portrait = generate('portrait.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=480x720:rate=8', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '0.5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac'])
const oddPortrait = generate('odd-portrait.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=321x481:rate=8', '-t', '0.5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv444p'])
const gif = generate('animation.gif', ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=8', '-t', '1', '-loop', '2'])
const unoptimizedGif = generate('animation-unoptimized.gif', ['-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=8', '-t', '1', '-gifflags', '0', '-loop', '2'])
const wav = generate('audio.wav', ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '2', '-ac', '2'])
const mp3 = generate('audio.mp3', ['-i', wav, '-c:a', 'libmp3lame', '-b:a', '192k'])
const lowRateWavs = new Map([8000, 16000, 22050].map(rate => [rate, generate(`audio-${rate}.wav`, ['-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=${rate}`, '-t', '1', '-ac', '2'])]))

const base = path.join(root, 'public/ffmpeg-core')
const manifest = JSON.parse(readFileSync(path.join(base, 'wasm-manifest.json'), 'utf8'))
const wasm = Buffer.concat(manifest.chunks.map(chunk => readFileSync(path.join(base, chunk.file))))
assert.equal(createHash('sha256').update(wasm).digest('hex'), manifest.sha256, 'Audit the exact shipped core')
// The shipped Emscripten build targets browser Workers. Supplying its actual
// WASM bytes and a location shim lets Node run the same binary without fetch.
globalThis.self = { location: { href: pathToFileURL(path.join(base, 'ffmpeg-core.js')).href } }
const createCore = (await import('data:text/javascript;base64,' + readFileSync(path.join(base, 'ffmpeg-core.js')).toString('base64'))).default
const loadStarted = performance.now()
const core = await createCore({ wasmBinary: wasm })
const loadMs = Math.round(performance.now() - loadStarted)
const progressHandlers = new Set()
const codecLogs = []
core.setLogger(entry => { if (codecLogs.length < 200) codecLogs.push(entry) })
core.setProgress(event => { for (const handler of progressHandlers) handler(event) })
let alive = true
const adapter = {
  on: (_type, handler) => progressHandlers.add(handler),
  off: (_type, handler) => progressHandlers.delete(handler),
  ffprobe: async (args, timeout) => { core.setTimeout(timeout); try { return core.ffprobe(...args) } finally { core.reset() } },
  exec: async (args, timeout) => { core.setTimeout(timeout); try { return core.exec(...args) } finally { core.reset() } },
  readFile: async name => core.FS.readFile(name),
  deleteFile: async name => core.FS.unlink(name),
}
globalThis.__filecompresserMediaAudit = { adapter, get alive() { return alive }, terminate: () => { alive = false }, write: async (name, file) => core.FS.writeFile(name, new Uint8Array(await file.arrayBuffer())) }
// Bundle the source engines, replacing only the Worker transport with a direct
// adapter. Input validation, command construction, progress, result policy and
// output integrity checks remain the production implementations.
const bundle = path.join(directory, 'engines.mjs')
await build({
  stdin: { contents: `export { compressVideo } from './lib/engines/video'; export { processAudio } from './lib/engines/audio'; export { compressGif } from './lib/engines/gif';`, resolveDir: root },
  bundle: true, platform: 'node', format: 'esm', outfile: bundle,
  plugins: [{ name: 'direct-wasm-transport', setup(builder) {
    builder.onLoad({ filter: /lib\/ffmpeg\/loader\.ts$/ }, () => ({ contents: `
      const audit = globalThis.__filecompresserMediaAudit;
      export const getFFmpeg = async () => audit.adapter;
      export const terminateFFmpeg = async () => audit.terminate();
      export const isFFmpegLoaded = () => audit.alive;
      export const toBytes = value => value;
      export const writeInputFile = async (_ffmpeg, name, file) => audit.write(name, file);
    `, loader: 'js' }))
  } }],
})
const engines = await import(pathToFileURL(bundle).href)
const nativeProbe = file => JSON.parse(execFileSync(nativeFfprobe, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file], { timeout: 30000 }).toString())
const frameHashes = file => execFileSync(nativeFfmpeg, ['-v', 'error', '-i', file, '-map', '0:v:0', '-fps_mode', 'passthrough', '-enc_time_base', '-1', '-f', 'framemd5', '-'], { timeout: 30000 }).toString().split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim())
const cases = [
  { name: 'VP8 + Opus → H.264 + AAC', file: vp8, conversion: true },
  { name: 'VP9 + Opus → H.264 + AAC', file: vp9, conversion: true },
  { name: 'Unknown-duration VFR VP9 → H.264', file: vfr, conversion: true },
  { name: 'Compatible H.264 + AAC remux', file: compatible, conversion: true, remux: true },
  { name: 'MP4 compression', file: mp4 },
  { name: 'MOV → MP4', file: mov },
  { name: 'HEVC MP4 → compatible H.264 MP4', file: hevc, compatibilityConversion: true },
  { name: 'VP9 MP4 → compatible H.264 MP4', file: vp9Mp4, compatibilityConversion: true },
  ...['recommended', 'maximum'].flatMap(level => ['original', '1080', '720', '480'].map(resolution => ({ name: `Portrait video ${level}, ${resolution}`, file: portrait, options: { level, resolution }, expectedDimensions: resolution === '480' ? [320, 480] : [480, 720] }))),
  { name: 'Odd portrait rounds down to even pixels only for explicit 480 cap', file: oddPortrait, options: { resolution: '480' }, expectedDimensions: [320, 480] },
  { name: 'Odd portrait original dimensions rejected without unrequested resizing', file: oddPortrait, expectedError: /even dimensions/ },
  ...['recommended', 'maximum'].map(level => ({ name: `GIF ${level}`, file: gif, gif: true, options: { level } })),
  ...['recommended', 'maximum'].map(level => ({ name: `Unoptimized GIF ${level}`, file: unoptimizedGif, gif: true, options: { level } })),
  { name: 'WAV → MP3', file: wav, audio: true },
  ...['128k', '192k', '256k', '320k'].map(bitrate => ({ name: `WAV → MP3 at ${bitrate.replace('k', '')} kbps`, file: wav, audio: true, bitrate })),
  { name: 'MP3 compression', file: mp3, audio: true },
  ...[8000, 16000, 22050].flatMap(rate => [96, 128, 160, 192, 256, 320].map(bitrate => ({ name: `Low-rate WAV ${rate} Hz → ${bitrate} kbps MP3`, file: lowRateWavs.get(rate), audio: true, bitrate: `${bitrate}k`, sourceRate: rate, expectedSampleRate: Math.max(rate, bitrate > 160 ? 32000 : 16000) }))),
]
if (process.argv[2]) cases.push({ name: 'Provided screen recording → MP4', file: path.resolve(process.argv[2]), conversion: true, remux: true })
const results = []
const caseFilter = process.env.MEDIA_CASE_FILTER
const selectedCases = caseFilter ? cases.filter(test => test.name.includes(caseFilter)) : cases
assert(selectedCases.length > 0, 'The media case filter must select at least one test')
for (const test of selectedCases) {
  try {
    const input = new File([readFileSync(test.file)], path.basename(test.file), { type: test.gif ? 'image/gif' : test.audio ? test.file.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg' : test.conversion ? 'video/webm' : test.file.endsWith('.mov') ? 'video/quicktime' : 'video/mp4' })
    const progress = []
    const onProgress = (percent, stage) => progress.push({ percent, stage })
    const processingStarted = performance.now()
    const operation = test.gif ? engines.compressGif(input, test.options, onProgress) : test.audio ? engines.processAudio(input, { bitrate: test.bitrate || '96k' }, onProgress) : engines.compressVideo(input, { allowWebm: test.conversion, ...test.options }, onProgress)
    if (test.expectedError) {
      await assert.rejects(operation, test.expectedError)
      results.push({ name: test.name, pass: true, expectedRejection: String(test.expectedError), outputVerified: false })
      console.log('PASS', test.name, '(expected rejection)')
      continue
    }
    const output = await operation
    const durationMs = output.durationMs ?? Math.round(performance.now() - processingStarted)
    const outputPath = path.join(directory, `output-${results.length}-${output.filename}`)
    writeFileSync(outputPath, new Uint8Array(await output.blob.arrayBuffer()))
    const before = nativeProbe(test.file)
    const after = nativeProbe(outputPath)
    if (test.gif) {
      const original = before.streams.find(stream => stream.codec_type === 'video')
      const encoded = after.streams.find(stream => stream.codec_type === 'video')
      assert.equal(encoded.codec_name, 'gif')
      assert.equal(original.width, encoded.width)
      assert.equal(original.height, encoded.height)
      assert.equal(original.nb_read_frames, encoded.nb_read_frames)
      const loopCount = file => { const bytes = readFileSync(file); const index = bytes.indexOf(Buffer.from('NETSCAPE2.0')); return index >= 0 ? bytes.readUInt16LE(index + 13) : -1 }
      assert.equal(loopCount(test.file), loopCount(outputPath), 'GIF loop count preserved')
    } else if (test.audio) {
      const original = before.streams.find(stream => stream.codec_type === 'audio')
      const encoded = after.streams.find(stream => stream.codec_type === 'audio')
      assert.equal(encoded.codec_name, 'mp3')
      assert.equal(original.channels, encoded.channels)
      assert.equal(Number(encoded.bit_rate), Number((test.bitrate || '96k').replace('k', '')) * 1000)
      if (test.expectedSampleRate) {
        assert.equal(Number(encoded.sample_rate), test.expectedSampleRate)
        assert.match(output.note, new RegExp(`at ${test.bitrate.replace('k', '')} kbps`))
        if (test.expectedSampleRate !== test.sourceRate) assert.match(output.note, /Resampling does not restore missing detail/)
      }
    } else {
      const original = before.streams.find(stream => stream.codec_type === 'video')
      const encoded = after.streams.find(stream => stream.codec_type === 'video')
      assert.equal(encoded.codec_name, 'h264')
      assert.equal(encoded.width, test.expectedDimensions?.[0] ?? original.width)
      assert.equal(encoded.height, test.expectedDimensions?.[1] ?? original.height)
      if (test.expectedDimensions) { assert(encoded.width <= original.width); assert(encoded.height <= original.height) }
      assert.equal(original.nb_read_frames, encoded.nb_read_frames, 'No missing or duplicated frames')
      const audioBefore = before.streams.filter(stream => stream.codec_type === 'audio')
      const audioAfter = after.streams.filter(stream => stream.codec_type === 'audio')
      assert.equal(audioAfter.length, audioBefore.length)
      audioAfter.forEach((stream, index) => { assert.equal(stream.codec_name, 'aac'); assert.equal(stream.channels, audioBefore[index].channels) })
    }
    if (before.format.duration) assert(Math.abs(Number(before.format.duration) - Number(after.format.duration)) < .25, 'Duration preserved')
    // Preserve VFR timestamps while independently decoding too; the null muxer
    // otherwise rounds close screen-capture frames to a guessed constant rate.
    execFileSync(nativeFfmpeg, ['-v', 'error', '-i', outputPath, '-fps_mode', 'passthrough', '-enc_time_base', '-1', '-f', 'null', '-'], { timeout: 30000 })
    assert.equal(progress.at(-1)?.percent, 100)
    assert.equal(progressHandlers.size, 0, 'Progress subscriptions cleaned up')
    if (test.remux) {
      assert.match(output.note, /without re-encoding/)
      assert.deepEqual(frameHashes(outputPath), frameHashes(test.file), 'Remux preserves every decoded video frame exactly')
    }
    if (test.compatibilityConversion) assert.equal(output.outcome, 'converted', 'Compatibility must not silently return incompatible original codecs')
    const summary = { name: test.name, pass: true, outputVerified: true, inputBytes: input.size, outputBytes: output.blob.size, durationMs, outcome: output.outcome, note: output.note, progress: progress.filter((item, index) => !index || item.stage !== progress[index - 1].stage), before, after, outputPath }
    results.push(summary)
    console.log('PASS', test.name, JSON.stringify({ durationMs, inputBytes: input.size, outputBytes: output.blob.size, outcome: output.outcome }))
  } catch (error) {
    results.push({ name: test.name, pass: false, error: String(error) })
    console.error('FAIL', test.name, String(error))
  }
}
const sourceHashes = Object.fromEntries(['lib/engines/video.ts', 'lib/engines/audio.ts', 'lib/engines/media-inspection.ts'].map(file => [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')]))
const report = { generatedAt: new Date().toISOString(), runtime: 'Direct shipped WASM in Node/V8 with production engine orchestration; browser UI not covered', wasmSha256: manifest.sha256, sourceHashes, caseFilter, loadMs, fixtureDirectory: directory, results, pass: results.every(item => item.pass) }
const reportName = process.env.MEDIA_AUDIT_REPORT || 'media-core-audit.json'
assert(/^[a-z0-9-]+\.json$/.test(reportName), 'Use a plain JSON report filename')
const reportPath = path.join(evidenceDirectory, reportName)
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
console.log('Evidence:', reportPath)
if (!report.pass) process.exitCode = 1
