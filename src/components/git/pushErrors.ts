/**
 * Typed push-failure classification for the floating git button.
 *
 * The engine throws `GitEngineError` (message + `corruption` + optional
 * `code`) and returns `PushResult.nonFastForward` for rejected pushes. This
 * maps both into a small set of user-meaningful categories so the banner can
 * say *why* a push failed (auth / permission / transport / rejected / repo).
 */

export type PushErrorKind =
  | 'auth'
  | 'permission'
  | 'transport'
  | 'rejected'
  | 'corruption'
  | 'unknown';

export interface PushFailure {
  kind: PushErrorKind;
  /** Human-facing category label. */
  label: string;
  /** Raw engine message. */
  message: string;
}

const KIND_LABEL: Record<PushErrorKind, string> = {
  auth: 'Authentication failed',
  permission: 'Permission denied',
  transport: 'Network error',
  rejected: 'Push rejected',
  corruption: 'Repository needs repair',
  unknown: 'Push failed',
};

function messageOf(error: unknown): string {
  let message: string;
  if (error instanceof Error) message = error.message;
  else if (typeof error === 'string') message = error;
  else {
    try {
      message = JSON.stringify(error);
    } catch {
      message = String(error);
    }
  }
  // The bridge serializes errors as `Git(message: "...", corruption: ..) (at ..)`;
  // surface the inner human-readable message when present.
  const inner = /message:\s*"([^"]*)"/.exec(message);
  if (inner && inner[1]) return inner[1];
  return message;
}

/** Classify a thrown engine error from `GitEngine.push`. */
export function classifyPushError(error: unknown): PushFailure {
  const message = messageOf(error);
  const lower = message.toLowerCase();

  // Match auth/permission/transport before the corruption flag: the serialized
  // error text embeds a literal `corruption:` field, so that flag alone would
  // misroute authentication failures as repo corruption.
  let kind: PushErrorKind;
  if (/non-fast-forward|fetch first|fast-forward|not fast.forward/i.test(lower)) {
    kind = 'rejected';
  } else if (/permission|denied|access|forbidden|\b403\b|prohibited/i.test(lower)) {
    kind = 'permission';
  } else if (
    /auth|credential|\b401\b|invalid username|could not read username|repository not found|not found|bad credentials/i.test(
      lower,
    )
  ) {
    kind = 'auth';
  } else if (
    /network|connect|timeout|timed out|resolve|dns|tls|ssl|certificate|unreachable|offline|econnrefused|enotfound|connection/i.test(
      lower,
    )
  ) {
    kind = 'transport';
  } else if ((error as { corruption?: boolean } | null)?.corruption === true) {
    kind = 'corruption';
  } else {
    kind = 'unknown';
  }

  return { kind, label: KIND_LABEL[kind], message };
}

/** Classify a non-exception rejection (`PushResult.pushed === false`). */
export function rejectedPushFailure(message: string | undefined): PushFailure {
  const text = message && message.length > 0 ? message : 'The remote rejected the push.';
  const base = classifyPushError(new Error(text));
  // A non-fast-forward result is a rejection even if the text doesn't say so.
  if (base.kind === 'unknown') {
    return { kind: 'rejected', label: KIND_LABEL.rejected, message: text };
  }
  return base;
}
