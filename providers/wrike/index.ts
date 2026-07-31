import { LiveWrikeProvider } from "./live-wrike-provider";
import { MockWrikeProvider } from "./mock-wrike-provider";
import type { ReadOnlyWrikeProvider } from "./read-only-wrike-provider";

export function getWrikeProvider(): ReadOnlyWrikeProvider {
  return process.env.WRIKE_PROVIDER === "live"
    ? new LiveWrikeProvider()
    : new MockWrikeProvider();
}

export type { ReadOnlyWrikeProvider } from "./read-only-wrike-provider";
export type * from "./wrike-types";
