import { useEffect, useState } from "react";
import type { ContextLanguage } from "./contracts";

/** Device voice inventory is separate from translation and provider readiness. */
export function useBrowserVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const update = () => setVoices(synth.getVoices().slice(0, 200));
    update();
    synth.addEventListener("voiceschanged", update);
    return () => synth.removeEventListener("voiceschanged", update);
  }, []);
  return voices;
}
export function voiceMatchesLanguage(
  voice: Pick<SpeechSynthesisVoice, "lang">,
  language: ContextLanguage,
): boolean {
  return voice.lang.toLowerCase().split(/[-_]/)[0] === language;
}
/** Keep every character and final warning; segment instead of truncating. */
export function speechSegments(transcript: string, limit = 350): string[] {
  if (!transcript.length || limit < 20) return [];
  const segments: string[] = [];
  let remaining = transcript;
  while (remaining.length > limit) {
    const candidate = remaining.slice(0, limit);
    const boundary = Math.max(
      candidate.lastIndexOf(". "),
      candidate.lastIndexOf("。"),
      candidate.lastIndexOf("! "),
      candidate.lastIndexOf("? "),
    );
    const whitespace = candidate.lastIndexOf(" ");
    let cut =
      boundary > limit / 3
        ? boundary + 1
        : whitespace > limit / 3
          ? whitespace + 1
          : limit;
    // Do not split a Unicode surrogate pair.
    if (/^[\uDC00-\uDFFF]$/u.test(remaining[cut])) cut -= 1;
    segments.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining) segments.push(remaining);
  return segments;
}
