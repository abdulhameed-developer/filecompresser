import { describe, expect, it } from 'vitest'
import { parseEditorialContent, parsePublishedPost } from '@/lib/content'
import { postAuthor, postImage } from '@/lib/blog'
import { ORGANIZATION_NAME } from '@/lib/seo'
import { collections } from '../tina/collections.mjs'

const article = {
  published: true, title: 'Choosing an output', description: 'Compare the real result.',
  date: '2026-11-21', readingTime: '3 min', figure: 'pipeline',
  body: [{ _template: 'p', text: 'Keep the original until the result has been checked.' }],
}
const editorial = { heading: 'About these tools', introduction: 'Process a supported file on your device.' }
type GroupField = {
  name: string
  required?: boolean
  fields?: GroupField[]
  templates?: { name: string; fields: GroupField[] }[]
  ui?: { validate?: (value: unknown, values?: Record<string, unknown>) => string | undefined }
}
const group = (collectionName: string, fieldName: string): GroupField => {
  const collection = collections.find(value => value.name === collectionName) as unknown as { fields: GroupField[] }
  const field = collection.fields.find(value => value.name === fieldName)
  if (!field) throw new Error(`Missing editor group ${collectionName}.${fieldName}`)
  return field
}

describe('clearing optional editor groups', () => {
  it('requires article content when publishing while allowing unfinished drafts and archived posts', () => {
    const validate = group('post', 'body').ui?.validate
    expect(validate).toBeTypeOf('function')
    expect(validate?.([], { published: true, archived: false })).toMatch(/content block before publishing/)
    expect(validate?.(undefined, { published: true })).toMatch(/content block before publishing/)
    expect(validate?.([], { published: false })).toBeUndefined()
    expect(validate?.(undefined, {})).toBeUndefined()
    expect(validate?.([], { published: true, archived: true })).toBeUndefined()
    expect(validate?.([], { published: false, archived: true })).toBeUndefined()
    expect(validate?.(article.body, { published: true, archived: false })).toBeUndefined()
  })

  it('turns wholly cleared author and image groups back into the existing fallbacks', () => {
    const post = parsePublishedPost({ ...article,
      featuredImage: { src: '', alt: null, caption: '   ' },
      author: { name: '', kind: '', url: null },
    }, 'cleared-groups')!
    expect(post.featuredImage).toBeUndefined()
    expect(post.author).toBeUndefined()
    expect(postImage(post).src).toBe('/blog/pipeline.jpg')
    expect(postAuthor(post)).toEqual({ name: ORGANIZATION_NAME, url: '/', kind: 'Organization' })
    expect(parsePublishedPost({ ...article, featuredImage: {}, author: {} }, 'empty-groups')!.author).toBeUndefined()
  })

  it('continues to reject partially filled author/image groups and empty inline images', () => {
    expect(() => parsePublishedPost({ ...article, featuredImage: { src: '/uploads/output.png', alt: '' } }, 'missing-alt')).toThrow('alt')
    expect(() => parsePublishedPost({ ...article, featuredImage: { alt: 'An output comparison.' } }, 'missing-image')).toThrow('src')
    expect(() => parsePublishedPost({ ...article, author: { name: '', url: '/about' } }, 'missing-author')).toThrow('name')
    expect(() => parsePublishedPost({ ...article, author: { kind: 'Person' } }, 'author-type-only')).toThrow('name')
    expect(() => parsePublishedPost({ ...article, body: [{ _template: 'image', src: '', alt: '' }] }, 'empty-body-image')).toThrow('src')
  })

  it('clears the optional homepage introduction while retaining validation for partial content', () => {
    expect(parseEditorialContent({ ...editorial, hero: { lead: '', emphasis: null, description: ' ' } }, 'home').hero).toBeUndefined()
    expect(parseEditorialContent({ ...editorial, hero: {} }, 'home').hero).toBeUndefined()
    expect(() => parseEditorialContent({ ...editorial, hero: { lead: 'Smaller files.' } }, 'home')).toThrow('emphasis')
    expect(parseEditorialContent({ ...editorial, hero: { lead: 'Smaller files.', emphasis: 'On your device.', description: 'Choose a file to begin.' } }, 'home').hero?.lead).toBe('Smaller files.')
  })

  it('allows optional editor groups to be entered and cleared without unconditional child-required errors', () => {
    const image = group('post', 'featuredImage')
    const author = group('post', 'author')
    const hero = group('homepage', 'hero')
    for (const field of [image, author, hero]) {
      expect(field.fields?.every(child => !child.required)).toBe(true)
      expect(field.ui?.validate?.({})).toBeUndefined()
    }
    expect(image.ui?.validate?.({ src: '/uploads/output.png', alt: '' })).toMatch(/alternative text/)
    expect(image.ui?.validate?.({ src: '', alt: '', caption: '' })).toBeUndefined()
    expect(image.ui?.validate?.({ src: '/uploads/output.png', alt: 'Comparison' })).toBeUndefined()
    expect(author.ui?.validate?.({ url: '/about' })).toMatch(/author name/)
    expect(author.ui?.validate?.({ name: '', kind: '', url: '' })).toBeUndefined()
    expect(hero.ui?.validate?.({ lead: 'Only a headline' })).toMatch(/Complete/)
    expect(hero.ui?.validate?.({ lead: '', emphasis: '', description: '' })).toBeUndefined()
    const bodyImage = group('post', 'body').templates?.find(template => template.name === 'image')
    expect(bodyImage?.fields.find(field => field.name === 'src')?.required).toBe(true)
    expect(bodyImage?.fields.find(field => field.name === 'alt')?.required).toBe(true)
  })
})
