const RSS_PROXY_URL = 'https://api.allorigins.win/get?url=';

function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function getTextContent(node, selectors = []) {
  if (!node) return '';
  for (const selector of selectors) {
    const match = node.querySelector(selector);
    if (match && match.textContent) {
      return compactText(match.textContent);
    }
  }
  return '';
}

function getAttribute(node, selector, attributeName) {
  if (!node) return '';
  const match = node.querySelector(selector);
  if (!match) return '';
  return compactText(match.getAttribute(attributeName) || '');
}

function readFirstAttribute(node, selectors, attribute) {
  for (const selector of selectors) {
    const match = node.querySelector(selector);
    if (match && match.getAttribute(attribute)) {
      return compactText(match.getAttribute(attribute));
    }
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
  const enclosure = entry.querySelector('enclosure');
  const mediaContent = entry.querySelector('media\:content') || entry.querySelector('media\:thumbnail') || entry.querySelector('media\:group');
  const imageNode = entry.querySelector('itunes\:image') || entry.querySelector('image');
  const descriptionNode = entry.querySelector('description') || entry.querySelector('summary') || entry.querySelector('content') || entry.querySelector('content\:encoded');
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
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    return { feed: null, items: [] };
  }

  const feedRoot = doc.documentElement?.tagName?.toLowerCase() || '';
  const isAtom = feedRoot === 'feed';
  const channel = doc.querySelector('channel');
  const channelTitle = getTextContent(channel, ['title']) || getTextContent(doc, ['title']);
  const channelDescription = getTextContent(channel, ['description', 'subtitle']) || getTextContent(doc, ['subtitle']);
  const channelLink = getTextContent(channel, ['link']) || doc.querySelector('link')?.getAttribute('href') || '';

  const firstEntries = isAtom ? Array.from(doc.querySelectorAll('entry')) : Array.from((channel || doc).querySelectorAll('item'));
  const items = firstEntries.map(entry => {
    if (isAtom) {
      const alternateLink = Array.from(entry.querySelectorAll('link')).find(linkNode => !linkNode.getAttribute('rel') || linkNode.getAttribute('rel') === 'alternate');
      const entryImage = readFirstAttribute(entry, ['media:thumbnail', 'media:content', 'image', 'itunes:image'], 'url') || readFirstAttribute(entry, ['media:thumbnail', 'media:content', 'image', 'itunes:image'], 'href') || '';
      const contentText = getTextContent(entry, ['content', 'summary', 'description']) || '';
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
      language: getTextContent(channel, ['language']) || ''
    },
    items
  };
}

export async function fetchRssFeed(rssUrl) {
  if (!rssUrl || !String(rssUrl).trim()) {
    return { feed: null, items: [] };
  }

  const rawUrl = String(rssUrl).trim();
  const candidates = [rawUrl];
  try {
    const proxiedUrl = `${RSS_PROXY_URL}${encodeURIComponent(rawUrl)}`;
    candidates.push(proxiedUrl);
  } catch (error) {
    // Ignore URL encoding issues and continue with the original feed.
  }

  let lastError = null;
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
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
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn('Kunne ikke lese RSS-feeden:', lastError);
  }

  return { feed: null, items: [] };
}
