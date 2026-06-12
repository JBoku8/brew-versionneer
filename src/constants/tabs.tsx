import { TabId } from "../api/tauri";
import { AppWindowIcon, FlaskIcon, PackageIcon } from "../components/icons/Icon";
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
  { id: "installed", label: "Installed", icon: <PackageIcon />, requiresBrew: true },
  { id: "formulae", label: "Formulae", icon: <FlaskIcon /> },
  { id: "casks", label: "Casks", icon: <AppWindowIcon /> },
];
