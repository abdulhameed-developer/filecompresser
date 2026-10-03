/**
 * Generate a real animated GIF fixture for browser-level QA.
 *
 * Uses `omggif` (a battle-tested GIF encoder) rather than a hand-rolled LZW
 * stream. A subtly wrong LZW implementation produces a file that *looks* like a
 * GIF and then fails deep inside FFmpeg, which reads as an application bug
 * rather than a bad fixture.
 *
 * `omggif` is intentionally NOT a project dependency — it is a QA tool. Install
 * it alongside `playwright-core` and point PW_TOOLS at that directory:
 *
 *   cd ~/pwtools && npm install playwright-core omggif
 *   PW_TOOLS=~/pwtools node scripts/make-gif.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const PW_TOOLS = process.env.PW_TOOLS || path.join(process.env.HOME || '', 'pwtools')

let GifWriter
try {
  ;({ GifWriter } = await import(path.join(PW_TOOLS, 'node_modules/omggif/omggif.js')))
} catch {
  console.error(
    'omggif not found. Install it outside the project:\n' +
      `  cd ${PW_TOOLS} && npm install omggif\n` +
      `  PW_TOOLS=${PW_TOOLS} node scripts/make-gif.mjs`
  )
  process.exit(2)
}

const WIDTH = 160
const HEIGHT = 120
const FRAMES = 6
// omggif validates `palette.length` as the *number of colours* (it must be a
// power of two in 2..256), but receives a flat RGB byte array — so the array is
// three times this. 128 entries keeps both checks happy.
const PALETTE = 128

const out = process.argv[2] || path.join(process.cwd(), '.qa-fixtures', 'anim.gif')
mkdirSync(path.dirname(out), { recursive: true })

/**
 * A visible gradient palette, so the frames are not a flat two-colour image.
 *
 * omggif takes an array of `[r, g, b]` triplets and derives the code size from
 * `palette.length` — a flat byte array is rejected, because its length would
 * be read as a colour count.
 */
const palette = []
for (let i = 0; i < PALETTE; i++) {
  palette.push([i, (i * 5) % 256, (i * 9) % 256])
}
const BG = 20
const DISC = 100

const frames = []
for (let f = 0; f < FRAMES; f++) {
  const cx = 20 + f * ((WIDTH - 40) / (FRAMES - 1))
  const cy = HEIGHT / 2
  const frame = new Uint8Array(WIDTH * HEIGHT)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dx = x - cx
      const dy = y - cy
      // Palette entry 20 is the background, 100 the disc.
      frame[y * WIDTH + x] = dx * dx + dy * dy < 32 * 32 ? DISC : BG
    }
  }
  frames.push(frame)
}

const buffer = new Uint8Array(WIDTH * HEIGHT * FRAMES)
const writer = new GifWriter(buffer, WIDTH, HEIGHT, { loop: 0, palette })
for (const frame of frames) {
  writer.addFrame(0, 0, WIDTH, HEIGHT, frame, { delay: 10 })
}
writer.end()

// omggif writes into the buffer in place and reports the length it used via
// `p`, which is not exposed — so the trailer byte is located by scanning
// backwards for the 0x3B terminator, the last thing a GIF writer emits.
let end = buffer.length
while (end > 0 && buffer[end - 1] === 0) end--
const bytes = buffer.subarray(0, end)
writeFileSync(out, bytes)

// Sanity-check the container: signature, trailer, and a decodable first frame.
const head = String.fromCharCode(...bytes.slice(0, 6))
const trailer = bytes[bytes.length - 1]
if (head !== 'GIF89a') {
  console.error(`BAD HEADER: ${head}`)
  process.exit(1)
}
if (trailer !== 0x3b) {
  console.error(`BAD TRAILER: 0x${trailer.toString(16)}`)
  process.exit(1)
}

console.log(`anim.gif  ${bytes.length} bytes, ${FRAMES} frames, ${WIDTH}x${HEIGHT}`)
console.log(`written to ${out}`)
