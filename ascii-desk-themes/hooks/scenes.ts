// ASCII scenes as self-animating SVG (SMIL), one per theme.
// Same eight themes as the claude.ai userscript, drawn as a grid of tiles
// that each carry one glyph. Seeded randomness keeps every redraw identical,
// so a re-render never restarts the animation with a new layout.

export type Layout = 'band' | 'side' | 'thumb'

export type Theme = {
  id: string
  name: string
  desc: string
  dark: boolean
  alias: string[]
  /** Border / accent color used to tint chat messages. */
  accent: string
  /** Soft fill behind the person's messages (8-digit hex, low alpha). */
  bubble: string
}

export const THEMES: Theme[] = [
  { id: 'code', name: 'Terminal Glow', desc: 'terminal tối, tia sáng cam', dark: true, alias: ['claude', 'terminal', 'spark'], accent: '#d97757', bubble: '#d9775722' },
  { id: 'cloud', name: 'Blue Sky', desc: 'trời xanh, mây trôi', dark: false, alias: ['may', 'troi', 'sky'], accent: '#5aa9e6', bubble: '#5aa9e622' },
  { id: 'lagoon', name: 'Turtle Bay', desc: 'rùa biển, cá, san hô', dark: false, alias: ['rua', 'honu', 'bien', 'sea'], accent: '#2fb3c4', bubble: '#2fb3c422' },
  { id: 'koi', name: 'Lotus Koi', desc: 'hồ cá koi, lá sen', dark: true, alias: ['ca', 'ca koi', 'ho', 'pond'], accent: '#e8733a', bubble: '#e8733a22' },
  { id: 'jelly', name: 'Deep Glow', desc: 'biển sâu, sứa phát sáng', dark: true, alias: ['sua', 'jellyfish', 'deep'], accent: '#b49cff', bubble: '#b49cff22' },
  { id: 'boats', name: 'Paper Fleet', desc: 'thuyền giấy trên sóng', dark: false, alias: ['thuyen', 'boat'], accent: '#4fb6b0', bubble: '#4fb6b022' },
  { id: 'fireflies', name: 'Night Forest', desc: 'rừng đêm, đom đóm', dark: true, alias: ['dom dom', 'domdom', 'firefly', 'rung'], accent: '#b6d94a', bubble: '#b6d94a22' },
  { id: 'moon', name: 'Starry Night', desc: 'trăng, sao, sao băng', dark: true, alias: ['trang', 'dem', 'night'], accent: '#8f9cff', bubble: '#8f9cff22' },
  { id: 'vn', name: 'Việt Nam', desc: 'cờ đỏ sao vàng tung bay', dark: false, alias: ['co', 'co do', 'co viet nam', 'co do sao vang', 'viet nam', 'vietnam', 'quoc ky', 'to quoc', 'flag'], accent: '#da251d', bubble: '#da251d22' },
]

export const byId = (id: string): Theme | undefined => THEMES.find(t => t.id === id)

const strip = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase().trim()

/** A theme id from what the person typed: id, name or Vietnamese alias. */
export function findTheme(q: string): string | undefined {
  const s = strip(q)
  if (!s) return undefined
  if (/^(off|tat|none|0)$/.test(s)) return 'off'
  const exact = THEMES.find(t => t.id === s || strip(t.name) === s || t.alias.includes(s))
  if (exact) return exact.id
  return THEMES.find(t => t.id.startsWith(s) || strip(t.name).includes(s) || t.alias.some(a => a.startsWith(s)))?.id
}

/* ------------------------------------------------------------- utilities */

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

type Pal = Record<string, [bg: string | null, fg: string | null, glyph?: string]>
type Tile = [col: number, row: number, bg: string | null, fg: string | null, glyph: string]

class Scene {
  readonly cols: number
  readonly rows: number
  readonly glyphs: boolean
  readonly rand: () => number
  private defs: string[] = []
  private body: string[] = []
  private ids = 0

  constructor(
    readonly W: number,
    readonly H: number,
    readonly cell: number,
    seed: number,
    readonly glyphSet: string,
  ) {
    this.cols = Math.ceil(W / cell)
    this.rows = Math.ceil(H / cell)
    this.glyphs = cell >= 9
    this.rand = rng(seed)
  }

  rnd(a: number, b: number) {
    return a + this.rand() * (b - a)
  }
  int(a: number, b: number) {
    return Math.floor(this.rnd(a, b + 1))
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rand() * list.length)] as T
  }
  glyph(i: number, j: number) {
    return this.glyphSet[Math.abs((i * 73856093) ^ (j * 19349663)) % this.glyphSet.length] ?? '.'
  }
  id(prefix: string) {
    return `${prefix}${this.ids++}`
  }

  def(markup: string) {
    this.defs.push(markup)
  }
  add(markup: string) {
    this.body.push(markup)
  }

  vgrad(stops: string[]) {
    const id = this.id('g')
    const s = stops.map((c, i) => `<stop offset="${r1(i / (stops.length - 1))}" stop-color="${c}"/>`).join('')
    this.def(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${s}</linearGradient>`)
    this.add(`<rect width="${this.W}" height="${this.H}" fill="url(#${id})"/>`)
  }

  glow(x: number, y: number, r: number, color: string, alpha: number, extra = '') {
    const id = this.id('r')
    this.def(`<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${alpha}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`)
    return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="url(#${id})">${extra}</circle>`
  }

  /** Tiles at cell coordinates, as one path per color plus one text run per row and color. */
  tiles(list: Tile[], ox = 0, oy = 0) {
    const c = this.cell
    const gap = c > 7 ? 1 : 0.5
    const s = r1(c - gap)
    const paths = new Map<string, string[]>()
    const texts = new Map<string, Map<number, [number[], string]>>()
    for (const [i, j, bg, fg, ch] of list) {
      const x = r1(ox + i * c + gap / 2)
      const y = r1(oy + j * c + gap / 2)
      if (bg) {
        if (!paths.has(bg)) paths.set(bg, [])
        paths.get(bg)!.push(`M${x} ${y}h${s}v${s}h-${s}z`)
      }
      if (fg && ch && (this.glyphs || !bg)) {
        if (!this.glyphs) {
          // Too small for letters: a dot stands in for a glyph without a tile.
          if (!paths.has(fg)) paths.set(fg, [])
          const d = r1(c * 0.4)
          paths.get(fg)!.push(`M${r1(x + (s - d) / 2)} ${r1(y + (s - d) / 2)}h${d}v${d}h-${d}z`)
          continue
        }
        if (!texts.has(fg)) texts.set(fg, new Map())
        const rowMap = texts.get(fg)!
        if (!rowMap.has(j)) rowMap.set(j, [[], ''])
        const row = rowMap.get(j)!
        row[0].push(r1(ox + i * c + c / 2))
        row[1] += ch
      }
    }
    let out = ''
    for (const [color, d] of paths) out += `<path fill="${color}" d="${d.join('')}"/>`
    for (const [color, rowMap] of texts) {
      for (const [j, [xs, chars]] of rowMap) {
        out += `<text fill="${color}" x="${xs.join(' ')}" y="${r1(oy + j * c + c * 0.72)}">${esc(chars)}</text>`
      }
    }
    return out
  }

  /** ASCII art -> tile list. */
  sprite(rows: string[], pal: Pal, flip = false): Tile[] {
    const w = Math.max(...rows.map(r => r.length))
    const out: Tile[] = []
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const p = pal[row[i] ?? ' ']
        if (!p) continue
        out.push([flip ? w - 1 - i : i, j, p[0], p[1], p[2] ?? this.glyph(i, j)])
      }
    })
    return out
  }

  /** A sprite stored once in <defs>, drawn with <use>. */
  defSprite(rows: string[], pal: Pal, flip = false) {
    const id = this.id('s')
    this.def(`<g id="${id}">${this.tiles(this.sprite(rows, pal, flip))}</g>`)
    return id
  }

  /** Moves `inner` from x0 to x1 (px) forever, starting part-way through. */
  drift(inner: string, x0: number, x1: number, y: number, seconds: number, phase: number, opacity = 1) {
    const op = opacity < 1 ? ` opacity="${r1(opacity)}"` : ''
    this.add(
      `<g${op}><animateTransform attributeName="transform" type="translate" from="${r1(x0)} ${r1(y)}" to="${r1(x1)} ${r1(y)}" dur="${r1(seconds)}s" begin="-${r1(phase * seconds)}s" repeatCount="indefinite"/>${inner}</g>`,
    )
  }

  render(alt: string) {
    const fs = r1(this.cell * 0.7)
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${this.W}" height="${this.H}" viewBox="0 0 ${this.W} ${this.H}" preserveAspectRatio="xMidYMid slice" role="img">` +
      `<title>${esc(alt)}</title>` +
      `<defs>${this.defs.join('')}</defs>` +
      `<g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="${fs}" font-weight="600" text-anchor="middle">` +
      this.body.join('') +
      `</g></svg>`
    )
  }
}

