import Link from 'next/link'
import type { ToolDefinition } from '@/lib/types'
import { TOOL_GUIDES } from '@/lib/tool-guides'
import { toolUsesFfmpeg } from '@/lib/tools'
import Icon from './Icon'
export default function ToolGuide({ tool }: { tool: ToolDefinition }) {
  const guide = TOOL_GUIDES[tool.slug]
  if (!guide) return null
  return <section className="toolGuideCompact" aria-labelledby="guide-heading">
    <div className="sectionHeading"><div><span className="sectionLabel">BEFORE YOU START</span><h2 id="guide-heading">About this {tool.engine === 'zip-extract' ? 'extraction' : tool.engine === 'zip-create' ? 'archive' : 'output'}</h2></div><Link className="tertiaryAction" href="/contact">Need help?<Icon name="arrow" /></Link></div>
    <p className="guideUse">{guide.use}</p>
    <div className="guideDisclosures">
      <details open><summary><span><Icon name="download" />What you get</span><Icon name="chevron" /></summary><div><p>{guide.output}</p></div></details>
      <details><summary><span><Icon name="shield" />Limits and quality</span><Icon name="chevron" /></summary><div><p>{guide.tip}</p>{tool.note && <p>{tool.note}</p>}{toolUsesFfmpeg(tool) && <p>The first media job downloads about 30 MB of engine code. Long or high-resolution files can exceed browser memory; jobs stop after five minutes. Try a shorter clip or lower resolution if processing fails.</p>}<p>Queues accept up to 500 files and 300 MB of inputs. These limits reduce memory pressure but cannot guarantee a job will fit every device.</p></div></details>
      <details><summary><span><Icon name="file" />How to use this tool</span><Icon name="chevron" /></summary><div><ol><li>Select a supported file and wait for validation.</li><li>Review the available settings and start processing.</li><li>Compare the result, then download individual files or a supported batch.</li></ol><Link className="editorialLink" href="/blog/compressing-files-for-the-web">Read the format-selection guide</Link></div></details>
    </div>
  </section>
}
