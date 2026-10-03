import type { FigureId } from '@/lib/blog'

/**
 * Diagrams for the blog posts.
 *
 * Hand-written SVG rather than raster images: each figure is a few KB, stays
 * crisp at any zoom, inherits the site palette, and needs no build step. They
 * are switched on an explicit id rather than looked up dynamically, so no
 * user-controlled value ever reaches a `d` attribute or a path.
 *
 * Every figure carries `role="img"` and an `aria-label` describing what it
 * shows, because a diagram that a screen reader cannot describe is decoration
 * masquerading as content. The visible text inside each SVG is `aria-hidden`,
 * since the label already carries the meaning.
 */

const INK = 'var(--ink)'
const MUTED = 'var(--muted)'
const LIME = 'var(--lime)'
const DEEP = 'var(--lime-deep)'
const LINE = 'var(--line)'
const PAPER = 'var(--surface)'

/** Shared frame: a viewBox, the accessible name, and hidden inner text. */
function Figure({
  id,
  label,
  height,
  children,
}: {
  id: string
  label: string
  height: number
  children: React.ReactNode
}) {
  return (
    <svg
      className="figureSvg"
      viewBox={`0 0 720 ${height}`}
      width="720"
      height={height}
      role="img"
      aria-label={label}
      id={id}
      preserveAspectRatio="xMidYMid meet"
    >
      <g aria-hidden="true" fontFamily="var(--font-mono)" fontSize="12">
        {children}
      </g>
    </svg>
  )
}

/** A labelled box in a flow diagram. */
function Node({
  x,
  y,
  w,
  h,
  label,
  sub,
  tone = 'plain',
}: {
  x: number
  y: number
  w: number
  h: number
  label: string
  sub?: string
  tone?: 'plain' | 'accent' | 'good'
}) {
  const fill = tone === 'accent' ? 'var(--ink)' : tone === 'good' ? '#eef6d8' : PAPER
  const stroke = tone === 'accent' ? INK : LINE
  const labelFill = tone === 'accent' ? '#fff' : INK
  const subFill = tone === 'accent' ? 'var(--lime)' : MUTED
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="6" fill={fill} stroke={stroke} />
      <text
        x={x + w / 2}
        y={sub ? y + h / 2 - 4 : y + h / 2 + 4}
        textAnchor="middle"
        fill={labelFill}
        fontWeight="700"
        fontSize="13"
        fontFamily="var(--font-sans)"
      >
        {label}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fill={subFill} fontSize="11">
          {sub}
        </text>
      )}
    </g>
  )
}

/** An arrow between two points. */
function Arrow({ x1, y1, x2, y2, dashed = false }: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }) {
  return (
    <g stroke={MUTED} strokeWidth="1.5" fill="none" markerEnd="url(#arrowhead)">
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeDasharray={dashed ? '4 4' : undefined} />
    </g>
  )
}

const ArrowDefs = (
  <defs>
    <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill={MUTED} />
    </marker>
  </defs>
)

// ───────────────────────────── pipeline ─────────────────────────────
function PipelineFigure() {
  const y = 60
  const h = 78
  const w = 122
  const gap = 20
  const startX = 12
  const nodes = [
    { label: 'You pick a file', sub: 'never leaves the tab' },
    { label: 'Validate', sub: 'real bytes, not the name' },
    { label: 'Encode', sub: 'worker / WebAssembly' },
    { label: 'Measure', sub: 'compare to the original' },
    { label: 'Download', sub: 'a real file' },
  ]
  return (
    <Figure id="fig-pipeline" label="Five-stage pipeline: file selection, byte-level validation, encoding, size measurement, download. The file never leaves the browser tab." height={210}>
      {ArrowDefs}
      {nodes.map((node, i) => {
        const x = startX + i * (w + gap)
        return (
          <g key={node.label}>
            <Node x={x} y={y} w={w} h={h} label={node.label} sub={node.sub} tone={i === 2 ? 'accent' : 'plain'} />
            {i < nodes.length - 1 && <Arrow x1={x + w} y1={y + h / 2} x2={x + w + gap - 3} y2={y + h / 2} />}
          </g>
        )
      })}
      <text x={360} y={26} textAnchor="middle" fill={INK} fontSize="13" fontFamily="var(--font-sans)" fontWeight="700">
        Everything below runs on your device
      </text>
      <rect x={startX} y={168} width={5 * w + 4 * gap} height={26} rx="5" fill="#eef6d8" stroke={DEEP} />
      <text x={360} y={185} textAnchor="middle" fill={INK} fontSize="12">
        There is no upload step, and no endpoint to upload it to
      </text>
    </Figure>
  )
}

