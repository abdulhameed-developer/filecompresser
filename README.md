# FileCompresser.com

Private, browser-based file compression and conversion.

Website: [https://filecompresser.com](https://filecompresser.com)

## Overview

FileCompresser processes files **in the browser**. Supported tools do not upload your files to our servers. Heavy engines (FFmpeg WASM, PDF.js workers, HEIC conversion) are lazy-loaded only on pages that need them, and are served from this site’s own origin.

## Supported tools

### Compression
- Image: JPG/JPEG, PNG, WEBP (`/image-compressor`, `/jpg-compressor`, `/jpeg-compressor`, `/png-compressor`, `/webp-compressor`)
- GIF optimization (`/gif-compressor`)
- Video MP4/MOV → MP4 (`/video-compressor`) with quality + max-resolution controls
- MP3 bitrate reduction (`/mp3-compressor`)
- WAV → MP3 conversion (`/wav-compressor`) — honest wording: WAV is converted, not “losslessly compressed”
- PDF optimization (`/pdf-compressor`) — metadata strip + structure rewrite; already-optimized PDFs may not shrink
- ZIP create (`/zip-compressor`) and ZIP extract (`/archive-compressor`)
- Smart homepage compressor (`/compress` and `/`)

### Converters (genuine)
- Image format conversion, WEBP↔PNG/JPG, JFIF→PNG
- HEIC→JPG/PNG/PDF
- SVG→PNG/JPG/WEBP
- JPG/PNG/WEBP→PDF, PDF→JPG
- Video→MP4, MOV→MP4
- Audio MP3↔WAV, MP4/Video→MP3

### Not implemented (unreliable in-browser)
- PDF→Word, PDF→EPUB, EPUB→PDF, DOCX→PDF, PNG→SVG tracing

## Architecture

```
app/                 Next.js App Router pages (+ global Header/Footer in layout)
components/          Dropzone, queue UI, workspace, chrome
lib/
  engines/           Image, video, audio, gif, pdf, zip, heic
  ffmpeg/            Lazy FFmpeg WASM loader (same-origin core)
  validation.ts      Magic-byte validation + archive path safety
  process.ts         Engine dispatcher + concurrency
  useFileQueue.ts    Batch queue: validate → process → download
  tools.ts           Tool registry / SEO metadata
```

### Processing states
`queued` → `validating` → `processing` → `completed` | `failed` | `cancelled`

Concurrency: 2 for images, 1 for FFmpeg/PDF/ZIP/collective work.

## Privacy model

Client-side tools process files locally. Privacy copy only claims browser-side processing for tools that truly run client-side. There is no “deleted after 1 hour” claim because files are not uploaded.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production build

```bash
npm run build
npm start
```

## Testing / verification

```bash
npm test          # vitest (validation, ZIP security, image helpers)
npm run typecheck
npm run lint
npm run build
npm audit
# or everything:
npm run verify
```

## Environment variables

Optional:

- `NEXT_PUBLIC_SITE_URL` — canonical site origin (defaults to `https://filecompresser.com`)

## Browser limitations

- FFmpeg WASM needs a modern browser and enough RAM; large videos may fail on mobile.
- HEIC conversion depends on `heic2any` / browser support.
- PDF optimization is structural (metadata + rewrite); it does not rasterize pages or recompress embedded photos.
- First media operation downloads the FFmpeg core (~30 MB) from this site into a blob URL (your files themselves are never uploaded).

## Security

- Magic-byte validation for common formats
- ZIP path traversal rejection (`../`, absolute paths, null bytes, Windows reserved names)
- Archive bomb guards (entry count, uncompressed size, ratio)
- Security headers including a CSP compatible with WASM workers and blob URLs

## License

Private project — all rights reserved unless otherwise stated.
