export const SITE_TEXT_LIMITS: Readonly<Record<string, number>>
export function siteIdentityText(value: unknown, key: string, maximum?: number): string
export function safeSiteProfileHref(value: unknown): string
export function safeSocialImagePath(value: unknown): string
export function safeEditorialImagePath(value: unknown): string
export function editorialImageFieldValidator(options?: { required?: boolean }): (value: unknown) => string | undefined
