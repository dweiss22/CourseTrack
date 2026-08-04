import { LiveWrikeProvider } from "./live-wrike-provider";
import type { ReadOnlyWrikeProvider } from "./read-only-wrike-provider";

export function getWrikeProvider(): ReadOnlyWrikeProvider {
  return new LiveWrikeProvider();
}

export type { ReadOnlyWrikeProvider } from "./read-only-wrike-provider";
export type * from "./wrike-types";
