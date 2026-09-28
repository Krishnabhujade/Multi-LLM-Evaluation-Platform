import { redactSecrets } from "@/server/observability/redact";

/**
 * Minimal structured logger: one JSON object per line (what Vercel and most log pipelines
 * ingest best). Secret-looking fields are dropped and string values are redacted.
 */
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVEL_ORDER: Record<Level | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const SENSITIVE_KEY = /(api[-_]?key|token|secret|password|authorization|cookie)/i;

function threshold(): number {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  if (configured && configured in LEVEL_ORDER) {
    return LEVEL_ORDER[configured as keyof typeof LEVEL_ORDER];
  }
  return process.env.NODE_ENV === "test" ? LEVEL_ORDER.silent : LEVEL_ORDER.info;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSecrets(value.message),
      ...("code" in value && { code: value.code }),
    };
  }
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value))
    return depth > 3 ? "[…]" : value.map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    if (depth > 3) return "[…]";
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitize(entry, depth + 1),
      ]),
    );
  }
  return value;
}

export interface Logger {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
  child(bindings: Fields): Logger;
}

function createLogger(bindings: Fields = {}): Logger {
  const write = (level: Level, message: string, fields: Fields = {}) => {
    if (LEVEL_ORDER[level] < threshold()) return;
    const entry = sanitize({
      level,
      time: new Date().toISOString(),
      msg: message,
      ...bindings,
      ...fields,
    });
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
    child: (childBindings) => createLogger({ ...bindings, ...childBindings }),
  };
}

export const logger = createLogger();
