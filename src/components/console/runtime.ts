/**
 * Browser side of the console. It takes over the HTML rendered at build time
 * by `Console.astro` and makes it interactive: input, history, completion,
 * buttons and the animated boot. All command logic lives in `commands/` and
 * `core/`; this file only wires it to the DOM.
 */
import { createAiAssistant, type AiAssistant } from '../ai/controller';
import { resolveAiConfig } from '../ai/config';
import { localeFromPath } from '../../i18n/paths';
import { readCompany, withCompany } from '../../lib/company';
import type { Locale } from '../../lib/locales';
import { useTranslations } from '../../i18n/ui';
import { createRegistry } from './commands';
import { createOfferCommand } from './commands/offer';
import type { ConsoleData } from './data';
import { Animator, typeInto } from './core/animator';
import { complete } from './core/complete';
import { execute } from './core/execute';
import { emitConsoleEvent, type ConsoleEvent } from './core/events';
import { History } from './core/history';
import { markup, type Html } from './core/html';
import { FALLBACK_OUTPUT, echoLine, outputBlock } from './core/blocks';
import type { Command, CommandContext } from './core/types';

const HISTORY_KEY = 'console:history';
const BOOT_SEEN_KEY = 'console:boot-seen';

interface Payload {
  readonly locale: Locale;
  readonly data: ConsoleData;
}

const storage = {
  get(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Storage can be unavailable (private mode, blocked cookies): ignore.
    }
  },
};

