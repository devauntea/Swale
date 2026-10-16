import type {
  AssistantUIAction,
  CatchBasin,
  DemoAssistantReply,
  DemoSnapshot,
  ScenarioId,
} from "../types";
import { validateUIAction } from "./state";
import type { AppState } from "./state";

export const DEMO_SUGGESTED_PROMPTS = [
  "Top 10 basins to inspect in Red Hook before tomorrow's rain",
  "Switch to the extreme scenario and show the top 20",
  "Show recent flooding complaints near Gowanus",
  "Is this drain blocked?",
];

function reply(
  snapshot: DemoSnapshot,
  text: string,
  actions: AssistantUIAction[] = [],
  basinIds?: string[],
  status: DemoAssistantReply["status"] = "complete",
): DemoAssistantReply {
  if (
    actions.some((action) => !validateUIAction(action, snapshot).valid) ||
    basinIds?.some((id) => !snapshot.basins.some((basin) => basin.id === id))
  ) {
    return {
      text: "DEMO — The scripted map request failed validation. The map remains available; no command was applied.",
      actions: [],
      status: "error",
    };
  }
  return { text: `DEMO — ${text}`, actions, basinIds, status };
}

function knownBasinFromPrompt(
  prompt: string,
  snapshot: DemoSnapshot,
): CatchBasin | undefined {
  const tokens = new Set(
    (prompt.match(/[a-z0-9_-]+/gi) ?? []).map((token) => token.toLowerCase()),
  );
  return snapshot.basins.find((basin) => tokens.has(basin.id.toLowerCase()));
}

