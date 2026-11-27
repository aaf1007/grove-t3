import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { ContextMenuSource } from "@t3tools/contracts";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { T, useGT, Var } from "gt-react";
import { ChevronRightIcon, PlusIcon, SquarePenIcon } from "lucide-react";
import {
  memo,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { cn } from "~/lib/utils";
import { contextMenuSourceOf } from "../../contextMenuSource";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { useUiStateStore } from "../../uiStateStore";
import { animateSidebarLayoutChanges, resolveThreadLastVisitedAt } from "../Sidebar.logic";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  countThreadsNeedingYou,
  moveProjectKey,
  projectsLayoutMarkerId,
  remoteOnlyMachineLabel,
  type SubagentSummary,
} from "./projectsLayout.logic";
import { SIDEBAR_SORTABLE_DRAG_DISABLED } from "./SidebarThreadRow";

export const PROJECTS_HEADING_ID = projectsLayoutMarkerId("projects");

/** The small-caps label of a Projects layout section: Pinned, Projects, Snoozed, Settled. */
export const PROJECTS_LAYOUT_LABEL_CLASS_NAME =
  "text-2xs font-semibold tracking-wider uppercase text-sidebar-muted-foreground";

/** The project's sidebar tree row; its thread rows name it as their parent. */
export function sidebarFolderRowId(projectKey: string) {
  return `folder:${projectKey}`;
}

export function projectGroupMarkerId(projectKey: string) {
  return projectsLayoutMarkerId(`project:${projectKey}`);
}

/** Rows that are not dragged still shift while a thread is, so they join the sortable list. */
function useListedMarker(id: string) {
  const { setNodeRef, transform, transition } = useSortable({
    id,
    disabled: SIDEBAR_SORTABLE_DRAG_DISABLED,
    animateLayoutChanges: animateSidebarLayoutChanges,
  });
  return {
    setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition },
  };
}

export function ProjectsHeadingIconButton({
  label,
  children,
  ...rest
}: { label: string; children?: ReactNode } & Omit<
  ComponentProps<typeof Button>,
  "children" | "className" | "aria-label" | "size" | "variant"
>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label={label}
            {...rest}
            // The filter's active dot is positioned inside the button.
            className="relative"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

/** The "Projects" heading; its filter and Add project buttons show on hover. */
export function SidebarProjectsHeading(props: {
  filter: ReactNode;
  /** Keeps the filter shown while it hides projects. */
  filterActive: boolean;
  onAddProject: () => void;
}) {
  const gt = useGT();
  const { setNodeRef, style } = useListedMarker(PROJECTS_HEADING_ID);
  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid="sidebar-projects-heading"
      className="group/projects-heading mt-2 flex h-7 list-none items-center gap-1 ps-(--sidebar-row-content-inset) pe-1 first:mt-0"
    >
      <span className={cn("min-w-0 flex-1 truncate", PROJECTS_LAYOUT_LABEL_CLASS_NAME)}>
        <T context="sidebar heading">Projects</T>
      </span>
      <span
        className={cn(
          "flex items-center opacity-0 group-hover/projects-heading:opacity-100 focus-within:opacity-100 has-data-popup-open:opacity-100 pointer-coarse:opacity-100",
          props.filterActive && "opacity-100",
        )}
      >
        {props.filter}
        <ProjectsHeadingIconButton label={gt("Add project")} onClick={props.onAddProject}>
          <PlusIcon aria-hidden />
        </ProjectsHeadingIconButton>
      </span>
    </li>
  );
}

/**
 * A project in the Projects layout: its name, the machine it is on when that is not this
 * one, and while closed a count of threads that need you. Dragging it reorders projects.
 */
