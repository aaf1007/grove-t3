import { msg } from "gt-react";

export const WORKSPACE_TOUR_STEPS = [
  {
    id: "projects",
    title: msg("Projects and threads"),
    description: msg(
      "Projects group your threads by codebase. Expand a project to find its conversations.",
    ),
    targets: ["projects", "sidebar-toggle"],
  },
  {
    id: "add-project",
    title: msg("Add a project"),
    description: msg("Choose a folder from a connected computer to work on it in Loopy."),
    targets: ["add-project"],
  },
  {
    id: "new-thread",
    title: msg("Start a thread"),
    description: msg("Start a conversation in a project."),
    targets: ["new-thread"],
    command: "chat.new",
  },
  {
    id: "model",
    title: msg("Choose an agent and model"),
    description: msg("Choose which agent and model will run this thread."),
    targets: ["model"],
  },
  {
    id: "permissions",
    title: msg("Permissions"),
    description: msg(
      "Choose when the agent needs your approval. Available modes depend on the agent.",
    ),
    targets: ["permissions", "permissions-in-picker"],
    command: "composer.mode",
  },
  {
    id: "status",
    title: msg("Read thread status"),
    description: msg(
      "Dots flag threads that need you, failed, or have unread activity. A dashed ring means the agent is working.",
    ),
    targets: ["status", "thread"],
  },
  {
    id: "attention",
    title: msg("Jump to what needs you"),
    description: msg("Jump to the next thread waiting for your input or approval."),
    targets: ["thread"],
    command: "thread.nextNeedingYou",
  },
  {
    id: "panels",
    title: msg("Workspace panels"),
    description: msg(
      "Review changes in Diff, run commands in Terminal, or open a Browser preview.",
    ),
    targets: ["panels"],
  },
  {
    id: "palette",
    title: msg("Command palette"),
    description: msg("Search for commands, jump to a thread, or find Take the tour."),
    targets: [],
    command: "commandPalette.toggle",
  },
  {
    id: "settings",
    title: msg("Settings and themes"),
    description: msg(
      "Change your theme and shortcuts in Settings. To replay the tour, open About and select Take the tour.",
    ),
    targets: ["settings"],
  },
] as const;

export type WorkspaceTourStep = (typeof WORKSPACE_TOUR_STEPS)[number];
export type WorkspaceTourStepId = WorkspaceTourStep["id"];
export const FIRST_WORKSPACE_TOUR_STEP = WORKSPACE_TOUR_STEPS[0].id;

export function resumeWorkspaceTour(
  saved: string,
  available: ReadonlyArray<WorkspaceTourStepId>,
): WorkspaceTourStepId | undefined {
  const order = WORKSPACE_TOUR_STEPS.findIndex((step) => step.id === saved);
  return WORKSPACE_TOUR_STEPS.slice(Math.max(0, order)).find((step) => available.includes(step.id))
    ?.id;
}
