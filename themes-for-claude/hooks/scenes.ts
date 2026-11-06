// ASCII scenes as self-animating SVG (SMIL), one per theme.
// Same five themes as the claude.ai userscript, drawn as a grid of tiles
// that each carry one glyph. Seeded randomness keeps every redraw identical,
// so a re-render never restarts the animation with a new layout.

export type Layout = 'side' | 'thumb'

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
  { id: 'beaver', name: 'Hải Ly Hồng', desc: 'hải ly hồng ngồi trên khúc gỗ, tim bay', dark: false, alias: ['hai ly', 'hai ly hong', 'beaver', 'pink', 'hong'], accent: '#f07aa8', bubble: '#f07aa822' },
  { id: 'bunny', name: 'Thỏ Bảy Màu', desc: 'thỏ trắng nhảy dưới cầu vồng', dark: false, alias: ['tho', 'tho bay mau', 'bay mau', 'tho trang', 'bunny', 'rabbit', 'rainbow', 'cau vong'], accent: '#8b6cf0', bubble: '#8b6cf022' },
  { id: 'namsan', name: 'Tháp Namsan', desc: 'Seoul về đêm, tháp đổi màu', dark: true, alias: ['namsan', 'thap namsan', 'seoul', 'han quoc', 'korea', 'n tower'], accent: '#ff5fa2', bubble: '#ff5fa222' },
  { id: 'fuji', name: 'Núi Phú Sĩ', desc: 'núi tuyết, hoa anh đào rơi', dark: false, alias: ['fuji', 'phu si', 'phu sy', 'nui phu si', 'nui phu sy', 'nhat ban', 'japan', 'sakura', 'hoa anh dao'], accent: '#e86f8c', bubble: '#e86f8c22' },
  { id: 'taxua', name: 'Tà Xùa', desc: 'biển mây, cánh đồng hoa', dark: false, alias: ['ta xua', 'taxua', 'hoa', 'canh dong hoa', 'bien may', 'son la', 'tay bac', 'flowers'], accent: '#c46bd6', bubble: '#c46bd622' },
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

