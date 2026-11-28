import type { ReactNode } from "react";

import { APP_BASE_NAME } from "../../branding";
import { cn } from "../../lib/utils";
import { LoopyMark } from "../LoopyMark";

export function StandalonePage({
  children,
  onboarding = false,
}: {
  readonly children: ReactNode;
  readonly onboarding?: boolean;
}) {
  return (
    // The page owns scrolling because root cannot scroll; safe centering keeps oversized cards top-aligned.
    <div
      data-onboarding-screen={onboarding ? "" : undefined}
      className="flex h-full items-center-safe justify-center overflow-y-auto scrollbar-gutter-both bg-background px-4 py-10 text-foreground sm:px-6"
    >
      {onboarding ? <span data-onboarding-dither="" aria-hidden /> : null}
      <section
        className={cn(
          "w-full max-w-xl rounded-2xl border p-6",
          onboarding ? "bg-card" : "dialog-glass",
        )}
      >
        {children}
      </section>
    </div>
  );
}

export function StandalonePageHeader({
  context,
  title,
  description,
}: {
  readonly context?: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
        <span className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <LoopyMark className="size-5" aria-hidden />
          {APP_BASE_NAME}
        </span>
        {context ? <span className="text-sm">{context}</span> : null}
      </div>
      <h1 className="mt-6 text-xl leading-tight font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </>
  );
}
