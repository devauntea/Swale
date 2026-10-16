import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ContextualClient } from "../backend/contextualClient";
import { Icon } from "../components/controls/Icon";
import type { MascotExpression } from "../components/assistant/SwaleMascot";
import {
  contextIdentity,
  sameContext,
  type ContextAction,
  type ContextLanguage,
  type ContextReply,
  type ContextRequest,
} from "./contracts";
import "./contextual.css";
import {
  speechSegments,
  useBrowserVoices,
  voiceMatchesLanguage,
} from "./voices";

export interface ContextualAssistantProps {
  context: ContextRequest | null;
  onAction: (action: ContextAction) => void;
  onActions?: (actions: ContextAction[]) => void;
  movementEnabled: boolean;
  onMovementChange: (enabled: boolean) => void;
  autoCamera: boolean;
  onAutoCameraChange: (enabled: boolean) => void;
}
interface Props extends ContextualAssistantProps {
  open: boolean;
  onClose: () => void;
  onExpressionChange?: (expression: MascotExpression) => void;
  /** Deterministic transport injection for tests; normal runtime uses the backend. */
  client?: ContextualClient;
}
interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  reply?: ContextReply;
}
const LANGUAGE_NAMES: Record<ContextLanguage, string> = {
  en: "English",
  es: "Español",
  zh: "中文",
  ar: "العربية",
  ru: "Русский",
  fr: "Français",
};
const actionLabel = (action: ContextAction) => {
  switch (action.type) {
    case "set_view":
      return action.view_scope === "overview"
        ? "Return to overview"
        : "Explore station";
    case "set_water_view":
      return action.water_view === "normal"
        ? "Normal view"
        : "Flood simulation";
    case "seek_simulation":
      return `View ${action.elapsed_seconds} seconds`;
    case "select_station":
      return `Select ${action.station_id}`;
    case "set_layers":
      return "Apply layer choices";
    case "highlight":
      return "Highlight evidence";
    case "fly_to":
      return "Frame selection";
    case "play_briefing":
      return "Play this briefing";
    case "stop_audio":
      return "Stop audio";
  }
};

