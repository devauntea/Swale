// @vitest-environment jsdom
// Isolated resource/state checks, not WebGL or browser acceptance.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react/pure";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InfrastructureClient } from "../infrastructure/client";
import { useInfrastructure } from "../infrastructure/useInfrastructure";
import type {
  InfrastructureChunk,
  InfrastructureManifest,
  InfrastructureStation,
} from "../infrastructure/contracts";

const station = (id: string): InfrastructureStation => ({
  id,
  gtfsStopId: id,
  name: id,
  complexId: null,
  routes: ["F"],
  structure: "Subway",
  position: [-74, 40.68],
  detailUrl: `/infrastructure/stations/${id}.json`,
  sourceIds: [`S3:${id}`],
  assumptions: ["Schematic test"],
  backendStationId: null,
  relationship: "unmatched",
});
const manifest: InfrastructureManifest = {
  version: 1,
  modelId: "test",
  vintage: "source edition",
  referencePolicy: "flat reference",
  bounds: [-74.1, 40.5, -73.8, 40.8],
  stations: [station("F21"), station("F22")],
  sources: [],
};
const chunk = (id: string): InfrastructureChunk => ({
  stationId: id,
  primitives: [],
  metadata: {
    modelVintage: "source edition",
    referencePolicy: "flat reference",
    schematic: true,
  },
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("progressive infrastructure resource lifecycle", () => {
  it("does not load until explicit entry and only requests the chosen station", async () => {
    const index = vi
      .spyOn(InfrastructureClient.prototype, "manifest")
      .mockResolvedValue(manifest);
    const detail = vi
      .spyOn(InfrastructureClient.prototype, "chunk")
      .mockImplementation(async (model) => chunk(model.id));
    const hook = renderHook(
      ({ enabled, id }: { enabled: boolean; id: string | null }) =>
        useInfrastructure(enabled, id),
      { initialProps: { enabled: false, id: null as string | null } },
    );
    expect(index).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
    hook.rerender({ enabled: true, id: null });
    await waitFor(() =>
      expect(hook.result.current.manifestStatus).toBe("ready"),
    );
    expect(detail).not.toHaveBeenCalled();
    hook.rerender({ enabled: true, id: "F21" });
    await waitFor(() =>
      expect(hook.result.current.chunk?.stationId).toBe("F21"),
    );
    expect(detail).toHaveBeenCalledTimes(1);
    expect(detail.mock.calls[0][0].id).toBe("F21");
  });
  it("aborts old work and ignores late responses after station changes", async () => {
    vi.spyOn(InfrastructureClient.prototype, "manifest").mockResolvedValue(
      manifest,
    );
    const pending = new Map<
      string,
      { resolve: (value: InfrastructureChunk) => void; signal: AbortSignal }
    >();
    vi.spyOn(InfrastructureClient.prototype, "chunk").mockImplementation(
      (model, signal) =>
        new Promise<InfrastructureChunk>((resolve) =>
          pending.set(model.id, { resolve, signal }),
        ),
    );
    const hook = renderHook(({ id }) => useInfrastructure(true, id), {
      initialProps: { id: "F21" },
    });
    await waitFor(() => expect(pending.has("F21")).toBe(true));
    hook.rerender({ id: "F22" });
    await waitFor(() => expect(pending.has("F22")).toBe(true));
    expect(pending.get("F21")!.signal.aborted).toBe(true);
    await act(async () => {
      pending.get("F22")!.resolve(chunk("F22"));
    });
    await act(async () => {
      pending.get("F21")!.resolve(chunk("F21"));
    });
    expect(hook.result.current.chunk?.stationId).toBe("F22");
    hook.unmount();
    expect(pending.get("F22")!.signal.aborted).toBe(true);
  });
  it("recovers a missing index in the same mounted session after explicit retry", async () => {
    const index = vi
      .spyOn(InfrastructureClient.prototype, "manifest")
      .mockRejectedValueOnce(new Error("HTTP 404"))
      .mockResolvedValueOnce(manifest);
    const hook = renderHook(() => useInfrastructure(true, null));
    await waitFor(() => expect(hook.result.current.error).toBe("HTTP 404"));
    act(() => hook.result.current.retry());
    await waitFor(() =>
      expect(hook.result.current.manifestStatus).toBe("ready"),
    );
    expect(hook.result.current.error).toBe("");
    expect(index).toHaveBeenCalledTimes(2);
  });
});
