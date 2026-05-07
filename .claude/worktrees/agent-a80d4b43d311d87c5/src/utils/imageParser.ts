export interface NoteImage {
  uri: string;
  alt: string;
  caption?: string;
}

export function parseMarkdownImages(content: string): NoteImage[] {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images: NoteImage[] = [];
  let match: RegExpExecArray | null;

  do {
    match = imageRegex.exec(content);
    if (match) {
      images.push({
        alt: match[1] || '',
        uri: match[2],
      });
    }
  } while (match);

  return images;
}

export function parseNeorgImages(content: string): NoteImage[] {
  const imageRegex = /!\[([^\]]*)\]\{([^}]+)\}/g;
  const images: NoteImage[] = [];
  let match: RegExpExecArray | null;

  do {
    match = imageRegex.exec(content);
    if (match) {
      const alt = match[1] || '';
      const attrs = match[2];
      
      let uri = '';
      let caption = '';
      
      const uriMatch = attrs.match(/src:\s*([^,\s]+)/);
      if (uriMatch) uri = uriMatch[1];
      
      const captionMatch = attrs.match(/caption:\s*"([^"]+)"/);
      if (captionMatch) caption = captionMatch[1];

      if (uri) {
        images.push({ alt, uri, caption });
      }
    }
  } while (match);

  return images;
}

export function getFirstImage(content: string): string | null {
  const images = parseMarkdownImages(content);
  return images.length > 0 ? images[0].uri : null;
}

export function hasImages(content: string): boolean {
  return parseMarkdownImages(content).length > 0 || parseNeorgImages(content).length > 0;
}