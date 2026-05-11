// Resolves the app-internal `gitnotes://repo-image/<owner>/<repo>/<branch>/<path>`
// image scheme that `NoteGitHubSyncService.uploadLocalImages` writes for
// **private** repos (#733). The renderer can't load these directly because
// `https://raw.githubusercontent.com/...` 404s on private repos and signed
// `?token=` raw URLs expire after a few minutes — so we fetch the bytes via
// the authenticated Contents API on demand and inline them as a `data:` URI.
//
// Public-repo images keep using the cheap raw URL (cacheable on GitHub's CDN,
// no token needed). This module is a no-op for content that contains no
// `gitnotes://repo-image/...` URIs.

import { GitHubService } from '../services/GitHubService';

const GITNOTES_IMAGE_URI_RE = /gitnotes:\/\/repo-image\/([^/\s)]+)\/([^/\s)]+)\/([^/\s)]+)\/([^\s)]+)/g;

// Per-process cache: `gitnotes://...` URI → resolved `data:` URI. Resolution
// is deterministic given the same URI for as long as the file's bytes haven't
// changed on GitHub. A ref pinned to a branch can shift, but in practice the
// upload writes a single immutable image path per attachment, so re-edits of
// the *note* don't need to re-fetch the *image*. We accept that an out-of-band
// overwrite of the image at the same path won't be picked up until the JS
// bundle restarts — that mirrors how the rest of the app caches GitHub reads.
const dataUriCache = new Map<string, string>();

// Per-process in-flight dedupe so two simultaneous renders of the same note
// (preview + viewer, mode flips) don't issue parallel Contents API calls for
// the same image.
const inFlight = new Map<string, Promise<string | null>>();

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot >= 0 ? lower.slice(dot + 1) : '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'bmp':
      return 'image/bmp';
    default:
      // Best-effort fallback. Most note images are jpg/png from the picker.
      return 'image/jpeg';
  }
}

interface ParsedGitnotesImage {
  uri: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

function parseGitnotesImage(uri: string): ParsedGitnotesImage | null {
  const m = uri.match(/^gitnotes:\/\/repo-image\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!m) return null;
  try {
    return {
      uri,
      owner: decodeURIComponent(m[1]),
      repo: decodeURIComponent(m[2]),
      branch: decodeURIComponent(m[3]),
      path: m[4],
    };
  } catch {
    return null;
  }
}

async function resolveOne(parsed: ParsedGitnotesImage, opts?: { tokenOverride?: string }): Promise<string | null> {
  const cached = dataUriCache.get(parsed.uri);
  if (cached) return cached;

  const inflight = inFlight.get(parsed.uri);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const base64 = await GitHubService.getFileBase64(
        parsed.owner,
        parsed.repo,
        parsed.path,
        parsed.branch,
        opts,
      );
      if (!base64) return null;
      const dataUri = `data:${mimeFromPath(parsed.path)};base64,${base64}`;
      dataUriCache.set(parsed.uri, dataUri);
      return dataUri;
    } catch (error) {
      console.warn('[gitnotesImageResolver] Failed to resolve image:', parsed.uri, error);
      return null;
    } finally {
      inFlight.delete(parsed.uri);
    }
  })();

  inFlight.set(parsed.uri, promise);
  return promise;
}

/**
 * Returns true iff `content` contains at least one `gitnotes://repo-image/`
 * URI. Cheap pre-check so callers can skip the resolver entirely for the
 * common case (most notes have no images, or only the public raw URL form).
 */
export function hasGitnotesImageUris(content: string): boolean {
  return content.includes('gitnotes://repo-image/');
}

/**
 * Walks `content`, fetches every `gitnotes://repo-image/...` image via the
 * authenticated Contents API, and replaces each occurrence with a
 * `data:<mime>;base64,...` URI. Failures leave the original URI in place
 * (the renderer will show its built-in broken-image fallback).
 *
 * Resolutions are cached in-memory keyed by the URI, so repeat renders of
 * the same note don't re-hit the network.
 */
export async function resolveGitnotesImageUris(
  content: string,
  opts?: { tokenOverride?: string },
): Promise<string> {
  if (!hasGitnotesImageUris(content)) return content;

  // Collect unique URIs first so a note with the same image inserted twice
  // only fetches once.
  const seen = new Set<string>();
  const targets: ParsedGitnotesImage[] = [];
  let match: RegExpExecArray | null;
  GITNOTES_IMAGE_URI_RE.lastIndex = 0;
  while ((match = GITNOTES_IMAGE_URI_RE.exec(content)) !== null) {
    const uri = match[0];
    if (seen.has(uri)) continue;
    seen.add(uri);
    const parsed = parseGitnotesImage(uri);
    if (parsed) targets.push(parsed);
  }
  if (targets.length === 0) return content;

  const resolutions = await Promise.all(targets.map((t) => resolveOne(t, opts)));

  let out = content;
  targets.forEach((target, i) => {
    const replacement = resolutions[i];
    if (!replacement) return;
    // Replace every occurrence of this URI in the content.
    out = out.split(target.uri).join(replacement);
  });
  return out;
}
