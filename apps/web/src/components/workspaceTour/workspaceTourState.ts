import { useLocation } from "@tanstack/react-router";
import { createContext, type ReactNode } from "react";

import { persistClientSettingsPatch } from "../../hooks/useSettings";
import {
  isAppModalPage,
  isSidebarUtilityPage,
  useNavigateToMainApp,
} from "../sidebar/mainAppLocation";
import { FIRST_WORKSPACE_TOUR_STEP } from "./workspaceTour.logic";

export const WorkspaceTourPaletteContext = createContext<{
  card: ReactNode;
  onSkip: () => void;
} | null>(null);

export function isWorkspaceTourRoute(path: string) {
  return (
    !isAppModalPage(path) &&
    !isSidebarUtilityPage(path) &&
    !/^\/(?:welcome|connect|guest|pair)(?:\/|$)/.test(path)
  );
}

export function useReplayWorkspaceTour() {
  const navigateToMainApp = useNavigateToMainApp();
  const path = useLocation({ select: (location) => location.pathname });
  return async () => {
    if (!isWorkspaceTourRoute(path)) await navigateToMainApp();
    await persistClientSettingsPatch({
      workspaceTour: { status: "active", step: FIRST_WORKSPACE_TOUR_STEP },
    });
  };
}
