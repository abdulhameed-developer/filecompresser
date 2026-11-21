import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { checkUploads, isRasterSignature, MAX_UPLOAD_BYTES } from '../scripts/check-uploads.mjs'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const temporary: string[] = []
afterEach(async () => { await Promise.all(temporary.splice(0).map(directory => rm(directory, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'filecompresser-uploads-'))
  temporary.push(root)
  await mkdir(path.join(root, 'public/uploads'), { recursive: true })
  return root
}

describe('repository media upload checks', () => {
  it('accepts real raster images with ordinary spaces and Unicode filenames', async () => {
    const root = await fixture()
    await mkdir(path.join(root, 'public/uploads/guides'))
    await writeFile(path.join(root, 'public/uploads/guides/ایک photo.png'), png)
    expect(await checkUploads(root)).toEqual([{ path: 'guides/ایک photo.png', size: png.length }])
  })
  it.each(['bad.svg', 'bad.html', 'bad.js', 'bad.png.exe'])('refuses executable or document upload %s', async name => {
    const root = await fixture()
    await writeFile(path.join(root, 'public/uploads', name), '<script>alert(1)</script>')
    await expect(checkUploads(root)).rejects.toThrow(/Unsupported upload/)
  })
  it('refuses HTML or SVG disguised with a raster file extension', async () => {
    const root = await fixture()
    await writeFile(path.join(root, 'public/uploads/renamed.png'), '<svg onload="alert(1)"></svg>')
    await expect(checkUploads(root)).rejects.toThrow(/does not match/)
  })
  it('rejects images over the per-file limit before reading them', async () => {
    const root = await fixture()
    const image = path.join(root, 'public/uploads/large.png')
    await writeFile(image, png)
    await truncate(image, MAX_UPLOAD_BYTES + 1)
    await expect(checkUploads(root)).rejects.toThrow(/at most 10 MiB/)
  })
  it('never follows a media file symlink', async () => {
    const root = await fixture()
    await writeFile(path.join(root, 'outside.png'), png)
    await symlink(path.join(root, 'outside.png'), path.join(root, 'public/uploads/linked.png'))
    await expect(checkUploads(root)).rejects.toThrow(/symbolic links/)
  })
  it('never follows a symlink used as the media folder', async () => {
    const root = await fixture()
    await rm(path.join(root, 'public/uploads'), { recursive: true })
    await mkdir(path.join(root, 'outside'))
    await symlink(path.join(root, 'outside'), path.join(root, 'public/uploads'))
    await expect(checkUploads(root)).rejects.toThrow(/symbolic links/)
  })
  it('distinguishes AVIF images from an MP4 file sharing the ftyp container', () => {
    const avif = Buffer.alloc(24)
    avif.writeUInt32BE(24)
    avif.write('ftyp', 4)
    avif.write('avif', 8)
    expect(isRasterSignature(avif, '.avif')).toBe(true)
    const video = Buffer.from(avif)
    video.write('mp42', 8)
    expect(isRasterSignature(video, '.avif')).toBe(false)
  })
})
