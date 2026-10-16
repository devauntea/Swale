import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SwaleMascot } from "../components/assistant/SwaleMascot";
import { Icon } from "../components/controls/Icon";
import { readProgress, saveProgress, steps, type StepId } from "./model";
import "./tutorial.css";
interface Props {
  active: boolean;
  onStart: () => void;
  onEnd: (restore: boolean) => void;
  onShow: (step: StepId) => string;
}
export function Tutorial(p: Props) {
  const [progress, setProgress] = useState(readProgress);
  const [menu, setMenu] = useState(false);
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [rect, setRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [position, setPosition] = useState({ left: 16, top: 80 });
  const card = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const step = steps[progress.step];
  useEffect(() => saveProgress(progress), [progress]);
  const finish = (restore: boolean) => {
    setMenu(false);
    setProgress((v) => ({
      ...v,
      dismissed: true,
      completed: !restore || v.completed,
    }));
    p.onEnd(restore);
    requestAnimationFrame(() =>
      trigger.current?.focus({ preventScroll: true }),
    );
  };
  const start = (restart: boolean) => {
    setProgress((v) => ({
      ...v,
      step: restart ? 0 : v.step,
      dismissed: true,
      completed: false,
    }));
    setMenu(false);
    setMessage("");
    p.onStart();
  };
  const go = (delta: number) => {
    setMessage("");
    setProgress((v) => ({
      ...v,
      step: Math.max(0, Math.min(steps.length - 1, v.step + delta)),
    }));
  };
  useEffect(() => {
    if (!p.active && !menu) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (p.active) finish(true);
      else {
        setMenu(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  });
  useLayoutEffect(() => {
    const panel = card.current;
    if (!panel || !p.active) return;
    if (
      "popover" in HTMLElement.prototype &&
      typeof panel.showPopover === "function"
    )
      panel.showPopover();
    title.current?.focus({ preventScroll: true });
    let previous = "";
    let revealed: HTMLElement | null = null;
    const measure = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-tutorial="${step.anchor}"]`,
      );
      anchor.current = target;
      if (target && target !== revealed && step.anchor !== "map") {
        target.scrollIntoView?.({
          block: "nearest",
          inline: "nearest",
          behavior: "instant",
        });
        revealed = target;
      }
      const r = target?.getBoundingClientRect();
      const visible =
        !!r &&
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.top < innerHeight &&
        r.right > 0 &&
        r.left < innerWidth;
      const next = visible
        ? {
            x: Math.max(4, r.left - 5),
            y: Math.max(4, r.top - 5),
            width: Math.min(
              r.width + 10,
              innerWidth - Math.max(4, r.left - 5) - 4,
            ),
            height: Math.min(
              r.height + 10,
              innerHeight - Math.max(4, r.top - 5) - 4,
            ),
          }
        : null;
      const signature = JSON.stringify(next);
      if (signature !== previous) {
        previous = signature;
        setRect(next);
      }
      const w = panel.offsetWidth || 360,
        h = panel.offsetHeight || 430;
      const gap = 18;
      let left = (innerWidth - w) / 2,
        top = Math.max(72, (innerHeight - h) / 2);
      if (visible && step.anchor !== "map") {
        if (r.right + gap + w < innerWidth) {
          left = r.right + gap;
          top = r.top;
        } else if (r.left - gap - w > 0) {
          left = r.left - gap - w;
          top = r.top;
        } else if (r.bottom + gap + h < innerHeight) {
          top = r.bottom + gap;
        } else {
          top = r.top - gap - h;
        }
      } else if (step.anchor === "map") {
        left = Math.max(16, innerWidth - w - 80);
        top = 100;
      }
      if (innerWidth < 640) {
        left = 10;
        top = innerHeight - h - 10;
      }
      const nextPosition = {
        left: Math.max(10, Math.min(left, innerWidth - w - 10)),
        top: Math.max(10, Math.min(top, innerHeight - h - 10)),
      };
      setPosition((old) =>
        old.left === nextPosition.left && old.top === nextPosition.top
          ? old
          : nextPosition,
      );
    };
    measure();
    const timer = window.setInterval(measure, 200);
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, true);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", measure);
      document.removeEventListener("scroll", measure, true);
    };
  }, [p.active, step.anchor, retry]);
  return (
    <>
      <button
        ref={trigger}
        className="tutorial-entry"
        data-tutorial="welcome"
        aria-expanded={p.active || menu}
        aria-controls="swale-tutorial"
        onClick={() =>
          p.active
            ? title.current?.focus()
            : progress.dismissed && !progress.completed && progress.step > 0
              ? setMenu(!menu)
              : start(true)
        }
      >
        <Icon name="info" size={17} />
        How to Use Swale
      </button>
      {createPortal(
        <>
          {!p.active && !progress.dismissed && !progress.completed && (
            <aside
              className="tutorial-invitation"
              aria-label="Welcome to Swale"
            >
              <strong>Welcome to Swale!</strong>
              <p>
                Explore Brooklyn’s flood information and illustrative station
                models with a guided tour.
              </p>
              <div>
                <button onClick={() => start(true)}>Take the Tour</button>
                <button
                  onClick={() =>
                    setProgress((v) => ({ ...v, dismissed: true }))
                  }
                >
                  Maybe Later
                </button>
              </div>
            </aside>
          )}
          {!p.active && menu && (
            <aside className="tutorial-invitation" aria-label="Resume tutorial">
              <strong>Continue your walkthrough</strong>
              <p>Resume at step {progress.step + 1}, or begin again.</p>
              <div>
                <button onClick={() => start(false)}>Resume tour</button>
                <button onClick={() => start(true)}>Restart tour</button>
                <button
                  onClick={() => {
                    setMenu(false);
                    trigger.current?.focus();
                  }}
                >
                  Close
                </button>
              </div>
            </aside>
          )}
          {p.active && (
            <>
              <div
                className="tutorial-shade"
                aria-hidden="true"
                hidden={!!rect}
              />
              {rect && (
                <div
                  className="tutorial-spotlight"
                  aria-hidden="true"
                  style={{
                    left: rect.x,
                    top: rect.y,
                    width: rect.width,
                    height: rect.height,
                  }}
                />
              )}
              <div
                ref={card}
                id="swale-tutorial"
                className="tutorial-card"
                popover={
                  typeof HTMLElement !== "undefined" &&
                  "popover" in HTMLElement.prototype
                    ? "manual"
                    : undefined
                }
                role="dialog"
                aria-labelledby="tutorial-title"
                aria-describedby="tutorial-description"
                style={position}
              >
                <div className="tutorial-kicker">
                  <span>SWALE FIELD GUIDE</span>
                  <button
                    aria-label="Close tutorial"
                    onClick={() => finish(true)}
                  >
                    <Icon name="close" size={17} />
                  </button>
                </div>
                <div className="tutorial-heading">
                  <SwaleMascot
                    expression={
                      progress.step === 0
                        ? "opening"
                        : progress.step === 9
                          ? "greeting"
                          : progress.step === 7
                            ? "information"
                            : "highlighting"
                    }
                  />
                  <div>
                    <span className="tutorial-count">
                      Step {progress.step + 1} of {steps.length}
                    </span>
                    <h2 ref={title} tabIndex={-1} id="tutorial-title">
                      {step.title}
                    </h2>
                  </div>
                </div>
                <div className="tutorial-progress" aria-hidden="true">
                  {steps.map((s, i) => (
                    <i
                      key={s.id}
                      className={i <= progress.step ? "done" : ""}
                    />
                  ))}
                </div>
                <p id="tutorial-description">{step.text}</p>
                <p className="tutorial-practice">{step.practice}</p>
                {!rect && (
                  <p className="tutorial-fallback" role="status">
                    This control is hidden, loading or unavailable in this view.
                    Use Show Me to reveal available controls, retry, or
                    continue.
                    <button onClick={() => setRetry((v) => v + 1)}>
                      Retry highlight
                    </button>
                  </p>
                )}
                {message && (
                  <p className="tutorial-feedback" role="status">
                    {message}
                  </p>
                )}
                {progress.step > 0 && progress.step < 9 && (
                  <div className="tutorial-practice-actions">
                    <button
                      onClick={() => {
                        try {
                          setMessage(p.onShow(step.id));
                          setRetry((v) => v + 1);
                        } catch {
                          setMessage(
                            "This action is unavailable. You can continue or close the tour.",
                          );
                        }
                      }}
                    >
                      Show Me
                    </button>
                    <button
                      disabled={!rect}
                      onClick={() => {
                        const target = anchor.current;
                        const control = target?.matches(
                          "button,select,input,textarea",
                        )
                          ? target
                          : target?.querySelector<HTMLElement>(
                              "button:not(:disabled),select,input,textarea,canvas[tabindex]",
                            );
                        (control ?? target)?.focus({ preventScroll: true });
                      }}
                    >
                      Try the control
                    </button>
                  </div>
                )}
                <div className="tutorial-navigation">
                  <button disabled={progress.step === 0} onClick={() => go(-1)}>
                    Back
                  </button>
                  {progress.step === 9 ? (
                    <button
                      className="tutorial-primary"
                      onClick={() => finish(false)}
                    >
                      Finish Tour
                    </button>
                  ) : (
                    <button className="tutorial-primary" onClick={() => go(1)}>
                      Next <Icon name="arrow" size={14} />
                    </button>
                  )}
                </div>
                <div className="tutorial-bottom">
                  <button onClick={() => finish(true)}>Skip Tour</button>
                  {progress.step === 9 ? (
                    <button onClick={() => finish(false)}>Explore Swale</button>
                  ) : (
                    <span>Practice is optional · Esc to close</span>
                  )}
                </div>
              </div>
            </>
          )}
        </>,
        document.body,
      )}
    </>
  );
}
