import { TabId } from "../api/tauri";
import { TabNavItem } from "../models/ui";

export const TAB_LABELS: Record<TabId, string> = {
  installed: "Installed",
  formulae: "Formulae",
  casks: "Casks",
};

export function getTabLabel(tab: TabId): string {
  return TAB_LABELS[tab];
}

export const TAB_ITEMS: TabNavItem[] = [
  { id: "installed", label: "Installed", icon: "↓", requiresBrew: true },
  { id: "formulae", label: "Formulae", icon: "⌘" },
  { id: "casks", label: "Casks", icon: "⬜" },
];
