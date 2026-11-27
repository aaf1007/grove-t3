import * as Schema from "effect/Schema";

export const THEME_DITHER_PATTERNS = ["bayer", "dots", "noise", "lines"] as const;
export const THEME_DITHER_SURFACES = ["canvas", "sidebar", "panels"] as const;
export const MIN_THEME_DITHER_SCALE = 1;
export const MAX_THEME_DITHER_SCALE = 4;

export const ThemeDitherPattern = Schema.Literals(THEME_DITHER_PATTERNS);
export type ThemeDitherPattern = typeof ThemeDitherPattern.Type;
export const ThemeDitherSurface = Schema.Literals(THEME_DITHER_SURFACES);
export type ThemeDitherSurface = typeof ThemeDitherSurface.Type;

/** Dithered light across a theme's surfaces on web and desktop, brightest at the top. */
export const ThemeDither = Schema.Struct({
  pattern: ThemeDitherPattern,
  /** Percent: how far and how densely the light reaches. Clients dim it to keep text contrast. */
  strength: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
  /** Size of one pattern pixel, in CSS pixels. */
  scale: Schema.optional(
    Schema.Int.check(
      Schema.isBetween({ minimum: MIN_THEME_DITHER_SCALE, maximum: MAX_THEME_DITHER_SCALE }),
    ),
  ),
  /** Absent uses the text color cooled toward the accent. */
  color: Schema.optional(Schema.String.check(Schema.isPattern(/^#(?:[0-9a-fA-F]{6})$/))),
  surfaces: Schema.optional(Schema.Array(ThemeDitherSurface)),
  /** Lets the light drift and pulse, repainted at a capped frame rate. */
  motion: Schema.optional(Schema.Boolean),
});
export type ThemeDither = typeof ThemeDither.Type;

/** Per device: follow the theme's dither, turn it off, or use this one on every theme. */
export const ThemeDitherOverride = Schema.Union([Schema.Literals(["theme", "off"]), ThemeDither]);
export type ThemeDitherOverride = typeof ThemeDitherOverride.Type;
