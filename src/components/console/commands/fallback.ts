import { aiNotConfigured } from '../../ai/notices';
import type { FallbackHandler } from '../core/types';

/**
 * Answer for input that isn't a command when the build has no AI configured
 * (no `PUBLIC_AI_URL` or Turnstile key). `runtime.ts` replaces it with the
 * real AI handler when the configuration is there.
 */
export const aiUnavailable: FallbackHandler = (_input, ctx) => {
  ctx.print(aiNotConfigured(ctx));
};
