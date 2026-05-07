import { NeorgLink, LinkType, LinkParseResult } from '../models/NeorgLink';
import { CANVAS_LINK_PREFIX } from '../models/Canvas';

export class NeorgLinkParser {
  private static linkPattern = /\{([^}]+)\}(?:\[([^\]]+)\])?/g;
  private static headingPattern = /^\*(.+)$/;
  private static filePattern = /^:(.+):$/;
  private static urlPattern = /^(https?:\/\/.+)$/i;
  private static canvasPattern = /^canvas:(.+)$/;

  static parseLinks(text: string): LinkParseResult {
    const links: NeorgLink[] = [];
    this.linkPattern.lastIndex = 0;
    let match: RegExpExecArray | null = this.linkPattern.exec(text);
    
    while (match !== null) {
      const fullMatch = match[0];
      const linkContent = match[1];
      const displayText = match[2];

      const link = this.parseSingleLink(linkContent, displayText, fullMatch);
      if (link) {
        links.push(link);
      }
      match = this.linkPattern.exec(text);
    }

    return {
      success: links.length > 0,
      links,
      text,
    };
  }

  private static parseSingleLink(
    content: string,
    displayText: string | undefined,
    original: string
  ): NeorgLink | null {
    const headingMatch = content.match(this.headingPattern);
    if (headingMatch) {
      return {
        type: 'heading',
        target: headingMatch[1].trim(),
        displayText,
        original,
      };
    }

    const fileMatch = content.match(this.filePattern);
    if (fileMatch) {
      return {
        type: 'file',
        target: fileMatch[1].trim(),
        displayText,
        original,
      };
    }

    const urlMatch = content.match(this.urlPattern);
    if (urlMatch) {
      return {
        type: 'url',
        target: urlMatch[1].trim(),
        displayText,
        original,
      };
    }

    const canvasMatch = content.match(this.canvasPattern);
    if (canvasMatch) {
      return {
        type: 'canvas',
        target: content.trim(),
        displayText,
        original,
      };
    }

    return {
      type: 'url',
      target: content.trim(),
      displayText,
      original,
    };
  }

  static toMarkdown(link: NeorgLink): string {
    const display = link.displayText || link.target;

    switch (link.type) {
      case 'heading':
        return `[#${link.target}](${display})`;
      case 'file':
        return `[${display}](${link.target})`;
      case 'url':
        return `[${display}](${link.target})`;
      case 'canvas':
        return `[${display}](canvas:${link.target})`;
      case 'anchor':
        return `[${display}](#${link.target})`;
      default:
        return display;
    }
  }

  static toReactNativeLink(link: NeorgLink): {
    type: LinkType;
    target: string;
    displayText: string;
    action: 'navigate' | 'openUrl' | 'openFile';
  } {
    const displayText = link.displayText || link.target;

    switch (link.type) {
      case 'heading':
        return {
          type: 'heading',
          target: link.target,
          displayText,
          action: 'navigate',
        };
      case 'url':
        return {
          type: 'url',
          target: link.target,
          displayText,
          action: 'openUrl',
        };
      case 'file':
        return {
          type: 'file',
          target: link.target,
          displayText,
          action: 'openFile',
        };
      case 'canvas':
        return {
          type: 'canvas',
          target: link.target,
          displayText,
          action: 'navigate',
        };
      case 'anchor':
        return {
          type: 'anchor',
          target: link.target,
          displayText,
          action: 'navigate',
        };
      default:
        return {
          type: 'url',
          target: link.target,
          displayText,
          action: 'openUrl',
        };
    }
  }
}