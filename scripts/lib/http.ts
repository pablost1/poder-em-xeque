import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const RAW_DIR = path.join(process.cwd(), "data", "raw");

function cachePath(url: string): string {
  const h = crypto.createHash("sha1").update(url).digest("hex");
  return path.join(RAW_DIR, h.slice(0, 2), `${h}.json`);
}

/**
 * GET a JSON URL with on-disk caching (so ingestion is resumable and cheap to
 * re-run) and retry with backoff. Pass `cache: false` for volatile lists.
 */
export async function getJson<T = unknown>(
  url: string,
  opts: { cache?: boolean; retries?: number } = {},
): Promise<T> {
  const { cache = true, retries = 5 } = opts;
  const file = cachePath(url);
  if (cache && fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status === 404) return { dados: [] } as T; // treated as "no data"
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      const json = JSON.parse(text) as T;
      if (cache) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
      }
      return json;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

/** Run `fn` over `items` with bounded concurrency. */
export async function pool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}
