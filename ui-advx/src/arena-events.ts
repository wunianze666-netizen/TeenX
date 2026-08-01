import {
  ARENA_DIMENSION_NAMES,
  type ArenaEventConnection,
  type ArenaEventStreamOptions,
  type ArenaEventStreamResult,
  type ArenaProgressEvent,
  type ArenaStage,
  type ArenaTerminalEvent,
} from "./arena-contracts";

type ErrorFromResponse = (response: Response) => Promise<Error>;

export type ArenaEventRequest = {
  readonly baseUrl: string;
  readonly runId: string;
  readonly options: ArenaEventStreamOptions;
  readonly errorFromResponse: ErrorFromResponse;
};

export class ArenaSseProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArenaSseProtocolError";
  }
}

function isArenaStage(value: unknown): value is ArenaStage {
  return value === "challenge" || value === "standard" || value === "analysis" || value === "scoring" || value === "summary";
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function arenaProgressEvent(value: unknown): ArenaProgressEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ArenaSseProtocolError("Arena 事件必须是对象");
  }
  const event = value as Record<string, unknown>;
  switch (event.type) {
    case "run_started":
      if (exactRecord(event, ["type", "runId", "startedAt"]) && nonEmptyString(event.runId) && nonEmptyString(event.startedAt)) {
        return { type: "run_started", runId: event.runId, startedAt: event.startedAt };
      }
      break;
    case "stage":
      if (exactRecord(event, ["type", "stage", "status"]) && isArenaStage(event.stage) && (event.status === "started" || event.status === "completed")) {
        return { type: "stage", stage: event.stage, status: event.status };
      }
      break;
    case "dimension":
      if (
        exactRecord(event, ["type", "name", "index", "total", "status"])
        && nonEmptyString(event.name)
        && typeof event.index === "number"
        && Number.isInteger(event.index)
        && event.index >= 1
        && event.index <= 8
        && event.name === ARENA_DIMENSION_NAMES[event.index - 1]
        && event.total === 8
        && (event.status === "started" || event.status === "completed")
      ) {
        return { type: "dimension", name: event.name, index: event.index, total: 8, status: event.status };
      }
      break;
    case "run_completed":
      if (exactRecord(event, ["type", "runId", "scoreWorkProductId"]) && nonEmptyString(event.runId) && nonEmptyString(event.scoreWorkProductId)) {
        return { type: "run_completed", runId: event.runId, scoreWorkProductId: event.scoreWorkProductId };
      }
      break;
    case "run_failed":
      if (exactRecord(event, ["type", "runId", "code", "message"]) && nonEmptyString(event.runId) && nonEmptyString(event.code) && nonEmptyString(event.message)) {
        return { type: "run_failed", runId: event.runId, code: event.code, message: event.message };
      }
      break;
    case "run_cancelled":
      if (exactRecord(event, ["type", "runId"]) && nonEmptyString(event.runId)) {
        return { type: "run_cancelled", runId: event.runId };
      }
      break;
  }
  throw new ArenaSseProtocolError("收到未知或格式错误的 Arena 事件");
}

function isTerminalArenaEvent(event: ArenaProgressEvent): event is ArenaTerminalEvent {
  return event.type === "run_completed" || event.type === "run_failed" || event.type === "run_cancelled";
}

function parseArenaSseFrame(frame: string): { readonly cursor: number; readonly event: ArenaProgressEvent } | null {
  const lines = frame.split(/\r\n|\r|\n/);
  let id: string | null = null;
  const data: string[] = [];
  let hasComment = false;
  for (const line of lines) {
    if (!line) throw new ArenaSseProtocolError("Arena SSE 帧包含意外空行");
    if (line.startsWith(":")) {
      hasComment = true;
      continue;
    }
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let fieldValue = separator === -1 ? "" : line.slice(separator + 1);
    if (fieldValue.startsWith(" ")) fieldValue = fieldValue.slice(1);
    if (field === "id") {
      if (id !== null) throw new ArenaSseProtocolError("Arena SSE 帧包含重复 id");
      id = fieldValue;
    } else if (field === "data") data.push(fieldValue);
    else throw new ArenaSseProtocolError(`Arena SSE 帧包含未知字段 ${field || "(空)"}`);
  }
  if (id === null && data.length === 0 && hasComment) return null;
  if (id === null || data.length === 0 || !/^(0|[1-9]\d*)$/.test(id)) {
    throw new ArenaSseProtocolError("Arena SSE 帧缺少数字 id 或 data");
  }
  const cursor = Number(id);
  if (!Number.isSafeInteger(cursor)) throw new ArenaSseProtocolError("Arena SSE cursor 超出安全范围");
  let value: unknown;
  try {
    value = JSON.parse(data.join("\n"));
  } catch {
    throw new ArenaSseProtocolError("Arena SSE data 不是有效 JSON");
  }
  return { cursor, event: arenaProgressEvent(value) };
}

