const FEED_CACHE_TTL = 15 * 60 * 1000;
const REQUEST_TIMEOUT = 8000;
const MAX_FEED_ITEMS = 1000;
const inFlightRequests = new Map();

export function getCachedPodcastFeed(rssUrl) {
  if (!rssUrl) return null;

  const cacheKey = getCacheKey(rssUrl);
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    return Array.isArray(cached?.items) ? { ...cached, feed: cached.feed || {} } : null;
  } catch (error) {
    console.warn("Kunne ikke lese bufret podkast-feed:", error);
    try {
      localStorage.removeItem(cacheKey);
    } catch (removeError) {
      console.warn("Kunne ikke fjerne ugyldig podkast-cache:", removeError);
    }
    return null;
  }
}

export function fetchPodcastFeed(rssUrl) {
  if (!rssUrl) return Promise.reject(new Error("Podkasten mangler en RSS-adresse."));

  const cached = getCachedPodcastFeed(rssUrl);
  if (cached?.expiresAt > Date.now()) return Promise.resolve(cached);

  const existingRequest = inFlightRequests.get(rssUrl);
  if (existingRequest) return existingRequest;

  const request = loadPodcastFeed(rssUrl, cached)
    .finally(() => inFlightRequests.delete(rssUrl));
  inFlightRequests.set(rssUrl, request);
  return request;
}

async function loadPodcastFeed(rssUrl, staleCache) {
  try {
    try {
      const data = await fetchWithTimeout(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&count=${MAX_FEED_ITEMS}`,
        response => response.json()
      );
      if (data.status !== "ok") {
        throw new Error(data.message || "RSS-tjenesten kunne ikke lese feeden.");
      }
      if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new Error("RSS-tjenesten fant ingen episoder i feeden.");
      }
      return saveFeed(rssUrl, {
        feed: data.feed || {},
        items: data.items
      });
    } catch (primaryError) {
      console.warn("RSS-tjenesten kunne ikke hente feeden, prøver direkte RSS-lesing:", primaryError);
      const xmlText = await fetchWithTimeout(
        `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`,
        response => response.text(),
        "RSS-reserven"
      );
      const xml = new DOMParser().parseFromString(xmlText, "text/xml");
      if (xml.querySelector("parsererror")) throw new Error("RSS-feedens XML kunne ikke leses.");
      const feedData = parseXmlFeed(xml);
      if (!feedData.items.length) throw new Error("RSS-feeden inneholder ingen episoder.");
      return saveFeed(rssUrl, feedData);
    }
  } catch (error) {
    if (staleCache) {
      console.warn("Bruker bufret podkast-feed fordi oppdatering feilet:", error);
      return staleCache;
    }
    throw error;
  }
}

async function fetchWithTimeout(url, readBody, serviceName = "RSS-tjenesten") {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${serviceName} svarte med ${response.status}`);
    return await readBody(response);
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseXmlFeed(xml) {
  const channel = xml.querySelector("channel") || xml.documentElement;
  const feedLink = findElement(channel, "link");
  const feedImage = findElement(channel, "image");
  const feed = {
    title: childText(channel, "title"),
    description: childText(channel, "description") || childText(channel, "summary") || childText(channel, "subtitle"),
    link: feedLink?.getAttribute("href") || feedLink?.textContent?.trim() || "",
    image: childText(feedImage, "url") || feedImage?.getAttribute("href") || "",
    author: childText(channel, "author") || childText(channel, "creator"),
    category: childText(channel, "category")
  };
  const items = Array.from(xml.getElementsByTagName("*"))
    .filter(element => element.localName === "item" || element.localName === "entry")
    .map(element => parseXmlItem(element));

  return { feed, items };
}

function parseXmlItem(element) {
  const children = Array.from(element.getElementsByTagName("*"));
  const enclosure = children.find(child => child.localName === "enclosure");
  const atomEnclosure = children.find(child => child.localName === "link" && child.getAttribute("rel") === "enclosure");
  const mediaAudio = children.find(child =>
    child.localName === "content"
    && (child.getAttribute("medium") === "audio" || child.getAttribute("type")?.startsWith("audio/"))
  );
  const image = children.find(child => child.localName === "image" && child.getAttribute("href"));
  const mediaImage = children.find(child =>
    child.localName === "thumbnail"
    || (child.localName === "content" && child.getAttribute("type")?.startsWith("image/"))
  );
  const description = childText(element, "encoded")
    || childText(element, "description")
    || childText(element, "summary")
    || childText(element, "content");
  const link = findElement(element, "link");

  return {
    title: childText(element, "title"),
    link: link?.getAttribute("href") || link?.textContent?.trim() || "",
    description,
    pubDate: childText(element, "pubDate") || childText(element, "published") || childText(element, "updated"),
    thumbnail: image?.getAttribute("href")
      || image?.textContent?.trim()
      || mediaImage?.getAttribute("url")
      || mediaImage?.getAttribute("href")
      || "",
    enclosure: {
      link: enclosure?.getAttribute("url") || atomEnclosure?.getAttribute("href") || mediaAudio?.getAttribute("url") || "",
      duration: childText(element, "duration"),
      thumbnail: ""
    },
    itunes: {
      image: findElement(element, "image")?.getAttribute("href") || "",
      season: childText(element, "season"),
      episode: childText(element, "episode")
    },
    season: childText(element, "season"),
    episode: childText(element, "episode")
  };
}

function findElement(parent, localName) {
  if (!parent) return null;
  return Array.from(parent.children || []).find(element => element.localName === localName) || null;
}

function childText(parent, localName) {
  return findElement(parent, localName)?.textContent?.trim() || "";
}

function saveFeed(rssUrl, feedData) {
  const cached = {
    ...feedData,
    expiresAt: Date.now() + FEED_CACHE_TTL
  };
  try {
    localStorage.setItem(getCacheKey(rssUrl), JSON.stringify(cached));
  } catch (error) {
    console.warn("Kunne ikke lagre podkast-feed lokalt:", error);
  }
  return cached;
}

function getCacheKey(rssUrl) {
  return `tale_feed_${encodeURIComponent(rssUrl)}`;
}
