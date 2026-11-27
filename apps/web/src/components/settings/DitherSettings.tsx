import type { CSSProperties } from "react";
import { msg, useGT, useMessages } from "gt-react";
import {
  MAX_THEME_DITHER_SCALE,
  MIN_THEME_DITHER_SCALE,
  THEME_DITHER_PATTERNS,
  THEME_DITHER_SURFACES,
  type ThemeDitherPattern,
  type ThemeDitherSurface,
} from "@t3tools/contracts";

import { useCustomThemes } from "../../hooks/useCustomThemes";
import { useTheme } from "../../hooks/useTheme";
import {
  getStandardPaintedThemeColors,
  getThemeColorsForMode,
  getThemeDefinition,
  resolveThemeHalf,
  updateCustomTheme,
} from "../../themePalette";
import {
  autoDitherColor,
  DEFAULT_THEME_DITHER,
  effectiveThemeDither,
  resolveThemeDither,
  toThemeDither,
  type ResolvedThemeDither,
} from "../../themeDither";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

const PATTERN_LABELS: Record<ThemeDitherPattern, string> = {
  bayer: msg("Bayer", { $context: "ordered dither pattern" }),
  dots: msg("Halftone dots"),
  noise: msg("Noise", { $context: "random pixel pattern" }),
  lines: msg("Scanlines"),
};

const SURFACE_LABELS: Record<ThemeDitherSurface, string> = {
  canvas: msg("Canvas", { $context: "main app background" }),
  sidebar: msg("Sidebar"),
  panels: msg("Panels", { $context: "side panels and terminal" }),
};

function sliderStyle(value: number, min: number, max: number): CSSProperties {
  const ratio = (value - min) / (max - min);
  return {
    "--settings-slider-progress": `${ratio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - ratio}rem`,
  } as CSSProperties;
}