function nextSseBoundary(buffer: string): { readonly index: number; readonly length: number } | null {
  const match = /(?:\r\n|\r|\n)(?:\r\n|\r|\n)/.exec(buffer);
  return match ? { index: match.index, length: match[0].length } : null;
}

async function consumeArenaEvents(
  request: ArenaEventRequest,
  controller: AbortController,
): Promise<ArenaEventStreamResult> {
  const { baseUrl, runId, options, errorFromResponse } = request;
  if (options.cursor !== undefined && (!Number.isSafeInteger(options.cursor) || options.cursor < 0)) {
    throw new ArenaSseProtocolError("Arena SSE cursor 必须是非负安全整数");
  }
  const cursorQuery = options.cursor === undefined ? "" : `?cursor=${encodeURIComponent(String(options.cursor))}`;
  const headers = new Headers({ Accept: "text/event-stream" });
  if (options.cursor !== undefined) headers.set("Last-Event-ID", String(options.cursor));
  const response = await fetch(`${baseUrl}/runs/${encodeURIComponent(runId)}/events${cursorQuery}`, {
    headers,
    cache: "no-store",
    signal: controller.signal,
  });
  if (!response.ok) throw await errorFromResponse(response);
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "text/event-stream") throw new ArenaSseProtocolError("Arena 事件流返回了错误的 Content-Type");
  if (!response.body) throw new ArenaSseProtocolError("Arena 事件流没有响应体");
  options.onOpen?.();
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let latestCursor = options.cursor;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        buffer += decoder.decode();
        break;
      }
      options.onActivity?.();
      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 1_000_000) throw new ArenaSseProtocolError("Arena SSE 帧过大");
      let boundary = nextSseBoundary(buffer);
      while (boundary) {
        const rawFrame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        const parsed = parseArenaSseFrame(rawFrame);
        if (parsed) {
          if ("runId" in parsed.event && parsed.event.runId !== runId) throw new ArenaSseProtocolError("Arena 事件 runId 与当前运行不一致");
          const previousCursor = latestCursor ?? 0;
          if (parsed.cursor <= previousCursor) {
            boundary = nextSseBoundary(buffer);
            continue;
          }
          if (parsed.cursor !== previousCursor + 1) {
            throw new ArenaSseProtocolError(`Arena SSE 事件不连续：期待 ${previousCursor + 1}，收到 ${parsed.cursor}`);
          }
          options.onEvent(parsed.event, parsed.cursor);
          latestCursor = parsed.cursor;
          options.onCursor?.(parsed.cursor);
          if (isTerminalArenaEvent(parsed.event)) {
            options.onTerminal?.(parsed.event, parsed.cursor);
            await reader.cancel();
            return { cursor: latestCursor, terminal: parsed.event };
          }
        }
        boundary = nextSseBoundary(buffer);
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (buffer.trim()) throw new ArenaSseProtocolError("Arena SSE 在未完成帧中断开");
  return { cursor: latestCursor, terminal: null };
}

export function connectArenaEvents(
  request: ArenaEventRequest,
): ArenaEventConnection {
  const { options } = request;
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromParent();
  else options.signal?.addEventListener("abort", abortFromParent, { once: true });
  const done = consumeArenaEvents(request, controller).finally(() => {
    options.signal?.removeEventListener("abort", abortFromParent);
  });
  return { abort: (reason?: unknown) => controller.abort(reason), done };
}
