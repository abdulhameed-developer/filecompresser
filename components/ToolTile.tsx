import Link from 'next/link'
import type { ToolCard } from '@/lib/tool-presentation'
import Icon from './Icon'
export default function ToolTile({ tool }: { tool: ToolCard }) {
  return <Link prefetch={false} className="toolTile" href={`/${tool.slug}`}>
    <span className={`tileIcon tone-${tool.category}`}><Icon name={tool.icon} /></span>
    <span className="tileCopy"><strong>{tool.title}</strong><small>{tool.summary}</small></span>
    <Icon name="arrow" className="tileArrow" />
  </Link>
}