/** The existing assistant's backend presentation. Provider work is never automatic. */
export function ContextualAssistantPanel(p: Props) {
  const { onExpressionChange } = p;
  const client = useMemo(() => p.client ?? new ContextualClient(), [p.client]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<ContextLanguage>("en");
  const [useModel, setUseModel] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reply, setReply] = useState<ContextReply | null>(null);
  const [audioState, setAudioState] = useState("stopped");
  const voices = useBrowserVoices();
  const [voiceChoice, setVoiceChoice] = useState("backend");
  const sequence = useRef(0),
    generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, ContextReply>());
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const audioReplyId = useRef<string | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const current = useRef({ context: p.context, language, open: p.open });
  useLayoutEffect(() => {
    current.current = { context: p.context, language, open: p.open };
  });
  const identity = p.context ? contextIdentity(p.context) : "";
  const stopAudio = () => {
    if (utterance.current && "speechSynthesis" in window) {
      utterance.current.onend = null;
      utterance.current.onerror = null;
      window.speechSynthesis.cancel();
    }
    utterance.current = null;
    if (audio.current) {
      audio.current.pause();
      audio.current.removeAttribute("src");
      audio.current.load();
    }
    audio.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
    audioReplyId.current = null;
    setAudioState("stopped");
  };
  const cancel = () => {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
  };
  const append = (message: Omit<Message, "id">) =>
    setMessages((previous) => [
      ...previous.slice(-29),
      { ...message, id: ++sequence.current },
    ]);
  const remember = (key: string, result: ContextReply) => {
    cache.current.delete(key);
    cache.current.set(key, result);
    while (cache.current.size > 12)
      cache.current.delete(cache.current.keys().next().value!);
  };
  const validResult = (result: ContextReply, token: number) =>
    token === generation.current &&
    current.current.context !== null &&
    sameContext(result.context, current.current.context);
  const applyAction = (action: ContextAction, result: ContextReply) => {
    if (
      !current.current.context ||
      !sameContext(result.context, current.current.context)
    ) {
      setError(
        "This action belongs to an earlier selection or snapshot. Refresh its explanation first.",
      );
      return;
    }
    if (action.type === "stop_audio") {
      stopAudio();
      return;
    }
    if (action.type === "play_briefing") {
      void play(result);
      return;
    }
    try {
      p.onAction(action);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This action is unavailable for the selected context.",
      );
    }
  };
  const run = async (prompt: string | null, automatic = false) => {
    const context = current.current.context;
    if (!context) {
      setError("Select a station, entrance, basin or incident first.");
      return;
    }
    const value = prompt?.trim() ?? null;
    if (value !== null && (!value.length || value.length > 2000)) {
      setError("Enter a question of 1–2000 characters.");
      return;
    }
    cancel();
    stopAudio();
    const token = generation.current,
      controller = new AbortController();
    request.current = controller;
    const locale = automatic ? "en" : current.current.language;
    const model = automatic ? false : useModel;
    const key = `${contextIdentity(context)}|${locale}|${model}|${value ?? "briefing"}`;
    setPending(true);
    setError("");
    if (!automatic && value) {
      append({ role: "user", text: value });
      setInput("");
    }
    try {
      const cached = cache.current.get(key);
      const result =
        cached && Date.parse(cached.expires_at) > Date.now()
          ? cached
          : value === null
            ? await client.briefing(context, locale, model, controller.signal)
            : await client.agent(
                value,
                context,
                locale,
                model,
                controller.signal,
              );
      if (!validResult(result, token)) return;
      remember(key, result);
      setReply(result);
      if (!automatic)
        append({ role: "assistant", text: result.transcript, reply: result });
      // Navigation stays bounded and is revalidated by the shared app owner.
      // Audio actions remain visible buttons requiring an actual Play gesture.
      if (!automatic && !cached) {
        const navigation = result.actions.filter(
          (action) =>
            action.type !== "play_briefing" && action.type !== "stop_audio",
        );
        if (navigation.length) {
          if (p.onActions) p.onActions(navigation);
          else for (const action of navigation) applyAction(action, result);
        }
        if (result.actions.some((action) => action.type === "stop_audio"))
          stopAudio();
        if (
          result.actions.some((action) => action.type === "play_briefing") &&
          value !== null &&
          /\b(?:play|read aloud|speak|listen)\b/i.test(value)
        )
          void play(result);
      }
    } catch (cause) {
      if (token === generation.current && !controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Contextual explanation unavailable.",
        );
    } finally {
      if (token === generation.current) {
        setPending(false);
        request.current = null;
      }
    }
  };
  const translate = async () => {
    if (!reply || !p.context || !sameContext(reply.context, p.context)) return;
    cancel();
    stopAudio();
    setPending(true);
    setError("");
    const token = generation.current,
      controller = new AbortController();
    request.current = controller;
    try {
      const key = `${reply.context_key}|translation|${language}`;
      const result =
        cache.current.get(key) ??
        (await client.translate(reply, language, controller.signal));
      if (
        !validResult(result, token) ||
        result.language !== current.current.language
      )
        return;
      remember(key, result);
      setReply(result);
      append({ role: "assistant", text: result.transcript, reply: result });
    } catch (cause) {
      if (token === generation.current && !controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Translation unavailable; original transcript remains readable.",
        );
    } finally {
      if (token === generation.current) {
        setPending(false);
        request.current = null;
      }
    }
  };
  const play = async (result: ContextReply) => {
    if (
      !current.current.context ||
      !sameContext(result.context, current.current.context) ||
      result.language !== current.current.language
    ) {
      setError(
        "Refresh the selected language and context before playing audio.",
      );
      return;
    }
    cancel();
    stopAudio();
    setAudioState("loading");
    setError("");
    const token = generation.current,
      controller = new AbortController();
    request.current = controller;
    try {
      if (voiceChoice !== "backend") {
        const voice = voices.find(
          (voice) =>
            voice.voiceURI === voiceChoice &&
            voiceMatchesLanguage(voice, result.language),
        );
        if (
          !voice ||
          !("speechSynthesis" in window) ||
          !("SpeechSynthesisUtterance" in window)
        ) {
          setAudioState("unsupported");
          throw new Error(
            "No matching browser voice is available for this translated transcript.",
          );
        }
        const segments = speechSegments(result.transcript);
        let index = 0;
        const speakNext = () => {
          if (
            !validResult(result, token) ||
            result.language !== current.current.language
          )
            return;
          if (index >= segments.length) {
            utterance.current = null;
            setAudioState("ended");
            return;
          }
          const next = new SpeechSynthesisUtterance(segments[index++]);
          utterance.current = next;
          audioReplyId.current = result.id;
          next.voice = voice;
          next.lang = voice.lang;
          next.onstart = () => {
            if (utterance.current === next) setAudioState("playing");
          };
          next.onpause = () => {
            if (utterance.current === next) setAudioState("paused");
          };
          next.onresume = () => {
            if (utterance.current === next) setAudioState("playing");
          };
          next.onend = speakNext;
          next.onerror = () => {
            if (utterance.current === next) {
              stopAudio();
              setAudioState("failed");
              setError(
                "Browser speech failed; complete transcript remains readable.",
              );
            }
          };
          window.speechSynthesis.speak(next);
        };
        speakNext();
        return;
      }
      const blob = await client.audio(result, controller.signal);
      if (
        !validResult(result, token) ||
        result.language !== current.current.language
      )
        return;
      const url = URL.createObjectURL(blob),
        player = new Audio(url);
      audioUrl.current = url;
      audio.current = player;
      audioReplyId.current = result.id;
      player.onended = () => {
        if (audio.current === player) setAudioState("ended");
      };
      player.onerror = () => {
        if (audio.current === player) {
          stopAudio();
          setAudioState("error");
          setError(
            "Audio playback failed. The complete transcript remains available.",
          );
        }
      };
      await player.play();
      if (validResult(result, token) && audio.current === player)
        setAudioState("playing");
      else {
        player.pause();
        URL.revokeObjectURL(url);
      }
    } catch (cause) {
      if (token === generation.current && !controller.signal.aborted) {
        stopAudio();
        setAudioState("error");
        setError(
          cause instanceof Error
            ? cause.message
            : "Audio unavailable; transcript remains available.",
        );
      }
    } finally {
      if (token === generation.current) {
        request.current = null;
        setPending(false);
      }
    }
  };
  useLayoutEffect(() => {
    cancel();
    stopAudio();
    setPending(false);
    setError("");
    // A provider-disabled template gives selection context without spending or
    // model generation. Debounce changing playback cursors and rapid selections.
    if (p.context)
      autoTimer.current = setTimeout(() => {
        void run(null, true);
      }, 300);
    return () => {
      cancel();
      stopAudio();
    };
    // Context identity intentionally controls cancellation, not object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, client]);
  useLayoutEffect(() => {
    cancel();
    stopAudio();
    setPending(false);
    setError("");
  }, [language]);
  useLayoutEffect(() => {
    cancel();
    stopAudio();
    setPending(false);
  }, [voiceChoice]);
  useEffect(() => {
    if (p.open) inputRef.current?.focus({ preventScroll: true });
    else {
      cancel();
      stopAudio();
      setPending(false);
    }
  }, [p.open]);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "auto" });
  }, [messages, pending]);
  useEffect(() => {
    onExpressionChange?.(
      error
        ? "error"
        : pending
          ? "processing"
          : audioState === "playing"
            ? "speaking"
            : "information",
    );
  }, [pending, error, audioState, onExpressionChange]);
  const fresh =
    reply !== null &&
    p.context !== null &&
    sameContext(reply.context, p.context);
  const actionsDisabled = !fresh || pending;
  const displayedMessages: Message[] =
    reply && !messages.some((message) => message.reply?.id === reply.id)
      ? [
          ...messages,
          { id: 0, role: "assistant", text: reply.transcript, reply },
        ]
      : messages;
  const matchingVoices = voices.filter((voice) =>
    voiceMatchesLanguage(voice, language),
  );
  const submit = () => {
    if (
      /^\s*(?:play|read aloud|speak)\s+(?:this\s+)?briefing[.!]?\s*$/i.test(
        input,
      ) &&
      reply &&
      fresh &&
      reply.language === language
    ) {
      append({ role: "user", text: input.trim() });
      setInput("");
      void play(reply);
    } else if (
      /^\s*stop\s+(?:the\s+)?(?:audio|briefing)[.!]?\s*$/i.test(input)
    ) {
      append({ role: "user", text: input.trim() });
      setInput("");
      cancel();
      stopAudio();
      setPending(false);
    } else void run(input);
  };
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape from a descendant closes this labelled region.
    <section
      className="assistant-panel contextual-panel"
      id="swale-assistant-panel"
      hidden={!p.open}
      aria-labelledby="assistant-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          p.onClose();
        }
      }}
    >
      <header className="assistant-header">
        <span className="assistant-symbol">
          <Icon name="sparkle" size={24} />
        </span>
        <div>
          <h2 id="assistant-title">Swale assistant</h2>
          <p>SELECTED CONTEXT · EVIDENCE FIRST</p>
        </div>
        <button
          className="icon-button"
          ref={closeRef}
          aria-label="Close assistant"
          onClick={p.onClose}
        >
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="context-identity">
        <strong>
          {p.context
            ? `${p.context.kind.toUpperCase()} · ${p.context.id}`
            : "Select a map feature to begin"}
        </strong>
        {p.context && (
          <>
            {p.context.view_scope === "overview"
              ? "Overview"
              : "Station model tour"}{" "}
            ·{" "}
            {p.context.water_view === "normal"
              ? "Normal view — water hidden; current interior conditions unknown"
              : "Hypothetical flood simulation"}
            {p.context.snapshot && (
              <>
                {" "}
                · snapshot {p.context.snapshot.elapsed_seconds} s ·{" "}
                {p.context.snapshot.model_version}
              </>
            )}
          </>
        )}
      </div>
      <div className="context-toolbar">
        <label>
          Briefing language
          <select
            aria-label="Briefing language"
            value={language}
            onChange={(event) => {
              setLanguage(event.target.value as ContextLanguage);
              setVoiceChoice("backend");
            }}
          >
            {Object.entries(LANGUAGE_NAMES).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={useModel}
            onChange={(event) => setUseModel(event.target.checked)}
          />
          Model on explicit request
        </label>
        <label>
          <input
            type="checkbox"
            checked={p.movementEnabled}
            onChange={(event) => p.onMovementChange(event.target.checked)}
          />
          Mascot movement
        </label>
        <label>
          <input
            type="checkbox"
            checked={p.autoCamera}
            onChange={(event) => p.onAutoCameraChange(event.target.checked)}
          />
          Automatic camera travel
        </label>
      </div>
      <div
        className="chat-log"
        ref={log}
        role="log"
        aria-label="Assistant conversation"
        aria-live="polite"
        aria-relevant="additions"
      >
        {!displayedMessages.length && (
          <p className="context-warning">
            Select an entity for its source evidence. Model requests run only
            after Send or Generate; audio requires Play.
          </p>
        )}
        {displayedMessages.map((message) => {
          const r = message.reply,
            historical =
              r && (!p.context || !sameContext(r.context, p.context));
          return (
            <article
              className={`chat-message ${message.role}`}
              key={message.id}
              lang={r?.language}
              dir={r?.language === "ar" ? "rtl" : "auto"}
            >
              <div className="message-role">
                {message.role === "user"
                  ? "YOU"
                  : message.id === 0
                    ? "CURRENT SELECTION"
                    : "SWALE"}
                {r && (
                  <span>
                    {r.source === "model"
                      ? "MODEL · GUARDED"
                      : r.source === "machine_translation"
                        ? "MACHINE TRANSLATION"
                        : "SOURCE TEMPLATE"}
                  </span>
                )}
              </div>
              <p>{message.text}</p>
              {r && (
                <>
                  <small className="message-provenance">
                    {r.context.id} · {r.created_at}
                    {historical ? " · EARLIER CONTEXT / SNAPSHOT" : ""}
                  </small>
                  {r.error && <p className="context-warning">{r.error}</p>}
                  <details>
                    <summary>Evidence, freshness and limitations</summary>
                    {r.evidence.map((e) => (
                      <p key={e.id}>
                        <strong>
                          {e.type} · {e.source_id}
                        </strong>{" "}
                        · {e.subject_id}
                        <br />
                        {e.text}
                        <br />
                        Source time: {e.source_time ?? "unknown"}; fetched:{" "}
                        {e.fetched_at ?? "unknown"};{" "}
                        {e.stale === null
                          ? "freshness unknown"
                          : e.stale
                            ? "STALE"
                            : "source not marked stale"}
                        {e.url && (
                          <>
                            <br />
                            <a
                              href={e.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Source reference
                            </a>
                          </>
                        )}
                      </p>
                    ))}
                    {r.limitations.map((limitation, index) => (
                      <p key={index}>{limitation}</p>
                    ))}
                  </details>
                  {r.language !== "en" && (
                    <details>
                      <summary>Original English transcript</summary>
                      <p lang="en" dir="ltr">
                        {r.original_transcript}
                      </p>
                    </details>
                  )}
                </>
              )}
            </article>
          );
        })}
        {pending && (
          <p role="status" className="context-warning">
            Loading validated context…
          </p>
        )}
      </div>
      <div
        className="chat-suggestions"
        aria-label="Contextual assistant actions"
      >
        <button disabled={!p.context || pending} onClick={() => void run(null)}>
          Generate selected briefing
        </button>
        <button
          disabled={!p.context || pending}
          onClick={() => void run("Explain this selection.")}
        >
          Explain selection
        </button>
        <button
          disabled={!p.context || pending}
          onClick={() => void run("Return to the overview.")}
        >
          Return to overview
        </button>
        {reply?.actions.map((action, index) => (
          <button
            key={index}
            disabled={actionsDisabled}
            onClick={() => applyAction(action, reply)}
          >
            {actionLabel(action)}
          </button>
        ))}
      </div>
      {reply && (
        <div className="context-toolbar">
          <label>
            Voice
            <select
              aria-label="Briefing voice"
              value={voiceChoice}
              onChange={(event) => setVoiceChoice(event.target.value)}
            >
              <option value="backend">Backend voice · remote provider</option>
              {matchingVoices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} · {voice.lang} ·{" "}
                  {voice.localService
                    ? "local device"
                    : "remote browser service"}
                </option>
              ))}
            </select>
          </label>
          <small>
            {matchingVoices.length
              ? `${matchingVoices.length} browser voice(s) discovered for ${LANGUAGE_NAMES[language]}; remote voices send the transcript to their speech service.`
              : `No browser voice discovered for ${LANGUAGE_NAMES[language]}. Backend voice availability is verified only when requested.`}
          </small>
          <button
            className="context-action"
            disabled={actionsDisabled || reply.language === language}
            onClick={() => void translate()}
          >
            Translate transcript to {LANGUAGE_NAMES[language]}
          </button>
          <small>
            Configured languages shown; machine translation is not human
            reviewed.
          </small>
          <div className="context-audio">
            <button
              disabled={
                actionsDisabled ||
                reply.language !== language ||
                audioState === "loading"
              }
              onClick={() => void play(reply)}
            >
              {audioState === "ended" ? "Replay briefing" : "Play briefing"}
            </button>
            <button
              disabled={
                (!audio.current && !utterance.current) ||
                !["playing", "paused"].includes(audioState)
              }
              onClick={() => {
                const player = audio.current;
                if (utterance.current && "speechSynthesis" in window) {
                  if (audioState === "playing") {
                    window.speechSynthesis.pause();
                    setAudioState("paused");
                  } else {
                    window.speechSynthesis.resume();
                    setAudioState("playing");
                  }
                  return;
                }
                if (!player || audioReplyId.current !== reply.id) return;
                if (audioState === "playing") {
                  player.pause();
                  setAudioState("paused");
                } else {
                  void player
                    .play()
                    .then(() => setAudioState("playing"))
                    .catch(() => {
                      setAudioState("error");
                      setError("Playback could not resume; use Play to retry.");
                    });
                }
              }}
            >
              {audioState === "paused" ? "Resume audio" : "Pause audio"}
            </button>
            <button
              disabled={audioState === "stopped"}
              onClick={() => {
                cancel();
                stopAudio();
                setPending(false);
              }}
            >
              Stop audio
            </button>
            <span role="status">
              Audio: {audioState}. Playback reads this transcript; no autoplay.
            </span>
          </div>
        </div>
      )}
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="sr-only" htmlFor="assistant-input">
          Ask Swale about the selected context
        </label>
        <textarea
          id="assistant-input"
          ref={inputRef}
          rows={2}
          maxLength={2000}
          value={input}
          disabled={!p.context}
          placeholder="Explain this station or ask to change the view…"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="submit"
          aria-label="Send contextual message"
          disabled={!p.context || !input.trim() || pending}
        >
          <Icon name="send" size={17} />
        </button>
      </form>
      <p className="composer-note">
        Grounded explanation for planning. Model tours are virtual viewpoints,
        not walking or evacuation directions.
      </p>
      {error && (
        <p className="composer-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
