'use client'
import { useState } from 'react'
import { TOOLS } from '@/lib/tools'
import { TOOL_GROUPS } from '@/lib/nav'
import { TOOL_SUMMARIES } from '@/lib/tool-presentation'
import ToolTile from './ToolTile'
import Icon from './Icon'
export default function ToolDirectory() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const group = TOOL_GROUPS.find(item => item.key === category)
  const tools = TOOLS.filter(tool => (!group || group.categories.includes(tool.category)) && `${tool.title} ${TOOL_SUMMARIES[tool.slug]}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="toolDirectory">
    <div className="directoryToolbar">
      <div className="categoryFilters" role="group" aria-label="Filter tools by category">
        <button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All tools</button>
        {TOOL_GROUPS.map(item => <button key={item.key} type="button" aria-pressed={category === item.key} onClick={() => setCategory(item.key)}>{item.title}</button>)}
      </div>
      <label className="directorySearch"><span className="srInline">Find your tool</span><Icon name="search" /><input type="search" placeholder="Search tools or formats" value={query} onChange={event => setQuery(event.target.value)} /></label>
    </div>
    <p className="directoryCount" role="status">{tools.length} tool{tools.length === 1 ? '' : 's'}{query ? ` matching “${query}”` : category === 'all' ? ' for everyday file tasks' : ` in ${group?.title}`}</p>
    <div className="toolTileGrid">{tools.map(tool => <ToolTile key={tool.slug} tool={tool} />)}</div>
    {!tools.length && <div className="directoryEmpty"><Icon name="search" /><p>No tools match. Try JPG, MP3, PDF or ZIP.</p><button className="tertiaryAction" type="button" onClick={() => { setQuery(''); setCategory('all') }}>Reset filters<Icon name="close" /></button></div>}
  </div>
}