const use = (id: string, extra = '') => `<use href="#${id}" xlink:href="#${id}"${extra}/>`

/** Two frames that swap every `period` seconds. */
const flipbook = (a: string, b: string, period: number) =>
  `<g>${use(a)}<animate attributeName="opacity" values="1;0" calcMode="discrete" dur="${period}s" repeatCount="indefinite"/></g>` +
  `<g opacity="0">${use(b)}<animate attributeName="opacity" values="0;1" calcMode="discrete" dur="${period}s" repeatCount="indefinite"/></g>`

const bob = (inner: string, dy: number, seconds: number) =>
  `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 ${dy};0 0" dur="${seconds}s" repeatCount="indefinite"/>${inner}</g>`

const twinkle = (seconds: number, phase: number, lo = 0.15) =>
  `<animate attributeName="opacity" values="${lo};1;${lo}" dur="${r1(seconds)}s" begin="-${r1(phase)}s" repeatCount="indefinite"/>`

/* ----------------------------------------------------------- shared art */

function cloudRows(sc: Scene, w: number, h: number) {
  const E = [{ x: w / 2, y: h - h * 0.32, rx: w / 2, ry: h * 0.34 }]
  for (let k = sc.int(2, 4); k > 0; k--) {
    const rx = sc.rnd(w * 0.16, w * 0.3)
    E.push({ x: sc.rnd(rx * 0.9, w - rx * 0.9), y: h - h * 0.4 - sc.rnd(0, h * 0.2), rx, ry: Math.min(rx * 0.8, h * 0.6) })
  }
  const inside = (i: number, j: number) => E.some(e => ((i + 0.5 - e.x) / e.rx) ** 2 + ((j + 0.5 - e.y) / e.ry) ** 2 <= 1)
  const rows: string[] = []
  for (let j = 0; j < h; j++) {
    let r = ''
    for (let i = 0; i < w; i++) {
      if (!inside(i, j)) r += ' '
      else r += !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1) ? 'e' : 'c'
    }
    rows.push(r)
  }
  return rows
}

function clouds(sc: Scene, pal: Pal, count: number, maxY: number, speed: number, alpha: number) {
  const shapes = Array.from({ length: 4 }, () => {
    const w = sc.int(Math.min(8, sc.cols - 2), Math.max(9, Math.min(22, Math.round(sc.cols * 0.3))))
    const h = Math.max(3, Math.round(w * sc.rnd(0.3, 0.42)))
    return { id: sc.defSprite(cloudRows(sc, w, h), pal), w }
  })
  for (let k = 0; k < count; k++) {
    const s = sc.pick(shapes)
    const z = sc.rand()
    const span = sc.W + s.w * sc.cell * 2
    sc.drift(use(s.id), -s.w * sc.cell, sc.W + s.w * sc.cell, sc.rnd(-sc.cell, maxY), span / ((8 + z * 26) * speed), sc.rand(), alpha * (0.55 + z * 0.45))
  }
}

/* ---------------------------------------------------------------- themes */

const CODE_LINES = ['const theme = "ascii";', '$ npm run dev', '=> ready in 312ms', 'git commit -m "wip"', '<Chat theme={t} />', 'fn render() {', '// TODO: sleep', '[ok] 42 tests passed']

