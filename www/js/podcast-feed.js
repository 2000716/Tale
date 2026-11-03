const FEED_CACHE_TTL = 15 * 60 * 1000;
const REQUEST_TIMEOUT = 8000;
const MAX_FEED_ITEMS = 1000;
const inFlightRequests = new Map();
const FEED_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`
];

export function getCachedPodcastFeed(rssUrl) {
  if (typeof rssUrl !== "string" || !rssUrl.trim()) return null;

  const cacheKey = getCacheKey(rssUrl.trim());
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    return cached
      && Array.isArray(cached.items)
      && cached.feed
      && typeof cached.feed === "object"
      ? cached
      : null;
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
  if (typeof rssUrl !== "string" || !rssUrl.trim()) {
    return Promise.reject(new Error("Podkasten mangler en RSS-adresse."));
  }
  rssUrl = rssUrl.trim();

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
    const data = await fetchWithTimeout(
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&count=${MAX_FEED_ITEMS}`,
      response => response.json()
    );
    if (data?.status === "ok" && Array.isArray(data.items)) {
      return saveFeed(rssUrl, {
        feed: normalizeFeed(data.feed),
        items: data.items.slice(0, MAX_FEED_ITEMS).map(normalizeJsonItem)
      });
    }

    throw new Error(data?.message || "RSS-tjenesten returnerte ugyldige data.");
  } catch (error) {
    const errors = [error];
    for (const createProxyUrl of FEED_PROXIES) {
      try {
        const xmlText = await fetchWithTimeout(
          createProxyUrl(rssUrl),
          response => response.text(),
          "RSS-reserven"
        );
        const xml = new DOMParser().parseFromString(xmlText, "text/xml");
        const feedData = parseXmlFeed(xml);
        return saveFeed(rssUrl, feedData);
      } catch (proxyError) {
        errors.push(proxyError);
      }
    }

    if (staleCache) {
      console.warn("Bruker bufret podkast-feed fordi oppdatering feilet:", errors);
      return staleCache;
    }

    throw new Error(`Kunne ikke hente RSS-feeden: ${errors.map(item => item.message).join("; ")}`);
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
  if (xml.querySelector("parsererror")) throw new Error("RSS-feedens XML kunne ikke leses.");

  const channel = findDescendant(xml.documentElement, "channel")
    || (xml.documentElement?.localName === "feed" ? xml.documentElement : null);
  if (!channel) throw new Error("RSS-reserven returnerte ikke en gyldig RSS- eller Atom-feed.");

  const feedLink = childElements(channel, "link")
    .find(element => element.getAttribute("rel") !== "enclosure") || null;
  const feedImage = findElement(channel, "image");
  const feed = {
    title: childText(channel, "title"),
    description: childText(channel, "description") || childText(channel, "summary") || childText(channel, "subtitle"),
    link: feedLink?.getAttribute("href") || feedLink?.textContent?.trim() || "",
    image: childText(feedImage, "url") || feedImage?.getAttribute("href") || childText(channel, "logo"),
    author: childText(channel, "author") || childText(channel, "creator") || childText(channel, "name"),
    category: childText(channel, "category")
  };
  const items = [...childElements(channel, "item"), ...childElements(channel, "entry")]
    .slice(0, MAX_FEED_ITEMS)
    .map(parseXmlItem);

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
  const links = childElements(element, "link");
  const pageLink = links.find(child => child.getAttribute("rel") !== "enclosure");
  const description = childText(element, "encoded")
    || childText(element, "description")
    || childText(element, "summary")
    || childText(element, "content");
  const season = childText(element, "season");
  const episode = childText(element, "episode");

  return {
    title: childText(element, "title"),
    link: pageLink?.getAttribute("href") || pageLink?.textContent?.trim() || "",
    description,
    pubDate: childText(element, "pubDate") || childText(element, "published") || childText(element, "updated") || childText(element, "date"),
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
      season,
      episode
    },
    season,
    episode
  };
}

function normalizeFeed(feed = {}) {
  if (!feed || typeof feed !== "object") feed = {};
  return {
    ...feed,
    title: feed.title || "",
    description: feed.description || feed.summary || "",
    link: feed.link || "",
    image: feed.image || "",
    author: feed.author || feed.owner || "",
    category: feed.category || ""
  };
}

function normalizeJsonItem(item = {}) {
  if (!item || typeof item !== "object") item = {};
  const enclosure = typeof item.enclosure === "string"
    ? { link: item.enclosure }
    : item.enclosure || {};
  const itunes = item.itunes || {};
  const season = itunes.season ?? item.season ?? "";
  const episode = itunes.episode ?? item.episode ?? "";

  return {
    ...item,
    title: item.title || "",
    link: item.link || "",
    pubDate: item.pubDate || item.published || item.updated || "",
    description: item.description || item.content || item.summary || "",
    thumbnail: item.thumbnail || itunes.image || "",
    enclosure: {
      ...enclosure,
      link: enclosure.link || item.enclosureUrl || "",
      duration: enclosure.duration || item.duration || "",
      thumbnail: enclosure.thumbnail || ""
    },
    itunes: { ...itunes, image: itunes.image || "", season, episode },
    season,
    episode
  };
}

function findElement(parent, localName) {
  if (!parent) return null;
  return Array.from(parent.children || []).find(element => element.localName === localName) || null;
}

function childElements(parent, localName) {
  return Array.from(parent?.children || []).filter(element => element.localName === localName);
}

function findDescendant(parent, localName) {
  return Array.from(parent?.getElementsByTagName("*") || [])
    .find(element => element.localName === localName) || null;
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
