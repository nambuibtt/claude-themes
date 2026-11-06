/** What the person chose: the theme and which parts of it show. */
export type Prefs = {
  /** A theme id from hooks/scenes.ts, or `off`. */
  theme: string
  /** Themed borders and fill around chat messages. */
  tint: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'themes-for-claude': { prefs: Shaped<Prefs> }
  }
}
