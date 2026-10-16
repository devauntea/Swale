import { DEMO_SNAPSHOT, FORECAST_EXAMPLES } from "../fixtures/demo";
import type {
  DemoSnapshot,
  FrontendDataProvider,
  ProviderRefreshResult,
} from "../../types";

export type { FrontendDataProvider } from "../../types";

export interface LocalFixtureOptions {
  mode?: "ready" | "empty" | "error";
  forecastState?: "available" | "stale" | "unavailable";
}

/** The only operational provider. No network access or future backend adapter. */
export class LocalFixtureProvider implements FrontendDataProvider {
  constructor(private readonly options: LocalFixtureOptions = {}) {}

  async load(): Promise<DemoSnapshot> {
    if (this.options.mode === "error") {
      throw new Error(
        "Demonstration error state: the local example workspace could not be loaded. Choose Ready to restore it.",
      );
    }
    const snapshot = structuredClone(DEMO_SNAPSHOT);
    snapshot.forecast = structuredClone(
      FORECAST_EXAMPLES[this.options.forecastState ?? "available"],
    );
    if (this.options.mode === "empty") {
      snapshot.basins = [];
      snapshot.complaints = [];
      snapshot.densityCells = [];
      snapshot.floodZones = [];
      snapshot.buildings = [];
      snapshot.rankedBasinIds = { moderate_current: [], extreme_2080: [] };
    }
    return snapshot;
  }

  async refresh(): Promise<ProviderRefreshResult> {
    return {
      snapshot: await this.load(),
      status: "integration_pending",
      message:
        "Local examples reloaded. Live data refresh awaits backend integration; source timestamps have not changed.",
    };
  }
}

export default LocalFixtureProvider;