function code(sc: Scene) {
  sc.vgrad(['#24211f', '#1b1a18', '#141312'])
  const cx = sc.W * 0.72
  const cy = sc.H * 0.45
  sc.add(sc.glow(cx, cy, Math.max(sc.W, sc.H) * 0.45, '#d97757', 0.16))
  // Terminal lines floating upward.
  const lines = Math.max(3, Math.round((sc.cols * sc.rows) / 220))
  for (let k = 0; k < lines; k++) {
    const txt = sc.pick(CODE_LINES)
    const x = sc.rnd(0, Math.max(0, sc.W - txt.length * sc.cell))
    const t = sc.glyphs
      ? `<text fill="#6b625a" text-anchor="start" x="${r1(x)}" y="0">${esc(txt)}</text>`
      : `<rect x="${r1(x)}" y="0" width="${r1(txt.length * sc.cell * 0.6)}" height="${r1(sc.cell * 0.5)}" fill="#4a433d"/>`
    sc.add(
      `<g opacity="${r1(sc.rnd(0.35, 0.8))}"><animateTransform attributeName="transform" type="translate" from="0 ${sc.H + sc.cell}" to="0 ${-sc.cell}" dur="${r1(sc.rnd(30, 60))}s" begin="-${r1(sc.rnd(0, 60))}s" repeatCount="indefinite"/>${t}</g>`,
    )
  }
  // Embers.
  for (let k = Math.max(4, Math.round((sc.cols * sc.rows) / 260)); k > 0; k--) {
    const x = sc.rnd(0, sc.W)
    const d = r1(Math.max(1.5, sc.cell * 0.32))
    sc.add(
      `<rect x="${r1(x)}" y="0" width="${d}" height="${d}" fill="#ff9a66">${twinkle(sc.rnd(1.5, 3), sc.rnd(0, 3), 0.2)}<animateTransform attributeName="transform" type="translate" from="0 ${sc.H}" to="${r1(sc.rnd(-20, 20))} -10" dur="${r1(sc.rnd(8, 18))}s" begin="-${r1(sc.rnd(0, 18))}s" repeatCount="indefinite"/></rect>`,
    )
  }
  // The spark: ten pixel rays that slowly turn and breathe.
  const R = Math.max(3, Math.min(9, Math.round(Math.min(sc.cols, sc.rows) * 0.38)))
  const tiles: Tile[] = []
  const seen = new Set<string>()
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    const L = R - (k % 2)
    for (let i = 1; i <= L; i++) {
      const x = Math.round(Math.cos(a) * i)
      const y = Math.round(Math.sin(a) * i)
      if (seen.has(`${x},${y}`)) continue
      seen.add(`${x},${y}`)
      tiles.push([x, y, i === L ? '#f4a27e' : '#d97757', '#a24e2f', sc.glyph(k, i)])
    }
  }
  tiles.push([0, 0, '#e98a63', '#a24e2f', '*'])
  const half = sc.cell / 2
  sc.add(
    `<g transform="translate(${r1(cx)} ${r1(cy)})"><g><animateTransform attributeName="transform" type="scale" values="1;1.08;1" dur="3s" repeatCount="indefinite"/>${sc.tiles(tiles, -half, -half)}</g></g>`,
  )
}

function cloud(sc: Scene) {
  sc.vgrad(['#86c3f2', '#b3dbf8', '#d9eefc'])
  const id = sc.id('h')
  sc.def(`<linearGradient id="${id}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`)
  sc.add(`<rect width="${sc.W}" height="${sc.H}" fill="url(#${id})"/>`)
  for (let k = Math.max(6, Math.round((sc.cols * sc.rows) / 200)); k > 0; k--) {
    const d = r1(Math.max(1.5, sc.cell * 0.22))
    sc.add(
      `<rect x="${r1(sc.rnd(0, sc.W))}" y="0" width="${d}" height="${d}" fill="#fff" opacity=".55"><animateTransform attributeName="transform" type="translate" from="0 ${sc.H}" to="0 -10" dur="${r1(sc.rnd(25, 60))}s" begin="-${r1(sc.rnd(0, 60))}s" repeatCount="indefinite"/></rect>`,
    )
  }
  clouds(sc, { c: ['#ffffff', '#a9c1d6'], e: ['#eef6fd', '#c3d5e5'] }, Math.max(3, Math.min(10, Math.round((sc.cols * sc.rows) / 600))), sc.H * 0.8, 1, 1)
}

const TURTLE_PAL: Pal = {
  S: ['#2f8a58', '#1f6a42'],
  s: ['#a3d06c', '#78a847'],
  h: ['#8dd27f', '#5ba454'],
  f: ['#72bf76', '#4d9a52'],
  e: ['#17322a', null, ''],
}
const TURTLE_A = ['      ff      ', '    SSSSSf    ', '  SsSSsSSS he ', ' SSsSSsSSSShhh', '  SsSSsSSS hh ', '    SSSSSf    ', '      ff      ']
const TURTLE_B = ['        ff    ', '    SSSSSff   ', '  SsSSsSSS he ', ' SSsSSsSSSShhh', '  SsSSsSSS hh ', '    SSSSSff   ', '        ff    ']
const FISH = ['t yyy ', 'tyyyey', 't yyy ']
const FISH_PAL: Pal = { y: ['#ffd23f', '#f2a900'], t: ['#ffb000', '#d98a00'], e: ['#1b2f4a', null, ''] }
const CORALS: [string, string, string][] = [
  ['#ff7d8c', '#d6566a', '#ffb3bd'],
  ['#ff9f5a', '#d77a33', '#ffc79c'],
  ['#c79bff', '#9c70e0', '#e2cdff'],
  ['#ff6fb3', '#d9468d', '#ffacd4'],
]

