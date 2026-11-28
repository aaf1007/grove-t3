import {
  ThemeDither,
  type ThemeDitherOverride,
  type ThemeDitherPattern,
  type ThemeDitherSurface,
} from "@t3tools/contracts";
import type { ThemeColorRole, ThemeColors } from "@t3tools/shared/themePalettes";
import "culori/css";
import { converter, parse } from "culori/fn";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export type ResolvedThemeDither = Readonly<{
  pattern: ThemeDitherPattern;
  strength: number;
  scale: number;
  color: string | null;
  surfaces: ReadonlyArray<ThemeDitherSurface>;
  motion: boolean;
  speed: number;
}>;

export const DEFAULT_THEME_DITHER: ResolvedThemeDither = {
  pattern: "bayer",
  strength: 60,
  scale: 3,
  color: null,
  surfaces: ["canvas"],
  motion: false,
  speed: 100,
};

/** A lit cell's opacity over its surface, before the contrast cap lowers it. */
const INK_ALPHA = 0.15;
/** Motion repaints the field at most this often. */
const DITHER_MOTION_FPS = 12;

const decodeThemeDither = Schema.decodeUnknownOption(ThemeDither);

/** Theme files carry dither leniently: a malformed value is dropped, not fatal. */
export function themeDitherField(value: unknown): { readonly dither?: ThemeDither } {
  if (value === undefined) return {};
  const dither = decodeThemeDither(value);
  return Option.isSome(dither) ? { dither: dither.value } : {};
}

export function resolveThemeDither(dither: ThemeDither): ResolvedThemeDither {
  return {
    pattern: dither.pattern,
    strength: dither.strength ?? DEFAULT_THEME_DITHER.strength,
    scale: dither.scale ?? DEFAULT_THEME_DITHER.scale,
    color: dither.color ?? null,
    surfaces: dither.surfaces ? [...new Set(dither.surfaces)] : DEFAULT_THEME_DITHER.surfaces,
    motion: dither.motion ?? DEFAULT_THEME_DITHER.motion,
    speed: dither.speed ?? DEFAULT_THEME_DITHER.speed,
  };
}

export function toThemeDither(dither: ResolvedThemeDither): ThemeDither {
  return {
    pattern: dither.pattern,
    strength: dither.strength,
    scale: dither.scale,
    ...(dither.color ? { color: dither.color } : {}),
    surfaces: dither.surfaces,
    motion: dither.motion,
    speed: dither.speed,
  };
}

export function effectiveThemeDither(
  themeDither: ThemeDither | undefined,
  override: ThemeDitherOverride,
): ResolvedThemeDither {
  if (override !== "theme") return resolveThemeDither(override);
  return themeDither ? resolveThemeDither(themeDither) : DEFAULT_THEME_DITHER;
}

type Rgb = Readonly<{ r: number; g: number; b: number }>;
const toRgb = converter("rgb");

function rgbOf(value: string): Rgb | null {
  const parsed = parse(value);
  if (!parsed) return null;
  const { r, g, b } = toRgb(parsed);
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
  return { r: clamp(r), g: clamp(g), b: clamp(b) };
}

