import Link from 'next/link'
import type { ToolDefinition } from '@/lib/types'
import { TOOL_SUMMARIES, toolIcon } from '@/lib/tool-presentation'
import Icon from './Icon'
export default function ToolTile({ tool }: { tool: ToolDefinition }) {
  return <Link className="toolTile" href={`/${tool.slug}`}>
    <span className={`tileIcon tone-${tool.category}`}><Icon name={toolIcon(tool)} /></span>
    <span className="tileCopy"><strong>{tool.title}</strong><small>{TOOL_SUMMARIES[tool.slug]}</small></span>
    <Icon name="arrow" className="tileArrow" />
  </Link>
}
