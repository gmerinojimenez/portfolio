import { CommandRegistry } from '../core/registry';
import { clear } from './clear';
import { contact } from './contact';
import { cat } from './cat';
import { cv } from './cv';
import { aiUnavailable } from './fallback';
import { help } from './help';
import { lang } from './lang';
import { ls } from './ls';
import { map } from './map';
import { analyzeOffer } from './offer';
import { stack } from './stack';
import { whoami } from './whoami';

/**
 * The console's commands, in `help` order. Later specs plug in here:
 * `ls`/`cat` come from S05; `map` is S07's semantic map; `analiza-oferta`
 * is S11's offer analyzer; `stack` is S15's technology catalog. The fallback is the "AI not configured" notice;
 * the browser runtime swaps in the real AI (S10) when the build has it.
 */
export function createRegistry(): CommandRegistry {
  return new CommandRegistry()
    .register(help)
    .register(whoami)
    .register(map)
    .register(ls)
    .register(stack)
    .register(cat)
    .register(cv)
    .register(contact)
    .register(analyzeOffer)
    .register(lang)
    .register(clear)
    .setFallback(aiUnavailable);
}
