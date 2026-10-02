export const AUDIO_CACHE_NAME = "tale-audio-cache-v1";

export function normalizeAudioUrl(url) {
  if (typeof url !== "string") return "";

  const trimmed = url.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return "";

  return trimmed;
}

export function getAudioCacheKey(url) {
  const normalized = normalizeAudioUrl(url);
  if (!normalized) return "";

  try {
    return new URL(normalized).toString();
  } catch (error) {
    return normalized;
  }
}

export async function readCachedAudioResponse(url, cacheStorage = globalThis.caches) {
  const normalized = normalizeAudioUrl(url);
  if (!normalized || !cacheStorage || typeof cacheStorage.open !== "function") return null;

  try {
    const cache = await cacheStorage.open(AUDIO_CACHE_NAME);
    return await cache.match(normalized);
  } catch (error) {
    console.warn("Kunne ikke lese cachet lyd:", error);
    return null;
  }
}

export async function cacheAudioResponse(url, response, cacheStorage = globalThis.caches) {
  const normalized = normalizeAudioUrl(url);
  if (!normalized || !response || !cacheStorage || typeof cacheStorage.open !== "function") return false;

  try {
    const cache = await cacheStorage.open(AUDIO_CACHE_NAME);
    await cache.put(normalized, response.clone());
    return true;
  } catch (error) {
    console.warn("Kunne ikke lagre lyd i cache:", error);
    return false;
  }
}
