import { OutdatedResult } from "../api/tauri";

export const EMPTY_OUTDATED: OutdatedResult = { formulae: [], casks: [] };

export const BREW_INSTALL_COMMAND =
  '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
