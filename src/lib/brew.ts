import { BrewStatus } from "../api/tauri";

export interface BrewDerivedState {
  brewInstalled: boolean;
  brewPending: boolean;
}

export function deriveBrewState(
  brewStatus: BrewStatus | null,
  brewChecking: boolean,
): BrewDerivedState {
  return {
    brewInstalled: brewStatus?.installed ?? false,
    brewPending: brewChecking && brewStatus === null,
  };
}

export function getBrewVersionLine(brewStatus: BrewStatus | null): string | null {
  return brewStatus?.version?.split("\n")[0] ?? null;
}
