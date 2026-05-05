export const logger = {
  info(message: string, meta?: unknown): void {
    log("info", message, meta);
  },
  warn(message: string, meta?: unknown): void {
    log("warn", message, meta);
  },
  error(message: string, meta?: unknown): void {
    log("error", message, meta);
  }
};

function log(level: "info" | "warn" | "error", message: string, meta?: unknown): void {
  const line = {
    level,
    message,
    time: new Date().toISOString(),
    ...(meta === undefined ? {} : { meta })
  };

  const serialized = JSON.stringify(line);
  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}