/** An authored presentation script. No model, backend search, scoring or network. */
export function runDemoAssistant(
  prompt: string,
  snapshot: DemoSnapshot,
  state: AppState,
): DemoAssistantReply {
  const input = prompt.trim();
  const text = input.toLowerCase();
  if (!input || input.length > 2000) {
    return reply(
      snapshot,
      "Enter a short supported demonstration request.",
      [],
      undefined,
      "error",
    );
  }

  if (
    /evacuat|emergency guidance|road closure|transit closure|\b(?:open|clean|touch)\b.*\b(?:drain|basin)\b/.test(
      text,
    )
  ) {
    return reply(
      snapshot,
      "This planning demonstration does not provide emergency guidance or instructions to handle drainage infrastructure. It only presents synthetic examples and map controls.",
      [],
      undefined,
      "unsupported",
    );
  }

  if (
    /\b(?:is|are|does|can)\b.*\b(?:blocked|clogged)\b|\bblockage\b/.test(text)
  ) {
    return reply(
      snapshot,
      "An inspection-priority score cannot establish whether a catch basin is blocked. These are predefined synthetic examples, not observations or inspection results. Nearby complaints also do not establish a cause.",
    );
  }

  const explicitSyntheticIds = input.match(/\bsynthetic-[a-z0-9_-]+/gi) ?? [];
  if (
    explicitSyntheticIds.some(
      (id) =>
        !snapshot.basins.some(
          (basin) => basin.id.toLowerCase() === id.toLowerCase(),
        ),
    )
  ) {
    return reply(
      snapshot,
      "That basin identifier is not in the loaded synthetic fixture. Choose an existing marker or example queue entry.",
      [],
      undefined,
      "unsupported",
    );
  }

  if (/\bwhy\b|\bexplain\b/.test(text) && /\bbasin\b|synthetic-/.test(text)) {
    const requested = knownBasinFromPrompt(input, snapshot);
    const explicitUnknownId =
      /\bbasin\s+(?!is\b|ranked\b|selected\b|high\b)([a-z0-9_-]+)/i.exec(input);
    if (explicitUnknownId && !requested)
      return reply(
        snapshot,
        "That basin identifier is not in the loaded synthetic fixture. Choose an existing marker or example queue entry.",
        [],
        undefined,
        "unsupported",
      );
    const basin =
      requested ??
      snapshot.basins.find((item) => item.id === state.selectedBasinId);
    if (!basin)
      return reply(
        snapshot,
        "Select an existing synthetic basin before asking for its example details.",
        [],
        undefined,
        "unsupported",
      );
    const priority = basin.priorities[state.scenarioId];
    const factors = priority.factors
      .map(
        (factor) =>
          `${factor.label}: ${factor.contributionPoints ?? "unavailable"} score points`,
      )
      .join("; ");
    return reply(
      snapshot,
      `${basin.id} has a stored example priority of ${priority.score ?? "unavailable"} under ${snapshot.scenarios[state.scenarioId].shortLabel}. ${factors}. Inspection priority (heuristic, not validated). These values are authored fixtures; no scoring calculation or backend query occurred. A score does not prove blockage.`,
      [
        { name: "highlight", arguments: { ids: [basin.id] } },
        { name: "fly_to", arguments: { target: basin.id } },
      ],
      [basin.id],
    );
  }

  if (/\bgowanus\b/.test(text) && /\bcomplaints?\b|\bflooding\b/.test(text)) {
    const count = snapshot.complaints.filter(
      (complaint) => complaint.recent && complaint.focusArea === "Gowanus",
    ).length;
    return reply(
      snapshot,
      `Showing ${count} synthetic recent complaint examples in the Gowanus focus area. These are authored fixtures with historical category labels, not live service requests or evidence that a nearby basin caused flooding.`,
      [
        { name: "set_layers", arguments: { visibility: { complaints: true } } },
        { name: "fly_to", arguments: { target: "gowanus" } },
      ],
    );
  }

  const requestedScenario: ScenarioId | undefined =
    /\b(?:switch|select|set|show)\b.*\bextreme\b/.test(text)
      ? "extreme_2080"
      : /\b(?:switch|select|set|show)\b.*\bmoderate\b/.test(text)
        ? "moderate_current"
        : undefined;
  if (requestedScenario) {
    const showQueue = /\btop\b|\bbasins?\b|\bpriority\b/.test(text);
    const ids = showQueue
      ? snapshot.rankedBasinIds[requestedScenario].slice(0, 20)
      : [];
    const actions: AssistantUIAction[] = [
      { name: "set_scenario", arguments: { name: requestedScenario } },
    ];
    if (showQueue)
      actions.push(
        { name: "set_layers", arguments: { visibility: { basins: true } } },
        { name: "highlight", arguments: { ids } },
      );
    return reply(
      snapshot,
      `${snapshot.scenarios[requestedScenario].shortLabel} selected. The interface now displays its separate synthetic overlay and stored priority examples. Both the published rainfall intensity and sea-level assumptions differ between scenarios.${showQueue ? ` The fixture contains ${ids.length} basin examples; all available examples are highlighted in the predefined order, rather than inventing additional records.` : ""} No model or backend query ran.`,
      actions,
      showQueue ? ids : undefined,
    );
  }

  if (/red\s*hook/.test(text) && /\btop\b|\bbasins?\b|\bpriorit/.test(text)) {
    const ids = snapshot.rankedBasinIds[state.scenarioId]
      .filter((id) =>
        snapshot.basins.some(
          (basin) => basin.id === id && basin.focusArea === "Red Hook",
        ),
      )
      .slice(0, 20);
    if (!ids.length)
      return reply(
        snapshot,
        "No Red Hook examples are loaded in this workspace state. Restore the Ready example workspace to use the scripted queue.",
        [],
        undefined,
        "unsupported",
      );
    return reply(
      snapshot,
      `The fixture contains ${ids.length} synthetic Red Hook basin examples. I highlighted the available examples in their predefined presentation order. This does not provide a real inspection list or check tomorrow's weather; live forecasts, ranking and backend queries await integration.`,
      [
        { name: "set_layers", arguments: { visibility: { basins: true } } },
        { name: "highlight", arguments: { ids } },
        { name: "fly_to", arguments: { target: "red_hook" } },
      ],
      ids,
    );
  }

  if (/\bhighlight\b/.test(text)) {
    const basin =
      knownBasinFromPrompt(input, snapshot) ??
      (/\bselected\b/.test(text)
        ? snapshot.basins.find((item) => item.id === state.selectedBasinId)
        : undefined);
    if (!basin)
      return reply(
        snapshot,
        "Choose an existing synthetic basin to highlight. Unknown identifiers are rejected.",
        [],
        undefined,
        "unsupported",
      );
    return reply(
      snapshot,
      `${basin.id} highlighted. This is a synthetic example marker, not an official asset location.`,
      [
        { name: "set_layers", arguments: { visibility: { basins: true } } },
        { name: "highlight", arguments: { ids: [basin.id] } },
      ],
      [basin.id],
    );
  }

  return reply(
    snapshot,
    "This is a scripted chat demonstration with a limited set of supported prompts. Try the suggested requests, ask why a selected synthetic basin has its example priority, or highlight the selected basin. No language model or backend search is connected.",
    [],
    undefined,
    "unsupported",
  );
}
