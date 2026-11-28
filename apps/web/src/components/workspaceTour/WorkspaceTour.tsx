import { useAtomValue } from "@effect/atom-react";
import { useLocation } from "@tanstack/react-router";
import { T, useGT, useMessages } from "gt-react";
import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { useCommandPaletteStore } from "../../commandPaletteStore";
import { persistClientSettingsPatch, useClientSettings } from "../../hooks/useSettings";
import { shortcutLabelForCommand } from "../../keybindings";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { Button } from "../ui/button";
import {
  resumeWorkspaceTour,
  WORKSPACE_TOUR_STEPS,
  type WorkspaceTourStep,
} from "./workspaceTour.logic";
import { isWorkspaceTourRoute, WorkspaceTourPaletteContext } from "./workspaceTourState";
import "./workspaceTour.css";

type Bounds = { left: number; top: number; right: number; bottom: number };
type Target = { step: WorkspaceTourStep; bounds: Bounds | null };

function readBounds(element: HTMLElement): Bounds | null {
  if (element.matches(":disabled, [aria-disabled=true]")) return null;
  if (getComputedStyle(element).visibility !== "visible") return null;
  const rect = element.getBoundingClientRect();
  let left = Math.max(0, rect.left);
  let top = Math.max(0, rect.top);
  let right = Math.min(window.innerWidth, rect.right);
  let bottom = Math.min(window.innerHeight, rect.bottom);
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.overflowX === "visible" && style.overflowY === "visible") continue;
    const clip = parent.getBoundingClientRect();
    if (style.overflowX !== "visible") {
      left = Math.max(left, clip.left);
      right = Math.min(right, clip.right);
    }
    if (style.overflowY !== "visible") {
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
  }
  return right > left && bottom > top ? { left, top, right, bottom } : null;
}

function measureTargets(jumpAvailable: boolean): Target[] {
  return WORKSPACE_TOUR_STEPS.flatMap((step): Target[] => {
    if (step.id === "palette") return [{ step, bounds: null }];
    if (step.id === "attention" && !jumpAvailable) return [];
    for (const anchor of step.targets) {
      for (const element of document.querySelectorAll<HTMLElement>(`[data-tour~="${anchor}"]`)) {
        const bounds = readBounds(element);
        if (bounds) return [{ step, bounds }];
      }
    }
    return [];
  });
}

function containsTourAnchor(node: Node): boolean {
  return (
    node instanceof Element &&
    (node.matches("[data-tour]") || node.querySelector("[data-tour]") !== null)
  );
}

function useTourTargets(path: string, active: boolean, jumpAvailable: boolean) {
  const [measurement, setMeasurement] = useState<{
    path: string;
    key: string;
    targets: Target[];
    width: number;
    height: number;
  } | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- follows anchor layout and late-mounted workspace controls during the tour
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const measure = () => {
      const targets = measureTargets(jumpAvailable);
      const { innerWidth: width, innerHeight: height } = window;
      const key = JSON.stringify([
        width,
        height,
        targets.map(({ step, bounds }) => [step.id, bounds]),
      ]);
      setMeasurement((current) =>
        current?.path === path && current.key === key
          ? current
          : { path, key, targets, width, height },
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const layout = document.getElementById("root");
    const observer = new MutationObserver((changes) => {
      if (
        changes.some((change) =>
          change.type === "attributes"
            ? containsTourAnchor(change.target)
            : [...change.addedNodes, ...change.removedNodes].some(containsTourAnchor),
        )
      ) {
        schedule();
      }
    });
    if (layout)
      observer.observe(layout, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["disabled", "aria-disabled", "hidden", "data-state"],
      });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [path, active, jumpAvailable]);

  return active && measurement?.path === path ? measurement : null;
}

