import { APP_BASE_NAME } from "~/branding";
import { cn } from "~/lib/utils";

// Loopy has no mark yet, so the initial of its name stands in for T3's.
export function T3Wordmark(props: {
  readonly className?: string;
  readonly "aria-hidden"?: boolean;
}) {
  return (
    <span
      aria-hidden={props["aria-hidden"]}
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-xs leading-none font-bold",
        props.className,
      )}
    >
      {APP_BASE_NAME.charAt(0)}
    </span>
  );
}
