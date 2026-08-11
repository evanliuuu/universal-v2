/** Read Vite or Node env vars without throwing outside the bundler. */
export function readEnv(key: string): string | undefined {
  const meta = import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  };
  const fromMeta = meta.env?.[key];
  if (typeof fromMeta === "string" && fromMeta.length > 0) return fromMeta;

  if (typeof process !== "undefined" && process.env) {
    const fromProcess = process.env[key];
    if (typeof fromProcess === "string" && fromProcess.length > 0) {
      return fromProcess;
    }
  }
  return undefined;
}
