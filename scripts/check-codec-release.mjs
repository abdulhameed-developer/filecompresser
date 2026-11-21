import { assertVerifiedCodecRelease } from './codec-assets.mjs'

await assertVerifiedCodecRelease()
console.log('Paired codec/source release pins are configured. The build will verify the downloaded archive and selected assets.')