/** A vertical gradient from pixel row `y` to the bottom. */
function band(sc: Scene, y: number, stops: string[]) {
  const id = sc.id('g')
  const s = stops.map((c, i) => `<stop offset="${r1(i / (stops.length - 1))}" stop-color="${c}"/>`).join('')
  sc.def(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${s}</linearGradient>`)
  sc.add(`<rect y="${r1(y)}" width="${sc.W}" height="${r1(sc.H - y)}" fill="url(#${id})"/>`)
}

/** Moves `inner` from one point to another forever, starting part-way through. */
function move(sc: Scene, inner: string, from: [number, number], to: [number, number], seconds: number, phase: number, extra = '') {
  sc.add(
    `<g${extra}><animateTransform attributeName="transform" type="translate" from="${r1(from[0])} ${r1(from[1])}" to="${r1(to[0])} ${r1(to[1])}" dur="${r1(seconds)}s" begin="-${r1(phase * seconds)}s" repeatCount="indefinite"/>${inner}</g>`,
  )
}

/** '~' ripples on the water from row `y0` down, swaying side to side. */
function ripples(sc: Scene, y0: number, color: string) {
  const list: Tile[] = []
  for (let y = y0; y < sc.rows; y++) for (let x = 0; x < sc.cols; x++) if (sc.rand() < 0.07) list.push([x, y, null, color, '~'])
  sc.add(`<g opacity=".6"><animateTransform attributeName="transform" type="translate" values="0 0;${sc.cell} 0;0 0" dur="5s" repeatCount="indefinite"/>${sc.tiles(list)}</g>`)
}

/** Shows `a` most of the time and `b` for a short moment, e.g. a blink. */
const blink = (a: string, b: string, period: number, at = 0.95) =>
  `<g>${use(a)}<animate attributeName="opacity" values="1;0" keyTimes="0;${at}" calcMode="discrete" dur="${period}s" repeatCount="indefinite"/></g>` +
  `<g opacity="0">${use(b)}<animate attributeName="opacity" values="0;1" keyTimes="0;${at}" calcMode="discrete" dur="${period}s" repeatCount="indefinite"/></g>`

const at = (x: number, y: number, inner: string) => `<g transform="translate(${r1(x)} ${r1(y)})">${inner}</g>`

/* --- Pink Beaver */

const BEAVER_PAL: Pal = {
  e: ['#ff9ec4', '#f07aa8'],
  E: ['#ffd0e1', '#f5a6c4', ''],
  p: ['#ff9ec4', '#f07aa8'],
  K: ['#3a2430', null, ''],
  w: ['#ffffff', null, ''],
  k: ['#ff9ec4', '#3a2430', '-'],
  b: ['#ff7fa8', '#ee6b96', ''],
  n: ['#9b4562', null, ''],
  T: ['#ffffff', '#d9d0d4', ''],
  h: ['#ffb8d3', '#f07aa8'],
  f: ['#ec7fa5', '#cc5f86', ''],
  t: ['#c97692', '#a2566f', '#'],
}
const BEAVER = [
  '  ee        ee  ',
  ' eEEe      eEEe ',
  '  pppppppppppp  ',
  ' pppppppppppppp ',
  'pppKwppppppKwppp',
  'pppKKppppppKKppp',
  'pbbpppnnnnpppbbp',
  ' ppppppTTpppppp ',
  '  pppppTTppppp  ',
  '   hhpppppphh   ',
  '  pppppppppppp  ',
  '  pppppppppppp  ',
  '   ff      ff   ',
]
const BEAVER_BLINK = BEAVER.map((r, j) => (j === 4 ? 'pppkkppppppkkppp' : j === 5 ? 'pppppppppppppppp' : r))
const HEART = [' h h ', 'hhhhh', ' hhh ', '  h  ']
const HEART_COLS: [string, string][] = [['#ff6f9f', '#e04f80'], ['#ffa3c2', '#f07aa8'], ['#ff8a8a', '#e26464'], ['#ffc2d9', '#f59bbd']]

function beaver(sc: Scene) {
  const c = sc.cell
  const horizon = Math.round(sc.rows * 0.74)
  sc.vgrad(['#ffd3e6', '#ffe6ef', '#fff4e8'])
  band(sc, horizon * c, ['#ade3ef', '#6cc3dc'])
  sc.add(sc.glow(sc.W * 0.22, sc.H * 0.18, Math.max(sc.W, sc.H) * 0.4, '#ffffff', 0.55))
  clouds(sc, { c: ['#ffffff', '#f3c6d6'], e: ['#fff0f6', '#f0bfd2'] }, Math.max(2, Math.round(sc.cols / 12)), horizon * c * 0.45, 0.4, 1)
  const hearts = HEART_COLS.map(([a, b]) => sc.defSprite(HEART, { h: [a, b, ''] }))
  for (let k = Math.max(3, Math.round((sc.cols * sc.rows) / 300)); k > 0; k--) {
    const x = sc.rnd(0, sc.W - 5 * c)
    move(sc, use(sc.pick(hearts)), [x, horizon * c], [x + sc.rnd(-2, 2) * c, -5 * c], sc.rnd(14, 26), sc.rand(), ` opacity="${r1(sc.rnd(0.55, 0.95))}"`)
  }
  ripples(sc, horizon + 1, '#ffffff')
  const bw = BEAVER[0]!.length
  const bx = Math.round(Math.max(0, (sc.cols - bw) / 2))
  const by = horizon - 1 - BEAVER.length
  // Log, then the beaver bouncing on it with a blink.
  const log: Tile[] = []
  for (let i = 0; i < bw + 8; i++) {
    const end = i === 0 || i === bw + 7
    log.push([bx - 4 + i, horizon - 1, end ? '#e7c08f' : '#b47a4c', end ? '#a97948' : '#8a5a35', end ? 'o' : '='])
    log.push([bx - 4 + i, horizon, end ? '#d9ad7a' : '#8f6040', end ? '#a07040' : '#6e4529', end ? 'o' : '='])
  }
  const tail = sc.defSprite([' tt ', 'tttt', 'tttt', ' tt '], BEAVER_PAL)
  sc.add(at((bx - 3) * c, (by + 8) * c, bob(use(tail), c, 0.6)))
  sc.add(sc.tiles(log))
  const open = sc.defSprite(BEAVER, BEAVER_PAL)
  const shut = sc.defSprite(BEAVER_BLINK, BEAVER_PAL)
  sc.add(at(bx * c, by * c, bob(blink(open, shut, 4), -c, 1.6)))
}

/* --- Rainbow Bunny */

const RAINBOW = ['#ff5a5a', '#ff9d3c', '#ffd93d', '#62cf5c', '#4aa8ff', '#5d63ef', '#a55cf0']
const BUNNY_PAL: Pal = {
  w: ['#ffffff', '#c9d1db'],
  i: ['#ffc2d4', '#f3a0b8', ''],
  K: ['#2d2a32', null, ''],
  n: ['#ff8fb1', null, ''],
  b: ['#ffd1dc', '#f7b5c6', ''],
  t: ['#fff7e8', '#e8dcc4', 'o'],
  f: ['#f1f3f6', '#cfd5dc', ''],
}
const BUNNY = [
  '  ww  ww   ',
  '  wi  wi   ',
  '  wi  wi   ',
  '  ww  ww   ',
  ' wwwwwwww  ',
  'wwwwwwKwww ',
  'wwwwwwwwwnw',
  'wwwwwwwbww ',
  ' wwwwwwwww ',
  'twwwwwwwww ',
  ' ff    ff  ',
]

function bunny(sc: Scene) {
  const c = sc.cell
  const horizon = Math.round(sc.rows * 0.76)
  sc.vgrad(['#7cc4f5', '#b5defb', '#e9f6ff'])
  band(sc, horizon * c, ['#9ee07a', '#5fb846'])
  sc.add(sc.glow(sc.W * 0.85, sc.H * 0.1, Math.max(sc.W, sc.H) * 0.3, '#fff6c8', 0.7))
  const cx = Math.round(sc.cols / 2)
  const R = Math.round(Math.max(6, Math.min(sc.cols * 0.45, sc.rows * 0.5)))
  const arc: Tile[] = []
  for (let y = horizon - R - 1; y < horizon; y++) {
    for (let x = cx - R - 1; x <= cx + R + 1; x++) {
      const k = Math.floor(R - Math.hypot(x + 0.5 - cx, y + 0.5 - horizon))
      if (k >= 0 && k < 7) arc.push([x, y, RAINBOW[k]!, null, ''])
    }
  }
  sc.add(`<g opacity=".5">${sc.tiles(arc)}</g>`)
  clouds(sc, { c: ['#ffffff', '#a9c1d6'], e: ['#eef6fd', '#c3d5e5'] }, Math.max(2, Math.round(sc.cols / 10)), horizon * c * 0.5, 0.5, 1)
  const ground: Tile[] = []
  for (let x = 0; x < sc.cols; x++) {
    const hh = Math.round(2 + Math.sin(x * 0.09 + 1) * 1.6)
    for (let k = 0; k < hh; k++) ground.push([x, horizon - 1 - k, '#b4e59a', '#94cf78', sc.glyph(x, k)])
  }
  const FLOWERS = ['#ffffff', '#ffd93d', '#ff8fb1', '#a55cf0']
  for (let y = horizon; y < sc.rows; y++) {
    for (let x = 0; x < sc.cols; x++) {
      const r = sc.rand()
      if (r < 0.06) ground.push([x, y, sc.pick(FLOWERS), '#5a8f3a', '*'])
      else if (r < 0.4) ground.push([x, y, null, '#3f8f2c', sc.glyph(x, y)])
    }
  }
  sc.add(sc.tiles(ground))
  for (let k = Math.max(5, Math.round((sc.cols * sc.rows) / 200)); k > 0; k--) {
    const d = r1(Math.max(1.5, c * 0.3))
    sc.add(`<rect x="${r1(sc.rnd(0, sc.W))}" y="${r1(sc.rnd(0, horizon * c))}" width="${d}" height="${d}" fill="${sc.pick(RAINBOW)}">${twinkle(sc.rnd(1.5, 3.5), sc.rnd(0, 3), 0)}</rect>`)
  }
  // The bunny hops in place: three hops, then a rest.
  const bw = BUNNY[0]!.length
  const id = sc.defSprite(BUNNY, BUNNY_PAL)
  const bx = Math.round((sc.cols - bw) / 2)
  const by = horizon - BUNNY.length + 2
  const hop = `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 ${-3 * c};0 0;0 ${-3 * c};0 0;0 ${-3 * c};0 0;0 0" keyTimes="0;.1;.2;.3;.4;.5;.6;1" dur="3.6s" repeatCount="indefinite"/>${use(id)}</g>`
  const shadow: Tile[] = []
  for (let i = 2; i < bw - 1; i++) shadow.push([bx + i, by + BUNNY.length, '#4f9a37', null, ''])
  sc.add(`<g opacity=".3">${sc.tiles(shadow)}</g>`)
  sc.add(at(bx * c, by * c, hop))
}

/* --- N Seoul Tower */

const TOWER_LIGHTS = ['#ff5fa2', '#6aa8ff', '#7cf0c8', '#ffd36a', '#b58cff']

function namsan(sc: Scene) {
  const c = sc.cell
  sc.vgrad(['#070b26', '#141a47', '#2c2160', '#5a2f6b'])
  sc.add(sc.glow(sc.W * 0.5, sc.H * 1.05, Math.max(sc.W, sc.H) * 0.6, '#ff9a6a', 0.22))
  for (let k = Math.max(12, Math.round((sc.cols * sc.rows) / 60)); k > 0; k--) {
    const d = r1(Math.max(1.2, c * 0.22))
    sc.add(`<rect x="${r1(sc.rnd(0, sc.W))}" y="${r1(sc.rnd(0, sc.H * 0.6))}" width="${d}" height="${d}" fill="#fff">${twinkle(sc.rnd(2, 5), sc.rnd(0, 5), 0.1)}</rect>`)
  }
  // Moon.
  const mx = Math.round(sc.cols * 0.22)
  const my = Math.max(2, Math.round(sc.rows * 0.1))
  const mr = Math.max(1, Math.min(4, Math.round(sc.cols * 0.06)))
  sc.add(sc.glow((mx + 0.5) * c, (my + 0.5) * c, mr * 5 * c, '#fff2cc', 0.35))
  const moon: Tile[] = []
  for (let dy = -mr; dy <= mr; dy++) for (let dx = -mr; dx <= mr; dx++) if (Math.hypot(dx, dy) <= mr + 0.3) moon.push([mx + dx, my + dy, '#fff4d6', '#e8d9a8', sc.glyph(dx, dy)])
  sc.add(sc.tiles(moon))
  // Hill, tower, skyline.
  const hx = Math.round(sc.cols / 2)
  const hh = Math.round(Math.max(4, Math.min(30, sc.rows * 0.22)))
  const hw = Math.max(10, sc.cols * 0.45)
  const hill = (x: number) => {
    const d = Math.abs(x + 0.5 - hx) / hw
    return d >= 1 ? 0 : Math.round(hh * Math.pow(1 - d * d, 0.7))
  }
  const land: Tile[] = []
  for (let x = 0; x < sc.cols; x++) {
    const h = hill(x)
    for (let k = 0; k < h; k++) land.push([x, sc.rows - 1 - k, k >= h - 1 ? '#1d4a3c' : '#163a30', '#0f2a22', k >= h - 1 ? '^' : sc.glyph(x, k)])
  }
  const top = sc.rows - hill(hx)
  const S = Math.round(Math.max(3, Math.min(18, sc.rows * 0.15)))
  const A = Math.round(Math.max(2, Math.min(11, S * 0.6)))
  for (let dx = -1; dx <= 1; dx++) for (let k = 1; k <= 2; k++) land.push([hx + dx, top - k, '#c9d1e3', '#9aa5bd', '#'])
  for (let k = 3; k < 3 + S; k++) land.push([hx, top - k, '#e8edf7', '#aab4c8', '|'])
  const py = top - 3 - S
  for (let k = 0; k < A; k++) land.push([hx, py - 4 - k, '#d5dceb', '#a2adc2', '|'])
  for (const y of [py, py - 3]) for (let dx = -2; dx <= 2; dx++) land.push([hx + dx, y, '#e8edf7', '#aab4c8', '='])
  const windows: Tile[] = []
  for (let x = 0; x < sc.cols; ) {
    const bw = sc.int(2, 5)
    const bh = Math.round(sc.rnd(sc.rows * 0.04, sc.rows * (Math.abs(x - hx) < 4 ? 0.06 : 0.14)))
    const col = sc.pick(['#151a3a', '#1b2047', '#111531'])
    for (let i = 0; i < bw; i++) {
      for (let k = 0; k < bh; k++) {
        land.push([x + i, sc.rows - 1 - k, col, '#232a58', sc.glyph(x + i, k)])
        if (sc.rand() < 0.3) windows.push([x + i, sc.rows - 1 - k, sc.pick(['#ffd98a', '#ffeab8', '#9fd2ff']), null, ''])
      }
    }
    x += bw + (sc.rand() < 0.3 ? 1 : 0)
  }
  // The lit deck changes colour every few seconds.
  const deck: Tile[] = []
  for (const y of [py - 1, py - 2]) for (let dx = -3; dx <= 3; dx++) deck.push([hx + dx, y, 'DECK', '#ffffff', '#'])
  const cycle = `<animate attributeName="fill" values="${TOWER_LIGHTS.join(';')}" calcMode="discrete" dur="${TOWER_LIGHTS.length * 4}s" repeatCount="indefinite"/>`
  const glowId = sc.id('r')
  sc.def(`<radialGradient id="${glowId}"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`)
  sc.add(sc.tiles(land))
  sc.add(`<circle cx="${r1((hx + 0.5) * c)}" cy="${r1((py - 1) * c)}" r="${r1(7 * c)}" fill="url(#${glowId})" opacity=".35"/>`)
  sc.add(sc.tiles(deck).replace(/<path fill="DECK" d="([^"]*)"\/>/, (_, d) => `<path fill="${TOWER_LIGHTS[0]}" d="${d}">${cycle}</path>`))
  sc.add(`<g>${twinkle(1.4, 0, 0.2)}${sc.tiles([[hx, py - 4 - A, '#ff4040', '#ffffff', '*']])}</g>`)
  const groups = [0, 1, 2].map(() => [] as Tile[])
  windows.forEach((w, i) => groups[i % 3]!.push(w))
  groups.forEach((g, i) => sc.add(`<g>${twinkle(sc.rnd(4, 8), i * 2, 0.35)}${sc.tiles(g)}</g>`))
}

/* --- Mount Fuji */

const TORII = ['RRRRRRRRRRR', ' rrrrrrrrr ', '  R  R  R  ', ' RRRRRRRRR ', '  R     R  ', '  R     R  ', '  R     R  ']
const SAKURA = ['#ffc4d8', '#ffadc9', '#ff97bb', '#ffe0ea']

function fuji(sc: Scene) {
  const c = sc.cell
  const horizon = Math.round(sc.rows * 0.7)
  sc.vgrad(['#8fc3ec', '#cfe2f2', '#f9d6c8', '#ffc4b4'])
  band(sc, horizon * c, ['#a9c6e0', '#6f97c2'])
  sc.add(sc.glow(sc.W * 0.2, horizon * c * 0.78, Math.max(sc.W, sc.H) * 0.35, '#ffe2c4', 0.6))
  const mx = Math.round(sc.cols / 2)
  const peakH = Math.round(Math.max(4, Math.min(40, sc.rows * 0.42, sc.cols * 0.45)))
  const topW = Math.max(1, Math.round(peakH * 0.14))
  const base = peakH * 2.6
  const fujiH = (x: number) => {
    const d = Math.abs(x + 0.5 - mx)
    if (d <= topW) return peakH
    const u = (d - topW) / base
    return u >= 1 ? 0 : Math.round(peakH * Math.pow(1 - u, 1.7))
  }
  const land: Tile[] = []
  const mirror: Tile[] = []
  for (let x = 0; x < sc.cols; x++) {
    const hh = fujiH(x)
    const snow = peakH * 0.6 + (sc.rand() - 0.5) * peakH * 0.14 - (x % 3 === 0 ? peakH * 0.08 : 0)
    const lit = x + 0.5 >= mx
    for (let k = 0; k < hh; k++) {
      const y = horizon - 1 - k
      if (k >= snow) land.push([x, y, lit ? '#ffffff' : '#e6ecf6', lit ? '#dbe3f0' : '#c6d0e2', sc.glyph(x, k)])
      else land.push([x, y, lit ? (k / peakH > 0.35 ? '#7f92c9' : '#6c81bb') : k / peakH > 0.35 ? '#6577b0' : '#566aa3', lit ? '#6476ad' : '#4b5c90', sc.glyph(x, k)])
    }
    for (let k = 0; k < Math.min(hh, sc.rows - horizon); k++) mirror.push([x, horizon + k, k >= snow ? '#ffffff' : '#6c81bb', null, ''])
    for (let k = 0; k < 1 + Math.round(sc.rand() * 1.6); k++) land.push([x, horizon - 1 - k, '#3e5a4c', '#2e463a', '^'])
  }
  sc.add(sc.tiles(land))
  sc.add(`<g opacity=".22">${sc.tiles(mirror)}</g>`)
  clouds(sc, { c: ['#fff6ef', '#f1cdbd'], e: ['#ffe9de', '#ecc0ae'] }, Math.max(2, Math.round(sc.cols / 14)), (horizon - 3) * c, 0.35, 0.8)
  ripples(sc, horizon, '#eef6ff')
  if (sc.rows - horizon > TORII.length - 2) sc.add(sc.tiles(sc.sprite(TORII, { R: ['#e0402f', '#b22e21'], r: ['#2f2a2a', '#1a1616', ''] }), Math.round(sc.cols * 0.08) * c, (horizon + 1) * c))
  // Petals drifting down and to the right.
  for (let k = Math.max(6, Math.round((sc.cols * sc.rows) / 120)); k > 0; k--) {
    const d = r1(sc.rand() < 0.4 ? c * 0.8 : c * 0.4)
    const x = sc.rnd(-sc.W * 0.3, sc.W)
    move(sc, `<rect width="${d}" height="${d}" rx="${r1(d / 3)}" fill="${sc.pick(SAKURA)}"/>`, [x, -c], [x + sc.H * 0.5, sc.H + c], sc.rnd(14, 28), sc.rand())
  }
  // A cherry branch reaching in from the top-left corner.
  const L = Math.round(Math.max(10, Math.min(60, sc.cols * 0.5)))
  const branch: Tile[] = []
  const pts: [number, number][] = []
  for (let i = 0; i <= L; i++) {
    const x = i - 1
    const y = Math.round(1 + Math.pow(i / L, 1.6) * Math.max(2, Math.min(12, sc.rows * 0.12)))
    pts.push([x, y])
    branch.push([x, y, '#6b4a3a', '#4e3428', '='])
    if (i < L * 0.4) branch.push([x, y - 1, '#5e4033', '#4e3428', '='])
  }
  for (let i = 2; i < pts.length; i += 3) {
    const [bx, by] = pts[i]!
    const r = 1.2 + sc.rand() * 1.5
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.hypot(dx, dy) <= r && sc.rand() > 0.2) branch.push([bx + dx, by + dy + 1, sc.pick(SAKURA), '#e0789c', sc.rand() < 0.3 ? '*' : ''])
  }
  sc.add(sc.tiles(branch))
}