export const SidebarProjectGroupHeader = memo(function SidebarProjectGroupHeader(props: {
  group: SidebarProjectSnapshot;
  collapsed: boolean;
  hiddenThreads: readonly EnvironmentThreadShell[];
  lifted: boolean;
  onToggle: (group: SidebarProjectSnapshot) => void;
  onNewThread: (group: SidebarProjectSnapshot) => void;
  onDragStart: (group: SidebarProjectSnapshot, event: ReactPointerEvent) => void;
  /** True once when the click ends a project drag, which must not also toggle it. */
  consumeDragClick: () => boolean;
  onContextMenu: (
    group: SidebarProjectSnapshot,
    position: { x: number; y: number },
    source: ContextMenuSource,
  ) => void;
}) {
  const gt = useGT();
  const { group, collapsed, hiddenThreads } = props;
  const rowId = sidebarFolderRowId(group.projectKey);
  const { setNodeRef, style } = useListedMarker(projectGroupMarkerId(group.projectKey));
  const localLastVisitedAtById = useUiStateStore((state) => state.threadLastVisitedAtById);
  const needsYou = collapsed
    ? countThreadsNeedingYou(
        hiddenThreads.map((thread) => ({
          ...thread,
          lastVisitedAt: resolveThreadLastVisitedAt(
            thread.lastVisitedAt,
            localLastVisitedAtById[
              scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))
            ],
          ),
        })),
      )
    : 0;
  const machineLabel = remoteOnlyMachineLabel(group);
  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid="sidebar-project-folder"
      data-project-group-key={group.projectKey}
      className="group/project-folder relative mt-1 list-none first:mt-0"
    >
      <button
        type="button"
        data-sidebar-row={rowId}
        aria-expanded={!collapsed}
        onPointerDown={(event) => props.onDragStart(group, event)}
        onClick={() => {
          if (props.consumeDragClick()) return;
          props.onToggle(group);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          props.onContextMenu(
            group,
            { x: event.clientX, y: event.clientY },
            contextMenuSourceOf(event),
          );
        }}
        className={cn(
          "flex h-8 w-full cursor-pointer items-center gap-2 rounded-(--control-radius) px-(--sidebar-row-content-inset) text-left outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          props.lifted && "bg-sidebar-row-selected ring-1 ring-inset ring-sidebar-border",
        )}
      >
        <span className="min-w-0 truncate text-sm font-medium text-sidebar-foreground">
          {group.displayName}
        </span>
        <ChevronRightIcon
          aria-hidden
          className={cn(
            "size-3 shrink-0 text-sidebar-muted-foreground/70 transition-transform",
            !collapsed && "rotate-90",
          )}
        />
        {machineLabel ? (
          <span className="min-w-0 shrink truncate text-xs text-sidebar-muted-foreground">
            {machineLabel}
          </span>
        ) : null}
        {/* Keeps the chevron clear of the New thread button on long names. */}
        <span className="min-w-4 flex-1" />
        {needsYou > 0 ? (
          <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-warning/15 px-1 text-2xs font-medium tabular-nums text-warning-foreground pointer-fine:group-hover/project-folder:invisible pointer-fine:group-has-[[data-sidebar-action-for]:focus]/project-folder:invisible pointer-coarse:me-6.5">
            {needsYou}{" "}
            <span className="sr-only">
              {gt("{count, plural, one {thread needs you} other {threads need you}}", {
                count: needsYou,
              })}
            </span>
          </span>
        ) : null}
      </button>
      {/* Sits over the count, which hides on hover or focus; touch screens move the count left of it. */}
      <span className="absolute inset-y-0 right-1 flex items-center opacity-0 focus-within:opacity-100 group-hover/project-folder:opacity-100 pointer-coarse:opacity-100">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                data-sidebar-action-for={rowId}
                size="icon-xs"
                variant="ghost-muted"
                aria-label={gt("New thread in {project}", { project: group.displayName })}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => props.onNewThread(group)}
              />
            }
          >
            <SquarePenIcon aria-hidden />
          </TooltipTrigger>
          <TooltipPopup>
            <T>
              New thread in <Var>{group.displayName}</Var>
            </T>
          </TooltipPopup>
        </Tooltip>
      </span>
    </li>
  );
});

/**
 * The line under a thread that runs subagents, joined to it by a connector: "1 needs you ·
 * 2 working · 1 done". Clicking it opens the subagent that needs you, or one still working.
 */
