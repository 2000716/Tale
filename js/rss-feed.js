const RSS_PROXY_URL = 'https://api.allorigins.win/get?url=';
const feedRequests = new Map();

function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function getElementsByLocalName(node, names) {
  if (!node) return [];
  const localNames = new Set(names.map(name => name.toLowerCase()));
  return Array.from(node.getElementsByTagName('*')).filter(element =>
    localNames.has((element.localName || element.tagName.split(':').pop()).toLowerCase())
  );
}

function getFirstElement(node, names) {
  return getElementsByLocalName(node, names)[0] || null;
}

function getTextContent(node, names = []) {
  return compactText(getFirstElement(node, names)?.textContent || '');
}

function readFirstAttribute(node, names, attribute) {
  for (const element of getElementsByLocalName(node, names)) {
    const value = element.getAttribute(attribute);
    if (value) return compactText(value);
  }
  return '';
}

function parseContentValue(rawValue) {
  if (!rawValue) return '';
  const trimmed = String(rawValue).trim();
  if (!trimmed) return '';
  return trimmed;
}

function toFeedItem(entry, fallbackImage = '') {
  const enclosure = getFirstElement(entry, ['enclosure']);
  const mediaContent = getFirstElement(entry, ['content', 'thumbnail']);
  const imageNode = getFirstElement(entry, ['image']);
  const descriptionNode = getFirstElement(entry, ['description', 'summary', 'encoded', 'content']);
  const audioUrl = enclosure?.getAttribute('url') || enclosure?.getAttribute('href') || '';
  const thumbnail = mediaContent?.getAttribute('url') || mediaContent?.getAttribute('href') || imageNode?.getAttribute('href') || imageNode?.getAttribute('url') || '';
  const title = getTextContent(entry, ['title']) || 'Uten tittel';
  const link = getTextContent(entry, ['link']) || entry.getAttribute('about') || '';
  const description = parseContentValue(descriptionNode?.textContent || '');

  return {
    title,
    link,
    description,
    summary: description,
    content: description,
    pubDate: getTextContent(entry, ['pubDate', 'published', 'updated']) || '',
    audioUrl,
    enclosure: {
      link: audioUrl,
      thumbnail,
      duration: getTextContent(entry, ['itunes:duration', 'duration']) || ''
    },
    duration: getTextContent(entry, ['itunes:duration', 'duration']) || '',
    thumbnail,
    itunes: {
      image: thumbnail,
      season: getTextContent(entry, ['itunes:season', 'season']) || '',
      episode: getTextContent(entry, ['itunes:episode', 'episode']) || ''
    },
    media: {
      content: { url: thumbnail || fallbackImage || '' },
      thumbnail: { url: thumbnail || fallbackImage || '' }
    },
    image: thumbnail || fallbackImage,
    cover: thumbnail || fallbackImage
  };
}

function parseFeedDocument(xmlText) {
  if (!xmlText) return { feed: null, items: [] };

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    return { feed: null, items: [] };
  }

  const feedRoot = doc.documentElement?.tagName?.toLowerCase() || '';
  const isAtom = feedRoot === 'feed';
  const channel = getFirstElement(doc, ['channel']);
  const channelTitle = getTextContent(channel, ['title']) || getTextContent(doc, ['title']);
  const channelDescription = getTextContent(channel, ['description', 'subtitle']) || getTextContent(doc, ['subtitle']);
  const channelLinkNode = getFirstElement(channel, ['link']) || getFirstElement(doc, ['link']);
  const channelLink = channelLinkNode?.getAttribute('href') || compactText(channelLinkNode?.textContent || '');

  const firstEntries = getElementsByLocalName(isAtom ? doc : (channel || doc), [isAtom ? 'entry' : 'item']);
  const items = firstEntries.map(entry => {
    if (isAtom) {
      const alternateLink = getElementsByLocalName(entry, ['link']).find(linkNode => !linkNode.getAttribute('rel') || linkNode.getAttribute('rel') === 'alternate');
      const entryImage = readFirstAttribute(entry, ['thumbnail', 'content', 'image'], 'url') || readFirstAttribute(entry, ['thumbnail', 'content', 'image'], 'href') || '';
      const contentText = getTextContent(entry, ['content', 'summary', 'description']);
      const title = getTextContent(entry, ['title']) || 'Uten tittel';
      return {
        title,
        link: alternateLink?.getAttribute('href') || getTextContent(entry, ['link']) || '',
        description: contentText,
        summary: contentText,
        content: contentText,
        pubDate: getTextContent(entry, ['published', 'updated', 'pubDate']) || '',
        audioUrl: readFirstAttribute(entry, ['enclosure'], 'url') || readFirstAttribute(entry, ['link'], 'href') || '',
        enclosure: {
          link: readFirstAttribute(entry, ['enclosure'], 'url') || '',
          thumbnail: entryImage,
          duration: getTextContent(entry, ['itunes:duration', 'duration']) || ''
        },
        duration: getTextContent(entry, ['itunes:duration', 'duration']) || '',
        thumbnail: entryImage,
        itunes: { image: entryImage, season: getTextContent(entry, ['itunes:season', 'season']) || '', episode: getTextContent(entry, ['itunes:episode', 'episode']) || '' },
        media: { content: { url: entryImage }, thumbnail: { url: entryImage } },
        image: entryImage,
        cover: entryImage
      };
    }

    return toFeedItem(entry, channel?.querySelector('image')?.querySelector('url')?.textContent || '');
  });

  return {
    feed: {
      title: channelTitle || doc.querySelector('title')?.textContent || '',
      description: channelDescription || '',
      link: channelLink || '',
      author: getTextContent(channel, ['author', 'managingEditor']) || '',
      category: getTextContent(channel, ['category']) || '',
      language: getTextContent(channel, ['language']) || '',
      image: getTextContent(getFirstElement(channel, ['image']), ['url'])
    },
    items
  };
}

export async function fetchRssFeed(rssUrl) {
  if (!rssUrl || !String(rssUrl).trim()) {
    return { feed: null, items: [] };
  }

  const rawUrl = String(rssUrl).trim();
  const existingRequest = feedRequests.get(rawUrl);
  if (existingRequest) return existingRequest;

  const request = loadRssFeed(rawUrl);
  feedRequests.set(rawUrl, request);
  return request;
}

async function loadRssFeed(rawUrl) {
  let lastError = null;
  const candidates = [rawUrl, `${RSS_PROXY_URL}${encodeURIComponent(rawUrl)}`];
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        lastError = new Error(`RSS-tjenesten svarte med HTTP ${response.status}.`);
        continue;
      }

      let xmlText = await response.text();
      if (url.startsWith(RSS_PROXY_URL)) {
        try {
          const proxyPayload = JSON.parse(xmlText);
          if (proxyPayload?.contents) {
            xmlText = proxyPayload.contents;
          } else if (proxyPayload?.data) {
            xmlText = proxyPayload.data;
          }
        } catch (error) {
          // AllOrigins can return plain XML; if so, keep the raw text.
        }
      }

      const parsed = parseFeedDocument(xmlText);
      if (parsed.items.length || parsed.feed?.title || parsed.feed?.description) {
        return parsed;
      }
      lastError = new Error('RSS-feeden inneholder ikke lesbare metadata eller episoder.');
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn('Kunne ikke lese RSS-feeden:', lastError);
  }

  return { feed: null, items: [] };
}