export function DitherSettingsSection() {
  const searchableSetting = useSearchableSetting();
  const gt = useGT();
  const m = useMessages();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const { theme, themeHalves, resolvedTheme } = useTheme();
  const customThemes = useCustomThemes();
  const definition = getThemeDefinition(resolveThemeHalf(theme, themeHalves, resolvedTheme));
  const colors =
    (definition && getThemeColorsForMode(definition, resolvedTheme)) ??
    getStandardPaintedThemeColors(resolvedTheme);
  const themeDither = definition?.dither;
  const override = settings.ditherOverride;
  const effective = effectiveThemeDither(themeDither, override);
  const shown: ResolvedThemeDither =
    effective ?? (themeDither ? resolveThemeDither(themeDither) : DEFAULT_THEME_DITHER);
  const customTheme = customThemes.find((candidate) => candidate.id === definition?.id) ?? null;

  const update = (patch: Partial<ResolvedThemeDither>) =>
    updateSettings({ ditherOverride: toThemeDither({ ...shown, ...patch }) });
  const setEnabled = (enabled: boolean) =>
    updateSettings({ ditherOverride: enabled ? "theme" : "off" });
  const saveToTheme = () => {
    if (!customTheme || typeof override !== "object") return;
    try {
      updateCustomTheme({ ...customTheme, dither: override });
      updateSettings({ ditherOverride: "theme" });
    } catch {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: gt("Couldn't save the dither to this theme"),
          description: gt("Try again."),
        }),
      );
    }
  };

  const ditherColor = shown.color ?? autoDitherColor(colors);
  const resetToTheme =
    override !== "theme" ? (
      <SettingResetButton
        ariaLabel={gt("Use the theme's dither")}
        tooltip={gt("Use the theme's dither")}
        onClick={() => updateSettings({ ditherOverride: "theme" })}
      />
    ) : null;

  return (
    <SettingsSection id="appearance-dither" title={gt("Dither")}>
      <SettingsRow
        {...searchableSetting("dither")}
        devicePreference
        description={
          themeDither
            ? gt("This theme comes with a dither. Turn it off or change it on this device.")
            : gt("Show dithered light across the app on this device.")
        }
        resetAction={resetToTheme}
        control={
          <div className="flex items-center gap-2">
            {customTheme && typeof override === "object" ? (
              <Button size="sm" variant="outline" onClick={saveToTheme}>
                {gt("Save to theme")}
              </Button>
            ) : null}
            <Switch
              checked={effective !== null}
              onCheckedChange={(checked) => setEnabled(Boolean(checked))}
              aria-label={gt("Dither")}
            />
          </div>
        }
      />
      {effective ? (
        <>
          <SettingsRow
            {...searchableSetting("dither-pattern")}
            devicePreference
            description={gt("Choose the pixel pattern.")}
            control={
              <div className="w-full sm:w-44">
                <Select
                  value={shown.pattern}
                  onValueChange={(value) => {
                    const pattern = THEME_DITHER_PATTERNS.find((candidate) => candidate === value);
                    if (pattern) update({ pattern });
                  }}
                >
                  <SelectTrigger size="sm" className="w-full min-w-0" aria-label={gt("Pattern")}>
                    <SelectValue>{m(PATTERN_LABELS[shown.pattern])}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    {THEME_DITHER_PATTERNS.map((pattern) => (
                      <SelectItem key={pattern} value={pattern}>
                        {m(PATTERN_LABELS[pattern])}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
            }
          />
          <SettingsRow
            {...searchableSetting("dither-strength")}
            devicePreference
            description={gt(
              "Set how far the light reaches. Text keeps its contrast, so some themes keep it faint.",
            )}
            control={
              <div className="flex w-full items-center gap-3 sm:w-52">
                <output
                  className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                  htmlFor="dither-strength-slider"
                >
                  {shown.strength}%
                </output>
                <input
                  aria-label={gt("Dither strength")}
                  className="settings-slider min-w-0 flex-1"
                  id="dither-strength-slider"
                  max={100}
                  min={5}
                  onChange={(event) => {
                    const strength = Number(event.currentTarget.value);
                    if (Number.isInteger(strength)) update({ strength });
                  }}
                  step={5}
                  style={sliderStyle(shown.strength, 5, 100)}
                  type="range"
                  value={shown.strength}
                />
              </div>
            }
          />
          <SettingsRow
            {...searchableSetting("dither-scale")}
            devicePreference
            description={gt("Set how large each pattern pixel is.")}
            control={
              <div className="flex w-full items-center gap-3 sm:w-52">
                <output
                  className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                  htmlFor="dither-scale-slider"
                >
                  {shown.scale}×
                </output>
                <input
                  aria-label={gt("Pixel size")}
                  className="settings-slider min-w-0 flex-1"
                  id="dither-scale-slider"
                  max={MAX_THEME_DITHER_SCALE}
                  min={MIN_THEME_DITHER_SCALE}
                  onChange={(event) => {
                    const scale = Number(event.currentTarget.value);
                    if (Number.isInteger(scale)) update({ scale });
                  }}
                  step={1}
                  style={sliderStyle(shown.scale, MIN_THEME_DITHER_SCALE, MAX_THEME_DITHER_SCALE)}
                  type="range"
                  value={shown.scale}
                />
              </div>
            }
          />
          <SettingsRow
            {...searchableSetting("dither-color")}
            devicePreference
            description={
              shown.color
                ? gt("Pattern pixels use this color.")
                : gt("Automatic: the text color, cooled toward the theme's accent.")
            }
            resetAction={
              shown.color ? (
                <SettingResetButton
                  ariaLabel={gt("Use the automatic dither color")}
                  onClick={() => update({ color: null })}
                />
              ) : null
            }
            control={
              <input
                aria-label={gt("Dither color")}
                className="size-8 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                onChange={(event) => update({ color: event.currentTarget.value })}
                type="color"
                value={ditherColor}
              />
            }
          />
          <SettingsRow
            {...searchableSetting("dither-surfaces")}
            devicePreference
            description={gt("Choose which surfaces show the pattern.")}
            control={
              <ToggleGroup
                aria-label={gt("Dither surfaces")}
                multiple
                variant="segmented"
                value={[...shown.surfaces]}
                onValueChange={(value) => {
                  const surfaces = THEME_DITHER_SURFACES.filter((surface) =>
                    value.includes(surface),
                  );
                  if (surfaces.length > 0) update({ surfaces });
                }}
              >
                {THEME_DITHER_SURFACES.map((surface) => (
                  <Toggle key={surface} value={surface}>
                    {m(SURFACE_LABELS[surface])}
                  </Toggle>
                ))}
              </ToggleGroup>
            }
          />
          <SettingsRow
            {...searchableSetting("dither-motion")}
            devicePreference
            description={gt(
              "Let the light drift and pulse. It uses more power, pauses while the window is hidden, and stays still when your system asks for reduced motion.",
            )}
            control={
              <Switch
                checked={shown.motion}
                onCheckedChange={(checked) => update({ motion: Boolean(checked) })}
                aria-label={gt("Dither motion")}
              />
            }
          />
        </>
      ) : null}
    </SettingsSection>
  );
}
