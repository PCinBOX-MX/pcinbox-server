const sharedResponses = new Map<string, { at: number; value: unknown }>();
const sharedInflight = new Map<string, Promise<unknown>>();

/**
 * Una respuesta pública para todos los que piden lo mismo a la vez.
 * No guarda datos de un usuario.
 */
export async function getSharedJson<T>(
  key: string,
  loader: () => Promise<T>,
  ttlSec: number,
): Promise<T> {
  const ttlMs = ttlSec * 1000;
  if (sharedResponses.size > 200) {
    const now = Date.now();
    for (const [entryKey, entry] of sharedResponses) {
      if (now - entry.at >= ttlMs) sharedResponses.delete(entryKey);
    }
  }

  const fresh = sharedResponses.get(key);
  if (fresh && Date.now() - fresh.at < ttlMs) return fresh.value as T;

  const pending = sharedInflight.get(key);
  if (pending) return pending as Promise<T>;

  const run = (async () => {
    const value = await loader();
    sharedResponses.set(key, { at: Date.now(), value });
    return value;
  })().finally(() => {
    sharedInflight.delete(key);
  });

  sharedInflight.set(key, run);
  return run;
}
