import {
  CONTEXT_LANGUAGES,
  identifier,
  invalid,
  object,
  parseContextReply,
  parseContextRequest,
  text,
  type ContextLanguage,
  type ContextReply,
  type ContextRequest,
} from "../contextual/contracts";
import { isApprovedBackendRequest } from "./routes";

const JSON_LIMIT = 512 * 1024,
  AUDIO_LIMIT = 12 * 1024 * 1024;
function briefingPath(id: string) {
  if (!/^[a-f0-9]{32}$/.test(identifier(id))) invalid();
  return `/api/v1/context/briefings/${id}`;
}
async function boundedBody(
  response: Response,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error("The contextual response exceeded its size limit.");
  }
  if (!response.body)
    throw new Error("The contextual service returned an empty response.");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Error("The contextual response exceeded its size limit.");
      }
      parts.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.byteLength;
  }
  return body;
}
export class ContextualClient {
  constructor(
    private fetcher: typeof fetch = (input, init) =>
      globalThis.fetch(input, init),
  ) {}
  private async request(
    path: string,
    method: "GET" | "POST",
    body: unknown,
    signal?: AbortSignal,
    binary = false,
  ): Promise<unknown> {
    if (!isApprovedBackendRequest(method, path)) invalid();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 90000);
    try {
      const response = await this.fetcher(path, {
        method,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: binary
            ? "audio/mpeg, application/problem+json"
            : "application/json, application/problem+json",
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      });
      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim();
      if (binary && response.ok && contentType === "audio/mpeg")
        return new Blob([await boundedBody(response, AUDIO_LIMIT)], {
          type: "audio/mpeg",
        });
      if (
        contentType !== "application/json" &&
        contentType !== "application/problem+json"
      ) {
        await response.body?.cancel();
        throw new Error(
          `Contextual service HTTP ${response.status}: unexpected response type.`,
        );
      }
      const value: unknown = JSON.parse(
        new TextDecoder().decode(await boundedBody(response, JSON_LIMIT)),
      );
      if (!response.ok) {
        const p = object(value);
        throw new Error(
          typeof p.detail === "string"
            ? p.detail.slice(0, 500)
            : `Contextual service HTTP ${response.status}.`,
        );
      }
      if (controller.signal.aborted)
        throw new DOMException("Cancelled", "AbortError");
      if (binary)
        throw new Error(
          "Audio is unavailable. The complete transcript remains readable.",
        );
      return value;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
  async agent(
    prompt: string,
    context: ContextRequest,
    language: ContextLanguage,
    useModel: boolean,
    signal?: AbortSignal,
  ): Promise<ContextReply> {
    const validated = parseContextRequest(context);
    if (!CONTEXT_LANGUAGES.includes(language) || typeof useModel !== "boolean")
      invalid();
    const result = parseContextReply(
      await this.request(
        "/api/v1/context/agent",
        "POST",
        {
          prompt: text(prompt.trim(), 2000),
          context: validated,
          language,
          use_model: useModel,
        },
        signal,
      ),
      validated,
    );
    if (result.language !== language) invalid();
    return result;
  }
  async briefing(
    context: ContextRequest,
    language: ContextLanguage,
    useModel: boolean,
    signal?: AbortSignal,
  ): Promise<ContextReply> {
    const validated = parseContextRequest(context);
    if (!CONTEXT_LANGUAGES.includes(language) || typeof useModel !== "boolean")
      invalid();
    const result = parseContextReply(
      await this.request(
        "/api/v1/context/briefings",
        "POST",
        { context: validated, language, use_model: useModel },
        signal,
      ),
      validated,
    );
    if (result.language !== language) invalid();
    return result;
  }
  async translate(
    reply: ContextReply,
    language: ContextLanguage,
    signal?: AbortSignal,
  ) {
    if (!CONTEXT_LANGUAGES.includes(language)) invalid();
    const result = parseContextReply(
      await this.request(
        `${briefingPath(reply.id)}/translations`,
        "POST",
        { language, use_model: true },
        signal,
      ),
      reply.context,
    );
    if (
      result.language !== language ||
      result.context_key !== reply.context_key
    )
      invalid();
    return result;
  }
  async audio(reply: ContextReply, signal?: AbortSignal): Promise<Blob> {
    // This method is called only from explicit Play/Replay, never from an effect.
    await this.request(
      `${briefingPath(reply.id)}/audio`,
      "POST",
      { user_intent: true },
      signal,
    );
    return (await this.request(
      `${briefingPath(reply.id)}/audio`,
      "GET",
      undefined,
      signal,
      true,
    )) as Blob;
  }
}