/* --- Ta Xua: sea of clouds and flower fields */

const TAXUA_FLOWERS = ['#ff7eb6', '#e05ac0', '#b57bff', '#ffffff', '#ffc1e0', '#d68cff']

function taxua(sc: Scene) {
  const c = sc.cell
  const sea = Math.round(sc.rows * 0.5)
  const seaH = Math.max(3, Math.round(sc.rows * 0.12))
  sc.vgrad(['#6fa8e2', '#b9d3ef', '#ffd9b0', '#ffc39a', '#f5eef2'])
  sc.add(sc.glow(sc.W * 0.7, sea * c, Math.max(sc.W, sc.H) * 0.4, '#ffe6b0', 0.6))
  clouds(sc, { c: ['#ffffff', '#a9c1d6'], e: ['#eef6fd', '#c3d5e5'] }, Math.max(1, Math.round(sc.cols / 16)), sea * c * 0.35, 0.3, 0.8)
  const ridges: Tile[] = []
  for (let x = 0; x < sc.cols; x++) {
    const far = Math.round(sc.rows * 0.08 + Math.sin(x * 0.12 + 2) * sc.rows * 0.04 + Math.sin(x * 0.37) * 1.2)
    for (let k = 0; k < far; k++) ridges.push([x, sea + 1 - k, '#a9b7d8', '#97a6ca', sc.glyph(x, k)])
  }
  const peaks = Array.from({ length: Math.max(2, Math.round(sc.cols / 12)) }, () => ({ x: sc.rnd(0, sc.cols), h: sc.rnd(sc.rows * 0.06, sc.rows * 0.14), slope: sc.rnd(0.6, 1.2) }))
  for (let x = 0; x < sc.cols; x++) {
    const near = Math.round(Math.max(0, ...peaks.map(p => p.h - Math.abs(x + 0.5 - p.x) * p.slope)))
    for (let k = 0; k < near; k++) ridges.push([x, sea + 2 - k, k >= near - 1 ? '#7d93a8' : '#5f7398', '#4e6185', sc.glyph(x, k)])
  }
  sc.add(sc.tiles(ridges))
  // The sea of clouds: wide strips drifting in opposite directions.
  for (let layer = 0; layer < 3; layer++) {
    const w = sc.cols * 2
    const rows: string[] = []
    for (let j = 0; j < seaH; j++) {
      let r = ''
      for (let i = 0; i < w; i++) {
        const n = Math.sin(i * 0.2 + j * 0.9 + layer) + Math.sin(i * 0.07 + layer * 2) + (sc.rand() - 0.5)
        r += n > 0.9 - (j / seaH) * 3 ? (n > 1.6 ? 'c' : 'e') : ' '
      }
      rows.push(r)
    }
    const id = sc.defSprite(rows, { c: ['#ffffff', '#d9d6e6', '~'], e: ['#f3eef6', '#d9d6e6', ''] })
    const y = (sea - 1 + layer) * c
    const dir = layer % 2 ? -1 : 1
    move(sc, use(id), [dir > 0 ? -sc.W : 0, y], [dir > 0 ? 0 : -sc.W, y], 60 + layer * 20, sc.rand(), ` opacity="${r1(0.8 + layer * 0.1)}"`)
  }
  // The meadow, its flowers shimmering in three groups.
  const field = (x: number) => Math.round(sc.rows * 0.7 - (1 - x / sc.cols) * sc.rows * 0.1 + Math.sin(x * 0.12) * 1.2)
  const meadow: Tile[] = []
  const groups = [0, 1, 2].map(() => [] as Tile[])
  for (let x = 0; x < sc.cols; x++) {
    for (let y = field(x); y < sc.rows; y++) {
      meadow.push([x, y, '#7fae5c', '#669447', sc.glyph(x, y)])
      if (sc.rand() < 0.3) groups[(x + y) % 3]!.push([x, y, sc.pick(TAXUA_FLOWERS), '#7a3f6e', sc.rand() < 0.5 ? '*' : '+'])
    }
  }
  sc.add(sc.tiles(meadow))
  groups.forEach((g, i) => sc.add(`<g>${twinkle(3, i, 0.65)}${sc.tiles(g)}</g>`))
  for (let k = Math.max(2, Math.round(sc.cols / 8)); k > 0; k--) {
    const pts = Array.from({ length: 3 }, () => `${r1(sc.rnd(0, sc.W))} ${r1(sc.rnd(sc.H * 0.7, sc.H * 0.95))}`)
    const col = sc.pick(['#ffd23f', '#ffffff', '#ff9ad5', '#9fd8ff'])
    const wing = r1(c * 0.5)
    const body = `<g>${flipbookInline(`<rect x="${-wing}" y="${-wing / 2}" width="${wing * 2}" height="${wing}" fill="${col}"/>`, `<rect x="${-wing / 3}" y="${-wing / 2}" width="${r1(wing / 1.5)}" height="${wing}" fill="${col}"/>`, 0.25)}</g>`
    sc.add(`<g><animateMotion path="M${pts[0]}Q${pts[1]} ${pts[2]}T${pts[0]}" dur="${r1(sc.rnd(20, 40))}s" begin="-${r1(sc.rnd(0, 40))}s" repeatCount="indefinite"/>${body}</g>`)
  }
}

/** Two inline frames that swap every `period` seconds. */
const flipbookInline = (a: string, b: string, period: number) =>
  `<g>${a}<animate attributeName="opacity" values="1;0" calcMode="discrete" dur="${period}s" repeatCount="indefinite"/></g>` +
  `<g opacity="0">${b}<animate attributeName="opacity" values="0;1" calcMode="discrete" dur="${period}s" repeatCount="indefinite"/></g>`

/* ----------------------------------------------------------------- entry */

const BUILDERS: Record<string, [glyphs: string, draw: (sc: Scene) => void]> = {
  beaver: [".:'", beaver],
  bunny: [",'.\"", bunny],
  namsan: ['.:+', namsan],
  fuji: ["^.:'", fuji],
  taxua: ['~.:', taxua],
}

const SIZES: Record<Layout, [w: number, h: number, cell: number]> = {
  side: [420, 900, 12],
  thumb: [168, 96, 6],
}

const cache = new Map<string, string>()

/** The SVG document for a theme in one of the two layouts; memoized. */
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
