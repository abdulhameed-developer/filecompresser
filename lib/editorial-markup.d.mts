export type EditorialNode = string | { tag: string; href?: string; children: EditorialNode[] }
export type EditorialInlinePart = string | { label: string; href: string; source: string }
export interface EditorialValidationOptions { allowHtml?: boolean; htmlOnly?: boolean; literalHtml?: boolean; required?: boolean }
export function safeEditorialHref(value: string): string
export function safeReferenceHref(value: string): string
export function editorialUrlFieldValidator(options?: { required?: boolean; reference?: boolean }): (value: unknown) => string | undefined
export function hasEditorialHtml(value: string): boolean
export function parseEditorialHtml(value: string): EditorialNode[]
export function splitEditorialLinks(value: string): EditorialInlinePart[]
export function validateInlineLinks(value: string): void
export function validateEditorialValue(value: unknown, options?: EditorialValidationOptions): void
export function editorialFieldValidator(options?: EditorialValidationOptions): (value: unknown) => string | undefined
