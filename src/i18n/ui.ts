import type { Locale } from '../lib/locales';

/**
 * UI strings for both languages. Content (name, projects…) is not here: it
 * comes from the data layer. Spanish is the reference; English must have the
 * exact same shape (enforced by the `UiStrings` type).
 */
const es = {
  meta: {
    title: 'Portfolio · Software engineer',
    description:
      'Portfolio en forma de consola: experiencia en Android, full stack e IA aplicada.',
  },
  console: {
    label: 'Consola del portfolio',
    windowTitle: 'visitante@portfolio: ~',
    prompt: 'visitante@portfolio:~$',
    inputLabel: 'Escribe un comando o una pregunta',
    placeholder: 'escribe un comando o una pregunta',
    logLabel: 'Salida de la consola',
    quickCommandsLabel: 'Comandos rápidos',
    languageLabel: 'Idioma',
    skipBoot: 'saltar intro',
    noscript:
      'La consola necesita JavaScript para escribir comandos. Lo importante está arriba, y aquí tienes cómo contactarme:',
  },
  boot: {
    hintBefore: 'portfolio v0.1 · escribe ',
    hintAfter: ' o usa los botones de abajo',
    suggestion: 'Pregúntame lo que quieras en lenguaje natural, p. ej. ',
    sampleQuestion: '¿Ha trabajado con apps reguladas?',
    quickQuestion: '¿Qué experiencia tiene con IA en producción?',
    quickQuestionLabel: '¿experiencia con IA?',
  },
  commands: {
    help: {
      summary: 'lista de comandos',
      heading: 'comandos disponibles:',
      footer:
        'Cualquier otra cosa se la preguntarás a la IA (muy pronto). ↑/↓ recorre el historial y Tab completa.',
    },
    whoami: { summary: 'quién soy' },
    clear: { summary: 'limpiar la consola' },
    lang: {
      summary: 'cambiar de idioma',
      usage: 'uso: lang es|en',
      current: 'idioma actual: español',
      already: 'ya estás en español',
      switching: 'cambiando a',
      unknown: 'lang: idioma desconocido:',
      names: { es: 'español', en: 'English' },
    },
    cv: {
      summary: 'descargar el CV',
      downloading: 'descargando',
      fallbackLink: 'si no empieza, descárgalo aquí',
      missing: 'El CV en PDF aún no está publicado. Mientras, escríbeme:',
    },
    contact: { summary: 'cómo contactarme', email: 'email' },
    map: {
      summary: 'mapa de todo lo que he hecho',
      title: 'mapa semántico · en construcción',
      body: 'Aquí aparecerá todo lo que he hecho, agrupado por tema.',
      legend:
        '○ app · ◎ proyecto importante · □ estudios · ◇ librería · △ post',
    },
  },
  fallback: {
    aiSoon: 'La IA aún no está conectada: llega muy pronto. Mientras, prueba ',
  },
};

export type UiStrings = typeof es;

const en: UiStrings = {
  meta: {
    title: 'Portfolio · Software engineer',
    description:
      'A portfolio you can type into: Android, full stack and applied AI experience.',
  },
  console: {
    label: 'Portfolio console',
    windowTitle: 'visitor@portfolio: ~',
    prompt: 'visitor@portfolio:~$',
    inputLabel: 'Type a command or a question',
    placeholder: 'type a command or a question',
    logLabel: 'Console output',
    quickCommandsLabel: 'Quick commands',
    languageLabel: 'Language',
    skipBoot: 'skip intro',
    noscript:
      'The console needs JavaScript to run commands. The essentials are above, and here is how to reach me:',
  },
  boot: {
    hintBefore: 'portfolio v0.1 · type ',
    hintAfter: ' or use the buttons below',
    suggestion: 'Ask me anything in plain language, e.g. ',
    sampleQuestion: 'Has he worked on regulated apps?',
    quickQuestion: 'What experience does he have with AI in production?',
    quickQuestionLabel: 'AI experience?',
  },
  commands: {
    help: {
      summary: 'list of commands',
      heading: 'available commands:',
      footer:
        'Anything else goes to the AI (coming very soon). ↑/↓ browses history and Tab completes.',
    },
    whoami: { summary: 'who I am' },
    clear: { summary: 'clear the console' },
    lang: {
      summary: 'switch language',
      usage: 'usage: lang es|en',
      current: 'current language: English',
      already: 'you are already in English',
      switching: 'switching to',
      unknown: 'lang: unknown language:',
      names: { es: 'español', en: 'English' },
    },
    cv: {
      summary: 'download my CV',
      downloading: 'downloading',
      fallbackLink: "if it doesn't start, download it here",
      missing: "The PDF CV isn't published yet. Meanwhile, drop me a line:",
    },
    contact: { summary: 'how to reach me', email: 'email' },
    map: {
      summary: "map of everything I've done",
      title: 'semantic map · under construction',
      body: "Everything I've worked on will show up here, grouped by topic.",
      legend: '○ app · ◎ key project · □ education · ◇ library · △ post',
    },
  },
  fallback: {
    aiSoon:
      "The AI isn't connected yet: it's coming very soon. Meanwhile, try ",
  },
};

export const ui: Record<Locale, UiStrings> = { es, en };

export function useTranslations(locale: Locale): UiStrings {
  return ui[locale];
}

/** A value with one variant per language. */
export type Localized<T = string> = Record<Locale, T>;

/** Builds a `Localized` value by picking the same key from every language. */
export function pick<T>(select: (t: UiStrings) => T): Localized<T> {
  return { es: select(es), en: select(en) };
}
