/** What the person chose: the theme and which parts of it show. */
export type Prefs = {
  /** A theme id from hooks/scenes.ts, or `off`. */
  theme: string
  /** The animated strip above the prompt. */
  band: boolean
  /** Themed borders and fill around chat messages. */
  tint: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'themes-for-claude': { prefs: Shaped<Prefs> }
  }
}
