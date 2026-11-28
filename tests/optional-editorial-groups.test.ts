import { describe, expect, it } from 'vitest'
import { parseEditorialContent, parsePublishedPost } from '@/lib/content'
import { postAuthor, postImage } from '@/lib/blog'
import { ORGANIZATION_NAME } from '@/lib/seo'
import { collections } from '../tina/collections.mjs'
import { editorialFieldPublicationError } from '../tina/editorial-policy.mjs'

const article = {
  published: true, title: 'Choosing an output', description: 'Compare the real result.',
  date: '2026-11-21', readingTime: '3 min', figure: 'pipeline',
  body: [{ _template: 'p', text: 'Keep the original until the result has been checked.' }],
}
const editorial = { heading: 'About these tools', introduction: 'Process a supported file on your device.' }
type GroupField = {
  name: string
  type?: string
  list?: boolean
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
  it('keeps shared body-template scalar types compatible with Tina generated GraphQL fragments', () => {
    const signatures = new Map<string, Set<string>>()
    for (const template of group('post', 'body').templates ?? []) {
      for (const field of template.fields) {
        if (field.type === 'object') continue
        const scalar = ['string', 'image', 'datetime', 'reference'].includes(field.type || '') ? 'String' : field.type
        const signature = `${field.list ? `[${scalar}]` : scalar}${field.required ? '!' : ''}`
        const variants = signatures.get(field.name) ?? new Set<string>()
        variants.add(signature)
        signatures.set(field.name, variants)
      }
    }
    for (const [name, variants] of signatures) expect([...variants], `GraphQL types for body field ${name}`).toHaveLength(1)
    expect([...signatures.get('caption')!]).toEqual(['String'])
    const caption = group('post', 'body').templates?.find(template => template.name === 'figure')?.fields.find(field => field.name === 'caption')
    expect(caption?.ui?.validate?.('')).toMatch(/caption/)
    expect(caption?.ui?.validate?.('A real illustration caption.')).toBeUndefined()
    expect(() => parsePublishedPost({ ...article, body: [{ _template: 'figure', figure: 'pipeline', caption: '' }] }, 'missing-figure-caption')).toThrow('caption')
  })

  it('requires article content when publishing while allowing unfinished drafts and archived posts', () => {
    const body = group('post', 'body')
    expect(body.ui?.validate).toBeUndefined()
    const validate = (value: unknown, values?: Record<string, unknown>) => editorialFieldPublicationError(body, value, values)
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
      expect(field.ui?.validate).toBeUndefined()
      expect(editorialFieldPublicationError(field, {})).toBeUndefined()
    }
    expect(editorialFieldPublicationError(image, { src: '/uploads/output.png', alt: '' })).toMatch(/alternative text/)
    expect(editorialFieldPublicationError(image, { src: '', alt: '', caption: '' })).toBeUndefined()
    expect(editorialFieldPublicationError(image, { src: '/uploads/output.png', alt: 'Comparison' })).toBeUndefined()
    expect(editorialFieldPublicationError(author, { url: '/about' })).toMatch(/author name/)
    expect(editorialFieldPublicationError(author, { name: '', kind: '', url: '' })).toBeUndefined()
    expect(editorialFieldPublicationError(hero, { lead: 'Only a headline' })).toMatch(/Complete/)
    expect(editorialFieldPublicationError(hero, { lead: '', emphasis: '', description: '' })).toBeUndefined()
    const bodyImage = group('post', 'body').templates?.find(template => template.name === 'image')
    expect(bodyImage?.fields.find(field => field.name === 'src')?.required).toBe(true)
    expect(bodyImage?.fields.find(field => field.name === 'alt')?.required).toBe(true)
  })
})