function lagoon(sc: Scene) {
  sc.vgrad(['#6fdad4', '#34b6c4', '#1b86a3'])
  sc.add(sc.glow(sc.W / 2, -sc.H * 0.1, sc.H * 0.9, '#ffffff', 0.25))
  // Light rays.
  for (let k = 0; k < 4; k++) {
    const x0 = ((k + 0.5) / 4) * sc.W
    const sp = sc.W * 0.04
    sc.add(
      `<path fill="#fff" opacity=".06" d="M${r1(x0 - sp)} 0H${r1(x0 + sp)}L${r1(x0 + sp * 3 - sc.H * 0.3)} ${sc.H}H${r1(x0 - sp * 2 - sc.H * 0.3)}Z">${twinkle(sc.rnd(5, 9), sc.rnd(0, 9), 0.3)}</path>`,
    )
  }
  const seed = sc.int(1, 9999)
  const sand = (x: number) => 2 + Math.round(0.8 + Math.sin(x * 0.13 + seed) * 0.9)
  const ground: Tile[] = []
  for (let x = 0; x < sc.cols; x++) {
    const top = sc.rows - sand(x)
    for (let y = top; y < sc.rows; y++) ground.push([x, y, y === top ? '#fae8bf' : '#f5dda4', '#dfc07c', sc.glyph(x, y)])
  }
  for (let n = Math.max(2, Math.round(sc.cols / 12)); n > 0; n--) {
    const x0 = sc.int(1, sc.cols - 2)
    const col = sc.pick(CORALS)
    const base = sc.rows - sand(x0) - 1
    for (let b = sc.int(2, 4); b > 0; b--) {
      let x = x0 + sc.int(-2, 2)
      const L = sc.int(2, 6)
      for (let i = 0; i < L; i++) {
        ground.push([x, base - i, i === L - 1 ? col[2] : col[0], col[1], i === L - 1 ? 'o' : sc.glyph(x, i)])
        if (sc.rand() < 0.3) x += sc.rand() < 0.5 ? -1 : 1
      }
    }
  }
  sc.add(sc.tiles(ground))
  // Seaweed sways around its root.
  for (let n = Math.max(3, Math.round(sc.cols / 9)); n > 0; n--) {
    const x = sc.int(0, sc.cols - 1)
    const h = sc.int(3, Math.max(4, Math.round(sc.rows * 0.3)))
    const base = sc.rows - sand(x) - 1
    const weed: Tile[] = []
    for (let k = 0; k < h; k++) weed.push([0, -k, k > h - 2 ? '#6fd08c' : '#3daa6a', '#2a8752', sc.glyph(x, k)])
    sc.add(
      `<g transform="translate(${x * sc.cell} ${base * sc.cell})"><g><animateTransform attributeName="transform" type="skewX" values="-6;6;-6" dur="${r1(sc.rnd(3, 5))}s" begin="-${r1(sc.rnd(0, 5))}s" repeatCount="indefinite"/>${sc.tiles(weed)}</g></g>`,
    )
  }
  const fishR = sc.defSprite(FISH, FISH_PAL)
  const fishL = sc.defSprite(FISH, FISH_PAL, true)
  for (let n = sc.cols > 70 ? 3 : 2; n > 0; n--) {
    const dir = sc.rand() < 0.5 ? 1 : -1
    const school = Array.from({ length: sc.int(3, 6) }, () =>
      bob(use(dir > 0 ? fishR : fishL, ` x="${r1(sc.rnd(-6, 6) * sc.cell)}" y="${r1(sc.rnd(-3, 3) * sc.cell)}"`), sc.cell * 0.5, r1(sc.rnd(1.2, 2))),
    ).join('')
    const span = sc.W + 24 * sc.cell
    const [a, b] = dir > 0 ? [-12 * sc.cell, sc.W + 12 * sc.cell] : [sc.W + 12 * sc.cell, -12 * sc.cell]
    sc.drift(school, a, b, sc.rnd(3, sc.rows * 0.65) * sc.cell, span / (sc.cell * sc.rnd(2.5, 4)), sc.rand())
  }
  for (let n = sc.cols > 70 ? 2 : 1; n > 0; n--) {
    const dir = sc.rand() < 0.5 ? 1 : -1
    const A = sc.defSprite(TURTLE_A, TURTLE_PAL, dir < 0)
    const B = sc.defSprite(TURTLE_B, TURTLE_PAL, dir < 0)
    const span = sc.W + 32 * sc.cell
    const [a, b] = dir > 0 ? [-16 * sc.cell, sc.W + 16 * sc.cell] : [sc.W + 16 * sc.cell, -16 * sc.cell]
    sc.drift(bob(flipbook(A, B, 1), sc.cell * 1.5, 6), a, b, sc.rnd(1, Math.max(1, sc.rows * 0.55)) * sc.cell, span / (sc.cell * sc.rnd(1.2, 2)), sc.rand())
  }
  for (let n = Math.max(5, Math.round(sc.cols / 5)); n > 0; n--) {
    const x = r1(sc.rnd(0, sc.W))
    const g = sc.glyphs ? `<text fill="#effffd" x="${x}" y="0">o</text>` : `<circle cx="${x}" cy="0" r="1.2" fill="#effffd"/>`
    sc.add(
      `<g opacity=".65"><animateTransform attributeName="transform" type="translate" from="0 ${sc.H + 10}" to="0 -10" dur="${r1(sc.rnd(6, 14))}s" begin="-${r1(sc.rnd(0, 14))}s" repeatCount="indefinite"/>${g}</g>`,
    )
  }
}

const KOI_A = ['     f     ', 't  ooWWoo  ', 'ttoWWooWWoo', '   ooWWoo  ', '     f     ']
const KOI_B = ['     f     ', '   ooWWoo  ', 'ttoWWooWWoo', 't  ooWWoo  ', '     f     ']
const koiPal = (o: [string, string], W: [string, string], t: string): Pal => ({ o, W, t: [t, o[1], ''], f: [W[0], W[1], ''] })
const KOI_PALS = [
  koiPal(['#e8533a', '#b83a25'], ['#fff6ec', '#e3d2bf'], '#ff8a6b'),
  koiPal(['#ffb21f', '#d98e00'], ['#ffe39a', '#e2c066'], '#ffc94d'),
  koiPal(['#ff7b2e', '#cf5617'], ['#2b2b2b', '#4a4a4a'], '#ff9a5c'),
  koiPal(['#f4f3ee', '#cfcdc4'], ['#ffffff', '#dddddd'], '#ffffff'),
]

function koi(sc: Scene) {
  sc.vgrad(['#13706a', '#0d5458', '#093b42'])
  sc.add(sc.glow(sc.W * 0.3, sc.H * 0.3, Math.max(sc.W, sc.H) * 0.5, '#3fd1b4', 0.14))
  // Ripples.
  for (let n = Math.max(3, Math.round((sc.cols * sc.rows) / 400)); n > 0; n--) {
    const dur = r1(sc.rnd(3, 5))
    const begin = r1(sc.rnd(0, 5))
    sc.add(
      `<circle cx="${r1(sc.rnd(0, sc.W))}" cy="${r1(sc.rnd(0, sc.H))}" r="1" fill="none" stroke="#c8f7ee" stroke-width="${r1(sc.cell * 0.3)}" stroke-dasharray="${r1(sc.cell * 0.3)} ${r1(sc.cell * 0.7)}">` +
        `<animate attributeName="r" from="1" to="${r1(sc.cell * sc.rnd(3, 6))}" dur="${dur}s" begin="-${begin}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" from=".6" to="0" dur="${dur}s" begin="-${begin}s" repeatCount="indefinite"/></circle>`,
    )
  }
  // Koi swim closed loops; the sprite turns with the path.
  const n = Math.max(2, Math.min(8, Math.round((sc.cols * sc.rows) / 600)))
  for (let k = 0; k < n; k++) {
    const pal = sc.pick(KOI_PALS)
    const A = sc.defSprite(KOI_A, pal)
    const B = sc.defSprite(KOI_B, pal)
    const pts = Array.from({ length: 4 }, () => [r1(sc.rnd(sc.W * 0.08, sc.W * 0.92)), r1(sc.rnd(sc.H * 0.1, sc.H * 0.9))])
    const [p0, p1, p2, p3] = pts
    const path = `M${p0}C${p1} ${p2} ${p3}S${p1} ${p0}`
    const len = 4 * Math.max(sc.W, sc.H)
    const fish = `<g transform="translate(${r1(-5.5 * sc.cell)} ${r1(-2.5 * sc.cell)})">${flipbook(A, B, 0.6)}</g>`
    sc.add(`<g><animateMotion path="${path}" rotate="auto" dur="${r1(len / (sc.cell * sc.rnd(1.4, 2.4)))}s" begin="-${r1(sc.rnd(0, 60))}s" repeatCount="indefinite"/>${fish}</g>`)
  }
  // Lily pads float above the fish.
  const pads: Tile[] = []
  for (let k = Math.max(3, Math.round((sc.cols * sc.rows) / 500)); k > 0; k--) {
    const px = sc.int(0, sc.cols)
    const py = sc.int(0, sc.rows)
    const r = sc.int(2, sc.cols > 60 ? 4 : 3)
    const notch = sc.rnd(0, Math.PI * 2)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy)
        if (d > r + 0.35) continue
        const ang = Math.atan2(dy, dx)
        if (d > 0.8 && Math.abs(Math.atan2(Math.sin(ang - notch), Math.cos(ang - notch))) < 0.45) continue
        const edge = d > r - 0.65
        pads.push([px + dx, py + dy, edge ? '#57ba68' : '#3f9c51', edge ? '#3f9c51' : '#2d7a3d', sc.glyph(dx, dy)])
      }
    }
    if (sc.rand() < 0.3) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) pads.push([px + dx, py + dy, '#ff9fcb', '#e0679d', '*'])
      pads.push([px, py, '#ffe27a', '#e0b93f', '*'])
    }
  }
  sc.add(sc.tiles(pads))
}

