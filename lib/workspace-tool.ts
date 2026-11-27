import type { ToolDefinition } from './types'

/** Public editorial/SEO data renders on the server, outside the file workspace. */
export function workspaceTool(tool: ToolDefinition): ToolDefinition {
  return {
    slug: tool.slug,
    title: tool.title,
    description: tool.description,
    category: tool.category,
    engine: tool.engine,
    accept: tool.accept,
    extensions: tool.extensions,
    mimeTypes: tool.mimeTypes,
    maxFileSize: tool.maxFileSize,
    privacyClientSide: tool.privacyClientSide,
    ...(tool.settings ? { settings: tool.settings } : {}),
  }
}
