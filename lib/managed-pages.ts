/** Known public documents, read for rendering and emitted as escaped text. */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Metadata } from 'next'
import type { IconName } from '@/components/Icon'
import { pageMetadata } from './seo'

export const MANAGED_PAGE_SLUGS = ['about', 'contact', 'privacy', 'terms', 'disclaimer', 'blog'] as const
export type ManagedPageSlug = typeof MANAGED_PAGE_SLUGS[number]
export interface ManagedLink { label: string; href: string }
export interface ManagedSection {
  heading: string
  placement: 'card' | 'detail' | 'text'
  body: string[]
  items: string[]
  icon?: IconName
  label?: string
  links: ManagedLink[]
}
export interface ManagedPage {
  title: string
  introduction: string
  label?: string
  seoTitle: string
  seoDescription: string
  updated?: string
  sections: ManagedSection[]
  introCta?: ManagedLink
  support?: { text: string; emphasis: string; link: ManagedLink }
  footer?: { heading: string; introduction: string; link: ManagedLink }
}

const icons = new Set<IconName>(['file', 'shield', 'check', 'clock', 'image', 'download'])
const invalid = (location: string, reason: string): never => { throw new Error(`Invalid managed page ${location}: ${reason}`) }
function record(value: unknown, location: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(location, 'expected an object')
  return value as Record<string, unknown>
}
function text(value: unknown, location: string, optional = false): string {
  if (optional && (value === undefined || value === null || value === '')) return ''
  if (typeof value !== 'string' || !value.trim()) return invalid(location, 'expected non-empty text')
  return value
}
function list(value: unknown, location: string): unknown[] {
  if (!Array.isArray(value)) return invalid(location, 'expected a list')
  return value
}
function clearedGroupValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return !value.trim()
  if (typeof value === 'object' && !Array.isArray(value)) return Object.values(value).every(clearedGroupValue)
  return false
}
/** Tina keeps an object after its child inputs are cleared; treat that as off. */
function optionalGroup(value: unknown, location: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined
  const item = record(value, location)
  return clearedGroupValue(item) ? undefined : item
}
function link(value: unknown, location: string): ManagedLink {
  const item = record(value, location)
  const href = text(item.href, `${location}.href`)
  if (/[\u0000-\u0020\u007f\\]/.test(href)) return invalid(location, 'links cannot contain whitespace, control characters or backslashes')
  if (!/^\/(?!\/)/.test(href)) {
    try {
      const url = new URL(href)
      if (url.protocol !== 'https:' || url.username || url.password) return invalid(location, 'use a site-relative or HTTPS link without credentials')
    } catch { return invalid(location, 'use a site-relative or HTTPS link without credentials') }
  }
  return { label: text(item.label, `${location}.label`), href }
}
function date(value: unknown, location: string): string | undefined {
  const source = text(value, location, true)
  if (!source) return undefined
  const parsed = new Date(`${source}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== source) return invalid(location, 'use a real YYYY-MM-DD date')
  return source
}
export function parseManagedPage(value: unknown, location: string): ManagedPage {
  const item = record(value, location)
  const result: ManagedPage = {
    title: text(item.title, `${location}.title`),
    introduction: text(item.introduction, `${location}.introduction`, true),
    label: text(item.label, `${location}.label`, true) || undefined,
    seoTitle: text(item.seoTitle, `${location}.seoTitle`),
    seoDescription: text(item.seoDescription, `${location}.seoDescription`),
    updated: date(item.updated, `${location}.updated`),
    sections: list(item.sections ?? [], `${location}.sections`).map((entry, i) => {
      const at = `${location}.sections[${i}]`
      const section = record(entry, at)
      const icon = text(section.icon, `${at}.icon`, true)
      if (icon && !icons.has(icon as IconName)) return invalid(at, 'choose a supported icon')
      const placement = section.placement ?? 'text'
      if (!['card', 'detail', 'text'].includes(String(placement))) return invalid(at, 'choose a supported display style')
      return {
        heading: text(section.heading, `${at}.heading`),
        placement: placement as ManagedSection['placement'],
        body: list(section.body ?? [], `${at}.body`).map((paragraph, j) => text(paragraph, `${at}.body[${j}]`)),
        items: list(section.items ?? [], `${at}.items`).map((entry, j) => text(entry, `${at}.items[${j}]`)),
        icon: icon as IconName || undefined,
        label: text(section.label, `${at}.label`, true) || undefined,
        links: list(section.links ?? [], `${at}.links`).map((entry, j) => link(entry, `${at}.links[${j}]`)),
      }
    }),
  }
  const introCta = optionalGroup(item.introCta, `${location}.introCta`)
  if (introCta) result.introCta = link(introCta, `${location}.introCta`)
  const support = optionalGroup(item.support, `${location}.support`)
  if (support) {
    result.support = { text: text(support.text, `${location}.support.text`), emphasis: text(support.emphasis, `${location}.support.emphasis`), link: link(support.link, `${location}.support.link`) }
  }
  const footer = optionalGroup(item.footer, `${location}.footer`)
  if (footer) {
    result.footer = { heading: text(footer.heading, `${location}.footer.heading`), introduction: text(footer.introduction, `${location}.footer.introduction`), link: link(footer.link, `${location}.footer.link`) }
  }
  return result
}

export function getManagedPage(slug: ManagedPageSlug): ManagedPage {
  // Runtime guard also protects callers which do not originate in TypeScript.
  if (!(MANAGED_PAGE_SLUGS as readonly string[]).includes(slug)) return invalid(String(slug), 'unknown page')
  const filename = path.join(process.cwd(), 'content', 'pages', `${slug}.json`)
  let raw: unknown
  try { raw = JSON.parse(readFileSync(filename, 'utf8')) } catch { return invalid(slug, 'content file is missing or is not valid JSON') }
  return parseManagedPage(raw, slug)
}

export function managedPageMetadata(slug: ManagedPageSlug): Metadata {
  const page = getManagedPage(slug)
  return pageMetadata({ title: page.seoTitle, description: page.seoDescription, path: `/${slug}` })
}

export function managedDateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