const JELLY_A = ['   bbb   ', ' bBBBBBb ', 'bBBbBbBBb', 'b b b b b', ' t  t  t ', '  t  t  t', ' t  t  t ', '  t  t   ']
const JELLY_B = ['   bbb   ', '  bBBBb  ', ' bBbBbBb ', '  b b b  ', '  t t t  ', '  t t t  ', '   t t t ', '  t t t  ', '   t t   ']
const JELLY_COLS: [string, string][] = [
  ['#ff8fc8', '#ffd1e8'],
  ['#b49cff', '#e0d6ff'],
  ['#74dcff', '#c9f2ff'],
  ['#ffb08a', '#ffe0cf'],
]

function jelly(sc: Scene) {
  sc.vgrad(['#0b3c6b', '#072a52', '#030f24'])
  sc.add(sc.glow(sc.W / 2, -sc.H * 0.15, sc.H, '#5bb6ff', 0.22))
  for (let k = Math.max(10, Math.round((sc.cols * sc.rows) / 90)); k > 0; k--) {
    const d = r1(Math.max(1.2, sc.cell * 0.2))
    sc.add(
      `<rect x="${r1(sc.rnd(0, sc.W))}" y="0" width="${d}" height="${d}" fill="#bfe6ff" opacity=".4"><animateTransform attributeName="transform" type="translate" from="0 -10" to="${r1(sc.rnd(-15, 15))} ${sc.H + 10}" dur="${r1(sc.rnd(20, 45))}s" begin="-${r1(sc.rnd(0, 45))}s" repeatCount="indefinite"/></rect>`,
    )
  }
  const n = Math.max(2, Math.min(9, Math.round((sc.cols * sc.rows) / 500)))
  for (let k = 0; k < n; k++) {
    const [m, l] = sc.pick(JELLY_COLS)
    const pal: Pal = { B: [m, l], b: [l, m], t: [null, l, '|'] }
    const A = sc.defSprite(JELLY_A, pal)
    const B = sc.defSprite(JELLY_B, pal)
    const x = sc.rnd(0, Math.max(1, sc.W - 9 * sc.cell))
    const dur = r1(sc.rnd(16, 30))
    const body = sc.glow(4.5 * sc.cell, 2 * sc.cell, 5.5 * sc.cell, m, 0.3) + flipbook(A, B, 1.4)
    sc.add(
      `<g><animateTransform attributeName="transform" type="translate" from="${r1(x)} ${sc.H + 2 * sc.cell}" to="${r1(x + sc.rnd(-30, 30))} ${-10 * sc.cell}" dur="${dur}s" begin="-${r1(sc.rnd(0, dur))}s" repeatCount="indefinite"/>${body}</g>`,
    )
  }
}

const BOAT = ['    m    ', '    mM   ', '   mmMM  ', '  mmmMMM ', 'hhhhhhhhh', ' hhhhhhh ', '  hhhhh  ']
const boatPal = (a: string, b: string, c: string): Pal => ({ m: [a, c], M: [b, c], h: [a, c] })
const BOAT_PALS = [boatPal('#ffffff', '#e4ecef', '#b9c7ce'), boatPal('#fff3c4', '#f0e0a0', '#cdb877'), boatPal('#ffe1ea', '#f4c8d6', '#d39bb0')]

function boats(sc: Scene) {
  sc.vgrad(['#d4f4ee', '#9fdfd8', '#63c2c4'])
  sc.add(sc.glow(sc.W * 0.8, sc.H * 0.05, sc.H * 0.6, '#ffffff', 0.4))
  const top = Math.round(sc.rows * 0.22)
  // Wave rows: a repeating strip slides by one period and loops seamlessly.
  const period = 24
  let band = 0
  for (let y = top; y < sc.rows; y += sc.int(3, 5), band++) {
    const tiles: Tile[] = []
    const crest = Array.from({ length: period }, () => sc.rand() < 0.22)
    for (let x = -period; x < sc.cols + period; x++) {
      const u = ((x % period) + period) % period
      if (crest[u]) tiles.push([x, y + (u % 8 < 4 ? 0 : 1), '#ffffff40', '#ffffff', '~'])
    }
    const dir = band % 2 ? 1 : -1
    sc.add(
      `<g><animateTransform attributeName="transform" type="translate" from="0 0" to="${dir * period * sc.cell} 0" dur="${r1(sc.rnd(12, 24))}s" repeatCount="indefinite"/>${sc.tiles(tiles)}</g>`,
    )
  }
  for (let k = Math.max(6, Math.round((sc.cols * sc.rows) / 200)); k > 0; k--) {
    const g: Tile = [sc.int(0, sc.cols), sc.int(top, sc.rows), null, '#ffffff', '+']
    sc.add(`<g>${twinkle(sc.rnd(1.5, 3.5), sc.rnd(0, 3.5), 0)}${sc.tiles([g])}</g>`)
  }
  const ids = BOAT_PALS.map(p => sc.defSprite(BOAT, p))
  const n = Math.max(2, Math.min(7, Math.round((sc.cols * sc.rows) / 800)))
  const rows = Array.from({ length: n }, () => sc.int(top, Math.max(top, sc.rows - 8))).sort((a, b) => a - b)
  for (const row of rows) {
    const shadow = `<path fill="#145a64" opacity=".18" d="M${sc.cell} ${7 * sc.cell}h${7 * sc.cell}v${sc.cell}h-${7 * sc.cell}z"/>`
    const span = sc.W + 20 * sc.cell
    sc.drift(bob(shadow + use(sc.pick(ids)), sc.cell * 0.7, r1(sc.rnd(2.5, 4))), -10 * sc.cell, sc.W + 10 * sc.cell, row * sc.cell, span / (sc.cell * sc.rnd(0.5, 1.1)), sc.rand())
  }
}

