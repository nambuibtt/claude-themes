// ==UserScript==
// @name         Claude Themes
// @name:vi      Claude Themes – khung cảnh ASCII cho claude.ai
// @namespace    https://github.com/nambuibtt/claude-themes
// @version      2.0.0
// @description  Claude themes: animated background wallpapers behind the claude.ai chat. Type /theme to pick one.
// @description:vi Khung cảnh ASCII chuyển động phía sau khung chat claude.ai. Gõ /theme để chọn.
// @author       Nam Bui
// @license      MIT
// @homepageURL  https://github.com/nambuibtt/claude-themes
// @supportURL   https://github.com/nambuibtt/claude-themes/issues
// @match        https://claude.ai/*
// @grant        none
// @run-at       document-idle
// @inject-into  content
// @noframes
// @updateURL    https://raw.githubusercontent.com/nambuibtt/claude-themes/main/claude-themes.user.js
// @downloadURL  https://raw.githubusercontent.com/nambuibtt/claude-themes/main/claude-themes.user.js
// ==/UserScript==

/*
 * How it works
 *  1. A full-screen <canvas> sits behind the page (z-index -1) and draws a scene
 *     as a grid of small tiles, each holding one ASCII glyph – the "pixel" look.
 *  2. A scanner finds the page's opaque backgrounds: large ones become
 *     transparent, smaller panels (sidebar, composer, bubbles, menus) become
 *     frosted glass. It only looks at computed styles, not class names, so it
 *     keeps working when claude.ai changes its markup.
 *  3. Typing /theme in the chat box (or the floating button, or Alt+T) opens a
 *     picker. Settings are kept in localStorage.
 *
 * No innerHTML and no inline <style> (CSSOM only), so it also works on pages
 * with a strict Content-Security-Policy / Trusted Types.
 */
