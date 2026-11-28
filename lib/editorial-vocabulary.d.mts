export const PROHIBITED_EDITORIAL_TERMS: readonly string[]
export const NON_EDITORIAL_KEYS: Set<string>
export function editorialPlainText(value: unknown): string
export function findProhibitedEditorialTerms(value: unknown): { term: string; wordIndex: number }[]
export function editorialVocabularyError(value: unknown): string | undefined
export function inspectEditorialVocabulary(value: unknown, location?: string): { field: string; term: string; wordIndex: number }[]
export function assertEditorialVocabulary(value: unknown, location?: string): void