function fireflies(sc: Scene) {
  sc.vgrad(['#061210', '#0a1c16', '#0f2a1e'])
  sc.add(sc.glow(sc.W * 0.15, sc.H * 0.1, sc.H * 0.5, '#9bd88a', 0.08))
  const seed = sc.int(1, 9999)
  const land: Tile[] = []
  for (let x = 0; x < sc.cols; x++) {
    const hf = Math.round(sc.rows * 0.26 + Math.sin(x * 0.08 + seed) * 2.2 + Math.sin(x * 0.21) * 1.2)
    for (let y = sc.rows - hf; y < sc.rows; y++) land.push([x, y, '#0e261a', '#133222', sc.glyph(x, y)])
  }
  for (let k = Math.max(3, Math.round(sc.cols / 10)); k > 0; k--) {
    const px = sc.int(0, sc.cols)
    const ph = Math.round(sc.rows * sc.rnd(0.3, 0.48))
    for (let j = 0; j < ph; j++) {
      const half = Math.floor(j * 0.32)
      for (let dx = -half; dx <= half; dx++) land.push([px + dx, sc.rows - ph + j, '#0b2016', '#10291b', sc.glyph(dx, j)])
    }
  }
  for (let x = 0; x < sc.cols; x++) {
    const hn = Math.round(sc.rows * 0.1 + Math.sin(x * 0.3 + seed))
    for (let y = sc.rows - hn; y < sc.rows; y++) land.push([x, y, '#08150e', '#0c1f14', sc.glyph(x, y)])
  }
  sc.add(sc.tiles(land))
  for (let k = Math.max(8, Math.min(50, Math.round((sc.cols * sc.rows) / 140))); k > 0; k--) {
    const pts = Array.from({ length: 3 }, () => `${r1(sc.rnd(0, sc.W))} ${r1(sc.rnd(0, sc.H * 0.85))}`)
    const path = `M${pts[0]}Q${pts[1]} ${pts[2]}T${pts[0]}`
    const blink = twinkle(sc.rnd(1.6, 4), sc.rnd(0, 4), 0)
    const s = r1(sc.cell * 0.8)
    const body =
      sc.glow(0, 0, sc.cell * 2.8, '#d9ff6e', 0.5) +
      `<rect x="${r1(-s / 2)}" y="${r1(-s / 2)}" width="${s}" height="${s}" fill="#f1ffa6"/>`
    sc.add(`<g>${blink}<animateMotion path="${path}" dur="${r1(sc.rnd(25, 60))}s" begin="-${r1(sc.rnd(0, 60))}s" repeatCount="indefinite"/>${body}</g>`)
  }
}

