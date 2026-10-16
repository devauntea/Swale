import { describe, expect, it } from "vitest";
import { displayNumber, formatTime } from "../app/format";

describe("missing values and known timestamp presentation", () => {
  it("keeps a genuine numerical zero visible and a missing value distinct", () => {
    expect(displayNumber(0, 1)).toBe("0");
    expect(displayNumber(null, 1)).toBe("—");
    expect(displayNumber(12.7, 1)).toBe("12.7");
  });

  it("formats known instants in New York and does not replace missing times with now", () => {
    expect(formatTime("2026-10-16T06:00:00Z")).toContain("2:00 AM EDT");
    expect(formatTime(null, "Source time unknown")).toBe("Source time unknown");
    expect(formatTime("not-a-date")).toBe("Unknown time");
  });
});
