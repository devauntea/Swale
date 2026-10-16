import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  AssistantMessage,
  DemoAssistantReply,
  DemoSnapshot,
  ScenarioId,
} from "../../types";
import { Icon } from "../controls/Icon";
import { fixtureTime } from "../../app/format";
import { SwaleMascot, type MascotExpression } from "./SwaleMascot";
import "./assistant.css";

interface Props {
  open: boolean;
  snapshot: DemoSnapshot;
  scenarioId: ScenarioId;
  selectedBasinId: string | null;
  onClose: () => void;
  onSubmit: (text: string) => DemoAssistantReply;
  onSelect: (id: string) => void;
  onExpressionChange?: (expression: MascotExpression) => void;
}
const initialMessage: AssistantMessage = {
  id: "welcome",
  role: "assistant",
  demo: true,
  status: "complete",
  text: "Explore the local demonstration. I can switch scenarios, highlight example basins, and show complaint examples. Responses are scripted; no live AI or backend is connected.",
};
export function AssistantPanel(p: Props) {
  const { open, onSubmit, onExpressionChange } = p;
  const [messages, setMessages] = useState<AssistantMessage[]>([
    initialMessage,
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");
  const [expression, setExpression] = useState<MascotExpression>("idle");
  const onSubmitRef = useRef(onSubmit);
  const openRef = useRef(open);
  const pendingRef = useRef(pending);
  useLayoutEffect(() => {
    onSubmitRef.current = onSubmit;
    openRef.current = open;
    pendingRef.current = pending;
  }, [onSubmit, open, pending]);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousOpen = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (motionTimer.current) clearTimeout(motionTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (motionTimer.current) clearTimeout(motionTimer.current);
    if (open) {
      setExpression(pendingRef.current ? "processing" : "opening");
      // The panel is immediately interactive; only decorative motion settles later.
      motionTimer.current = setTimeout(() => {
        setExpression(pendingRef.current ? "processing" : "greeting");
      }, 650);
      (pendingRef.current ? closeRef.current : inputRef.current)?.focus({
        preventScroll: true,
      });
    } else if (previousOpen.current) {
      setExpression("closing");
      motionTimer.current = setTimeout(() => setExpression("idle"), 180);
    }
    previousOpen.current = open;
    return () => {
      if (motionTimer.current) clearTimeout(motionTimer.current);
    };
  }, [open]);
  useEffect(() => {
    onExpressionChange?.(expression);
  }, [expression, onExpressionChange]);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "auto" });
  }, [messages, pending, p.open]);
  const send = (text: string) => {
    if (pending) return;
    const value = text.trim();
    if (!value) {
      setFormError("Enter a question or choose a demonstration prompt.");
      setExpression("error");
      return;
    }
    if (value.length > 600) {
      setFormError("Keep the demonstration question under 600 characters.");
      setExpression("error");
      return;
    }
    setFormError("");
    setInput("");
    setPending(true);
    if (motionTimer.current) clearTimeout(motionTimer.current);
    setExpression("processing");
    setMessages((current) => [
      ...current,
      {
        id: `user-${++sequence.current}`,
        role: "user",
        text: value,
        demo: true,
        status: "complete",
      },
    ]);
    timer.current = setTimeout(() => {
      try {
        const reply = onSubmitRef.current(value);
        setExpression(
          openRef.current
            ? reply.status === "error"
              ? "error"
              : reply.actions.some((action) => action.name === "highlight")
                ? "highlighting"
                : "information"
            : "idle",
        );
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${++sequence.current}`,
            role: "assistant",
            demo: true,
            status: reply.status === "error" ? "error" : "complete",
            text: reply.text,
            basinIds: reply.basinIds,
            actions: reply.actions,
          },
        ]);
      } catch {
        setExpression(openRef.current ? "error" : "idle");
        setMessages((current) => [
          ...current,
          {
            id: `error-${++sequence.current}`,
            role: "assistant",
            demo: true,
            status: "error",
            text: "The local demonstration could not apply that request. The map remains available. Try a suggested prompt.",
          },
        ]);
      } finally {
        setPending(false);
      }
    }, 450);
  };
  const suggestions = [
    [
      "Priorities in Red Hook",
      "Top 10 basins to inspect in Red Hook before tomorrow's rain",
    ],
    ["Switch to extreme", "Switch to the extreme scenario and show the top 20"],
    ["Gowanus complaints", "Show recent flooding complaints near Gowanus"],
    ["Is this drain blocked?", "Is this drain blocked?"],
  ];
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes the region from its descendant controls; the region itself is not interactive.
    <section
      className="assistant-panel"
      id="swale-assistant-panel"
      hidden={!p.open}
      aria-labelledby="assistant-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          p.onClose();
        }
      }}
    >
      <header className="assistant-header">
        <span className="assistant-symbol">
          <SwaleMascot expression={expression} />
        </span>
        <div>
          <h2 id="assistant-title">Swale assistant</h2>
          <p>LOCAL DEMONSTRATION</p>
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
      <div className="assistant-notice">
        <span className="demo-label">DEMO</span>
        <p>Local fixture responses. Real AI integration is pending.</p>
      </div>
      <div
        className="chat-log"
        ref={log}
        role="log"
        aria-label="Assistant conversation"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.map((message) => (
          <article
            className={`chat-message ${message.role} ${message.status}`}
            key={message.id}
          >
            <div className="message-role">
              {message.role === "assistant" ? (
                <>
                  <Icon name="sparkle" size={12} />
                  SWALE<span>DEMO</span>
                </>
              ) : (
                "YOU"
              )}
            </div>
            <p>{message.text}</p>
            {message.basinIds && message.basinIds.length > 0 && (
              <div className="assistant-result-list">
                {message.basinIds
                  .filter((id) => p.snapshot.basins.some((b) => b.id === id))
                  .slice(0, 6)
                  .map((id) => {
                    const basin = p.snapshot.basins.find((b) => b.id === id)!;
                    return (
                      <button key={id} onClick={() => p.onSelect(id)}>
                        <Icon name="basin" size={13} />
                        <span>
                          {id}
                          <small>{basin.focusArea}</small>
                        </span>
                        <Icon name="arrow" size={14} />
                      </button>
                    );
                  })}
              </div>
            )}
            {message.role === "assistant" && message.id !== "welcome" && (
              <small className="message-provenance">
                LOCAL SCRIPT / FIXTURE · {fixtureTime(p.snapshot.provenance)}
              </small>
            )}
          </article>
        ))}
        {pending && (
          <div className="assistant-pending" role="status">
            <i />
            <i />
            <i />
            <span>Preparing local example…</span>
          </div>
        )}
      </div>
      <div
        className="chat-suggestions"
        aria-label="Suggested demonstration prompts"
      >
        {suggestions.map(([label, prompt]) => (
          <button key={label} disabled={pending} onClick={() => send(prompt)}>
            {label}
            <Icon name="arrow" size={11} />
          </button>
        ))}
        {p.selectedBasinId && (
          <button
            disabled={pending}
            onClick={() =>
              send(`Why is basin ${p.selectedBasinId} ranked high?`)
            }
          >
            Explain selected basin
            <Icon name="arrow" size={11} />
          </button>
        )}
      </div>
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label className="sr-only" htmlFor="assistant-input">
          Ask the demonstration assistant
        </label>
        <textarea
          ref={inputRef}
          id="assistant-input"
          placeholder="Ask about the example workspace…"
          rows={2}
          maxLength={600}
          value={input}
          readOnly={pending}
          aria-invalid={!!formError}
          aria-describedby={formError ? "composer-error" : "composer-note"}
          onChange={(e) => {
            setInput(e.target.value);
            if (formError) setFormError("");
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button
          type="submit"
          aria-label="Send demonstration message"
          disabled={pending || !input.trim()}
        >
          <Icon name="send" size={17} />
        </button>
      </form>
      {formError && (
        <p className="composer-error" id="composer-error" role="status">
          {formError}
        </p>
      )}
      <p className="composer-note" id="composer-note">
        DEMO · No LLM, live queries, or verified blockage detection.
      </p>
    </section>
  );
}