function moon(sc: Scene) {
  const sea = Math.round(sc.rows * 0.8)
  const mx = Math.round(sc.cols * 0.78)
  const my = Math.max(3, Math.round(sc.rows * 0.2))
  const mr = Math.max(2, Math.min(7, Math.round(Math.min(sc.cols, sc.rows) * 0.08)))
  sc.vgrad(['#0a1036', '#141c50', '#26306e'])
  const id = sc.id('g')
  sc.def(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#111a4c"/><stop offset="1" stop-color="#070b28"/></linearGradient>`)
  sc.add(`<rect y="${sea * sc.cell}" width="${sc.W}" height="${sc.H - sea * sc.cell}" fill="url(#${id})"/>`)
  sc.add(sc.glow((mx + 0.5) * sc.cell, (my + 0.5) * sc.cell, mr * sc.cell * 5, '#fff2c4', 0.24))
  // Stars twinkle in a few groups, each on its own beat.
  const groups: Tile[][] = [[], [], [], []]
  for (let k = Math.max(15, Math.min(160, Math.round((sc.cols * sc.rows) / 60))); k > 0; k--) {
    const x = sc.int(0, sc.cols - 1)
    const y = sc.int(0, Math.max(0, sea - 2))
    if (Math.hypot(x - mx, y - my) < mr + 2) continue
    sc.pick(groups).push([x, y, null, '#e8ecff', sc.pick(['.', '+', '*', ':'])])
  }
  groups.forEach((g, i) => sc.add(`<g>${twinkle(2 + i * 0.7, i * 0.9, 0.25)}${sc.tiles(g)}</g>`))
  const disc: Tile[] = []
  for (let dy = -mr; dy <= mr; dy++) {
    for (let dx = -mr; dx <= mr; dx++) {
      const d = Math.hypot(dx, dy)
      if (d > mr + 0.3) continue
      const crater = (Math.abs(dx * 31 + dy * 17) % 7 === 0) && d < mr - 0.8
      disc.push([mx + dx, my + dy, crater ? '#eadb9f' : d > mr - 0.7 ? '#fff9e3' : '#fff2c7', '#e0cf8e', crater ? 'o' : sc.glyph(dx, dy)])
    }
  }
  sc.add(sc.tiles(disc))
  clouds(sc, { c: ['#27306e', '#323d86'], e: ['#222a61', '#2c3678'] }, Math.max(2, Math.min(5, Math.round(sc.cols / 25))), sea * sc.cell * 0.6, 0.4, 0.75)
  // Sea: drifting wave glyphs and the moon's flickering reflection.
  const waves: Tile[] = []
  const glints: Tile[] = []
  for (let y = sea + 1; y < sc.rows; y++) {
    const d = y - sea
    for (let x = 0; x < sc.cols; x++) if ((x * 13 + y * 7) % 17 === 0) waves.push([x, y, null, '#4a57a8', '~'])
    const spread = Math.round(1 + d * 0.7)
    for (let x = mx - spread; x <= mx + spread; x++) if (sc.rand() < 0.3) glints.push([x, y, '#fff0b8', '#e2cf86', '~'])
  }
  sc.add(`<g><animateTransform attributeName="transform" type="translate" values="0 0;${sc.cell * 2} 0;0 0" dur="9s" repeatCount="indefinite"/>${sc.tiles(waves)}</g>`)
  sc.add(`<g opacity=".55"><animate attributeName="opacity" values=".35;.65;.4;.6;.35" dur="2.5s" repeatCount="indefinite"/>${sc.tiles(glints)}</g>`)
  // A shooting star crosses now and then.
  const trail: Tile[] = Array.from({ length: 8 }, (_, i) => [i, Math.round(i * 0.45), i ? '#cfd8ff' : '#ffffff', null, ''])
  const sx = sc.W * 0.9
  sc.add(
    `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.02;.12;.16;1" dur="11s" repeatCount="indefinite"/>` +
      `<animateTransform attributeName="transform" type="translate" values="${r1(sx)} 0;${r1(sx - sc.W * 0.5)} ${r1(sea * sc.cell * 0.3)};${r1(sx - sc.W * 0.5)} ${r1(sea * sc.cell * 0.3)}" keyTimes="0;.16;1" dur="11s" repeatCount="indefinite"/>${sc.tiles(trail)}</g>`,
  )
}

// Vietnam's flag: 2:3, red field, a yellow five-pointed star whose
// centre-to-tip radius is 1/5 of the flag's length, one point up.
const FLAG_RED = '#da251d'
const FLAG_RED_GLYPH = '#b51f18'
const FLAG_YELLOW = '#ffea00'
const FLAG_YELLOW_GLYPH = '#cfb800'

function inStar(x: number, y: number, cx: number, cy: number, R: number) {
  const r = R * 0.381966
  let inside = false
  for (let k = 0, j = 9; k < 10; j = k++) {
    const ak = -Math.PI / 2 + (k * Math.PI) / 5
    const aj = -Math.PI / 2 + (j * Math.PI) / 5
    const rk = k % 2 ? r : R
    const rj = j % 2 ? r : R
    const xk = cx + Math.cos(ak) * rk
    const yk = cy + Math.sin(ak) * rk
    const xj = cx + Math.cos(aj) * rj
    const yj = cy + Math.sin(aj) * rj
    if (yk > y !== yj > y && x < ((xj - xk) * (y - yk)) / (yj - yk) + xk) inside = !inside
  }
  return inside
}

function karstRow(cols: number, peaks: { x: number; w: number; h: number; lean: number }[]) {
  const hs = new Array<number>(cols).fill(0)
  for (const p of peaks) {
    for (let x = Math.floor(p.x - p.w * 1.3); x <= Math.ceil(p.x + p.w * 1.3); x++) {
      if (x < 0 || x >= cols) continue
      const dx = x + 0.5 - p.x
      const d = Math.abs(dx) / (p.w * (dx < 0 ? 1 + p.lean : 1 - p.lean))
      if (d >= 1) continue
      hs[x] = Math.max(hs[x] ?? 0, Math.round(p.h * Math.pow(1 - Math.pow(d, 2.6), 0.55)))
    }
  }
  return hs
}

function vn(sc: Scene) {
  const c = sc.cell
  const horizon = Math.round(sc.rows * 0.8)
  const top = Math.max(1, Math.round(sc.rows * 0.12))
  const narrow = sc.cols < 60
  const L = Math.round(Math.max(8, Math.min(48, Math.min(sc.cols * (narrow ? 0.55 : 0.34), (horizon - top - 2) * 1.5))))
  const H = Math.round((L * 2) / 3)
  const px = Math.round(Math.max(2, Math.min(narrow ? sc.cols - L - 3 : sc.cols * 0.62, sc.cols - L - 2)))

  // Sky and sea.
  const sky = sc.id('g')
  sc.def(`<linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f9fe0"/><stop offset=".55" stop-color="#9fd2f2"/><stop offset="1" stop-color="#ffe0b0"/></linearGradient>`)
  sc.add(`<rect width="${sc.W}" height="${horizon * c}" fill="url(#${sky})"/>`)
  const sea = sc.id('g')
  sc.def(`<linearGradient id="${sea}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fb7cc"/><stop offset="1" stop-color="#2c7896"/></linearGradient>`)
  sc.add(`<rect y="${horizon * c}" width="${sc.W}" height="${sc.H - horizon * c}" fill="url(#${sea})"/>`)
  sc.add(sc.glow(sc.W * 0.82, horizon * c, Math.max(sc.W, sc.H) * 0.45, '#ffd27a', 0.55))

  // Rising sun, then hazy far towers and darker near towers with green crowns.
  const land: Tile[] = []
  const sx = Math.round(sc.cols * 0.82)
  const sr = Math.max(2, Math.min(5, Math.round(sc.rows * 0.07)))
  for (let dy = -sr; dy <= 0; dy++) for (let dx = -sr; dx <= sr; dx++) if (Math.hypot(dx, dy) <= sr + 0.3) land.push([sx + dx, horizon - 1 + dy, '#fff0b8', '#f5d27a', sc.glyph(dx, dy)])
  const cluster = (n: number, wMin: number, wMax: number, hMax: number) => {
    const out: { x: number; w: number; h: number; lean: number }[] = []
    for (let k = 0; k < n; k++) {
      const x = sc.rnd(0, sc.cols)
      const h = sc.rnd(hMax * 0.55, hMax)
      const w = sc.rnd(wMin, wMax)
      out.push({ x, w, h, lean: sc.rnd(-0.25, 0.25) })
      if (sc.rand() < 0.7) out.push({ x: x + w * sc.rnd(0.8, 1.3) * (sc.rand() < 0.5 ? -1 : 1), w: w * 0.7, h: h * sc.rnd(0.45, 0.7), lean: sc.rnd(-0.25, 0.25) })
    }
    return out
  }
  const far = karstRow(sc.cols, cluster(Math.round(Math.max(2, Math.min(8, sc.cols / 14))), 3, 6, Math.max(4, sc.rows * 0.16)))
  const near = karstRow(sc.cols, cluster(Math.round(Math.max(1, Math.min(5, sc.cols / 22))), 3.5, 7, Math.max(5, sc.rows * 0.24)))
  sc.add(sc.tiles(land))
  const farTiles: Tile[] = []
  const nearTiles: Tile[] = []
  const reflect: Tile[] = []
  for (let x = 0; x < sc.cols; x++) {
    for (let k = 0; k < (far[x] ?? 0); k++) farTiles.push([x, horizon - 1 - k, '#a9c4cf', '#97b5c2', sc.glyph(x, k)])
    const hgt = near[x] ?? 0
    for (let k = 0; k < hgt; k++) {
      const crown = k >= hgt - 2 && hgt > 2
      nearTiles.push([x, horizon - 1 - k, crown ? '#6f9e7c' : '#5b8b92', crown ? '#557f62' : '#46737a', sc.glyph(x, k)])
    }
    for (let k = 0; k < Math.min(hgt, sc.rows - horizon) * 0.5; k++) reflect.push([x, horizon + k, '#3f7f8f', null, ''])
  }
  sc.add(`<g opacity=".8">${sc.tiles(farTiles)}</g>`)
  sc.add(sc.tiles(nearTiles))
  sc.add(`<g opacity=".3">${sc.tiles(reflect)}</g>`)

  clouds(sc, { c: ['#ffffff', '#a9c1d6'], e: ['#eef6fd', '#c3d5e5'] }, Math.max(2, Math.min(5, Math.round(sc.cols / 30))), horizon * c * 0.45, 0.5, 0.9)

  // Birds glide right to left, flapping.
  for (let k = Math.round(Math.max(2, Math.min(8, sc.cols / 14))); k > 0; k--) {
    const y = sc.rnd(2, horizon * 0.5) * c
    const bird = sc.glyphs
      ? `<text fill="#33475b" x="0" y="0">v<animate attributeName="opacity" values="1;0" calcMode="discrete" dur=".5s" repeatCount="indefinite"/></text><text fill="#33475b" x="0" y="0" opacity="0">-<animate attributeName="opacity" values="0;1" calcMode="discrete" dur=".5s" repeatCount="indefinite"/></text>`
      : `<rect x="0" y="-1" width="${r1(c * 0.8)}" height="1" fill="#33475b"/>`
    sc.drift(bird, sc.W + 20, -20, y, (sc.W + 40) / (c * sc.rnd(0.8, 1.8)), sc.rand(), 0.85)
  }

  // Water ripples and the sun's glittering path.
  const ripples: Tile[] = []
  const glints: Tile[] = []
  for (let y = horizon; y < sc.rows; y++) {
    const d = y - horizon
    for (let x = 0; x < sc.cols; x++) if ((x * 13 + y * 7) % 17 === 0) ripples.push([x, y, null, '#e6f6fb', '~'])
    const spread = Math.round(1 + d * 0.8)
    for (let x = sx - spread; x <= sx + spread; x++) if (sc.rand() < 0.3) glints.push([x, y, '#fff0b8', '#f0d27a', '~'])
  }
  sc.add(`<g opacity=".55"><animateTransform attributeName="transform" type="translate" values="0 0;${c * 2} 0;0 0" dur="8s" repeatCount="indefinite"/>${sc.tiles(ripples)}</g>`)
  sc.add(`<g opacity=".6"><animate attributeName="opacity" values=".4;.7;.45;.65;.4" dur="2.4s" repeatCount="indefinite"/>${sc.tiles(glints)}</g>`)

  // Pole with a gold finial and a stone base.
  const pole: Tile[] = []
  for (let y = top - 1; y <= horizon + 1; y++) pole.push([px, y, '#ece6d8', '#bdb5a3', '|'])
  pole.push([px, top - 2, '#ffd34d', '#c99a1c', 'o'])
  for (let dx = -1; dx <= 1; dx++) pole.push([px + dx, horizon + 2, '#8d99a6', '#6d7884', '='])
  sc.add(sc.tiles(pole))

  // The flag: every column bobs on the same sine wave, offset by its distance
  // from the pole; amplitude grows toward the free end. A dark/light overlay
  // per column follows the slope of the cloth.
  const A = Math.max(1, H * 0.14)
  const k = (Math.PI * 2.2) / L
  const N = 16
  const dur = 1.85
  for (let i = 0; i < L; i++) {
    const f = Math.pow((i + 1) / L, 0.8)
    const col: Tile[] = []
    for (let j = 0; j < H; j++) {
      let n = 0
      for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) if (inStar(i + (a + 0.5) / 6, j + (b + 0.5) / 6, L / 2, H / 2, L / 5)) n++
      const star = n / 36 >= 0.22
      col.push([px + 1 + i, top + j, star ? FLAG_YELLOW : FLAG_RED, star ? FLAG_YELLOW_GLYPH : FLAG_RED_GLYPH, star ? '*' : sc.glyph(i, j)])
    }
    const ys: number[] = []
    const dark: number[] = []
    const light: number[] = []
    for (let s2 = 0; s2 <= N; s2++) {
      const ph = i * k - (Math.PI * 2 * s2) / N
      ys.push(Math.round((Math.sin(ph) + 0.18 * Math.sin(ph * 2 + 1)) * A * f) * c)
      const slope = Math.cos(ph) * (0.6 + f) * 0.5
      dark.push(r1(Math.max(0, -slope) * 0.32))
      light.push(r1(Math.max(0, slope) * 0.22))
    }
    const x = (px + 1 + i) * c
    sc.add(
      `<g><animateTransform attributeName="transform" type="translate" values="${ys.map(v => `0 ${v}`).join(';')}" dur="${dur}s" repeatCount="indefinite"/>` +
        sc.tiles(col) +
        `<rect x="${x}" y="${top * c}" width="${c}" height="${H * c}" fill="#000" opacity="0"><animate attributeName="opacity" values="${dark.join(';')}" dur="${dur}s" repeatCount="indefinite"/></rect>` +
        `<rect x="${x}" y="${top * c}" width="${c}" height="${H * c}" fill="#fff" opacity="0"><animate attributeName="opacity" values="${light.join(';')}" dur="${dur}s" repeatCount="indefinite"/></rect></g>`,
    )
  }
}

