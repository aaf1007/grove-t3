import * as Schema from "effect/Schema";

export const THEME_DITHER_PATTERNS = ["bayer", "dots", "noise", "lines"] as const;
export const THEME_DITHER_SURFACES = ["canvas", "sidebar", "panels"] as const;
export const MIN_THEME_DITHER_SCALE = 1;
export const MAX_THEME_DITHER_SCALE = 4;
export const MIN_THEME_DITHER_SPEED = 25;
export const MAX_THEME_DITHER_SPEED = 300;

export const ThemeDitherPattern = Schema.Literals(THEME_DITHER_PATTERNS);
export type ThemeDitherPattern = typeof ThemeDitherPattern.Type;
export const ThemeDitherSurface = Schema.Literals(THEME_DITHER_SURFACES);
export type ThemeDitherSurface = typeof ThemeDitherSurface.Type;

/** Dithered light along the top of a theme's surfaces on web and desktop, clear below the middle. */
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
  /** Percent of the default drift speed. */
  speed: Schema.optional(
    Schema.Int.check(
      Schema.isBetween({ minimum: MIN_THEME_DITHER_SPEED, maximum: MAX_THEME_DITHER_SPEED }),
    ),
  ),
});
export type ThemeDither = typeof ThemeDither.Type;

/** Per device: follow the theme's dither, or use this one on every theme. */
export const ThemeDitherOverride = Schema.Union([Schema.Literal("theme"), ThemeDither]);
export type ThemeDitherOverride = typeof ThemeDitherOverride.Type;
