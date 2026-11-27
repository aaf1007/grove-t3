import { CircleDashedIcon } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { cn } from "~/lib/utils";
import { observeVisibleAnimation } from "~/lib/visibleAnimation";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ProjectsLayoutDot } from "./projectsLayout.logic";

const DOT_CLASS_NAME: Record<Exclude<ProjectsLayoutDot, "working">, string> = {
  attention: "bg-warning",
  failed: "bg-error",
  unread: "bg-success",
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
  const dot =
    props.dot === "working" ? (
      // A working thread can spin for an hour, so the spin is a transform only, paused offscreen
      // and in hidden tabs, and static under reduced motion.
      <CircleDashedIcon
        aria-hidden
        ref={observeVisibleAnimation}
        strokeWidth={3}
        className="size-3 shrink-0 text-info motion-safe:visible-animate-spin"
      />
    ) : (
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
