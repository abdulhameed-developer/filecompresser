import Image from 'next/image'
import Link from 'next/link'
import BlogFigure from './BlogFigure'
import type { Block } from '@/lib/blog'

/** Structured editorial blocks render as escaped React text, never raw HTML. */
export default function BlogContent({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((block, index) => {
    switch (block.type) {
      case 'h2': return <h2 id={`section-${index}`} key={index}>{block.text}</h2>
      case 'h3': return <h3 id={`section-${index}`} key={index}>{block.text}</h3>
      case 'p': return <p key={index}>{block.text}</p>
      case 'ul': return <ul key={index}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
      case 'ol': return <ol key={index}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ol>
      case 'link': return <p className="postLink" key={index}><Link href={block.href}>{block.text}</Link></p>
      case 'image': return <figure className="postFigure postUploadedImage" key={index}>
        <Image src={block.src} alt={block.alt} width={1200} height={800} sizes="(max-width: 860px) 100vw, 860px" style={{ width: '100%', height: 'auto' }} />
        {block.caption && <figcaption>{block.caption}</figcaption>}
      </figure>
      case 'table': return <div className="postTableWrap" style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label={block.caption || 'Article data table'} key={index}>
        <table>
          {block.caption && <caption>{block.caption}</caption>}
          <thead><tr>{block.columns.map((column, i) => <th scope="col" key={i}>{column}</th>)}</tr></thead>
          <tbody>{block.rows.map((row, i) => <tr key={i}>{row.cells.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
      case 'callout': return <aside className="postCallout" key={index}><strong>{block.title}</strong><p>{block.text}</p></aside>
      case 'figure': return <figure className="postFigure" key={index}><BlogFigure figure={block.figure} /><figcaption>{block.caption}</figcaption></figure>
      default: return null
    }
  })}</>
}
