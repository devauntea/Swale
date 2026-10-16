export const TOUR_VERSION = 1;
export const TOUR_KEY = "swale.tutorial";
export const steps = [
  {
    id: "welcome",
    title: "Welcome to Swale",
    anchor: "welcome",
    text: "Explore Brooklyn’s flood-planning workspace with me. Source evidence, historical reports and illustrative simulations are different kinds of information. Always check the source and date before interpreting a feature.",
    practice:
      "You control the tour. Practice is optional, and you can leave at any time.",
  },
  {
    id: "map",
    title: "Explore the Brooklyn map",
    anchor: "map",
    text: "Drag to pan and use + / − to zoom. Focus the map to pan with arrow keys. Red grate icons mark catch basins; coat-yellow NYC 311 badges mark complaint records. Select a visible basin, report or station to inspect its evidence; the available features depend on your data mode.",
    practice:
      "Try selecting a feature, or use the sidebar’s keyboard-accessible selection list.",
  },
  {
    id: "layers",
    title: "Understand the map layers",
    anchor: "layers",
    text: "Use the real layer switches to compare drainage, reports, flood context and buildings. Subway monitoring has station and entrance layers. The map legend explains the current symbols and source-status labels; a report does not prove an active obstruction.",
    practice:
      "Try turning a layer off and back on. DEMO labels identify synthetic examples.",
  },
  {
    id: "water",
    title: "Normal view vs. flood simulation",
    anchor: "water",
    text: "Normal view hides hypothetical water and shows the infrastructure baseline. Flood simulation shows illustrative conditions using the current scenario and inputs. Neither view establishes actual present flooding, dryness or safety.",
    practice:
      "Compare the two views. Regional polygons and station storage are separate, uncoupled models.",
  },
  {
    id: "station",
    title: "Explore a subway station",
    anchor: "station",
    text: "In Backend / snapshot + transit, choose Subway monitoring. Select a station and Explore station, or Browse infrastructure and choose a model. Carroll St is available in the static catalog. Inspect modeled entrances, steps, railings, landings and available platforms.",
    practice:
      "Use the real viewpoint buttons and Return to overview. Geometry is schematic, not surveyed or a guaranteed accessible route.",
  },
  {
    id: "station-water",
    title: "Experience a station flood",
    anchor: "timeline",
    text: "With a station entrance selected, choose Flood simulation. The 600 s snapshot button opens the retained hypothetical example. Play, Pause, the elapsed-seconds slider and Reset control the existing local model.",
    practice:
      "No server simulation is started by this tour. If the entrance or timeline is unavailable, select a supported model or continue.",
  },
  {
    id: "evidence",
    title: "Understand infrastructure warnings",
    anchor: "evidence",
    text: "Inspect a drainage feature or incident and read its source, dates and verification details. Red grate icons identify catch basin inventory, not a blocked or dangerous basin. Yellow NYC 311 badges, matching the assistant’s raincoat, identify complaint records, not confirmed current conditions. Select either icon to inspect its evidence. Eligible recent unresolved reports may have a red halo. Historical, dated and unknown records remain distinct.",
    practice:
      "A nearby report or inferred link does not establish cause, current blockage or verified maintenance. Inspection priority (heuristic, not validated) is not a prediction.",
  },
  {
    id: "assistant",
    title: "Meet the Swale assistant",
    anchor: "assistant",
    text: "Select a feature, then open Swale Assistant for context and supported navigation actions. Fixture mode uses scripted DEMO replies; connected mode can request evidence-grounded explanations. This tour does not send a model request.",
    practice:
      "LOCAL TUTORIAL EXAMPLE: “Is this drain blocked?” — A report or inspection priority cannot establish blockage. Review the source evidence and its date.",
  },
  {
    id: "briefing",
    title: "Play a briefing",
    anchor: "briefing",
    text: "In the connected assistant, choose a Briefing language. After the tour, explicitly generate or open a contextual briefing, review its transcript and sources, then choose Play. Pause, Stop and Replay are available with a loaded briefing.",
    practice:
      "Language, translation and voice availability depend on provider capabilities. Generation, translation and audio are paused during the tutorial; nothing autoplays.",
  },
  {
    id: "finish",
    title: "You’re ready to explore Swale!",
    anchor: "theme",
    text: "Try light or dark mode without losing your place. You can now investigate Brooklyn’s flood information, compare scenarios, explore available station models and ask Swale for more details.",
    practice:
      "Reopen How to Use Swale whenever you need a guide. Finish keeps the view you explored; Close or Skip restores the tour’s saved UI state where possible.",
  },
] as const;
export type StepId = (typeof steps)[number]["id"];
export interface Progress {
  version: number;
  step: number;
  dismissed: boolean;
  completed: boolean;
}
export const initialProgress = (): Progress => ({
  version: TOUR_VERSION,
  step: 0,
  dismissed: false,
  completed: false,
});
export function readProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(TOUR_KEY) ?? "null");
    if (
      p?.version === TOUR_VERSION &&
      Number.isInteger(p.step) &&
      p.step >= 0 &&
      p.step < steps.length &&
      typeof p.dismissed === "boolean" &&
      typeof p.completed === "boolean"
    )
      return p;
  } catch {
    /* Storage is optional. */
  }
  return initialProgress();
}
export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(TOUR_KEY, JSON.stringify(p));
  } catch {
    /* Session remains usable. */
  }
}
