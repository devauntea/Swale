// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react/pure";
import { afterEach, describe, expect, it } from "vitest";
import { ServiceBadges } from "../components/transit/ServiceBadges";
import {
  MTA_SERVICE_COLORS,
  canonicalService,
  primitiveService,
  serviceColor,
  serviceRgba,
  serviceTextColor,
} from "../map/servicePalette";

afterEach(cleanup);
describe("official service identity stays separate from service status", () => {
  it("covers all requested palette services and explicitly resolves supported aliases", () => {
    expect(MTA_SERVICE_COLORS).toMatchObject({
      A: "#0062CF",
      F: "#EB6800",
      G: "#799534",
      J: "#8E5C33",
      L: "#7C858C",
      S: "#7C858C",
      R: "#F6BC26",
      "1": "#D82233",
      "4": "#009952",
      "7": "#9A38A1",
    });
    for (const alias of ["FS", "GS", "H"])
      expect(canonicalService(alias)).toBe("S");
    expect(serviceColor("6X")).toBe(serviceColor("6"));
    expect(serviceColor("7X")).toBe(serviceColor("7"));
    expect(serviceColor("FX")).toBe(serviceColor("F"));
    expect(serviceColor("UNRECOGNIZED")).toBeNull();
    expect(serviceTextColor("R")).toBe("#081525");
    expect(serviceRgba("G")).toEqual([121, 149, 52, 255]);
  });
  it("uses only explicit route source relationships for schematic alignments", () => {
    expect(primitiveService(["S1:SEGMENTID=123", "S2:route=F"])).toBe("F");
    expect(primitiveService(["S3:F21"])).toBeNull();
    expect(primitiveService(["S2:route=F", "S2:route=G"])).toBeNull();
  });
  it("renders every supplied service at mixed-service stations with unchanged official fills", () => {
    render(
      createElement(ServiceBadges, { routes: ["2", "3", "4", "5", "R", "R"] }),
    );
    const group = screen.getByLabelText("Routes 2, 3, 4, 5, R");
    expect(group.children).toHaveLength(5);
    const badge = screen.getByText("R");
    expect(badge.style.backgroundColor).toBe("rgb(246, 188, 38)");
    expect(badge.style.color).toBe("rgb(8, 21, 37)");
    expect(badge.title).toContain("not service status");
  });
});
