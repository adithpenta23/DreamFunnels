import { describe, expect, it } from "vitest"
import { createLogger, redact, type LogRecord, type LogThreshold } from "./logger"

function collectingLogger(level: LogThreshold) {
  const records: LogRecord[] = []
  const lines: string[] = []
  const logger = createLogger({
    level,
    format: "json",
    sink: (record, line) => {
      records.push(record)
      lines.push(line)
    },
  })
  return { logger, records, lines }
}

describe("createLogger", () => {
  it("drops records below the configured level", () => {
    const { logger, records } = collectingLogger("warn")
    logger.debug("debug.event")
    logger.info("info.event")
    logger.warn("warn.event")
    logger.error("error.event")
    expect(records.map((r) => r.event)).toEqual(["warn.event", "error.event"])
  })

  it("is completely quiet when silent", () => {
    const { logger, records } = collectingLogger("silent")
    logger.error("error.event")
    expect(records).toHaveLength(0)
  })

  it("emits one JSON object per line with level, time, event and context", () => {
    const { logger, lines } = collectingLogger("debug")
    logger.info("workspace.created", { workspaceId: "ws_1" })
    const parsed = JSON.parse(lines[0] ?? "") as Record<string, unknown>
    expect(parsed).toMatchObject({ level: "info", event: "workspace.created", workspaceId: "ws_1" })
    expect(typeof parsed.time).toBe("string")
  })

  it("merges child bindings into every record without letting context override core fields", () => {
    const { logger, records } = collectingLogger("debug")
    logger.child({ requestId: "req_1" }).info("child.event", { event: "spoofed", level: "error" })
    expect(records[0]).toMatchObject({ requestId: "req_1", event: "child.event", level: "info" })
  })
})

describe("redact", () => {
  it("masks sensitive keys at any depth", () => {
    expect(
      redact({
        user: { id: "u1", password: "hunter2" },
        headers: { authorization: "Bearer abc", cookie: "sb=1" },
        apiKey: "k",
        SUPABASE_SECRET_KEY: "s",
        accessToken: "t",
      })
    ).toEqual({
      user: { id: "u1", password: "[REDACTED]" },
      headers: { authorization: "[REDACTED]", cookie: "[REDACTED]" },
      apiKey: "[REDACTED]",
      SUPABASE_SECRET_KEY: "[REDACTED]",
      accessToken: "[REDACTED]",
    })
  })

  it("serialises errors, including their cause", () => {
    const error = new Error("outer", { cause: new Error("inner") })
    expect(redact(error)).toMatchObject({
      name: "Error",
      message: "outer",
      cause: { name: "Error", message: "inner" },
    })
  })

  it("keeps AppError diagnostics but still redacts secrets inside them", () => {
    const error = Object.assign(new Error("Failed"), {
      context: { status: 503, token: "abc" },
    })
    expect(redact(error)).toMatchObject({ context: { status: 503, token: "[REDACTED]" } })
  })

  it("stops at a maximum depth instead of recursing forever", () => {
    let nested: Record<string, unknown> = { value: "leaf" }
    for (let i = 0; i < 10; i++) nested = { nested }
    expect(JSON.stringify(redact(nested))).toContain("[Truncated]")
  })
})
