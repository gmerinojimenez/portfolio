/**
 * Opt-out signals the browser can send:
 * - Do Not Track (`navigator.doNotTrack === '1'`, `'yes'` in old browsers,
 *   `window.doNotTrack` in old Safari/IE, `msDoNotTrack` in old Edge);
 * - Global Privacy Control (`navigator.globalPrivacyControl === true`), the
 *   successor of DNT, with legal weight in some jurisdictions.
 * If either is on, analytics doesn't even load.
 */
export interface PrivacySignals {
  readonly doNotTrack?: string | null | undefined;
  readonly msDoNotTrack?: string | null | undefined;
  readonly windowDoNotTrack?: string | null | undefined;
  readonly globalPrivacyControl?: boolean | undefined;
}

const DNT_ON = new Set(['1', 'yes']);

export function isOptedOut(signals: PrivacySignals): boolean {
  if (signals.globalPrivacyControl === true) return true;
  return [
    signals.doNotTrack,
    signals.msDoNotTrack,
    signals.windowDoNotTrack,
  ].some((value) => value != null && DNT_ON.has(value));
}

/** Reads the signals from the browser. */
export function readPrivacySignals(
  nav: Navigator & {
    globalPrivacyControl?: boolean;
    msDoNotTrack?: string | null;
  },
  win: Window & { doNotTrack?: string | null },
): PrivacySignals {
  return {
    doNotTrack: nav.doNotTrack,
    msDoNotTrack: nav.msDoNotTrack,
    windowDoNotTrack: win.doNotTrack,
    globalPrivacyControl: nav.globalPrivacyControl,
  };
}
