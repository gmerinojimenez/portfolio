import type { ConsoleEvent } from '../../components/console/core/events';
import type { LinkKind } from './links';

/**
 * The analytics event catalog. Every event the site sends is one of these;
 * `toCapture` is the only place that turns them into PostHog names and
 * properties, so what leaves the browser is easy to audit.
 */
export type AnalyticsEvent =
  | ConsoleEvent
  | { readonly type: 'pageview' }
  | { readonly type: 'link-clicked'; readonly kind: LinkKind };

/** What's known about the visit, attached to every event. */
export interface Session {
  readonly locale: string;
  readonly ref?: string | undefined;
  /** Validated `?company=` (S11), lowercase. */
  readonly company?: string | undefined;
  /** Validated `?track=` (S16): `ai` or `android`. */
  readonly track?: string | undefined;
}

export interface Capture {
  readonly name: string;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

/** Buckets the length of free text so the length alone says little. */
export function lengthBucket(length: number): string {
  if (length <= 20) return '1-20';
  if (length <= 80) return '21-80';
  if (length <= 200) return '81-200';
  return '200+';
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

/** Ids come from the code (command names, content slugs): keep them tame. */
function safeId(value: string): string {
  return ID_PATTERN.test(value) ? value : 'invalid';
}

export function toCapture(event: AnalyticsEvent, session: Session): Capture {
  const base: Record<string, string | number | boolean> = {
    locale: session.locale,
  };
  if (session.ref) base['ref'] = session.ref;
  if (session.company) base['company'] = session.company;
  if (session.track) base['track'] = session.track;
  const withBase = (
    name: string,
    extra: Record<string, string | number | boolean> = {},
  ): Capture => ({ name, properties: { ...base, ...extra } });

  switch (event.type) {
    case 'pageview':
      return withBase('$pageview');
    case 'boot':
      return withBase(
        event.outcome === 'skipped' ? 'boot_skipped' : 'boot_completed',
      );
    case 'command':
      return withBase('command_run', { command: safeId(event.command) });
    case 'unknown-input':
      return withBase('unknown_input', {
        length_bucket: lengthBucket(event.length),
      });
    case 'ai-answered':
      return withBase('ai_answered', { stop_reason: safeId(event.stopReason) });
    case 'ai-error':
      return withBase('ai_error', { code: safeId(event.code) });
    case 'company-node-clicked':
      return withBase('company_node_clicked');
    case 'offer-analyzed':
      return withBase('offer_analyzed', {
        matches: event.matches,
        gaps: event.gaps,
      });
    case 'stack-tech-clicked':
      return withBase('stack_tech_clicked', { tech: safeId(event.tech) });
    case 'card-opened':
      return withBase('card_opened', { item_id: safeId(event.itemId) });
    case 'link-clicked':
      return withBase('link_clicked', { kind: event.kind });
    case 'language-switched':
      return withBase('language_switched', {
        from: safeId(event.from),
        to: safeId(event.to),
      });
  }
}