// ───────────────────────────── size bars ─────────────────────────────
function SizeBarsFigure() {
  const rows = [
    { label: 'Genuinely smaller', before: 300, after: 120, verdict: '61% smaller', tone: '#eef6d8', stroke: DEEP },
    { label: 'The same size', before: 220, after: 220, verdict: 'no size change', tone: PAPER, stroke: LINE },
    { label: 'Larger', before: 180, after: 190, verdict: '5% larger', tone: '#fbeae7', stroke: 'var(--danger)' },
  ]
  const maxPx = 400
  const barH = 18
  return (
    <Figure id="fig-sizebars" label="Bar chart comparing original and output size for three outcomes: genuinely smaller, the same size, and larger. Only the first is a saving." height={230}>
      {rows.map((row, i) => {
        const y = 40 + i * 60
        const beforeW = (row.before / 300) * maxPx
        const afterW = (row.after / 300) * maxPx
        return (
          <g key={row.label}>
            <text x={12} y={y - 8} fill={INK} fontSize="13" fontFamily="var(--font-sans)" fontWeight="700">
              {row.label}
            </text>
            <rect x={12} y={y} width={beforeW} height={barH} rx="3" fill="none" stroke={MUTED} strokeDasharray="3 3" />
            <text x={16} y={y + 13} fill={MUTED} fontSize="11">
              original
            </text>
            <rect x={12} y={y + barH + 4} width={afterW} height={barH} rx="3" fill={row.tone} stroke={row.stroke} />
            <text x={16} y={y + barH + 17} fill={INK} fontSize="11">
              output
            </text>
            <text x={430} y={y + 22} fill={INK} fontSize="12" fontFamily="var(--font-sans)" fontWeight="700">
              {row.verdict}
            </text>
          </g>
        )
      })}
      <text x={12} y={218} fill={MUTED} fontSize="11">
        Only the first row is a saving. The other two are reported, never dressed up.
      </text>
    </Figure>
  )
}

// ───────────────────────────── quality curve ─────────────────────────────
function QualityCurveFigure() {
  // An illustrative curve: bytes fall steeply at first, then flatten out.
  const x0 = 70
  const y0 = 200
  const w = 420
  const h = 140
  const pts: string[] = []
  for (let i = 0; i <= 40; i++) {
    const q = i / 40
    const bytes = Math.exp(-2.6 * q) * (1 - q * 0.15)
    pts.push(`${(x0 + q * w).toFixed(1)},${(y0 - bytes * h).toFixed(1)}`)
  }
  const recommendedQ = 0.72
  const maximumQ = 0.92
  const yAt = (q: number) => y0 - Math.exp(-2.6 * q) * (1 - q * 0.15) * h
  const xAt = (q: number) => x0 + q * w
  return (
    <Figure id="fig-qualitycurve" label="Quality versus file size curve, showing that file size falls steeply at low quality then flattens. Recommended and Maximum modes are marked on the curve." height={250}>
      <line x1={x0} y1={y0} x2={x0 + w} y2={y0} stroke={INK} />
      <line x1={x0} y1={y0} x2={x0} y2={y0 - h} stroke={INK} />
      <polyline points={pts.join(' ')} fill="none" stroke={DEEP} strokeWidth="2.5" />
      <text x={x0 - 10} y={y0 + 16} textAnchor="end" fill={MUTED} fontSize="11">
        more size
      </text>
      <text x={x0 - 10} y={y0 - h} textAnchor="end" fill={MUTED} fontSize="11">
        less
      </text>
      <text x={x0 + w / 2} y={y0 + 34} textAnchor="middle" fill={MUTED} fontSize="11">
        encoder quality
      </text>

      <g>
        <line x1={xAt(maximumQ)} y1={yAt(maximumQ)} x2={xAt(maximumQ)} y2={y0} stroke={MUTED} strokeDasharray="3 3" />
        <circle cx={xAt(maximumQ)} cy={yAt(maximumQ)} r="4" fill={INK} />
        <text x={xAt(maximumQ) + 8} y={yAt(maximumQ) - 4} fill={INK} fontSize="11" fontFamily="var(--font-sans)" fontWeight="700">
          Maximum · 0.6
        </text>
      </g>
      <g>
        <line x1={xAt(recommendedQ)} y1={yAt(recommendedQ)} x2={xAt(recommendedQ)} y2={y0} stroke={MUTED} strokeDasharray="3 3" />
        <circle cx={xAt(recommendedQ)} cy={yAt(recommendedQ)} r="4" fill={DEEP} />
        <text x={xAt(recommendedQ) - 8} y={yAt(recommendedQ) - 8} textAnchor="end" fill={INK} fontSize="11" fontFamily="var(--font-sans)" fontWeight="700">
          Recommended · 0.82
        </text>
      </g>
      <text x={12} y={24} fill={MUTED} fontSize="11">
        The presets pick a point on this curve. Lower is smaller, and visibly so.
      </text>
    </Figure>
  )
}

