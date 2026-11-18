import { markup, type Html } from './html';

// Output markup is kept on one line on purpose: whitespace inside these
// templates would show up in the console (echo lines use `pre-wrap`).

/** Output blocks of input that isn't a command use this name. */
export const FALLBACK_OUTPUT = 'fallback';

/**
 * A clickable command. The runtime runs it through event delegation on
 * `[data-cmd]`, so it also works inside output rendered at build time.
 */
export function commandButton(command: string, label?: Html | string): Html {
  return markup`<button type="button" class="c-cmd" data-cmd="${command}">${label ?? command}</button>`;
}

/** The "prompt + command" line echoed before each output. */
export function echoLine(prompt: string, command: string): Html {
  return markup`<div class="c-echo"><span class="c-prompt" aria-hidden="true">${prompt}</span> <span class="c-echo-text">${command}</span></div>`;
}

/** Wraps a command's output; `enhance` hooks find it by `data-output-of`. */
export function outputBlock(commandName: string, content: Html): Html {
  return markup`<div class="c-out" data-output-of="${commandName}">${content}</div>`;
}
