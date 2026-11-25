import type { MouseEvent as ReactMouseEvent } from "react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ProjectsLayoutDot } from "./projectsLayout.logic";

// Static on purpose: a working thread can stay working for an hour, and a pulse would repaint all of it.
const DOT_CLASS_NAME: Record<ProjectsLayoutDot, string> = {
  attention: "bg-warning",
  failed: "bg-error",
  unread: "bg-info",
  working: "shadow-[inset_0_0_0_1.5px_var(--color-sidebar-muted-foreground)]",
};

/**
 * A Projects layout row's status: a 7px dot whose words live in its tooltip and screen-reader
 * text. With `onDismiss` it is a button that clears the mark, as a woken thread's is.
 */
export function ProjectsLayoutStatusDot(props: {
  dot: ProjectsLayoutDot;
  label: string;
  dismissLabel?: string;
  onDismiss?: ((event: ReactMouseEvent) => void) | undefined;
}) {
  const dot = (
    <span
      aria-hidden
      className={cn("size-[7px] shrink-0 rounded-full", DOT_CLASS_NAME[props.dot])}
    />
  );
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          props.onDismiss ? (
            <button
              type="button"
              aria-label={props.dismissLabel ?? props.label}
              onClick={props.onDismiss}
              className="inline-flex size-4 cursor-pointer items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          ) : (
            <span
              role="img"
              aria-label={props.label}
              className="inline-flex size-4 items-center justify-center"
            />
          )
        }
      >
        {dot}
      </TooltipTrigger>
      <TooltipPopup side="top">{props.label}</TooltipPopup>
    </Tooltip>
  );
}
