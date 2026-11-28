import { describe, expect, it } from "vite-plus/test";
import { converter, parse } from "culori/fn";
import { BITMAP_THEME, BUILT_IN_THEMES } from "@t3tools/shared/themePalettes";
import { THEME_DITHER_SURFACES } from "@t3tools/contracts";

import {
  autoDitherColor,
  DEFAULT_THEME_DITHER,
  ditherAlphaFor,
  ditherCells,
  ditherThreshold,
  effectiveThemeDither,
  packInk,
  resolveThemeDither,
  themeDitherCss,
  themeDitherField,
} from "./themeDither";
import {
  getStandardPaintedThemeColors,
  getThemeColorsForMode,
  parseThemeFile,
  serializeThemeFile,
  THEME_FILE_VERSION,
  type ThemeColors,
} from "./themePalette";

const toRgb = converter("rgb");

function rgb(value: string): [number, number, number] {
  const { r, g, b } = toRgb(parse(value)!);
  return [r, g, b].map((channel) => Math.min(1, Math.max(0, channel))) as [number, number, number];
}

function contrast(first: [number, number, number], second: [number, number, number]): number {
  const luminance = (channels: [number, number, number]) =>
    channels
      .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

function blend(
  base: [number, number, number],
  overlay: [number, number, number],
  alpha: number,
): [number, number, number] {
  return base.map((channel, index) => channel + (overlay[index]! - channel) * alpha) as [
    number,
    number,
    number,
  ];
}

const SURFACE_PAIRS = {
  canvas: [
    ["canvas", "text", 7],
    ["canvas", "textMuted", 4.5],
  ],
  sidebar: [
    ["sidebar", "sidebarForeground", 7],
    ["sidebar", "sidebarMutedForeground", 4.5],
  ],
  panels: [
    ["canvas", "text", 7],
    ["canvas", "textMuted", 4.5],
    ["surface", "text", 7],
    ["surface", "textMuted", 4.5],
  ],
} as const;

const PALETTES: ReadonlyArray<[string, ThemeColors]> = [
  ["standard light", getStandardPaintedThemeColors("light")],
  ["standard dark", getStandardPaintedThemeColors("dark")],
  ...BUILT_IN_THEMES.flatMap((theme) =>
    (["light", "dark"] as const).flatMap((mode) => {
      const colors = getThemeColorsForMode(theme, mode);
      return colors ? [[`${theme.id} ${mode}`, colors] as [string, ThemeColors]] : [];
    }),
  ),
];

describe("theme dither", () => {
  it("never lowers text below its contrast target, whatever the color", () => {
    for (const [name, colors] of PALETTES) {
      for (const surface of THEME_DITHER_SURFACES) {
        for (const color of [autoDitherColor(colors), "#000000", "#ffffff", "#ff2d55"]) {
          const alpha = ditherAlphaFor(colors, surface, color, 0.5);
          for (const [background, foreground, target] of SURFACE_PAIRS[surface]) {
            const before = contrast(rgb(colors[foreground]), rgb(colors[background]));
            const after = contrast(
              rgb(colors[foreground]),
              blend(rgb(colors[background]), rgb(color), alpha),
            );
            expect(after, `${name} ${surface} ${foreground} with ${color}`).toBeGreaterThanOrEqual(
              Math.min(target, before) - 1e-6,
            );
          }
        }
      }
    }
  });

  it("keeps Bitmap's own dither visible", () => {
    for (const mode of ["light", "dark"] as const) {
      const colors = getThemeColorsForMode(BITMAP_THEME, mode)!;
      const dither = resolveThemeDither(BITMAP_THEME.dither!);
      for (const surface of dither.surfaces) {
        const color = autoDitherColor(colors);
        const alpha = ditherAlphaFor(colors, surface, color, 0.15);
        const background = rgb(colors.canvas);
        expect(contrast(background, blend(background, rgb(color), alpha))).toBeGreaterThan(1.1);
      }
    }
  });

  it("rounds opacity down when packing, so text keeps its contrast floor", () => {
    const colors: ThemeColors = {
      ...getStandardPaintedThemeColors("light"),
      canvas: "#ffffff",
      text: "#000000",
      textMuted: "#757575",
    };
    const alpha = ditherAlphaFor(colors, "canvas", "#000000", 0.15);
    const packedAlpha = (packInk({ rgb: { r: 0, g: 0, b: 0 }, alpha }) >>> 24) / 255;
    expect(packedAlpha).toBeLessThanOrEqual(alpha);
    const background = rgb(colors.canvas);
    const blended = blend(background, [0, 0, 0], packedAlpha);
    expect(contrast(rgb(colors.textMuted), blended)).toBeGreaterThanOrEqual(4.5);
  });

  it("follows the theme or a per-device override", () => {
    const themeDither = { pattern: "lines", strength: 40 } as const;
    expect(effectiveThemeDither(undefined, "theme")).toEqual(DEFAULT_THEME_DITHER);
    expect(effectiveThemeDither(themeDither, "theme")).toMatchObject({ pattern: "lines" });
    expect(effectiveThemeDither(undefined, { pattern: "noise" })).toMatchObject({
      pattern: "noise",
      strength: DEFAULT_THEME_DITHER.strength,
    });
  });

  it("pins one image per surface to the viewport", () => {
    const css = themeDitherCss([
      { surface: "canvas", imageUrl: "blob:canvas" },
      { surface: "panels", imageUrl: "blob:panels" },
    ]);
    expect(css).toContain('url("blob:canvas"), var(--surface-grain)');
    expect(css).toContain('url("blob:panels");');
    expect(css).toContain("background-attachment: fixed, scroll");
    expect(css).not.toContain("sidebar-inner");
  });

  it("pools light at the top and lets a dimmer glow reach the bottom", () => {
    const [columns, rows] = [120, 80];
    const lit = (cells: Uint32Array, from: number, to: number) =>
      cells.slice(from * columns, to * columns).filter(Boolean).length;
    const cells = ditherCells(DEFAULT_THEME_DITHER, columns, rows, 1, 2.5);
    expect(lit(cells, 0, rows / 4)).toBeGreaterThan(columns);
    expect(lit(cells, (rows * 3) / 4, rows)).toBeGreaterThan(0);
    expect(lit(cells, 0, rows / 4)).toBeGreaterThan(2 * lit(cells, (rows * 3) / 4, rows));
    const brighter = ditherCells({ ...DEFAULT_THEME_DITHER, strength: 100 }, columns, rows, 1, 2.5);
    expect(lit(brighter, 0, rows)).toBeGreaterThan(lit(cells, 0, rows));
    expect(ditherCells(DEFAULT_THEME_DITHER, columns, rows, 1, 2.5)).toEqual(cells);
    expect(ditherCells(DEFAULT_THEME_DITHER, columns, rows, 1, 6)).not.toEqual(cells);
  });

  it("gives every pattern thresholds inside the field's range, the same on every load", () => {
    for (const pattern of ["bayer", "dots", "noise", "lines"] as const) {
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const threshold = ditherThreshold(pattern, x, y);
          expect(threshold).toBeGreaterThanOrEqual(0);
          expect(threshold).toBeLessThan(1);
          expect(ditherThreshold(pattern, x, y)).toBe(threshold);
        }
      }
    }
    expect(themeDitherField({ pattern: "noise" })).toEqual({ dither: { pattern: "noise" } });
  });

  it("round-trips dither through theme files and drops a malformed one", () => {
    const dither = { pattern: "dots", strength: 30, scale: 3, surfaces: ["sidebar"] } as const;
    const theme = parseThemeFile({
      version: THEME_FILE_VERSION,
      name: "Dotted",
      appearance: "light",
      colors: { canvas: "#ffffff" },
      dither,
    });
    expect(theme.dither).toEqual(dither);
    expect(parseThemeFile(JSON.parse(serializeThemeFile(theme))).dither).toEqual(dither);
    expect(themeDitherField({ pattern: "plaid" })).toEqual({});
    expect(themeDitherField({ pattern: "bayer", strength: 400 })).toEqual({});
    expect(
      parseThemeFile({
        version: THEME_FILE_VERSION,
        name: "Plain",
        appearance: "dark",
        colors: { canvas: "#000000" },
        dither: { pattern: "plaid" },
      }).dither,
    ).toBeUndefined();
  });
});
