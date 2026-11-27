import { TOOLS } from '@/lib/tools'
import { TOOL_GROUPS } from '@/lib/nav'
import { TOOL_SUMMARIES, toolIcon } from '@/lib/tool-presentation'
import ToolDirectoryFilter from './ToolDirectoryFilter'

/** Serialize just the searchable card data, never the entire tool registry. */
export default function ToolDirectory() {
  const cards = TOOLS.map(tool => ({
    slug: tool.slug,
    title: tool.title,
    category: tool.category,
    summary: TOOL_SUMMARIES[tool.slug],
    icon: toolIcon(tool),
  }))
  const groups = TOOL_GROUPS.map(({ key, title, categories }) => ({ key, title, categories }))
  return <ToolDirectoryFilter cards={cards} groups={groups} />
}