function hexOf({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function luminance({ r, g, b }: Rgb): number {
  const linear = (channel: number) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(first: Rgb, second: Rgb): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Browsers composite in gamma-encoded sRGB, so the blend is per channel on those values.
function mix(base: Rgb, overlay: Rgb, alpha: number): Rgb {
  return {
    r: base.r + (overlay.r - base.r) * alpha,
    g: base.g + (overlay.g - base.g) * alpha,
    b: base.b + (overlay.b - base.b) * alpha,
  };
}

type Foreground = Readonly<{ role: ThemeColorRole; target: number }>;
type SurfaceContrast = Readonly<{
  backgrounds: ReadonlyArray<ThemeColorRole>;
  foregrounds: ReadonlyArray<Foreground>;
}>;

// Body text keeps 7:1 (AAA) and secondary text 4.5:1 (AA), or what the palette had if lower.
const SURFACE_CONTRAST: Readonly<Record<ThemeDitherSurface, SurfaceContrast>> = {
  canvas: {
    backgrounds: ["canvas"],
    foregrounds: [
      { role: "text", target: 7 },
      { role: "textMuted", target: 4.5 },
    ],
  },
  sidebar: {
    backgrounds: ["sidebar"],
    foregrounds: [
      { role: "sidebarForeground", target: 7 },
      { role: "sidebarMutedForeground", target: 4.5 },
    ],
  },
  panels: {
    backgrounds: ["canvas", "surface"],
    foregrounds: [
      { role: "text", target: 7 },
      { role: "textMuted", target: 4.5 },
    ],
  },
};

/** The text color cooled toward the accent, so the pattern reads as the theme's own light. */
export function autoDitherColor(colors: ThemeColors): string {
  const text = rgbOf(colors.text) ?? { r: 1, g: 1, b: 1 };
  const accent = rgbOf(colors.accent) ?? text;
  return hexOf(mix(text, accent, 0.35));
}

/** The highest opacity, up to `requested`, at which every foreground keeps its contrast target. */
export function ditherAlphaFor(
  colors: ThemeColors,
  surface: ThemeDitherSurface,
  color: string,
  requested: number,
): number {
  const overlay = rgbOf(color);
  if (!overlay || requested <= 0) return 0;
  const { backgrounds, foregrounds } = SURFACE_CONTRAST[surface];
  const pairs: Array<{ background: Rgb; foreground: Rgb; floor: number }> = [];
  for (const backgroundRole of backgrounds) {
    const background = rgbOf(colors[backgroundRole]);
    if (!background) continue;
    for (const { role, target } of foregrounds) {
      const foreground = rgbOf(colors[role]);
      if (!foreground) continue;
      pairs.push({
        background,
        foreground,
        floor: Math.min(target, contrast(foreground, background)),
      });
    }
  }
  const keepsContrast = (alpha: number) =>
    pairs.every(
      ({ background, foreground, floor }) =>
        contrast(foreground, mix(background, overlay, alpha)) >= floor - 1e-9,
    );
  if (keepsContrast(requested)) return requested;
  let low = 0;
  let high = requested;
  for (let step = 0; step < 16; step++) {
    const middle = (low + high) / 2;
    if (keepsContrast(middle)) low = middle;
    else high = middle;
  }
  return low;
}

const SURFACE_SELECTORS: Readonly<Record<ThemeDitherSurface, string>> = {
  // The chat area paints the canvas again over the inset, so its layers take the image too.
  canvas:
    'body, [data-slot="sidebar-inset"], :where([data-slot="sidebar-inset"] .bg-background:not(:is([data-workspace-area="panel"], [data-thread-terminal-drawer]), :is([data-workspace-area="panel"], [data-thread-terminal-drawer]) *))',
  sidebar:
    ':where(.surface-grain):is([data-slot="sidebar-inner"], [data-slot="sidebar"], [data-sidebar="sidebar"])',
  panels: '[data-workspace-area="panel"], [data-thread-terminal-drawer]',
};

// Panels have no grain of their own, so they take the image alone.
const GRAINED_SURFACES: ReadonlySet<ThemeDitherSurface> = new Set(["canvas", "sidebar"]);

/**
 * One viewport-sized image, pinned to the viewport, so every layer that repaints the canvas
 * shows its own slice of the same field. Selectors match the surface-grain utility's
 * specificity, so theme CSS, adopted after, still wins.
 */
export function themeDitherCss(
  images: ReadonlyArray<Readonly<{ surface: ThemeDitherSurface; imageUrl: string }>>,
): string {
  return images
    .map(({ surface, imageUrl }) => {
      const grained = GRAINED_SURFACES.has(surface);
      return (
        `${SURFACE_SELECTORS[surface]} {` +
        ` background-image: url("${imageUrl}")${grained ? ", var(--surface-grain)" : ""};` +
        ` background-size: 100vw 100vh${grained ? ", var(--surface-grain-size)" : ""};` +
        ` background-attachment: fixed${grained ? ", scroll" : ""};` +
        ` background-repeat: no-repeat${grained ? ", repeat" : ""};` +
        " background-position: 0 0;" +
        " image-rendering: pixelated;" +
        " }"
      );
    })
    .join("\n");
}

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;
// Clustered-dot order: each cell grows from its middle, like print halftone.
const CLUSTER_4 = [
  [12, 5, 6, 13],
  [4, 0, 1, 7],
  [11, 3, 2, 8],
  [15, 10, 9, 14],
] as const;
// Spreads the rows so lines thicken evenly instead of from the top.
const LINE_ROWS = [0, 2, 1, 3] as const;

function cellNoise(x: number, y: number): number {
  let hash = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
  return ((hash ^ (hash >>> 12)) >>> 0) / 4294967296;
}

/** The density a cell must exceed to light up, 0 to 1. */
export function ditherThreshold(pattern: ThemeDitherPattern, x: number, y: number): number {
  switch (pattern) {
    case "bayer":
      return (BAYER_4[y & 3]![x & 3]! + 0.5) / 16;
    case "dots":
      return (CLUSTER_4[y & 3]![x & 3]! + 0.5) / 16;
    case "noise":
      return cellNoise(x, y);
    case "lines":
      return (LINE_ROWS[y & 3]! + 0.5) / 4;
  }
}

type Glow = Readonly<{
  x: number;
  width: number;
  depth: number;
  period: number;
  phase: number;
  peak: number;
}>;

// Pools of light hanging from the top edge that swell, fade, and slide past each other.
const GLOWS: ReadonlyArray<Glow> = [
  { x: 0.15, width: 0.32, depth: 0.62, period: 10, phase: 0, peak: 0.85 },
  { x: 0.5, width: 0.3, depth: 0.4, period: 13, phase: Math.PI / 3, peak: 0.55 },
  { x: 0.85, width: 0.34, depth: 0.7, period: 11, phase: Math.PI / 2, peak: 1 },
];
const TAU = Math.PI * 2;
/** The moment a still dither shows: every glow lit, the first near full. */
const STILL_TIME = 2.5;
/** The light is gone by this far down the window, so the middle stays clear for text. */
const FIELD_FLOOR = 0.5;
/** How far above the floor the light starts thinning out. */
const FIELD_FADE = 0.3;

/** Light density at `u`, `v` (0 to 1 across and down the window) at `time` seconds, 0 to 1. */
function ditherField(u: number, v: number, time: number): number {
  if (v >= FIELD_FLOOR) return 0;
  // A slow, gentle warp keeps the glows' edges from reading as perfect ellipses.
  const wu = u + 0.035 * Math.sin(v * 9 + time * 0.6);
  const wv = v + 0.035 * Math.sin(u * 7 - time * 0.4);
  let value = 0;
  for (const glow of GLOWS) {
    const x = glow.x + 0.07 * Math.sin((TAU * time) / (glow.period * 1.1) + glow.phase);
    const width =
      glow.width * (1 + 0.2 * Math.sin((TAU * time) / (glow.period * 1.3) + glow.phase + 1));
    const level = glow.peak * (0.6 + 0.4 * Math.sin((TAU * time) / glow.period + glow.phase));
    const dx = (wu - x) / width;
    const dy = (wv + 0.05) / glow.depth;
    // Screen blend, so overlapping glows brighten together instead of meeting at a seam.
    value = 1 - (1 - value) * (1 - level * Math.exp(-2.6 * (dx * dx + dy * dy)));
  }
  const fade = Math.min(1, (FIELD_FLOOR - v) / FIELD_FADE);
  return value * fade * fade * (3 - 2 * fade);
}

/** Lights each cell whose field density clears the pattern's threshold. Packed RGBA, row-major. */
export function ditherCells(
  dither: Pick<ResolvedThemeDither, "pattern" | "strength">,
  columns: number,
  rows: number,
  ink: number,
  time: number,
): Uint32Array {
  const cells = new Uint32Array(columns * rows);
  const gain = dither.strength / 70;
  for (let y = 0; y < rows; y++) {
    const v = (y + 0.5) / rows;
    for (let x = 0; x < columns; x++) {
      // The small floor ends each glow cleanly instead of in a wide haze of stray cells.
      const density = gain * ditherField((x + 0.5) / columns, v, time) - 0.025;
      if (density > ditherThreshold(dither.pattern, x, y)) cells[y * columns + x] = ink;
    }
  }
  return cells;
}

/** The pattern's color, and per surface an opacity that never costs its text its contrast. */
function ditherInks(
  dither: ResolvedThemeDither,
  colors: ThemeColors,
): Array<{ surface: ThemeDitherSurface; rgb: Rgb; alpha: number }> {
  const rgb = rgbOf(dither.color ?? autoDitherColor(colors));
  if (!rgb) return [];
  const color = hexOf(rgb);
  return dither.surfaces
    .map((surface) => ({ surface, rgb, alpha: ditherAlphaFor(colors, surface, color, INK_ALPHA) }))
    .filter(({ alpha }) => alpha > 0.004);
}

// RGBA bytes in memory order; Uint32Array is little-endian on every platform browsers run on.
export function packInk({ rgb, alpha }: { rgb: Rgb; alpha: number }): number {
  const byte = (value: number) => Math.round(value * 255);
  // Rounding opacity up could push text just below its contrast floor.
  const alphaByte = Math.floor(alpha * 255 + 1e-9);
  return ((alphaByte << 24) | (byte(rgb.b) << 16) | (byte(rgb.g) << 8) | byte(rgb.r)) >>> 0;
}

let ditherSheet: CSSStyleSheet | null = null;
let themeSource: Readonly<{ dither: ThemeDither | undefined; colors: ThemeColors }> | null = null;
let deviceOverride: ThemeDitherOverride = "theme";
let deviceEnabled = true;
let reducedMotion: MediaQueryList | null = null;
let imageUrls: ReadonlyArray<string> = [];
let paintKey = "";
let paintGeneration = 0;
let motionTimer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function applyCss(css: string) {
  if (!ditherSheet) {
    if (!css) return;
    ditherSheet = new CSSStyleSheet();
    // Ahead of the theme CSS sheet, so a theme's own background rules override the dither.
    document.adoptedStyleSheets = [ditherSheet, ...document.adoptedStyleSheets];
  }
  ditherSheet.replaceSync(css);
}

async function encodeCells(
  cells: Uint32Array,
  columns: number,
  rows: number,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(columns, rows);
  new Uint32Array(image.data.buffer).set(cells);
  context.putImageData(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function encodedUrl(cells: Uint32Array, columns: number, rows: number) {
  const blob = await encodeCells(cells, columns, rows);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  // Decoded before it is shown, so a swap never flashes an empty background.
  const image = new Image();
  image.src = url;
  await image.decode().catch(() => undefined);
  return url;
}

async function paint(dither: ResolvedThemeDither, colors: ThemeColors, time: number) {
  const generation = ++paintGeneration;
  const inks = ditherInks(dither, colors);
  if (inks.length === 0) {
    applyCss("");
    return;
  }
  const columns = Math.max(1, Math.ceil(window.innerWidth / dither.scale));
  const rows = Math.max(1, Math.ceil(window.innerHeight / dither.scale));
  const mask = ditherCells(dither, columns, rows, 1, time);
  // Surfaces whose contrast allows the same opacity share one image.
  const urlByInk = new Map<number, Promise<string | null>>();
  const images = await Promise.all(
    inks.map(async (ink) => {
      const packed = packInk(ink);
      let url = urlByInk.get(packed);
      if (!url) {
        url = encodedUrl(
          mask.map((lit) => (lit ? packed : 0)),
          columns,
          rows,
        );
        urlByInk.set(packed, url);
      }
      return { surface: ink.surface, imageUrl: await url };
    }),
  );
  const urls = [...new Set(images.flatMap(({ imageUrl }) => (imageUrl ? [imageUrl] : [])))];
  if (generation !== paintGeneration) {
    for (const url of urls) URL.revokeObjectURL(url);
    return;
  }
  applyCss(
    themeDitherCss(
      images.flatMap(({ surface, imageUrl }) => (imageUrl ? [{ surface, imageUrl }] : [])),
    ),
  );
  for (const url of imageUrls) URL.revokeObjectURL(url);
  imageUrls = urls;
}

function motionAllowed(): boolean {
  return document.visibilityState !== "hidden" && !reducedMotion?.matches;
}

function stopMotion() {
  if (motionTimer !== null) clearTimeout(motionTimer);
  motionTimer = null;
}

function render(): void {
  if (typeof CSSStyleSheet === "undefined") return;
  const dither =
    themeSource && deviceEnabled ? effectiveThemeDither(themeSource.dither, deviceOverride) : null;
  if (!dither || !themeSource) {
    stopMotion();
    paintKey = "";
    paintGeneration++;
    applyCss("");
    for (const url of imageUrls) URL.revokeObjectURL(url);
    imageUrls = [];
    return;
  }
  if (!listening) {
    listening = true;
    window.addEventListener("resize", scheduleRender);
    // Not via scheduleRender: hidden windows skip animation frames, so motion would never stop.
    document.addEventListener("visibilitychange", render);
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.addEventListener("change", render);
  }
  const { colors } = themeSource;
  const animate = dither.motion && motionAllowed();
  const key = JSON.stringify([dither, window.innerWidth, window.innerHeight, animate]);
  if (key === paintKey && themeSource.colors === paintedColors) return;
  paintKey = key;
  paintedColors = colors;
  stopMotion();
  if (!animate) {
    void paint(dither, colors, STILL_TIME);
    return;
  }
  const started = performance.now();
  const frame = () => {
    const elapsed = (performance.now() - started) / 1000;
    void paint(dither, colors, STILL_TIME + (elapsed * dither.speed) / 100);
    motionTimer = setTimeout(frame, 1000 / DITHER_MOTION_FPS);
  };
  frame();
}

let paintedColors: ThemeColors | null = null;
let renderQueued = false;

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

/** The palette now on screen and the dither its theme asks for. */
export function setThemeDitherSource(dither: ThemeDither | undefined, colors: ThemeColors): void {
  if (themeSource && themeSource.dither === dither && themeSource.colors === colors) return;
  themeSource = { dither, colors };
  render();
}

/** This device's dither settings, applied over whatever theme is on screen. */
export function setThemeDitherDevice(enabled: boolean, override: ThemeDitherOverride): void {
  deviceEnabled = enabled;
  deviceOverride = override;
  render();
}