// ───────────────────────────── data flow ─────────────────────────────
function DataFlowFigure() {
  return (
    <Figure id="fig-dataflow" label="Diagram contrasting data flow with code flow. Your file has a single path that stays inside the browser. Engine code and web fonts travel over the network, but never carry your file." height={290}>
      <text x={12} y={24} fill={INK} fontSize="13" fontFamily="var(--font-sans)" fontWeight="700">
        Your file
      </text>
      <rect x={12} y={34} width={300} height={120} rx="8" fill="#eef6d8" stroke={DEEP} />
      <Node x={40} y={70} w={100} h={64} label="Browser tab" sub="memory" tone="good" />
      <Node x={184} y={70} w={100} h={64} label="Download" sub="a real file" tone="good" />
      <Arrow x1={140} y1={102} x2={182} y2={102} />
      <text x={162} y={80} textAnchor="middle" fill="var(--ok)" fontSize="12" fontFamily="var(--font-sans)" fontWeight="700">
        one path
      </text>
      <text x={162} y={172} textAnchor="middle" fill={MUTED} fontSize="11">
        never crosses the network
      </text>

      <text x={400} y={24} fill={INK} fontSize="13" fontFamily="var(--font-sans)" fontWeight="700">
        Code and fonts
      </text>
      <rect x={400} y={34} width={308} height={120} rx="8" fill={PAPER} stroke={LINE} />
      <Node x={420} y={70} w={124} h={64} label="FFmpeg core" sub="~30 MB, once" />
      <Node x={568} y={70} w={120} h={64} label="Web fonts" sub="Google Fonts" />
      <text x={564} y={172} textAnchor="middle" fill={MUTED} fontSize="11">
        fetched over the network, carrying no file
      </text>

      <rect x={12} y={196} width={696} height={72} rx="8" fill={INK} />
      <text x={360} y={222} textAnchor="middle" fill={LIME} fontSize="13" fontFamily="var(--font-sans)" fontWeight="700">
        A policy says what someone promises not to do.
      </text>
      <text x={360} y={248} textAnchor="middle" fill="#fff" fontSize="13" fontFamily="var(--font-sans)" fontWeight="700">
        An architecture makes it impossible to do.
      </text>
    </Figure>
  )
}

// ───────────────────────────── format tree ─────────────────────────────
function FormatTreeFigure() {
  const branches = [
    { need: 'A photo on a page', answer: 'WEBP, or JPG for old browsers', tone: 'accent' as const },
    { need: 'Flat colour, hard edges', answer: 'PNG — lossless', tone: 'plain' as const },
    { need: 'Transparency required', answer: 'PNG or WEBP, never JPG', tone: 'plain' as const },
    { need: 'Video for the web', answer: 'H.264 in MP4', tone: 'plain' as const },
    { need: 'Audio for the web', answer: 'MP3', tone: 'plain' as const },
  ]
  return (
    <Figure id="fig-formattree" label="Decision guide mapping what a file is for to the format to use: photographs to WEBP or JPG, flat colour to PNG, transparency to PNG or WEBP, video to H.264 MP4, and audio to MP3." height={290}>
      <text x={12} y={24} fill={MUTED} fontSize="11">
        Start from what the file is for, not from its extension.
      </text>
      {branches.map((branch, i) => {
        const y = 44 + i * 46
        return (
          <g key={branch.need}>
            <path
              d={`M 24 ${y + 16} C 60 ${y + 16}, 70 ${y + 16}, 96 ${y + 16}`}
              fill="none"
              stroke={LINE}
              strokeWidth="1.5"
            />
            <text x={104} y={y + 12} fill={INK} fontSize="13" fontFamily="var(--font-sans)" fontWeight="700">
              {branch.need}
            </text>
            <text x={104} y={y + 30} fill={MUTED} fontSize="12">
              {branch.answer}
            </text>
          </g>
        )
      })}
    </Figure>
  )
}

const FIGURES: Record<FigureId, () => React.JSX.Element> = {
  pipeline: PipelineFigure,
  sizebars: SizeBarsFigure,
  qualitycurve: QualityCurveFigure,
  dataflow: DataFlowFigure,
  formattree: FormatTreeFigure,
}

export default function BlogFigure({ figure }: { figure: FigureId }) {
  const Component = FIGURES[figure]
  return <Component />
}
