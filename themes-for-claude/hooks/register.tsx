import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Prefs } from '../types'
import { THEMES, byId, findTheme, scene } from './scenes'

const DEFAULTS: Prefs = { theme: 'cloud', band: true, tint: true }
const STORE_KEY = 'prefs'
// Change the tag when Prefs changes: it declines what an earlier version kept.
const prefs = atom({ plugin: 'themes-for-claude', key: 'prefs' } as const, DEFAULTS, { shape: 'prefs-1' })

const PICKER = 'desk-picker'
const SIDE = 'desk-scene'

/** Applies `fn` to the current prefs, then keeps the result across sessions. */
async function change($: EngineInterface, fn: (p: Prefs) => Prefs): Promise<Prefs> {
  let out = DEFAULTS
  await update($, prefs, p => (out = fn(p)))
  await $.store.set(STORE_KEY, out)
  return out
}

function restore(saved: unknown): Prefs {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<Prefs>
  return {
    theme: typeof s.theme === 'string' && (s.theme === 'off' || byId(s.theme)) ? s.theme : DEFAULTS.theme,
    band: typeof s.band === 'boolean' ? s.band : DEFAULTS.band,
    tint: typeof s.tint === 'boolean' ? s.tint : DEFAULTS.tint,
  }
}

const label = (id: string) => (id === 'off' ? 'Tắt' : (byId(id)?.name ?? id))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get(STORE_KEY)
    if (saved !== undefined) await update($, prefs, () => restore(saved))
    await $.command.register({
      name: 'desk',
      description: 'Khung cảnh ASCII: mở bảng chọn, hoặc /desk <theme> (koi, moon, off…)',
      argumentHint: '[theme | off | side | band | tint]',
    })

    return next(e)
  })

  on('command.run', { command: 'desk' }, async ($, e) => {
    const arg = e.args.trim()
    const word = arg.toLowerCase()

    if (!arg) {
      await $.ui.open({ id: PICKER, title: 'Claude Themes', focus: true, closeOnEscape: true })
      return { text: 'Đã mở bảng chọn khung cảnh ASCII.' }
    }
    if (word === 'side') {
      await $.ui.open({ id: SIDE, title: 'Desk scene', backgroundColor: 'transparent' })
      return { text: 'Đã mở khung cảnh ASCII bên cạnh.' }
    }
    if (word === 'band' || word === 'tint') {
      const p = await change($, cur => ({ ...cur, [word]: !cur[word] }))
      const what = word === 'band' ? 'Dải cảnh trên ô chat' : 'Tô màu tin nhắn'
      return { text: `${what}: ${p[word] ? 'bật' : 'tắt'}.` }
    }

    const id = findTheme(arg)
    if (!id) {
      return { text: `Không có theme "${arg}". Các theme: ${THEMES.map(t => t.id).join(', ')}, off.` }
    }
    await change($, cur => ({ ...cur, theme: id }))

    return { text: id === 'off' ? 'Đã tắt khung cảnh ASCII.' : `Đã đổi sang ${label(id)}.` }
  })

  // The picker: a thumbnail per theme where the surface draws SVG, a list elsewhere.
  on('ui.render', { component: 'Pane', requestId: PICKER }, async ($, e) => {
    const p = await read($, prefs)
    const pick = (id: string) => () => change($, cur => ({ ...cur, theme: id }))
    const flip = (key: 'band' | 'tint') => () => change($, cur => ({ ...cur, [key]: !cur[key] }))
    const mark = (id: string) => (id === p.theme ? '✓ ' : '')

    if (e.surface === 'terminal') {
      const { Box, Button, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Text dimColor>Cảnh động chỉ hiện trong app Desktop, VS Code và điện thoại; ở đây bạn vẫn đổi theme và màu tin nhắn.</Text>
          {[...THEMES.map(t => t.id), 'off'].map(id => (
            <Button key={id} plain onPress={pick(id)}>
              {mark(id)}
              {label(id)}
            </Button>
          ))}
          <Button key="tint" label={`Tô màu tin nhắn: ${p.tint ? 'bật' : 'tắt'}`} onPress={flip('tint')} />
        </Box>
      )
    }

    const { Box, Button, Svg, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {THEMES.map(t => (
            <Box key={`card-${t.id}`} flexDirection="column">
              <Svg source={scene(t.id, 'thumb')} alt={`${t.name}: ${t.desc}`} width={168} height={96} />
              <Button key={t.id} plain onPress={pick(t.id)}>
                {mark(t.id)}
                {t.name}
              </Button>
              <Text dimColor>{t.desc}</Text>
            </Box>
          ))}
          <Box key="card-off" flexDirection="column">
            <Button key="off" plain onPress={pick('off')}>
              {mark('off')}Tắt hình nền
            </Button>
          </Box>
        </Box>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          <Button key="band" label={`Dải cảnh trên ô chat: ${p.band ? 'bật' : 'tắt'}`} onPress={flip('band')} />
          <Button key="tint" label={`Tô màu tin nhắn: ${p.tint ? 'bật' : 'tắt'}`} onPress={flip('tint')} />
          <Button
            key="side"
            label="Mở khung cảnh bên cạnh"
            onPress={() => $.ui.open({ id: SIDE, title: 'Desk scene', backgroundColor: 'transparent' })}
          />
        </Box>
      </Box>
    )
  })

  // The animated strip just above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface === 'terminal' || e.props.hasSurvey) return next(e)
    const p = await read($, prefs)
    const t = byId(p.theme)
    if (!t || !p.band) return next(e)
    const { Box, Svg } = $.ui.resolve(e)
    const others = await next(e)

    return (
      <Box flexDirection="column">
        {others}
        <Svg source={scene(t.id, 'band')} alt={`${t.name}: ${t.desc}`} height={84} isInteractive />
      </Box>
    )
  })

  // A tall scene in a pane beside the transcript.
  on('ui.render', { component: 'Pane', requestId: SIDE }, async ($, e) => {
    const p = await read($, prefs)
    const t = byId(p.theme)
    if (e.surface === 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>Khung cảnh ASCII chỉ hiện trong app Desktop, VS Code và điện thoại.</Text>
    }
    const { Svg, Text } = $.ui.resolve(e)
    if (!t) return <Text dimColor>Hình nền đang tắt. Gõ /desk để chọn theme.</Text>

    return <Svg source={scene(t.id, 'side')} alt={`${t.name}: ${t.desc}`} isInteractive />
  })

  // Themed frames around chat messages.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const inner = await next(e)
    const p = await read($, prefs)
    const t = byId(p.theme)
    if (!t || !p.tint || e.props.isExpanded || e.props.task || e.props.from) return inner
    const { Box } = $.ui.resolve(e)

    return (
      <Box borderStyle="round" borderColor={t.accent} backgroundColor={e.surface === 'terminal' ? undefined : t.bubble} paddingX={1}>
        {inner}
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const inner = await next(e)
    const p = await read($, prefs)
    const t = byId(p.theme)
    if (!t || !p.tint || e.props.isSummary) return inner
    const { Box } = $.ui.resolve(e)

    return (
      <Box borderStyle="round" borderColor={t.accent} borderDimColor paddingX={1}>
        {inner}
      </Box>
    )
  })
}