export function WorkspaceTour({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const path = useLocation({ select: (location) => location.pathname });
  const progress = useClientSettings((settings) => settings.workspaceTour);
  const paletteOpen = useCommandPaletteStore((state) => state.open);
  const active =
    enabled && isWorkspaceTourRoute(path) && progress?.status === "active" && !paletteOpen;
  return (
    <TourSession path={path} saved={active ? progress.step : null}>
      {children}
    </TourSession>
  );
}

function TourSession({
  children,
  path,
  saved,
}: {
  children: ReactNode;
  path: string;
  saved: string | null;
}) {
  const gt = useGT();
  const m = useMessages();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const measurement = useTourTargets(
    path,
    saved !== null,
    Boolean(shortcutLabelForCommand(keybindings, "thread.nextNeedingYou")),
  );
  const [animate, setAnimate] = useState(true);
  const titleId = useId();
  const descriptionId = useId();
  const targets = measurement?.targets ?? [];
  const currentId =
    saved === null
      ? undefined
      : resumeWorkspaceTour(
          saved,
          targets.map(({ step }) => step.id),
        );
  const index = targets.findIndex(({ step }) => step.id === currentId);
  const current = targets[index];

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- records the resolved step when a saved anchor is unavailable
  useEffect(() => {
    if (!measurement || saved === null || saved === currentId) return;
    void persistClientSettingsPatch({
      workspaceTour:
        currentId === undefined ? { status: "completed" } : { status: "active", step: currentId },
    });
  }, [measurement, saved, currentId]);

  const skip = () => void persistClientSettingsPatch({ workspaceTour: { status: "skipped" } });
  const go = (delta: -1 | 1, pointer: boolean) => {
    const next = targets[index + delta];
    setAnimate(pointer);
    if (next) {
      void persistClientSettingsPatch({ workspaceTour: { status: "active", step: next.step.id } });
    } else if (delta === 1) {
      void persistClientSettingsPatch({ workspaceTour: { status: "completed" } });
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Tab") return;
    event.stopPropagation();
    if (event.key === "Enter" && event.target !== event.currentTarget) return;
    if (event.key === "Escape") {
      event.preventDefault();
      skip();
    } else if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      go(1, false);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1, false);
    }
  };

  const shortcut =
    current && "command" in current.step
      ? shortcutLabelForCommand(keybindings, current.step.command)
      : undefined;

  const focusCard = (node: HTMLElement | null) => {
    if (!node) return;
    const dialog = node.closest("dialog");
    if (dialog && !dialog.open) dialog.showModal();
    node.focus({ preventScroll: true });
  };

  const card = current ? (
    <section
      key={current.step.id}
      ref={focusCard}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-workspace-tour-step={current.step.id}
      data-onboarding-dialog=""
      data-tour-enter={animate && current.step.id !== "palette" ? "" : undefined}
      data-keybinding-capture=""
      onKeyDown={onKeyDown}
      className="min-h-0 overflow-y-auto rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl outline-none"
    >
      <p className="text-xs tabular-nums text-muted-foreground">
        {gt("{current} of {total}", { current: index + 1, total: targets.length })}
      </p>
      <h2 id={titleId} className="mt-1 text-base font-semibold">
        {m(current.step.title)}
      </h2>
      <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
        {m(current.step.description)}
      </p>
      {shortcut ? (
        <kbd className="mt-2 inline-block rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
          {shortcut}
        </kbd>
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-2">
        <Button variant="ghost-muted" size="sm" onClick={skip}>
          <T>Skip tour</T>
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={index === 0}
            onClick={(event) => go(-1, event.detail > 0)}
          >
            <T>Back</T>
          </Button>
          <Button size="sm" onClick={(event) => go(1, event.detail > 0)}>
            {index === targets.length - 1 ? gt("Finish tour") : gt("Next")}
          </Button>
        </div>
      </div>
    </section>
  ) : null;
  const inPalette = current?.step.id === "palette";
  const bounds = current?.bounds;
  return (
    <WorkspaceTourPaletteContext value={inPalette ? { card, onSkip: skip } : null}>
      {children}
      {current && bounds && measurement ? (
        <TourSpotlight
          bounds={bounds}
          width={measurement.width}
          height={measurement.height}
          label={m(current.step.title)}
          onSkip={skip}
        >
          {card}
        </TourSpotlight>
      ) : null}
    </WorkspaceTourPaletteContext>
  );
}

function TourSpotlight({
  bounds,
  width,
  height,
  label,
  onSkip,
  children,
}: {
  bounds: Bounds;
  width: number;
  height: number;
  label: string;
  onSkip: () => void;
  children: ReactNode;
}) {
  const [bindDialog] = useState(
    () => (node: HTMLDialogElement | null) => (node ? () => node.close() : undefined),
  );
  const gap = 16;
  const cardWidth = Math.min(352, width - gap * 2);
  const rightFits = bounds.right + gap + cardWidth <= width - gap;
  const leftFits = bounds.left - gap - cardWidth >= gap;
  const left = rightFits
    ? bounds.right + gap
    : leftFits
      ? bounds.left - gap - cardWidth
      : Math.max(gap, Math.min(bounds.left, width - cardWidth - gap));
  const sideFits = rightFits || leftFits;
  const below = bounds.bottom + gap;
  const above = bounds.top - gap;
  const position = sideFits
    ? { top: Math.max(gap, Math.min(bounds.top, height - 230)) }
    : below + 210 <= height || below <= height - above
      ? { top: Math.min(below, height - 210) }
      : { bottom: Math.min(height - above, height - 210) };
  return (
    <dialog
      ref={bindDialog}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onSkip();
      }}
      className="fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden bg-transparent p-0 backdrop:bg-transparent"
    >
      <div
        aria-hidden
        className="pointer-events-none fixed rounded-lg"
        style={{
          left: bounds.left - 4,
          top: bounds.top - 4,
          width: bounds.right - bounds.left + 8,
          height: bounds.bottom - bounds.top + 8,
          boxShadow: "0 0 0 1px rgb(255 255 255 / 45%), 0 0 0 200vmax rgb(0 0 0 / 65%)",
        }}
      />
      <div
        className="fixed flex flex-col"
        style={{
          left,
          width: cardWidth,
          maxHeight: height - (position.top ?? position.bottom ?? gap) - gap,
          ...position,
        }}
      >
        {children}
      </div>
    </dialog>
  );
}