(function () {
  'use strict';
  // A clear line in the console, so a run from DevTools shows it worked.
  const say = (text) => console.info('%c' + text, 'color:#2f8a58;font-weight:bold');
  const VERSION = '2.0.0';
  const prev = window.__claudeThemes;
  if (prev) {
    if (prev.version === VERSION) {
      say('Claude Themes đang chạy rồi. Bấm Alt+T (hoặc nút ô vuông màu ở cạnh phải) để chọn theme.');
      return;
    }
    // A different copy is running: take its place.
    if (typeof prev.destroy === 'function') prev.destroy();
    else {
      // Version 1.0 had no way to stop itself, so the page must be reloaded first.
      say('Đang chạy bản Claude Themes cũ. Tải lại cửa sổ (Cmd+R hoặc Ctrl+R) rồi dán script này lại một lần nữa.');
      return;
    }
  }
  // Every listener hangs off this signal, so destroy() can remove them all.
  const life = new AbortController();
  const on = { signal: life.signal };
  const onCap = { signal: life.signal, capture: true };

  /* ------------------------------------------------------------------ utils */

  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  // Stable pseudo-random number in [0, 1) for integer coordinates.
  function hash(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function vgrad(c, w, h, stops) {
    const g = c.createLinearGradient(0, 0, 0, h);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }

  function rglow(c, x, y, r, hex, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(hex, a));
    g.addColorStop(1, rgba(hex, 0));
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // A sprite is ASCII art: every non-space char is a key into a palette of
  // [tileColor, glyphColor, fixedGlyph?, alpha?].
  function sprite(rows, pal) {
    const w = Math.max(...rows.map((r) => r.length));
    return { rows: rows.map((r) => r.padEnd(w)), w, h: rows.length, pal };
  }

  const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase().trim();

  /* ------------------------------------------------------------------ world */

  const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

  class World {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.tiles = new Map();
      this.glows = new Map();
      this.s = {};
      this.t = 0;
      this.veil = 0;
      this.veilColor = '#ffffff';
    }

    resize(w, h, cell, dpr) {
      this.w = w;
      this.h = h;
      this.cell = cell;
      this.dpr = dpr;
      this.cv.width = Math.max(1, Math.round(w * dpr));
      this.cv.height = Math.max(1, Math.round(h * dpr));
      this.cols = Math.ceil(w / cell);
      this.rows = Math.ceil(h / cell);
      this.glyphsOn = cell >= 8;
      this.tiles.clear();
      this.under = this.over = null;
    }

    setTheme(th) {
      this.th = th;
      this.s = {};
      this.t = 0;
      this.tiles.clear();
      this.under = this.over = null;
      th.init(this);
    }

    // Static parts of a scene are drawn once into an offscreen layer.
    layer(fn) {
      const c = document.createElement('canvas');
      c.width = this.cv.width;
      c.height = this.cv.height;
      const x = c.getContext('2d');
      x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const prev = this.ctx;
      this.ctx = x;
      try {
        fn(x);
      } finally {
        this.ctx = prev;
      }
      return c;
    }

    draw(dt) {
      const th = this.th;
      const ctx = this.ctx;
      if (!th) return;
      this.t += dt;
      if (!this.under) {
        this.under = this.layer((c) => {
          th.bg(c, this.w, this.h, this);
          if (th.under) th.under(this);
        });
      }
      if (th.over && !this.over) this.over = this.layer(() => th.over(this));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.under, 0, 0);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      th.frame(this, dt);
      if (this.over) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.over, 0, 0);
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }
      if (this.veil > 0) {
        ctx.globalAlpha = this.veil;
        ctx.fillStyle = this.veilColor;
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.globalAlpha = 1;
      }
    }

    // One tile = rounded square + glyph, rendered once and reused.
    img(bg, fg, ch) {
      const key = bg + '|' + fg + '|' + ch;
      let c = this.tiles.get(key);
      if (c) return c;
      if (this.tiles.size > 900) this.tiles.clear();
      const s = this.cell;
      const px = Math.max(1, Math.ceil(s * this.dpr));
      c = document.createElement('canvas');
      c.width = c.height = px;
      const x = c.getContext('2d');
      x.scale(px / s, px / s);
      if (bg) {
        const gap = s > 6 ? Math.max(1, s * 0.09) : 0.5;
        const r = s > 6 ? s * 0.16 : 0;
        x.fillStyle = bg;
        if (r && x.roundRect) {
          x.beginPath();
          x.roundRect(gap / 2, gap / 2, s - gap, s - gap, r);
          x.fill();
        } else {
          x.fillRect(gap / 2, gap / 2, s - gap, s - gap);
        }
      }
      if (ch && fg && this.glyphsOn) {
        x.fillStyle = fg;
        x.font = `600 ${Math.round(s * 0.7)}px ${FONT}`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(ch, s / 2, s / 2 + s * 0.05);
      } else if (ch && fg && !bg) {
        const d = Math.max(1, s * 0.4);
        x.fillStyle = fg;
        x.fillRect((s - d) / 2, (s - d) / 2, d, d);
      }
      this.tiles.set(key, c);
      return c;
    }

    tile(x, y, bg, fg, ch, a = 1) {
      x = Math.round(x);
      y = Math.round(y);
      if (a <= 0.01 || x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
      const ctx = this.ctx;
      ctx.globalAlpha = a > 1 ? 1 : a;
      ctx.drawImage(this.img(bg, fg, ch), x * this.cell, y * this.cell, this.cell, this.cell);
      ctx.globalAlpha = 1;
    }

    glyph(x, y, ch, fg, a) {
      this.tile(x, y, null, fg, ch, a);
    }

    ch(i, j, seed) {
      const g = this.th.glyphs;
      return g[(hash(i, j, seed) * g.length) | 0];
    }

    sprite(sp, x, y, o = {}) {
      const X = Math.round(x);
      const Y = Math.round(y);
      const pal = o.pal || sp.pal;
      const a = o.a == null ? 1 : o.a;
      const seed = o.seed || 0;
      for (let j = 0; j < sp.h; j++) {
        const row = sp.rows[j];
        for (let i = 0; i < sp.w; i++) {
          const p = pal[row[i]];
          if (!p) continue;
          const gx = X + (o.flip ? sp.w - 1 - i : i);
          this.tile(gx, Y + j, p[0], p[1], p[2] != null ? p[2] : this.ch(i, j, seed), a * (p[3] == null ? 1 : p[3]));
        }
      }
    }

    glow(x, y, r, hex, a) {
      if (a <= 0.01) return;
      let g = this.glows.get(hex);
      if (!g) {
        g = document.createElement('canvas');
        g.width = g.height = 64;
        rglow(g.getContext('2d'), 32, 32, 32, hex, 1);
        this.glows.set(hex, g);
      }
      const c = this.cell;
      const R = r * c;
      this.ctx.globalAlpha = clamp(a, 0, 1);
      this.ctx.drawImage(g, (x + 0.5) * c - R, (y + 0.5) * c - R, R * 2, R * 2);
      this.ctx.globalAlpha = 1;
    }

    dot(x, y, color, a, size = 0.3) {
      if (a <= 0.01) return;
      const c = this.cell;
      const d = Math.max(1, c * size);
      this.ctx.globalAlpha = clamp(a, 0, 1);
      this.ctx.fillStyle = color;
      this.ctx.fillRect(Math.round(x) * c + (c - d) / 2, Math.round(y) * c + (c - d) / 2, d, d);
      this.ctx.globalAlpha = 1;
    }
  }

  /* ---------------------------------------------------------------- sprites */

  const CLOUD_DAY = { c: ['#ffffff', '#a9c1d6'], e: ['#eef6fd', '#c3d5e5'] };
  const CLOUD_NIGHT = { c: ['#27306e', '#323d86'], e: ['#222a61', '#2c3678'] };

  // Flat-bottomed cloud made of a few overlapping ellipses.
  function cloudRows(w, h) {
    const E = [{ x: w / 2, y: h - h * 0.32, rx: w / 2, ry: h * 0.34 }];
    for (let k = rint(2, 4); k > 0; k--) {
      const rx = rnd(w * 0.16, w * 0.3);
      E.push({ x: rnd(rx * 0.9, w - rx * 0.9), y: h - h * 0.4 - rnd(0, h * 0.2), rx, ry: Math.min(rx * 0.8, h * 0.6) });
    }
    const inside = (i, j) => E.some((e) => ((i + 0.5 - e.x) / e.rx) ** 2 + ((j + 0.5 - e.y) / e.ry) ** 2 <= 1);
    const rows = [];
    for (let j = 0; j < h; j++) {
      let r = '';
      for (let i = 0; i < w; i++) {
        if (!inside(i, j)) r += ' ';
        else r += !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1) ? 'e' : 'c';
      }
      rows.push(r);
    }
    return rows;
  }

  function cloud(w, anywhere, pal) {
    const z = Math.random();
    const cw = Math.round(clamp(w.cols * 0.12, 7, 16) + z * clamp(w.cols * 0.14, 4, 16));
    const ch = Math.max(3, Math.round(cw * rnd(0.3, 0.42)));
    return {
      sp: sprite(cloudRows(cw, ch), pal),
      z,
      x: anywhere ? rnd(-cw, w.cols) : -cw - rnd(0, w.cols * 0.3),
      y: rnd(-1, w.rows * 0.85 - ch),
      v: 0.35 + z * 1.2,
      a: 0.55 + z * 0.45,
      seed: rint(1, 1e6),
    };
  }

  /* ----------------------------------------------------------------- themes */

  const THEMES = [];

  const CLOUD_PINK = { c: ['#ffffff', '#f3c6d6'], e: ['#fff0f6', '#f0bfd2'] };
  const CLOUD_DAWN = { c: ['#fff6ef', '#f1cdbd'], e: ['#ffe9de', '#ecc0ae'] };

  // A particle list sized to the screen.
  const many = (w, per, lo, hi, make) => Array.from({ length: Math.round(clamp((w.cols * w.rows) / per, lo, hi)) }, make);

  function driftClouds(w, list, dt, aScale = 1) {
    for (const c of list) {
      c.x += c.v * dt;
      if (c.x > w.cols + 1) c.x = -c.sp.w - rnd(0, 10);
      w.sprite(c.sp, c.x, c.y, { a: c.a * aScale, seed: c.seed });
    }
  }

  // Ripples drifting left and right on alternate rows, from row y0 down.
  function ripples(w, y0, color, seed, a = 0.6) {
    const t = w.t;
    for (let y = y0; y < w.rows; y++) {
      const dir = y % 2 ? 1 : -1;
      for (let x = 0; x < w.cols; x++) if (hash(Math.floor(x + t * 0.8 * dir), y, seed) < 0.07) w.glyph(x, y, '~', color, a);
    }
  }

  function skyAndWater(c, w, h, hy, sky, sea) {
    const s = c.createLinearGradient(0, 0, 0, hy);
    sky.forEach((col, i) => s.addColorStop(i / (sky.length - 1), col));
    c.fillStyle = s;
    c.fillRect(0, 0, w, hy);
    const g = c.createLinearGradient(0, hy, 0, h);
    sea.forEach((col, i) => g.addColorStop(i / (sea.length - 1), col));
    c.fillStyle = g;
    c.fillRect(0, hy, w, h - hy);
  }

  /* ------------------------------------------------------- Pink Beaver */

  const BEAVER_PAL = {
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
  };
  const BEAVER_ROWS = [
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
  ];
  const BEAVER = sprite(BEAVER_ROWS, BEAVER_PAL);
  const BEAVER_BLINK = sprite(
    BEAVER_ROWS.map((r, j) => (j === 4 ? 'pppkkppppppkkppp' : j === 5 ? 'pppppppppppppppp' : r)),
    BEAVER_PAL,
  );
  const BEAVER_TAIL = sprite([' tt ', 'tttt', 'tttt', ' tt '], BEAVER_PAL);
  const HEART = sprite([' h h ', 'hhhhh', ' hhh ', '  h  '], null);
  const HEART_PALS = [
    { h: ['#ff6f9f', '#e04f80', ''] },
    { h: ['#ffa3c2', '#f07aa8', ''] },
    { h: ['#ff8a8a', '#e26464', ''] },
    { h: ['#ffc2d9', '#f59bbd', ''] },
  ];

  function beaverGeo(w) {
    const horizon = Math.round(w.rows * 0.74);
    const bx = Math.round(clamp(w.cols < 60 ? (w.cols - BEAVER.w) / 2 : w.cols * 0.64, 0, Math.max(0, w.cols - BEAVER.w)));
    return { horizon, bx, by: horizon - 1 - BEAVER.h };
  }

  function heart(w, any, g) {
    return { x: rnd(0, w.cols - 5), y: any ? rnd(0, g.horizon) : g.horizon + rnd(0, 4), v: rnd(0.5, 1.2), ph: rnd(0, 6), pal: pick(HEART_PALS), a: rnd(0.55, 0.95) };
  }

  THEMES.push({
    id: 'beaver',
    name: 'Hải Ly Hồng',
    dark: false,
    alias: ['hai ly', 'hai ly hong', 'beaver', 'pink', 'hong'],
    glyphs: ".:'",
    bg(c, w, h, W) {
      skyAndWater(c, w, h, beaverGeo(W).horizon * W.cell, ['#ffd3e6', '#ffe6ef', '#fff4e8'], ['#ade3ef', '#6cc3dc']);
      rglow(c, w * 0.22, h * 0.18, Math.max(w, h) * 0.4, '#ffffff', 0.55);
    },
    init(w) {
      const s = w.s;
      const g = beaverGeo(w);
      s.clouds = many(w, 900, 2, 6, () => {
        const c = cloud(w, true, CLOUD_PINK);
        c.y = rnd(-1, g.horizon * 0.5);
        c.v *= 0.4;
        return c;
      });
      s.hearts = many(w, 500, 3, 14, () => heart(w, true, g));
      s.bubbles = many(w, 300, 4, 24, () => ({ x: rnd(0, w.cols), y: rnd(g.horizon, w.rows), v: rnd(0.4, 1), ph: rnd(0, 6) }));
      s.sparks = many(w, 260, 4, 30, () => ({ x: rnd(0, w.cols), y: rnd(0, g.horizon), ph: rnd(0, 6) }));
    },
    frame(w, dt) {
      const s = w.s;
      const g = beaverGeo(w);
      const t = w.t;
      driftClouds(w, s.clouds, dt);
      for (const p of s.sparks) w.glyph(p.x, p.y, '+', '#ffffff', 0.2 + 0.6 * Math.max(0, Math.sin(t * 1.5 + p.ph)));
      for (let i = 0; i < s.hearts.length; i++) {
        const hh = s.hearts[i];
        hh.y -= hh.v * dt;
        if (hh.y < -5) s.hearts[i] = heart(w, false, g);
        w.sprite(HEART, hh.x + Math.sin(t * 0.8 + hh.ph) * 1.2, hh.y, { pal: hh.pal, a: hh.a * clamp((hh.y + 4) / 6, 0, 1) });
      }
      ripples(w, g.horizon + 1, '#ffffff', 51);
      for (const b of s.bubbles) {
        b.y -= b.v * dt;
        if (b.y < g.horizon + 1) {
          b.y = w.rows + 1;
          b.x = rnd(0, w.cols);
        }
        w.glyph(b.x + Math.sin(t + b.ph) * 0.6, b.y, 'o', '#effcff', 0.65);
      }
      // Pink reflection on the water.
      for (let x = g.bx + 1; x < g.bx + BEAVER.w - 1; x++) for (let k = 1; k < 4; k++) w.tile(x, g.horizon + k, '#ff9ec4', null, '', 0.28 - k * 0.07);
      // The log it sits on: tail behind, then the log, then the beaver.
      const hop = Math.sin(t * 1.6) > 0.55 ? -1 : 0;
      w.sprite(BEAVER_TAIL, g.bx - 3, g.by + 8 + (Math.floor(t * 3) % 2) + hop);
      const lx = g.bx - 4;
      const lw = BEAVER.w + 8;
      for (let i = 0; i < lw; i++) {
        const end = i === 0 || i === lw - 1;
        w.tile(lx + i, g.horizon - 1, end ? '#e7c08f' : '#b47a4c', end ? '#a97948' : '#8a5a35', end ? 'o' : '=');
        w.tile(lx + i, g.horizon, end ? '#d9ad7a' : '#8f6040', end ? '#a07040' : '#6e4529', end ? 'o' : '=', 0.9);
      }
      w.sprite(t % 4 < 0.18 ? BEAVER_BLINK : BEAVER, g.bx, g.by + hop);
    },
  });

  /* ------------------------------------------------------ Rainbow Bunny */

  const RAINBOW = ['#ff5a5a', '#ff9d3c', '#ffd93d', '#62cf5c', '#4aa8ff', '#5d63ef', '#a55cf0'];
  const BUNNY_PAL = {
    w: ['#ffffff', '#c9d1db'],
    i: ['#ffc2d4', '#f3a0b8', ''],
    K: ['#2d2a32', null, ''],
    n: ['#ff8fb1', null, ''],
    b: ['#ffd1dc', '#f7b5c6', ''],
    t: ['#fff7e8', '#e8dcc4', 'o'],
    f: ['#f1f3f6', '#cfd5dc', ''],
  };
  const BUNNY_ROWS = [
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
  ];
  const BUNNY_SIT = sprite(BUNNY_ROWS, BUNNY_PAL);
  const BUNNY_HOP = sprite(BUNNY_ROWS.map((r, j) => (j < 4 ? ' ' + r.slice(0, -1) : j === 10 ? 'ff       ff' : r)), BUNNY_PAL);

  function bunnyGeo(w) {
    const horizon = Math.round(w.rows * 0.76);
    const R = Math.round(clamp(Math.min(w.cols * 0.32, w.rows * 0.55), 6, 44));
    const band = R > 30 ? 2 : 1;
    return { horizon, R, band, cx: Math.round(w.cols * (w.cols < 60 ? 0.5 : 0.42)) };
  }

  THEMES.push({
    id: 'bunny',
    name: 'Thỏ Bảy Màu',
    dark: false,
    alias: ['tho', 'tho bay mau', 'bay mau', 'tho trang', 'bunny', 'rabbit', 'rainbow', 'cau vong'],
    glyphs: ",'.\"",
    bg(c, w, h, W) {
      skyAndWater(c, w, h, bunnyGeo(W).horizon * W.cell, ['#7cc4f5', '#b5defb', '#e9f6ff'], ['#9ee07a', '#5fb846']);
      rglow(c, w * 0.85, h * 0.12, Math.max(w, h) * 0.3, '#fff6c8', 0.7);
    },
    init(w) {
      const s = w.s;
      const g = bunnyGeo(w);
      s.clouds = many(w, 800, 2, 7, () => {
        const c = cloud(w, true, CLOUD_DAY);
        c.y = rnd(-1, g.horizon * 0.55);
        c.v *= 0.5;
        return c;
      });
      s.sparks = many(w, 240, 5, 34, () => ({ x: rnd(0, w.cols), y: rnd(0, g.horizon), ph: rnd(0, 6), col: pick(RAINBOW) }));
      s.bunny = { x: rnd(2, Math.max(3, w.cols - 14)), dir: 1, ph: 0, rest: 1 };
    },
    under(w) {
      const g = bunnyGeo(w);
      // The rainbow: seven bands of an arc standing on the horizon.
      for (let y = g.horizon - g.R - 1; y < g.horizon; y++) {
        for (let x = g.cx - g.R - 1; x <= g.cx + g.R + 1; x++) {
          const d = Math.hypot(x + 0.5 - g.cx, y + 0.5 - g.horizon);
          const k = Math.floor((g.R - d) / g.band);
          if (k >= 0 && k < 7) w.tile(x, y, RAINBOW[k], null, '', 0.5);
        }
      }
      // A far hill, then the meadow with flowers.
      for (let x = 0; x < w.cols; x++) {
        const hh = Math.round(2 + Math.sin(x * 0.09 + 1) * 1.6 + Math.sin(x * 0.23) * 0.8);
        for (let k = 0; k < hh; k++) w.tile(x, g.horizon - 1 - k, '#b4e59a', '#94cf78', w.ch(x, k, 61), 0.95);
      }
      const FLOWERS = ['#ffffff', '#ffd93d', '#ff8fb1', '#a55cf0'];
      for (let y = g.horizon; y < w.rows; y++) {
        for (let x = 0; x < w.cols; x++) {
          const r = hash(x, y, 62);
          if (r < 0.06) w.tile(x, y, FLOWERS[(r * 1000) % 4 | 0], '#5a8f3a', '*');
          else if (r < 0.4) w.glyph(x, y, w.ch(x, y, 63), '#3f8f2c', 0.7);
        }
      }
    },
    frame(w, dt) {
      const s = w.s;
      const g = bunnyGeo(w);
      const t = w.t;
      driftClouds(w, s.clouds, dt);
      for (const p of s.sparks) w.dot(p.x, p.y, p.col, 0.2 + 0.7 * Math.max(0, Math.sin(t * 1.8 + p.ph)), 0.3);
      // The bunny hops a few times, rests, turns at the edges.
      const b = s.bunny;
      let lift = 0;
      if (b.rest > 0) b.rest -= dt;
      else {
        b.ph += dt / 0.6;
        b.x += b.dir * 5 * dt;
        lift = Math.round(Math.sin(Math.min(1, b.ph % 1) * Math.PI) * 3);
        if (b.ph >= 3) {
          b.ph = 0;
          b.rest = rnd(0.8, 2.5);
        }
        if (b.x > w.cols - BUNNY_SIT.w - 1) b.dir = -1;
        if (b.x < 1) b.dir = 1;
      }
      const y = g.horizon - BUNNY_SIT.h + 2;
      // Shadow stays on the ground.
      for (let i = 2; i < BUNNY_SIT.w - 1; i++) w.tile(b.x + i, y + BUNNY_SIT.h, '#4f9a37', null, '', 0.35 - lift * 0.07);
      w.sprite(lift ? BUNNY_HOP : BUNNY_SIT, b.x, y - lift, { flip: b.dir < 0 });
    },
  });

  /* ----------------------------------------------------- N Seoul Tower */

  const TOWER_LIGHTS = ['#ff5fa2', '#6aa8ff', '#7cf0c8', '#ffd36a', '#b58cff'];

  function namsanGeo(w) {
    const hx = Math.round(w.cols * (w.cols < 60 ? 0.5 : 0.62));
    const hh = Math.round(clamp(w.rows * 0.24, 4, 30));
    const hw = Math.max(12, w.cols * 0.26);
    const S = Math.round(clamp(w.rows * 0.15, 3, 18));
    const A = Math.round(clamp(S * 0.6, 2, 11));
    return { hx, hh, hw, S, A };
  }
  const hillH = (g, x) => {
    const d = Math.abs(x + 0.5 - g.hx) / g.hw;
    return d >= 1 ? 0 : Math.round(g.hh * Math.pow(1 - d * d, 0.7));
  };

  THEMES.push({
    id: 'namsan',
    name: 'Tháp Namsan',
    dark: true,
    alias: ['namsan', 'thap namsan', 'seoul', 'han quoc', 'korea', 'n tower'],
    glyphs: '.:+',
    bg(c, w, h) {
      vgrad(c, w, h, ['#070b26', '#141a47', '#2c2160', '#5a2f6b']);
      rglow(c, w * 0.5, h * 1.05, Math.max(w, h) * 0.6, '#ff9a6a', 0.22);
    },
    init(w) {
      const s = w.s;
      const g = namsanGeo(w);
      s.stars = many(w, 70, 12, 160, () => ({ x: rint(0, w.cols), y: rint(0, Math.round(w.rows * 0.6)), ph: rnd(0, 6), sp: rnd(0.8, 2.4) }));
      // Skyline along the bottom; windows are kept so they can flicker.
      s.city = [];
      s.windows = [];
      for (let x = 0; x < w.cols; ) {
        const bw = rint(2, 6);
        const bh = Math.round(rnd(w.rows * 0.05, w.rows * (Math.abs(x - g.hx) < g.hw * 0.4 ? 0.1 : 0.2)));
        s.city.push({ x, bw, bh, col: pick(['#151a3a', '#1b2047', '#111531']) });
        for (let i = 0; i < bw; i++) for (let k = 0; k < bh; k++) if (hash(x + i, k, 71) < 0.3) s.windows.push({ x: x + i, y: w.rows - 1 - k, col: pick(['#ffd98a', '#ffeab8', '#9fd2ff']), ph: rnd(0, 6), sp: rnd(0.1, 0.5) });
        x += bw + (Math.random() < 0.3 ? 1 : 0);
      }
      s.plane = { x: -2, y: rnd(2, w.rows * 0.25) };
    },
    under(w) {
      const s = w.s;
      const g = namsanGeo(w);
      // Moon.
      const mx = Math.round(w.cols * (w.cols < 60 ? 0.2 : 0.16));
      const my = Math.max(2, Math.round(w.rows * 0.14));
      const mr = clamp(Math.round(w.rows * 0.05), 1, 4);
      w.glow(mx, my, mr * 5, '#fff2cc', 0.35);
      for (let dy = -mr; dy <= mr; dy++) for (let dx = -mr; dx <= mr; dx++) if (Math.hypot(dx, dy) <= mr + 0.3) w.tile(mx + dx, my + dy, '#fff4d6', '#e8d9a8', w.ch(dx, dy, 72));
      // The hill with trees.
      const base = w.rows;
      for (let x = 0; x < w.cols; x++) {
        const hh = hillH(g, x);
        for (let k = 0; k < hh; k++) w.tile(x, base - 1 - k, k >= hh - 1 ? '#1d4a3c' : '#163a30', '#0f2a22', k >= hh - 1 ? '^' : w.ch(x, k, 73));
      }
      // The tower on the hilltop.
      const top = base - hillH(g, g.hx);
      for (let dx = -1; dx <= 1; dx++) for (let k = 1; k <= 2; k++) w.tile(g.hx + dx, top - k, '#c9d1e3', '#9aa5bd', '#');
      for (let k = 3; k < 3 + g.S; k++) w.tile(g.hx, top - k, '#e8edf7', '#aab4c8', '|');
      const py = top - 3 - g.S;
      s.pod = py;
      for (let k = 0; k < g.A; k++) w.tile(g.hx, py - 4 - k, '#d5dceb', '#a2adc2', '|');
      // Buildings in front of the hill.
      for (const b of s.city) for (let i = 0; i < b.bw; i++) for (let k = 0; k < b.bh; k++) w.tile(b.x + i, base - 1 - k, b.col, '#232a58', w.ch(b.x + i, k, 74));
    },
    frame(w, dt) {
      const s = w.s;
      const g = namsanGeo(w);
      const t = w.t;
      for (const st of s.stars) w.dot(st.x, st.y, '#ffffff', 0.15 + 0.75 * Math.max(0, Math.sin(t * st.sp + st.ph)), 0.22);
      // A plane blinking across the sky.
      const p = s.plane;
      p.x += 2.2 * dt;
      if (p.x > w.cols + 2) {
        p.x = -2;
        p.y = rnd(2, w.rows * 0.25);
      }
      w.dot(p.x, p.y, Math.floor(t * 2) % 2 ? '#ff5050' : '#ffffff', 0.9, 0.3);
      // The tower's observation deck changes colour every few seconds.
      const col = TOWER_LIGHTS[Math.floor(t / 4) % TOWER_LIGHTS.length];
      const py = s.pod;
      w.glow(g.hx, py - 1.5, 7, col, 0.45 + 0.1 * Math.sin(t * 2));
      const pod = [[2, py], [3, py - 1], [3, py - 2], [2, py - 3]];
      for (const [half, y] of pod) {
        for (let dx = -half; dx <= half; dx++) {
          const lit = y === py - 1 || y === py - 2;
          w.tile(g.hx + dx, y, lit ? col : '#e8edf7', lit ? '#ffffff' : '#aab4c8', lit ? '#' : '=');
        }
      }
      w.tile(g.hx, py - 4 - g.A, '#ff4040', '#ffffff', '*', 0.4 + 0.6 * (Math.floor(t * 1.5) % 2));
      for (const win of s.windows) w.tile(win.x, win.y, win.col, null, '', 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * win.sp + win.ph)));
    },
  });

  /* ------------------------------------------------------- Mount Fuji */

  const TORII = sprite(
    ['RRRRRRRRRRR', ' rrrrrrrrr ', '  R  R  R  ', ' RRRRRRRRR ', '  R     R  ', '  R     R  ', '  R     R  '],
    { R: ['#e0402f', '#b22e21'], r: ['#2f2a2a', '#1a1616', ''] },
  );
  const SAKURA = ['#ffc4d8', '#ffadc9', '#ff97bb', '#ffe0ea'];

  function fujiGeo(w) {
    const horizon = Math.round(w.rows * 0.7);
    const mx = Math.round(w.cols * (w.cols < 60 ? 0.5 : 0.56));
    const peakH = Math.round(clamp(Math.min(w.rows * 0.42, w.cols * 0.32), 4, 40));
    return { horizon, mx, peakH, top: Math.max(1, Math.round(peakH * 0.14)), base: peakH * 2.6 };
  }
  function fujiH(g, x) {
    const d = Math.abs(x + 0.5 - g.mx);
    if (d <= g.top) return g.peakH;
    const u = (d - g.top) / g.base;
    return u >= 1 ? 0 : Math.round(g.peakH * Math.pow(1 - u, 1.7));
  }

  function petal(w, any) {
    return { x: rnd(-5, w.cols), y: any ? rnd(0, w.rows) : rnd(-4, -1), vx: rnd(0.6, 1.6), vy: rnd(0.8, 1.8), ph: rnd(0, 6), col: pick(SAKURA), big: Math.random() < 0.4 };
  }

  THEMES.push({
    id: 'fuji',
    name: 'Núi Phú Sĩ',
    dark: false,
    alias: ['fuji', 'phu si', 'phu sy', 'nui phu si', 'nui phu sy', 'nhat ban', 'japan', 'sakura', 'hoa anh dao'],
    glyphs: "^.:'",
    bg(c, w, h, W) {
      const g = fujiGeo(W);
      skyAndWater(c, w, h, g.horizon * W.cell, ['#8fc3ec', '#cfe2f2', '#f9d6c8', '#ffc4b4'], ['#a9c6e0', '#6f97c2']);
      rglow(c, w * 0.2, g.horizon * W.cell * 0.78, Math.max(w, h) * 0.35, '#ffe2c4', 0.6);
    },
    init(w) {
      const s = w.s;
      const g = fujiGeo(w);
      s.clouds = many(w, 1000, 2, 5, () => {
        const c = cloud(w, true, CLOUD_DAWN);
        c.y = rnd(g.horizon - g.peakH * 0.6, g.horizon - 3);
        c.v *= 0.35;
        return c;
      });
      s.petals = many(w, 150, 6, 60, () => petal(w, true));
      s.birds = many(w, 1200, 2, 6, () => ({ x: rnd(0, w.cols), y: rnd(2, g.horizon * 0.4), v: rnd(0.8, 1.6), ph: rnd(0, 6) }));
    },
    under(w) {
      const g = fujiGeo(w);
      // Rising sun behind the left shoulder.
      const sx = Math.round(w.cols * 0.2);
      const sy = Math.round(g.horizon * 0.78);
      const sr = clamp(Math.round(w.rows * 0.05), 1, 4);
      for (let dy = -sr; dy <= sr; dy++) for (let dx = -sr; dx <= sr; dx++) if (Math.hypot(dx, dy) <= sr + 0.3) w.tile(sx + dx, sy + dy, '#ffe7cf', '#f6c9a0', w.ch(dx, dy, 81), 0.9);
      // The mountain: snow cap with ragged streaks, shaded left flank.
      for (let x = 0; x < w.cols; x++) {
        const hh = fujiH(g, x);
        const snow = g.peakH * 0.6 + (hash(x, 0, 82) - 0.5) * g.peakH * 0.14 - (x % 3 === 0 ? g.peakH * 0.08 : 0);
        const lit = x + 0.5 >= g.mx;
        for (let k = 0; k < hh; k++) {
          const y = g.horizon - 1 - k;
          if (k >= snow) w.tile(x, y, lit ? '#ffffff' : '#e6ecf6', lit ? '#dbe3f0' : '#c6d0e2', w.ch(x, k, 83));
          else {
            const f = k / g.peakH;
            w.tile(x, y, lit ? (f > 0.35 ? '#7f92c9' : '#6c81bb') : f > 0.35 ? '#6577b0' : '#566aa3', lit ? '#6476ad' : '#4b5c90', w.ch(x, k, 84));
          }
        }
        // Mirror on the lake.
        for (let k = 0; k < Math.min(hh, w.rows - g.horizon); k++) w.tile(x, g.horizon + k, k >= snow ? '#ffffff' : '#6c81bb', null, '', 0.3 - (k / hh) * 0.2);
      }
      // A shoreline of dark trees.
      for (let x = 0; x < w.cols; x++) {
        const th = Math.round(1 + hash(x, 1, 85) * 1.6);
        for (let k = 0; k < th; k++) w.tile(x, g.horizon - 1 - k, '#3e5a4c', '#2e463a', '^', 0.95);
      }
    },
    over(w) {
      const g = fujiGeo(w);
      // A torii standing in the lake.
      if (w.rows - g.horizon > TORII.h - 2) w.sprite(TORII, Math.round(w.cols * (w.cols < 60 ? 0.06 : 0.12)), g.horizon + 1);
      // A cherry branch reaching in from the top-left corner.
      const L = Math.round(clamp(w.cols * 0.38, 10, 60));
      const pts = [];
      for (let i = 0; i <= L; i++) {
        const x = i - 1;
        const y = Math.round(1 + Math.pow(i / L, 1.6) * clamp(w.rows * 0.14, 2, 12));
        pts.push([x, y]);
        w.tile(x, y, '#6b4a3a', '#4e3428', '=');
        if (i < L * 0.4) w.tile(x, y - 1, '#5e4033', '#4e3428', '=');
        if (i > 4 && i % 7 === 3) for (let k = 1; k <= 3; k++) w.tile(x + k, y + k, '#6b4a3a', '#4e3428', '\\');
      }
      for (let i = 2; i < pts.length; i += 3) {
        const [bx, by] = pts[i];
        const r = 1.2 + hash(i, 0, 86) * 1.5;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (Math.hypot(dx, dy) > r || hash(bx + dx, by + dy, 87) < 0.2) continue;
            const c = SAKURA[(hash(bx + dx, by + dy, 88) * 4) | 0];
            w.tile(bx + dx, by + dy + 1, c, '#e0789c', hash(bx + dx, by + dy, 89) < 0.3 ? '*' : '');
          }
        }
      }
    },
    frame(w, dt) {
      const s = w.s;
      const g = fujiGeo(w);
      const t = w.t;
      for (const b of s.birds) {
        b.x += b.v * dt;
        if (b.x > w.cols + 2) b.x = -2;
        w.glyph(b.x, b.y + Math.sin(t * 1.2 + b.ph) * 0.5, Math.floor(t * 4 + b.ph) % 2 ? 'v' : '-', '#4a4f6b', 0.75);
      }
      driftClouds(w, s.clouds, dt, 0.8);
      ripples(w, g.horizon, '#eef6ff', 91, 0.5);
      for (let i = 0; i < s.petals.length; i++) {
        const p = s.petals[i];
        p.x += (p.vx + Math.sin(t * 1.3 + p.ph) * 0.8) * dt;
        p.y += p.vy * dt;
        if (p.y > w.rows + 1 || p.x > w.cols + 1) s.petals[i] = petal(w, false);
        if (p.big) w.tile(p.x, p.y, p.col, '#e0789c', '', 0.85);
        else w.dot(p.x, p.y, p.col, 0.9, 0.4);
      }
    },
  });

  /* --------------------------------------------- Tà Xùa: clouds & flowers */

  const TAXUA_FLOWERS = ['#ff7eb6', '#e05ac0', '#b57bff', '#ffffff', '#ffc1e0', '#d68cff'];

  function taxuaGeo(w) {
    const sea = Math.round(w.rows * 0.5);
    return { sea, seaH: Math.max(3, Math.round(w.rows * 0.16)) };
  }
  const fieldTop = (w, x) => Math.round(w.rows * 0.7 - (1 - x / w.cols) * w.rows * 0.12 + Math.sin(x * 0.09) * 1.2);

  THEMES.push({
    id: 'taxua',
    name: 'Tà Xùa',
    dark: false,
    alias: ['ta xua', 'taxua', 'hoa', 'canh dong hoa', 'bien may', 'son la', 'tay bac', 'flowers'],
    glyphs: '~.:',
    bg(c, w, h) {
      vgrad(c, w, h, ['#6fa8e2', '#b9d3ef', '#ffd9b0', '#ffc39a', '#f5eef2']);
      rglow(c, w * 0.7, h * 0.48, Math.max(w, h) * 0.4, '#ffe6b0', 0.6);
    },
    init(w) {
      const s = w.s;
      const g = taxuaGeo(w);
      s.butterflies = many(w, 700, 2, 8, () => ({ x: rnd(0, w.cols), y: rnd(g.sea + g.seaH, w.rows - 2), vx: rnd(-1.5, 1.5), vy: 0, ph: rnd(0, 6), col: pick(['#ffd23f', '#ffffff', '#ff9ad5', '#9fd8ff']) }));
      s.peaks = many(w, 500, 3, 9, () => ({ x: rnd(0, w.cols), h: rnd(w.rows * 0.08, w.rows * 0.2), slope: rnd(0.5, 1.1) }));
      s.clouds = many(w, 1400, 1, 4, () => {
        const c = cloud(w, true, CLOUD_DAY);
        c.y = rnd(-1, g.sea * 0.4);
        c.v *= 0.3;
        return c;
      });
    },
    under(w) {
      const g = taxuaGeo(w);
      // Ridges rising above the sea of clouds: a far hazy one and a sharp near spine.
      for (let x = 0; x < w.cols; x++) {
        const far = Math.round(w.rows * 0.1 + Math.sin(x * 0.05 + 2) * w.rows * 0.05 + Math.sin(x * 0.17) * 1.5);
        for (let k = 0; k < far; k++) w.tile(x, g.sea + 1 - k, '#a9b7d8', '#97a6ca', w.ch(x, k, 101), 0.85);
      }
      // Near peaks: steep, sharp-crested ridges.
      for (let x = 0; x < w.cols; x++) {
        let near = 0;
        for (const p of w.s.peaks) near = Math.max(near, p.h - Math.abs(x + 0.5 - p.x) * p.slope + (hash(x, 0, 102) - 0.5));
        near = Math.round(near);
        for (let k = 0; k < near; k++) w.tile(x, g.sea + 2 - k, k >= near - 1 ? '#7d93a8' : '#5f7398', '#4e6185', w.ch(x, k, 103));
      }
      // The meadow under the flowers.
      for (let x = 0; x < w.cols; x++) for (let y = fieldTop(w, x); y < w.rows; y++) w.tile(x, y, '#7fae5c', '#669447', w.ch(x, y, 104));
    },
    frame(w, dt) {
      const s = w.s;
      const g = taxuaGeo(w);
      const t = w.t;
      driftClouds(w, s.clouds, dt, 0.8);
      // The sea of clouds: two slow wave fields, thinning toward the top.
      for (let y = g.sea - 1; y < g.sea + g.seaH + 3; y++) {
        const f = (y - (g.sea - 1)) / (g.seaH + 3);
        const thr = 0.35 - f * 1.8;
        for (let x = 0; x < w.cols; x++) {
          const n = (Math.sin((x + t * 0.9) * 0.16 + y * 0.8) + Math.sin((x - t * 0.5) * 0.07 + y * 1.3)) * 0.5 + (hash(Math.floor(x + t * 0.7), y, 105) - 0.5) * 0.5;
          if (n > thr) w.tile(x, y, n > thr + 0.4 ? '#ffffff' : '#f3eef6', '#d9d6e6', n > thr + 0.6 ? '~' : '', 0.75 + f * 0.25);
        }
      }
      // Flowers sway as a gust passes over the field.
      for (let x = 0; x < w.cols; x++) {
        for (let y = fieldTop(w, x); y < w.rows; y++) {
          const r = hash(x, y, 106);
          if (r > 0.3) continue;
          const gust = Math.sin(x * 0.25 - t * 2.2 + y * 0.4);
          const col = TAXUA_FLOWERS[(r * 100) % TAXUA_FLOWERS.length | 0];
          w.tile(x, y, col, '#7a3f6e', gust > 0.5 ? '*' : '+', 0.7 + 0.3 * Math.max(0, gust));
        }
      }
      for (const b of s.butterflies) {
        b.vx += (Math.random() - 0.5) * 2 * dt;
        b.vx = clamp(b.vx, -2, 2);
        b.x += b.vx * dt;
        if (b.x < 0 || b.x > w.cols) b.vx = -b.vx;
        b.x = clamp(b.x, 0, w.cols);
        w.tile(b.x, b.y + Math.sin(t * 2 + b.ph) * 0.8, null, b.col, Math.floor(t * 6 + b.ph) % 2 ? 'W' : 'v');
      }
    },
  });

  const ITEMS = THEMES.map((t) => t.id).concat('off');
  const byId = (id) => THEMES.find((t) => t.id === id);

  /* --------------------------------------------------------------- settings */

  const KEY = 'claude-themes:v1';
  const cfg = { theme: 'fuji', veil: 0.2, glass: 0.72, motion: true, button: true };
  try {
    Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch (e) {
    /* storage blocked: keep defaults */
  }
  if (!ITEMS.includes(cfg.theme)) cfg.theme = 'fuji';
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cfg));
    } catch (e) {
      /* ignore */
    }
  };

  /* ----------------------------------------------------------------- styles */

  const PAGE_CSS = `
html[data-pxt-on], html[data-pxt-on] body { background-color: transparent !important; background-image: none !important; }
html[data-pxt-on] [data-pxt="clear"] { background-color: transparent !important; background-image: none !important; }
html[data-pxt-on] [data-pxt="glass"] {
  background-color: rgba(var(--pxt-rgb), var(--pxt-alpha, .72)) !important;
  background-image: none !important;
  -webkit-backdrop-filter: blur(var(--pxt-blur, 12px)) saturate(1.35);
  backdrop-filter: blur(var(--pxt-blur, 12px)) saturate(1.35);
}
canvas[data-pxt-ui="bg"] { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; z-index: -1 !important; pointer-events: none !important; display: none; }
html[data-pxt-on] canvas[data-pxt-ui="bg"] { display: block !important; }
`;

  const UI_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.fab {
  position: fixed; right: 12px; top: 50%; transform: translateY(-50%); z-index: 2147483000;
  width: 36px; height: 36px; padding: 0; border-radius: 10px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.4); background: rgba(24,24,28,.35);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  display: grid; grid-template-columns: repeat(3, 6px); grid-auto-rows: 6px; gap: 2px; place-content: center;
  opacity: .6; transition: opacity .2s;
}
.fab:hover, .fab:focus-visible { opacity: 1; }
.fab i { display: block; border-radius: 1.5px; }
.panel {
  position: fixed; left: 50%; transform: translateX(-50%); z-index: 2147483001;
  width: min(760px, calc(100vw - 20px)); padding: 10px 10px 8px; border-radius: 14px;
  color: #1d1d1f; background: rgba(255,255,255,.88); border: 1px solid rgba(0,0,0,.08);
  box-shadow: 0 12px 40px rgba(0,0,0,.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
  font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
.panel.dark { color: #f2f2f2; background: rgba(30,30,32,.88); border-color: rgba(255,255,255,.1); }
.hd { display: flex; align-items: center; gap: 10px; padding: 0 4px 8px; }
.cmd { font: 600 11px/1 ui-monospace, Menlo, Consolas, monospace; padding: 4px 6px; border-radius: 5px; background: rgba(127,127,127,.18); }
.ttl { opacity: .7; }
.hint { margin-left: auto; opacity: .55; font-size: 11px; white-space: nowrap; }
.note { padding: 0 4px 6px; font-size: 11px; opacity: .7; }
.list { position: relative; display: flex; flex-wrap: wrap; gap: 10px 8px; max-height: min(52vh, 420px); overflow-y: auto; padding: 3px 3px 8px; scrollbar-width: thin; }
.it { flex: 0 0 auto; width: 84px; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.th { display: block; width: 84px; height: 54px; border-radius: 8px; overflow: hidden; outline: 2px solid transparent; outline-offset: 1px; background: rgba(127,127,127,.2); }
.th canvas { display: block; width: 100%; height: 100%; }
.it:hover .th { outline-color: rgba(47,124,246,.45); }
.it.sel .th { outline-color: #2f7cf6; }
.nm { display: block; margin-top: 4px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.it.cur .nm::after { content: " \\2713"; color: #2f7cf6; }
.off { display: grid; place-items: center; height: 100%; font-weight: 600; letter-spacing: .08em; opacity: .7;
  background: repeating-linear-gradient(45deg, rgba(127,127,127,.22) 0 6px, transparent 6px 12px); }
.ctl { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; padding: 8px 4px 0; border-top: 1px solid rgba(127,127,127,.2); }
.ctl label { display: flex; align-items: center; gap: 6px; font-size: 11px; opacity: .85; cursor: pointer; }
.ctl input[type=range] { width: 96px; accent-color: #2f7cf6; }
.ctl input[type=checkbox] { accent-color: #2f7cf6; }
@media (pointer: coarse) {
  .hint { display: none; }
  .fab { width: 42px; height: 42px; grid-template-columns: repeat(3, 7px); grid-auto-rows: 7px; }
  .it, .th { width: 92px; }
  .th { height: 60px; }
  .ctl input[type=range] { width: 120px; }
}
`;

  function sheet(css, target) {
    try {
      const s = new CSSStyleSheet();
      s.replaceSync(css);
      target.adoptedStyleSheets = [...target.adoptedStyleSheets, s];
      return () => (target.adoptedStyleSheets = target.adoptedStyleSheets.filter((x) => x !== s));
    } catch (e) {
      /* older browser: fall back to a <style> element */
    }
    const el = document.createElement('style');
    el.textContent = css;
    (target === document ? document.head || document.documentElement : target).appendChild(el);
    return () => el.remove();
  }

  /* ---------------------------------------------------- background scanner */

  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  const colors = new Map();

  // Any CSS color (rgb, hsl, oklch, ...) -> {r, g, b, a}.
  function toRGBA(s) {
    if (!s || s === 'transparent') return null;
    if (colors.has(s)) return colors.get(s);
    let v = null;
    const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(s);
    if (m) {
      v = { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : m[5] ? m[4] / 100 : +m[4] };
    } else {
      pctx.fillStyle = '#010203';
      pctx.fillStyle = s;
      if (pctx.fillStyle !== '#010203') {
        pctx.clearRect(0, 0, 1, 1);
        pctx.fillRect(0, 0, 1, 1);
        const d = pctx.getImageData(0, 0, 1, 1).data;
        v = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
      }
    }
    if (colors.size > 500) colors.clear();
    colors.set(s, v);
    return v;
  }

  const lum = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;

  // Saturated colors are buttons / badges: leave them alone.
  function accent(c) {
    const r = c.r / 255;
    const g = c.g / 255;
    const b = c.b / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    const d = mx - mn;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return s > 0.4 && l > 0.18 && l < 0.85;
  }

  const SKIP = /^(IMG|VIDEO|CANVAS|SVG|IFRAME|PICTURE|INPUT|SELECT|OPTION|SCRIPT|STYLE|LINK|META|HEAD|BR|HR|PATH|G|USE|HTML|BODY)$/i;
  const UI_SEL = 'button, a, label, [role="button"], [role="menuitem"], [role="option"], [role="tab"]';
  const OVERLAY_SEL = 'dialog, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [aria-modal="true"], [data-radix-popper-content-wrapper]';

  const glassColor = new WeakMap();

  function mark(el, kind, c) {
    if (kind === 'glass') {
      glassColor.set(el, c);
      el.style.setProperty('--pxt-rgb', `${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}`);
    }
    el.setAttribute('data-pxt', kind);
  }

  function classify(el, vw, vh, area) {
    if (el.nodeType !== 1 || el.hasAttribute('data-pxt') || el.hasAttribute('data-pxt-ui') || SKIP.test(el.tagName)) return;
    const cs = getComputedStyle(el);
    // Inline boxes (code chips, highlights) keep their look: a blurred inline box
    // that wraps across lines would blur the text next to it.
    if (cs.display === 'none' || cs.display === 'inline' || cs.display === 'contents' || cs.visibility === 'hidden') return;
    const img = cs.backgroundImage;
    const grad = img !== 'none' && /gradient/.test(img);
    if (img !== 'none' && !grad) return;
    const c = toRGBA(cs.backgroundColor);
    const solid = c && c.a >= 0.6;
    if (!solid && !grad) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const ratio = (Math.min(r.width, vw) * Math.min(r.height, vh)) / area;
    const ui = el.matches(UI_SEL);
    // Drawers, popovers and modals float above other content, so they need glass, not a hole.
    const floating = el.closest(OVERLAY_SEL) || ((cs.position === 'fixed' || cs.position === 'absolute') && cs.zIndex !== 'auto' && ratio < 0.95);

    if (ratio >= 0.4 && !floating) return mark(el, 'clear');
    if (!solid) {
      // Fade gradients (e.g. above the composer) would paint a band of solid color.
      if (!ui && ratio >= 0.02) mark(el, 'clear');
      return;
    }
    if (ratio < 0.0015 || accent(c) || (ui && ratio < 0.03)) return;
    const outer = el.parentElement && el.parentElement.closest('[data-pxt="glass"]');
    if (outer) {
      // Same-colored wrapper inside a glass panel: drop it so the alpha doesn't stack.
      const o = glassColor.get(outer);
      if (!o || Math.abs(o.r - c.r) + Math.abs(o.g - c.g) + Math.abs(o.b - c.b) < 24) return mark(el, 'clear');
      if (ratio < 0.02) return;
    }
    mark(el, 'glass', c);
  }

  // The veil and the picker follow the page's light/dark mode, read from its text color.
  function computeDark() {
    const els = document.body ? document.body.querySelectorAll('p, li, h1, h2, h3, button, a') : [];
    let n = 0;
    let light = 0;
    for (const el of els) {
      if (n >= 24) break;
      if (!el.textContent.trim()) continue;
      const c = toRGBA(getComputedStyle(el).color);
      if (!c || c.a < 0.3) continue;
      n++;
      if (lum(c) > 0.55) light++;
    }
    if (!n) {
      const c = document.body && toRGBA(getComputedStyle(document.body).color);
      return c ? lum(c) > 0.55 : matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return light / n > 0.5;
  }

  let scanning = false;
  let sampleTimer = 0;
  let flushTimer = 0;
  const deepQ = new Set();
  const shallowQ = new Set();

  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') {
        for (const n of m.addedNodes) if (n.nodeType === 1) deepQ.add(n);
      } else if (m.target.nodeType === 1 && !m.target.hasAttribute('data-pxt')) {
        shallowQ.add(m.target);
      }
    }
    if (!flushTimer) flushTimer = setTimeout(flush, 250);
  });

  function flush() {
    flushTimer = 0;
    const vw = innerWidth;
    const vh = innerHeight;
    const area = vw * vh;
    let budget = 3000;
    for (const el of deepQ) {
      if (!el.isConnected) continue;
      classify(el, vw, vh, area);
      const all = el.getElementsByTagName('*');
      for (let i = 0; i < all.length && budget > 0; i++, budget--) classify(all[i], vw, vh, area);
    }
    for (const el of shallowQ) if (el.isConnected) classify(el, vw, vh, area);
    deepQ.clear();
    shallowQ.clear();
  }

  function fullScan() {
    const all = document.body.getElementsByTagName('*');
    const vw = innerWidth;
    const vh = innerHeight;
    const area = vw * vh;
    let i = 0;
    (function chunk() {
      if (!scanning) return;
      const end = Math.min(all.length, i + 600);
      for (; i < end; i++) classify(all[i], vw, vh, area);
      if (i < all.length && i < 20000) setTimeout(chunk, 16);
    })();
  }

  // Catches elements that were hidden during the first scan and shown later.
  function sample() {
    if (document.hidden) return;
    const vw = innerWidth;
    const vh = innerHeight;
    const area = vw * vh;
    const seen = new Set();
    for (let i = 1; i < 7; i++) {
      for (let j = 1; j < 9; j++) {
        const stack = document.elementsFromPoint((i / 7) * vw, (j / 9) * vh);
        for (let k = stack.length - 1; k >= 0; k--) {
          if (seen.has(stack[k])) continue;
          seen.add(stack[k]);
          classify(stack[k], vw, vh, area);
        }
      }
    }
    const d = computeDark();
    if (d !== siteDark) {
      siteDark = d;
      syncPanel();
      if (!raf) paint(0);
    }
  }

  function startScan() {
    if (scanning) return;
    scanning = true;
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    fullScan();
    sampleTimer = setInterval(sample, 3000);
    setTimeout(sample, 600);
  }

  function stopScan() {
    if (!scanning) return;
    scanning = false;
    mo.disconnect();
    clearInterval(sampleTimer);
    clearTimeout(flushTimer);
    flushTimer = 0;
    deepQ.clear();
    shallowQ.clear();
  }

  /* --------------------------------------------------------------- renderer */

  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const FPS = matchMedia('(pointer: coarse)').matches ? 10 : 12;
  let siteDark = false;
  let canvas = null;
  let world = null;
  let curId = 'off';
  let raf = 0;
  let last = 0;

  function measure() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    const cell = Math.min(w, h) < 560 ? 11 : 14;
    // Keep the backing store under ~6M pixels on big screens.
    const dpr = clamp(Math.min(devicePixelRatio || 1, 2, Math.sqrt(6e6 / (w * h))), 1, 2);
    return { w, h, cell, dpr };
  }

  function ensureCanvas() {
    if (canvas && canvas.isConnected) return;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.setAttribute('data-pxt-ui', 'bg');
      canvas.setAttribute('aria-hidden', 'true');
      world = new World(canvas);
      if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas);
      addEventListener('resize', onResize, on);
    }
    root.appendChild(canvas);
  }

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeNow, 120);
  }

  function resizeNow() {
    if (!world || !world.th || curId === 'off') return;
    const m = measure();
    if (Math.abs(m.w - world.w) < 1 && Math.abs(m.h - world.h) < 1 && m.dpr === world.dpr) return;
    const { cols, rows, cell } = world;
    world.resize(m.w, m.h, m.cell, m.dpr);
    // Small changes (mobile toolbars) keep the scene; big ones rebuild it.
    if (m.cell !== cell || Math.abs(world.cols - cols) / cols > 0.25 || Math.abs(world.rows - rows) / rows > 0.25) world.setTheme(world.th);
    paint(0);
    if (open) place();
  }

  function paint(dt) {
    if (!world || !world.th) return;
    world.veilColor = siteDark ? '#141413' : '#fbfaf6';
    world.veil = clamp(cfg.veil * (world.th.veilScale || 1) + (world.th.dark === siteDark ? 0 : 0.42), 0, 0.9);
    world.draw(dt);
  }

  const running = () => curId !== 'off' && cfg.motion && !reduce.matches && !document.hidden;

  function loop(now) {
    raf = 0;
    if (!running()) return;
    raf = requestAnimationFrame(loop);
    if (last && now - last < 1000 / FPS - 2) return;
    const dt = last ? Math.min(0.2, (now - last) / 1000) : 1 / FPS;
    last = now;
    paint(dt);
  }

  function startLoop() {
    if (!raf && running()) {
      last = 0;
      raf = requestAnimationFrame(loop);
    }
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  document.addEventListener('visibilitychange', () => (document.hidden ? stopLoop() : startLoop()), on);

  function applyTheme(id) {
    const th = byId(id);
    if (!th) {
      root.removeAttribute('data-pxt-on');
      stopLoop();
      stopScan();
      curId = 'off';
      syncPanel();
      return;
    }
    ensureCanvas();
    root.setAttribute('data-pxt-on', '');
    root.style.setProperty('--pxt-alpha', String(cfg.glass));
    root.style.setProperty('--pxt-blur', cfg.glass >= 0.95 ? '0px' : '12px');
    siteDark = computeDark();
    const m = measure();
    if (m.w !== world.w || m.h !== world.h || m.dpr !== world.dpr || m.cell !== world.cell) world.resize(m.w, m.h, m.cell, m.dpr);
    if (curId !== id) {
      world.setTheme(th);
      curId = id;
    }
    syncPanel();
    startScan();
    paint(0);
    startLoop();
  }

  /* --------------------------------------------------------------------- UI */

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else if (v != null && v !== false) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid);
    return el;
  }

  const FAB_COLORS = ['#ff9ec4', '#ffffff', '#ff5a5a', '#ffd93d', '#62cf5c', '#4aa8ff', '#a55cf0', '#ff5fa2', '#7f92c9'];

  let host = null;
  let fab = null;
  let panel = null;
  let note = null;
  let list = null;
  let items = [];
  let open = false;
  let fromCmd = false;
  let editor = null;
  let anchor = null;
  let sel = 0;

  function thumb(th) {
    const cv = document.createElement('canvas');
    const w = new World(cv);
    w.resize(92, 60, 4, 2);
    w.setTheme(th);
    w.draw(0.5);
    w.draw(0.5);
    return cv;
  }

  function buildUI() {
    host = h('div', { 'data-pxt-ui': 'host' });
    const sh = host.attachShadow({ mode: 'open' });
    sheet(UI_CSS, sh);

    fab = h(
      'button',
      { class: 'fab', type: 'button', title: 'Claude Themes  (/theme · Alt+T)', 'aria-label': 'Đổi khung cảnh ASCII', onclick: () => (open ? closePicker(false) : openPicker(null, false)) },
      FAB_COLORS.map((c) => {
        const i = h('i');
        i.style.setProperty('background', c);
        return i;
      }),
    );
    fab.hidden = !cfg.button;

    panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Chọn khung cảnh ASCII', hidden: true });
    sh.append(fab, panel);
    root.appendChild(host);
  }

  function buildPanel() {
    list = h('div', { class: 'list', role: 'listbox', 'aria-label': 'Themes' });
    items = ITEMS.map((id, i) => {
      const th = byId(id);
      const btn = h(
        'button',
        {
          class: 'it',
          type: 'button',
          role: 'option',
          onclick: () => {
            sel = i;
            commit(id);
            if (fromCmd) {
              fromCmd = false;
              clearEditor(editor);
            }
          },
        },
        h('span', { class: 'th' }, th ? thumb(th) : h('span', { class: 'off' }, 'OFF')),
        h('span', { class: 'nm' }, th ? th.name : 'Tắt'),
      );
      list.append(btn);
      return btn;
    });

    const range = (label, min, max, key, after) =>
      h(
        'label',
        null,
        label,
        h('input', {
          type: 'range',
          min,
          max,
          step: '0.05',
          value: String(cfg[key]),
          oninput: (e) => {
            cfg[key] = +e.target.value;
            save();
            after();
          },
        }),
      );
    const check = (label, key, after) =>
      h(
        'label',
        null,
        h('input', {
          type: 'checkbox',
          checked: cfg[key],
          onchange: (e) => {
            cfg[key] = e.target.checked;
            save();
            after();
          },
        }),
        label,
      );

    note = h('div', { class: 'note', hidden: true });
    panel.append(
      h('div', { class: 'hd' }, h('span', { class: 'cmd' }, '/theme'), h('span', { class: 'ttl' }, 'Claude Themes'), h('span', { class: 'hint' }, '← → chọn · ↵ áp dụng · esc đóng')),
      note,
      list,
      h(
        'div',
        { class: 'ctl' },
        range('Làm dịu nền', '0', '0.8', 'veil', () => {
          if (!raf) paint(0);
        }),
        range('Độ đục khung', '0.3', '0.95', 'glass', () => {
          root.style.setProperty('--pxt-alpha', String(cfg.glass));
          root.style.setProperty('--pxt-blur', cfg.glass >= 0.95 ? '0px' : '12px');
        }),
        check('Chuyển động', 'motion', () => {
          if (cfg.motion) startLoop();
          else stopLoop();
        }),
        check('Nút nổi', 'button', () => {
          fab.hidden = !cfg.button;
        }),
      ),
    );
  }

  function syncPanel() {
    if (!panel) return;
    panel.classList.toggle('dark', siteDark);
    if (!note) return;
    const th = byId(curId);
    note.hidden = !th || th.dark === siteDark;
    note.textContent = th && th.dark ? 'Theme tối: bật giao diện Dark của trang để màu rõ hơn.' : 'Theme sáng: hợp với giao diện Light của trang hơn.';
  }

  function highlight() {
    syncPanel();
    items.forEach((b, i) => {
      b.classList.toggle('sel', i === sel);
      b.classList.toggle('cur', ITEMS[i] === cfg.theme);
      b.setAttribute('aria-selected', String(i === sel));
    });
    // The grid wraps; on a short screen it scrolls vertically to keep the selection in view.
    const b = items[sel];
    if (b && list) {
      const T = b.offsetTop;
      const B = T + b.offsetHeight;
      if (T < list.scrollTop) list.scrollTop = T - 4;
      else if (B > list.scrollTop + list.clientHeight) list.scrollTop = B - list.clientHeight + 4;
    }
  }

  function place() {
    const a = anchor && anchor.isConnected ? (anchor.closest('fieldset, form') || anchor).getBoundingClientRect() : null;
    const ph = panel.offsetHeight;
    const pw = panel.offsetWidth;
    const vh = innerHeight;
    const vw = document.documentElement.clientWidth || innerWidth;
    let top = vh - ph - 96;
    if (a && a.top - ph - 10 > 8) top = a.top - ph - 10;
    else if (a && a.bottom + ph + 10 < vh) top = a.bottom + 10;
    panel.style.setProperty('top', Math.max(8, top) + 'px');
    panel.style.setProperty('left', clamp(a ? a.left + a.width / 2 : vw / 2, pw / 2 + 10, vw - pw / 2 - 10) + 'px');
  }

  function openPicker(anchorEl, cmd) {
    if (!items.length) buildPanel();
    open = true;
    fromCmd = !!cmd;
    anchor = anchorEl;
    sel = Math.max(0, ITEMS.indexOf(cfg.theme));
    panel.hidden = false;
    highlight();
    place();
  }

  function closePicker(keep) {
    if (!open) return;
    if (!keep && curId !== cfg.theme) applyTheme(cfg.theme);
    open = false;
    fromCmd = false;
    anchor = null;
    panel.hidden = true;
  }

  function move(d) {
    sel = (sel + d + ITEMS.length) % ITEMS.length;
    applyTheme(ITEMS[sel]); // live preview, saved only on Enter / click
    highlight();
  }

  function commit(id) {
    cfg.theme = id;
    save();
    applyTheme(id);
    if (open) highlight();
  }

  function findTheme(q) {
    q = strip(q);
    if (!q) return -1;
    if (/^(off|tat|none|0)$/.test(q)) return ITEMS.indexOf('off');
    const exact = THEMES.findIndex((t) => t.id === q || strip(t.name) === q || t.alias.includes(q));
    if (exact >= 0) return exact;
    return THEMES.findIndex((t) => t.id.startsWith(q) || strip(t.name).includes(q) || t.alias.some((a) => a.startsWith(q)));
  }

  /* ------------------------------------------------------- /theme command */

  // "/thêm" and "/nen" are there because Vietnamese Telex keyboards turn "theme" into "thêm".
  const CMD = /^\/(theme|thêm|them|nen|nền)(?:\s+(.*))?$/iu;

  function editableRoot(t) {
    if (!t || t.nodeType !== 1) return null;
    if (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /^(text|search)$/i.test(t.type))) return t;
    return t.closest('[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]');
  }

  const textOf = (el) => (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? el.value : el.innerText || '');

  function clearEditor(el) {
    if (!el || !el.isConnected) return;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(range);
    if (!document.execCommand('delete', false)) el.textContent = '';
  }

  function runCommand(text) {
    const m = CMD.exec(String(text).normalize('NFC').trim());
    if (!m) return false;
    const i = m[2] ? findTheme(m[2]) : -1;
    if (i >= 0) commit(ITEMS[i]);
    else openPicker(null, false);
    return true;
  }

  document.addEventListener(
    'input',
    (e) => {
      const el = editableRoot(e.target);
      if (!el || (host && host.contains(el))) return;
      const m = CMD.exec(textOf(el).normalize('NFC').trim());
      if (m) {
        editor = el;
        if (!open) openPicker(el, true);
        fromCmd = true;
        const i = m[2] ? findTheme(m[2]) : -1;
        if (i >= 0 && i !== sel) {
          sel = i;
          applyTheme(ITEMS[i]);
          highlight();
        }
      } else if (open && fromCmd) {
        closePicker(false);
      }
    },
    onCap,
  );

  addEventListener(
    'keydown',
    (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyT') {
        e.preventDefault();
        if (open) closePicker(false);
        else openPicker(editableRoot(document.activeElement), false);
        return;
      }
      if (!open || e.isComposing) return;
      const target = e.composedPath()[0];
      if (target && target.tagName === 'INPUT' && target.type === 'range') return;
      // Opened from the button while the user types elsewhere: only Esc belongs to us.
      if (!fromCmd && editableRoot(document.activeElement) && e.key !== 'Escape') return;
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        stop();
        move(e.key === 'ArrowRight' ? 1 : -1);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        stop();
        const wasCmd = fromCmd;
        commit(ITEMS[sel]);
        closePicker(true);
        if (wasCmd) clearEditor(editor);
      } else if (e.key === 'Escape') {
        stop();
        closePicker(false);
      }
    },
    onCap,
  );

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (open && !e.composedPath().includes(host) && !(fromCmd && e.composedPath().includes(editor))) closePicker(false);
    },
    onCap,
  );

  addEventListener('resize', () => open && place(), on);
  if (window.visualViewport) visualViewport.addEventListener('resize', () => open && place(), on);
  reduce.addEventListener && reduce.addEventListener('change', () => (running() ? startLoop() : (stopLoop(), paint(0))), on);

  /* ------------------------------------------------------------------- boot */

  let unsheet = null;
  const api = {
    themes: ITEMS.slice(),
    get current() {
      return cfg.theme;
    },
    set(id) {
      if (!ITEMS.includes(id)) return false;
      commit(id);
      return true;
    },
    open: () => openPicker(null, false),
    close: () => closePicker(true),
    command: runCommand,
    version: VERSION,
    // Stops everything and puts the page back, so a newer copy can take over.
    destroy() {
      life.abort();
      stopLoop();
      stopScan();
      root.removeAttribute('data-pxt-on');
      if (canvas) canvas.remove();
      if (host) host.remove();
      if (unsheet) unsheet();
      if (window.__claudeThemes === api) delete window.__claudeThemes;
    },
  };
  window.__claudeThemes = api;

  function boot() {
    if (!document.body) {
      setTimeout(boot, 50);
      return;
    }
    unsheet = sheet(PAGE_CSS, document);
    buildUI();
    applyTheme(cfg.theme);
    say('✅ Claude Themes đã chạy. Bấm Alt+T (hoặc nút ô vuông màu ở cạnh phải) để chọn theme.');
  }

  boot();
})();
