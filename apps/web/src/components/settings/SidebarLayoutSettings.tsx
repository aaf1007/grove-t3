import { useGT } from "gt-react";

import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { canUseTranslucentSidebar } from "../sidebar/useSidebarTranslucency";
import { Switch } from "../ui/switch";
import { SettingsRow } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

/** Inbox or Projects, stored per device in `boringSidebarEnabled`. */
export function SidebarLayoutRow() {
  const setting = useSearchableSetting();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const gt = useGT();
  const labels = {
    inbox: gt("Inbox", { $context: "sidebar layout" }),
    projects: gt("Projects", { $context: "sidebar layout" }),
  };
  const value = settings.boringSidebarEnabled ? "projects" : "inbox";
  return (
    <SettingsRow
      {...setting("sidebar-layout")}
      description={gt(
        "Inbox lists threads by what needs you. Projects groups them under their project.",
      )}
      control={
        <Select
          value={value}
          onValueChange={(next) => updateSettings({ boringSidebarEnabled: next === "projects" })}
        >
          <SelectTrigger size="sm" className="w-full sm:w-44" aria-label={gt("Sidebar layout")}>
            <SelectValue>{labels[value]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            <SelectItem hideIndicator value="inbox">
              {labels.inbox}
            </SelectItem>
            <SelectItem hideIndicator value="projects">
              {labels.projects}
            </SelectItem>
          </SelectPopup>
        </Select>
      }
    />
  );
}

export function TranslucentSidebarRow() {
  const setting = useSearchableSetting();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const gt = useGT();
  if (!canUseTranslucentSidebar()) return null;
  return (
    <SettingsRow
      {...setting("translucent-sidebar")}
      description={gt(
        "Let the desktop behind the window show through the sidebar. Glass opacity sets how much.",
      )}
      control={
        <Switch
          checked={settings.sidebarTranslucent}
          onCheckedChange={(checked) => updateSettings({ sidebarTranslucent: Boolean(checked) })}
          aria-label={gt("Translucent sidebar")}
        />
      }
    />
  );
}