/* ----------------------------------------------------------------- entry */

const BUILDERS: Record<string, [glyphs: string, draw: (sc: Scene) => void]> = {
  code: ['{}<>/$_;:=+*', code],
  cloud: ['t%i:;tt%', cloud],
  lagoon: ['~o.:*', lagoon],
  koi: ['~:.o', koi],
  jelly: ['~*.:o', jelly],
  boats: ['~-.', boats],
  fireflies: ['|/\\^.', fireflies],
  moon: ['+*.:', moon],
  vn: [':.;', vn],
}

const SIZES: Record<Layout, [w: number, h: number, cell: number]> = {
  band: [1200, 132, 12],
  side: [420, 900, 12],
  thumb: [168, 96, 6],
}

const cache = new Map<string, string>()

/** The SVG document for a theme in one of the three layouts; memoized. */
export function scene(themeId: string, layout: Layout): string {
  const key = `${themeId}:${layout}`
  const hit = cache.get(key)
  if (hit) return hit
  const b = BUILDERS[themeId]
  const t = byId(themeId)
  if (!b || !t) return ''
  const [w, h, cell] = SIZES[layout]
  let seed = 7
  for (const ch of key) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619)
  const sc = new Scene(w, h, cell, seed, b[0])
  b[1](sc)
  const svg = sc.render(`${t.name}: ${t.desc}`)
  cache.set(key, svg)
  return svg
}
