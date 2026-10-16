import { describe, expect, it } from "vitest";
import { speechSegments, voiceMatchesLanguage } from "../contextual/voices";
describe("transcript and voice separation", () => {
  it("matches a discovered language without claiming that a foreign voice translates English", () => {
    expect(voiceMatchesLanguage({ lang: "es-MX" }, "es")).toBe(true);
    expect(voiceMatchesLanguage({ lang: "es-MX" }, "en")).toBe(false);
    expect(voiceMatchesLanguage({ lang: "zh-Hans-CN" }, "zh")).toBe(true);
  });
  it("segments the complete validated transcript, retaining identifiers, Unicode and the final caveat", () => {
    const transcript = `${"Station subway_station:F21 · 600 seconds; depth 0.2 m. ".repeat(50)}Final warning: this is hypothetical, not current flooding. 🚇`;
    const segments = speechSegments(transcript);
    expect(segments.join("")).toBe(transcript);
    expect(segments.every((segment) => segment.length <= 350)).toBe(true);
    expect(segments.at(-1)).toContain("not current flooding");
  });
});