function loadHistory(): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.get(HISTORY_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((e): e is string => typeof e === 'string')
      : [];
  } catch {
    return [];
  }
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Console: missing ${selector}`);
  return element;
}

export function startConsole(root: HTMLElement): ConsoleHandle {
  const payload = JSON.parse(
    required(root, '[data-console-data]').textContent ?? '{}',
  ) as Payload;
  const { locale, data } = payload;
  const t = useTranslations(locale);
  const registry = createRegistry();
  const log = required<HTMLElement>(root, '[data-console-log]');
  const form = required<HTMLFormElement>(root, '[data-console-form]');
  const input = required<HTMLInputElement>(root, '[data-console-input]');
  const skipButton = required<HTMLButtonElement>(root, '[data-console-skip]');
  const docEl = document.documentElement;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animator = new Animator(reducedMotion);
  const history = new History(loadHistory());

  // Announces what happens to whoever listens (analytics). Ids only.
  const emit = (event: ConsoleEvent) => emitConsoleEvent(root, event);

  // `?company=` (S11): validated once, kept in the URL (reload and share keep
  // the future node) and carried over to the other language.
  const company = readCompany(location.search);
  if (company) {
    root.querySelectorAll<HTMLAnchorElement>('a[data-lang]').forEach((link) => {
      link.href = withCompany(link.getAttribute('href') ?? '', company);
    });
  }

  // The AI answers whatever isn't a command. Without a backend URL and a
  // Turnstile key in the build, the registry keeps its "not configured"
  // notice and nothing is ever requested.
  const aiConfig = resolveAiConfig({
    PUBLIC_AI_URL: import.meta.env.PUBLIC_AI_URL,
    PUBLIC_TURNSTILE_SITE_KEY: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
  });
  let assistant: AiAssistant | undefined;
  if (aiConfig) {
    assistant = createAiAssistant({
      config: aiConfig,
      log,
      emit,
      turnstileContainer: () => {
        let host = root.querySelector<HTMLElement>('[data-turnstile]');
        if (!host) {
          host = document.createElement('div');
          host.className = 'c-turnstile';
          host.dataset['turnstile'] = '';
          form.before(host);
        }
        return host;
      },
    });
    registry.setFallback(assistant.fallback);
    const ai = assistant;
    registry.register(
      createOfferCommand((offer, ctx) => ai.analyzeOffer(offer, ctx)),
      { replace: true },
    );
  }

  // ---------- Output ----------

  const scrollToEnd = () => {
    log.scrollTop = log.scrollHeight;
  };

  function append(content: Html): HTMLElement {
    const template = document.createElement('template');
    template.innerHTML = content.value;
    const element = template.content.firstElementChild as HTMLElement;
    log.append(element);
    scrollToEnd();
    return element;
  }

  /** Marks the log busy so screen readers don't read letter by letter. */
  async function whileBusy(task: () => Promise<void>): Promise<void> {
    log.setAttribute('aria-busy', 'true');
    try {
      await task();
    } finally {
      log.removeAttribute('aria-busy');
    }
  }

  function makeContext(command: Command | undefined): CommandContext {
    const ctx: CommandContext = {
      locale,
      t,
      data,
      registry,
      pathname: location.pathname,
      interactive: true,
      company,
      print(content) {
        const name = command?.name ?? FALLBACK_OUTPUT;
        const element = append(outputBlock(name, content));
        command?.enhance?.(element, ctx);
      },
      clear() {
        log.replaceChildren();
        assistant?.reset(); // a new screen, a new conversation
      },
      navigate(url) {
        storage.set(BOOT_SEEN_KEY, '1');
        const to = localeFromPath(url);
        if (to && to !== locale) {
          emit({ type: 'language-switched', from: locale, to });
        }
        location.assign(to ? withCompany(url, company) : url);
      },
      download(url, filename) {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
      },
      sleep: (ms) => animator.sleep(ms),
    };
    return ctx;
  }

  // Hydrate output rendered at build time (e.g. S07's map).
  log.querySelectorAll<HTMLElement>('[data-output-of]').forEach((element) => {
    const command = registry.resolve(element.dataset.outputOf ?? '');
    command?.enhance?.(element, makeContext(command));
  });

  // ---------- Running commands ----------

  // Runs are chained so output never interleaves. A new run first skips any
  // animation in progress (boot or typing), so the console never feels stuck.
  let queue: Promise<void> = Promise.resolve();

  function submit(line: string, typed: boolean): Promise<void> {
    animator.skip();
    queue = queue
      .then(async () => {
        animator.resume();
        await runLine(line, typed);
      })
      .catch((error: unknown) => console.error(error));
    return queue;
  }

  async function runLine(line: string, typed: boolean): Promise<void> {
    const value = line.trim();
    if (!value) return;
    history.push(value);
    storage.set(HISTORY_KEY, JSON.stringify(history.entries));
    const echo = append(echoLine(t.console.prompt, value));
    if (typed && !animator.instant) {
      const text = echo.querySelector('.c-echo-text');
      if (text) await whileBusy(() => typeInto(text, value, animator));
    }
    const run = await execute(value, registry, makeContext);
    if (run?.command) emit({ type: 'command', command: run.command.name });
    else if (run) emit({ type: 'unknown-input', length: value.length });
  }

  // ---------- Boot ----------

  async function boot(): Promise<void> {
    const animate = docEl.classList.contains('boot-anim');
    docEl.setAttribute('data-console-ready', '');
    if (!animate) return finishBoot();

    const stopOnKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' && event.key !== 'Shift') animator.skip();
    };
    const stopOnPointer = () => animator.skip();
    document.addEventListener('keydown', stopOnKey);
    log.addEventListener('pointerdown', stopOnPointer);
    skipButton.hidden = false;

    await whileBusy(async () => {
      for (const step of log.querySelectorAll<HTMLElement>('[data-boot]')) {
        const text = step.querySelector('.c-echo-text');
        if (step.dataset.boot === 'echo' && text) {
          const command = text.textContent ?? '';
          step.dataset.shown = 'echo';
          scrollToEnd();
          await animator.sleep(400);
          await typeInto(text, command, animator, 70);
          await animator.sleep(300);
        }
        step.dataset.shown = 'all';
        scrollToEnd();
        await animator.sleep(500);
      }
    });

    document.removeEventListener('keydown', stopOnKey);
    log.removeEventListener('pointerdown', stopOnPointer);
    const skipped = animator.instant;
    const skipHadFocus = document.activeElement === skipButton;
    skipButton.hidden = true;
    docEl.classList.remove('boot-anim');
    animator.resume();
    if (skipHadFocus) input.focus();
    emit({ type: 'boot', outcome: skipped ? 'skipped' : 'completed' });
    finishBoot();
  }

  /**
   * The boot ends with the career tree, which grows upwards from the earliest
   * years: start with the bottom of the drawing at the bottom of the log, so
   * its base is in view (on phones the legend below it would push it out).
   */
  function scrollToTreeBase(): void {
    const canvas = log.querySelector<HTMLElement>('.m-canvas');
    if (!canvas) return scrollToEnd();
    const margin = 12;
    const canvasBottom =
      canvas.getBoundingClientRect().bottom -
      log.getBoundingClientRect().top +
      log.scrollTop;
    log.scrollTop = canvasBottom + margin - log.clientHeight;
  }

  function finishBoot(): void {
    storage.set(BOOT_SEEN_KEY, '1');
    scrollToTreeBase();
    // Focus the prompt on devices with a mouse; on touch screens this would
    // pop up the keyboard and hide the hero.
    const nothingFocused =
      document.activeElement === null ||
      document.activeElement === document.body;
    if (nothingFocused && matchMedia('(pointer: fine)').matches) {
      input.focus({ preventScroll: true });
    }
  }

  skipButton.addEventListener('click', () => animator.skip());
  queue = queue.then(boot).catch((error: unknown) => console.error(error));

  // ---------- Input ----------

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value;
    input.value = '';
    history.reset();
    void submit(value, false);
  });

  // Tab lists the candidates once; a second Tab with the same input lets the
  // browser move focus as usual, so keyboard users are never trapped.
  let listedFor: string | null = null;

  input.addEventListener('input', () => {
    listedFor = null;
  });

  input.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const value =
        event.key === 'ArrowUp'
          ? history.previous(input.value)
          : history.next();
      event.preventDefault();
      if (value === undefined) return;
      input.value = value;
      input.setSelectionRange(value.length, value.length);
      return;
    }

    if (event.key === 'Tab' && !event.shiftKey && input.value.trim()) {
      const result = complete(input.value, registry, makeContext(undefined));
      if (result.value !== input.value) {
        event.preventDefault();
        input.value = result.value;
        listedFor = null;
      } else if (result.candidates.length > 1 && listedFor !== input.value) {
        event.preventDefault();
        listedFor = input.value;
        const list = result.candidates.join('   ');
        append(markup`<div class="c-out c-dim c-candidates">${list}</div>`);
      }
    }
  });

  // ---------- Buttons ----------

  // One listener for every `[data-cmd]` button, including buttons inside
  // output added later (event delegation).
  root.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLElement | SVGElement>('[data-cmd]');
    if (button?.dataset.cmd) {
      // The map's future node is an SVG link (focusable, Enter clicks it).
      if (button.tagName.toLowerCase() === 'a') event.preventDefault();
      if (button.hasAttribute('data-company-node')) {
        emit({ type: 'company-node-clicked' });
      }
      void submit(button.dataset.cmd, true).then(() => {
        // If the button disappeared (e.g. after `clear`), keep focus usable.
        if (!button.isConnected) input.focus({ preventScroll: true });
      });
      return;
    }

    const langLink = target?.closest<HTMLAnchorElement>('a[data-lang]');
    if (langLink && event instanceof MouseEvent && !isModified(event)) {
      event.preventDefault();
      void submit(`lang ${langLink.dataset.lang ?? ''}`, true);
    }
  });

  return {
    locale,
    data,
    // Where focus goes when nothing better exists (e.g. closing a card the
    // page opened on load): the prompt with a mouse, the log on touch
    // screens so the keyboard doesn't pop up.
    focusTarget: () => (matchMedia('(pointer: fine)').matches ? input : log),
  };
}

export interface ConsoleHandle extends Payload {
  readonly focusTarget: () => HTMLElement;
}

function isModified(event: MouseEvent): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}
