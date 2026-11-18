import { CommandRegistry } from '../core/registry';
import { clear } from './clear';
import { contact } from './contact';
import { cv } from './cv';
import { aiComingSoon } from './fallback';
import { help } from './help';
import { lang } from './lang';
import { map } from './map';
import { whoami } from './whoami';

/**
 * The console's commands, in `help` order. Later specs plug in here:
 * S05 registers `ls`/`cat`, S07 replaces `map`, S10 replaces the fallback.
 */
export function createRegistry(): CommandRegistry {
  return new CommandRegistry()
    .register(help)
    .register(whoami)
    .register(map)
    .register(cv)
    .register(contact)
    .register(lang)
    .register(clear)
    .setFallback(aiComingSoon);
}
