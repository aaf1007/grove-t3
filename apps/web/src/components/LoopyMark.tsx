import { cn } from "~/lib/utils";

export function LoopyMark(props: {
  readonly className?: string;
  readonly "aria-hidden"?: boolean;
}) {
  return (
    <svg
      aria-hidden={props["aria-hidden"]}
      className={cn("shrink-0", props.className)}
      viewBox="17 14 97 97"
      fill="currentColor"
    >
      <path d="M36 22h17c6 0 11 5 11 11v35L37 95a19 19 0 0 1-12-18V33c0-6 5-11 11-11Z M43 103l30-30h22c6 0 11 5 11 11v8c0 6-5 11-11 11H43Z" />
    </svg>
  );
}
