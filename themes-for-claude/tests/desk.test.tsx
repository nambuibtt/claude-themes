import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'themes-for-claude'
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
type Surface = (typeof SURFACES)[number]

const pane = (requestId: string, surface: Surface) =>
  ({
    plugin: PLUGIN,
    surface,
    component: 'Pane',
    requestId,
    props: { title: 'Desk', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  }) as const

const band = (surface: Surface) =>
  ({
    plugin: PLUGIN,
    surface,
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  }) as const

const userMessage = (surface: Surface) =>
  ({
    plugin: PLUGIN,
    surface,
    component: 'UserMessage',
    requestId: 'm1',
    props: { text: 'hi', origin: { kind: 'composer' }, isExpanded: false },
  }) as const

// The engine beneath the plugin: a store in memory, and a session that
// registers, opens and draws a plain row. Returns the store to read back.
function engine(on: On, kept?: unknown) {
  const store = new Map<string, unknown>(kept === undefined ? [] : [['prefs', kept]])
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'desk' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return store
}

const desk = (args: string) =>
  ({ command: 'desk', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } }) as const

test('/desk koi switches the theme, keeps it, and draws the koi strip where SVG exists', async ($, on) => {
  const store = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ran = await $.command.run(desk('koi'))
  expect(ran.text).toContain('Lotus Koi')
  expect(store.get('prefs')).toEqual({ theme: 'koi', band: true, tint: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    const svg = await ui.find({ type: 'Svg' })
    if (surface === 'terminal') expect(svg).toBeUndefined()
    else expect(String(svg?.props.alt)).toContain('Lotus Koi')
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    await ui.unmount()
  }
})

test('a theme kept from an earlier session comes back, and Vietnamese names work', async ($, on) => {
  const store = engine(on, { theme: 'moon', band: false, tint: true })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const off = await $.ui.mount(band('desktop'))
  expect(await off.find({ type: 'Svg' })).toBeUndefined()
  await off.unmount()

  await $.command.run(desk('sứa'))
  expect(store.get('prefs')).toEqual({ theme: 'jelly', band: false, tint: true })

  const unknown = await $.command.run(desk('pizza'))
  expect(unknown.text).toContain('Không có theme')

  // The flag theme answers to its Vietnamese names; "co" must not fall through to "code".
  for (const [typed, id] of [['vietnam', 'vn'], ['Việt Nam', 'vn'], ['co', 'vn'], ['code', 'code']] as const) {
    await $.command.run(desk(typed))
    expect((store.get('prefs') as { theme: string }).theme).toBe(id)
  }
})

test('the picker applies a theme on press, on every surface', async ($, on) => {
  const store = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const [surface, id] of [['terminal', 'boats'], ['desktop', 'lagoon'], ['vscode', 'fireflies'], ['mobile', 'code']] as const) {
    const ui = await $.ui.mount(pane('desk-picker', surface))
    await ui.press({ key: id })
    expect(((store.get('prefs')) as { theme: string }).theme).toBe(id)
    expect((await ui.find({ key: id }))?.text).toContain('✓')
    await ui.unmount()
  }

  const ui = await $.ui.mount(pane('desk-picker', 'desktop'))
  await ui.press({ key: 'off' })
  expect(((store.get('prefs')) as { theme: string }).theme).toBe('off')
  await ui.unmount()
})

test('messages get a themed frame until tint is turned off', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(userMessage(surface))
    const box = await ui.find({ type: 'Box' })
    expect(box?.props.borderStyle).toBe('round')
    expect(box?.props.borderColor).toBe('#5aa9e6')
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    await ui.unmount()
  }

  await $.command.run(desk('tint'))
  const plain = await $.ui.mount(userMessage('desktop'))
  expect(await plain.find({ type: 'Box' })).toBeUndefined()
  await plain.unmount()
})

test('the side pane shows the tall scene, or says the wallpaper is off', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const side = await $.ui.mount(pane('desk-scene', 'desktop'))
  expect(String((await side.find({ type: 'Svg' }))?.props.alt)).toContain('Blue Sky')
  await side.unmount()

  await $.command.run(desk('off'))
  const off = await $.ui.mount(pane('desk-scene', 'desktop'))
  expect((await off.find({ type: 'Text', text: /tắt/ }))?.text).toContain('/desk')
  await off.unmount()
})