export function SidebarSubagentSummary(props: { summary: SubagentSummary; onOpen: () => void }) {
  const gt = useGT();
  const { summary } = props;
  const parts = [
    summary.needsYou > 0
      ? {
          key: "needs",
          text: gt("{count, plural, one {{count} needs you} other {{count} need you}}", {
            count: summary.needsYou,
          }),
          className: "text-warning-foreground",
        }
      : null,
    summary.working > 0
      ? { key: "working", text: gt("{count} working", { count: summary.working }), className: "" }
      : null,
    summary.failed > 0
      ? {
          key: "failed",
          text: gt("{count} failed", { count: summary.failed }),
          className: "text-error-foreground",
        }
      : null,
    summary.done > 0
      ? { key: "done", text: gt("{count} done", { count: summary.done }), className: "" }
      : null,
  ].filter((part) => part !== null);
  const label = gt("Subagents: {summary}. Open beside this thread", {
    summary: parts.map((part) => part.text).join(", "),
  });
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={props.onOpen}
            onPointerDown={(event) => event.stopPropagation()}
            className="relative -mt-0.5 mb-0.5 flex h-5 w-full cursor-pointer items-center gap-1 ps-6.5 text-left text-xs text-sidebar-muted-foreground outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        }
      >
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-2.5 h-2.5 w-2.5 rounded-bl-md border-b border-l border-sidebar-border"
        />
        {parts.map((part, index) => (
          <span key={part.key} className="flex items-center gap-1">
            {index > 0 ? <span aria-hidden>·</span> : null}
            <span className={part.className}>{part.text}</span>
          </span>
        ))}
      </TooltipTrigger>
      <TooltipPopup side="right">{gt("Open beside this thread")}</TooltipPopup>
    </Tooltip>
  );
}

const PROJECT_DRAG_THRESHOLD_PX = 4;

/**
 * Pointer dragging of project headers. Once a drag starts every project folds to one line;
 * the preview order follows the pointer and `onDrop` gets the order before and after.
 */
export function useProjectGroupDrag(
  onDrop: (before: readonly string[], after: readonly string[], dragged: string) => void,
) {
  const [drag, setDrag] = useState<{ key: string; order: readonly string[] } | null>(null);
  const dragClickRef = useRef(false);
  const start = (key: string, before: readonly string[], event: ReactPointerEvent) => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    const list = event.currentTarget.closest("ul");
    if (list === null) return;
    const origin = { x: event.clientX, y: event.clientY };
    let current: { key: string; order: readonly string[] } | null = null;
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape, true);
    };
    const move = (moveEvent: PointerEvent) => {
      if (current === null) {
        if (
          Math.hypot(moveEvent.clientX - origin.x, moveEvent.clientY - origin.y) <
          PROJECT_DRAG_THRESHOLD_PX
        ) {
          return;
        }
        current = { key, order: before };
        setDrag(current);
        return;
      }
      const others = [...list.querySelectorAll<HTMLElement>("[data-project-group-key]")].filter(
        (header) => header.dataset.projectGroupKey !== key,
      );
      const index = others.findIndex((header) => {
        const rect = header.getBoundingClientRect();
        return moveEvent.clientY < rect.top + rect.height / 2;
      });
      const order = moveProjectKey(current.order, key, index === -1 ? others.length : index);
      if (order !== current.order) {
        current = { key, order };
        setDrag(current);
      }
    };
    const end = () => {
      stop();
      if (current === null) return;
      dragClickRef.current = true;
      // A drag that ends off the header fires no click to consume the flag.
      requestAnimationFrame(() => {
        dragClickRef.current = false;
      });
      onDrop(before, current.order, key);
      setDrag(null);
    };
    const cancel = () => {
      stop();
      setDrag(null);
    };
    const escape = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape" || current === null) return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape, true);
  };
  return {
    drag,
    start,
    consumeDragClick: () => {
      const consumed = dragClickRef.current;
      dragClickRef.current = false;
      return consumed;
    },
  };
}
