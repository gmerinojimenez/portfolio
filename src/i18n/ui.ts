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
        'Cualquier otra cosa es una pregunta para la IA. ↑/↓ recorre el historial y Tab completa.',
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
    ls: {
      summary: 'lista de todo el contenido',
      usage: 'uso: ls [--tag <tag>]',
      empty: 'Aún no hay nada publicado.',
      unknownTag: 'ls: no hay nada con el tag',
      filteredBy: 'filtrado por',
      showAll: 'ver todo',
      tags: 'filtrar por tag:',
      hint: 'Pulsa un título o escribe cat <id> para abrir su card.',
    },
    cat: {
      summary: 'abre la card de un elemento',
      usage: 'uso: cat <id>  (los ids salen en ls)',
      unknown: 'cat: no existe',
      suggestions: '¿quizá?',
      opening: 'abriendo',
    },
    map: {
      summary: 'mapa de todo lo que he hecho',
      title: 'mapa semántico · en construcción',
      body: 'Aquí aparecerá todo lo que he hecho, agrupado por tema.',
      legend:
        '○ app · ◎ proyecto importante · □ estudios · ◇ librería · △ post',
    },
  },
  card: {
    close: 'Cerrar',
    inside: 'Dentro de:',
    related: 'Relacionado',
    links: 'Enlaces',
    fallback:
      'Este elemento aún no está traducido al inglés: se muestra en español.',
    present: 'hoy',
    types: {
      app: 'App',
      project: 'Proyecto',
      education: 'Estudios',
      post: 'Post',
      oss: 'Librería OSS',
    },
    contexts: {
      post: 'Blog',
      medium: 'Medium',
      oss: 'Open source',
      education: 'Formación',
      personal: 'Personal',
    },
  },
  nav: {
    label: 'Navegación',
    console: 'consola',
    reading: 'lectura',
    readingLabel: 'Versión de lectura',
    privacy: 'privacidad',
  },
  reading: {
    title: 'Versión de lectura · Portfolio',
    description:
      'Todo el portfolio en una página normal: experiencia en Android, full stack e IA aplicada, agrupada por tema.',
    intro: 'Lo mismo que la consola, en una página para leer de corrido.',
    contact: 'Contacto',
    topics: {
      android: 'Android',
      cloud: 'Cloud',
      ai: 'IA',
      fundamentals: 'Fundamentos',
      other: 'Otros',
    },
  },
  notFound: {
    title: 'Página no encontrada',
    body: 'Esta página no existe (o ya no).',
    home: 'Ir a la consola',
    reading: 'Ver la versión de lectura',
  },
  ai: {
    thinking: 'pensando…',
    sources: 'Fuentes:',
    meanwhile: 'Mientras, prueba:',
    notConfigured:
      'La IA todavía no está disponible en esta web: la estoy terminando. Los comandos sí funcionan, y puedes escribirme directamente.',
    cut: 'La respuesta se cortó por longitud. Pregunta por un detalle concreto para ver el resto.',
    refusal:
      'La IA ha preferido no responder a esto. Pregúntale por mi experiencia profesional.',
    retryIn: 'Vuelve a intentarlo en {time}.',
    tokensIn: '{n} tokens de entrada',
    tokensOut: '{n} de salida',
    cached: '{n} en caché',
    errors: {
      invalid_request:
        'No he podido leer la pregunta. Prueba con una más corta (máximo {max} caracteres).',
      forbidden_origin: 'Esta petición no viene de la web del portfolio.',
      turnstile_failed:
        'No he podido comprobar que no eres un bot. Recarga la página y vuelve a intentarlo.',
      method_not_allowed: 'Método no permitido.',
      rate_limited:
        'Has hecho muchas preguntas seguidas. Espera un poco y vuelve a intentarlo.',
      budget_exhausted:
        'La IA ha llegado a su límite de hoy. Mientras tanto, usa los comandos de la consola o escríbeme.',
      unavailable:
        'La IA no está disponible ahora mismo. Usa los comandos de la consola o escríbeme.',
      internal:
        'Algo ha fallado al responder. Usa los comandos de la consola o escríbeme.',
      network:
        'No he podido conectar con la IA. Revisa tu conexión y vuelve a intentarlo.',
      timeout: 'La IA ha tardado demasiado en responder. Inténtalo de nuevo.',
      interrupted: 'La respuesta se ha interrumpido. Inténtalo de nuevo.',
      bad_response:
        'La IA ha respondido algo que no entiendo. Inténtalo de nuevo más tarde.',
      turnstile_unavailable:
        'No he podido hacer la comprobación anti-bots (¿un bloqueador de anuncios?). Los comandos siguen funcionando.',
      too_long:
        'Esa pregunta es demasiado larga (máximo {max} caracteres). Acórtala y vuelve a intentarlo.',
      turn_limit:
        'Esta conversación ya tiene {questions} preguntas, el máximo. Empieza otra con:',
    },
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
        'Anything else is a question for the AI. ↑/↓ browses history and Tab completes.',
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
    ls: {
      summary: 'list everything',
      usage: 'usage: ls [--tag <tag>]',
      empty: 'Nothing published yet.',
      unknownTag: 'ls: nothing tagged',
      filteredBy: 'filtered by',
      showAll: 'show all',
      tags: 'filter by tag:',
      hint: 'Click a title or type cat <id> to open its card.',
    },
    cat: {
      summary: "open an item's card",
      usage: 'usage: cat <id>  (ids are listed by ls)',
      unknown: 'cat: no such item',
      suggestions: 'did you mean',
      opening: 'opening',
    },
    map: {
      summary: "map of everything I've done",
      title: 'semantic map · under construction',
      body: "Everything I've worked on will show up here, grouped by topic.",
      legend: '○ app · ◎ key project · □ education · ◇ library · △ post',
    },
  },
  card: {
    close: 'Close',
    inside: 'Part of:',
    related: 'Related',
    links: 'Links',
    fallback:
      "This item isn't translated into English yet, so it is shown in Spanish.",
    present: 'present',
    types: {
      app: 'App',
      project: 'Project',
      education: 'Education',
      post: 'Post',
      oss: 'OSS library',
    },
    contexts: {
      post: 'Blog',
      medium: 'Medium',
      oss: 'Open source',
      education: 'Education',
      personal: 'Personal',
    },
  },
  nav: {
    label: 'Navigation',
    console: 'console',
    reading: 'reading',
    readingLabel: 'Reading version',
    privacy: 'privacy',
  },
  reading: {
    title: 'Reading version · Portfolio',
    description:
      'The whole portfolio as a plain page: Android, full stack and applied AI experience, grouped by topic.',
    intro: 'Same as the console, as a page you can read top to bottom.',
    contact: 'Contact',
    topics: {
      android: 'Android',
      cloud: 'Cloud',
      ai: 'AI',
      fundamentals: 'Fundamentals',
      other: 'Other',
    },
  },
  notFound: {
    title: 'Page not found',
    body: "This page doesn't exist (or not anymore).",
    home: 'Go to the console',
    reading: 'See the reading version',
  },
  ai: {
    thinking: 'thinking…',
    sources: 'Sources:',
    meanwhile: 'Meanwhile, try:',
    notConfigured:
      "The AI isn't available on this site yet: I'm still finishing it. The commands work, and you can write to me directly.",
    cut: 'The answer was cut for length. Ask about a specific detail to see the rest.',
    refusal:
      'The AI preferred not to answer that. Ask it about my professional experience.',
    retryIn: 'Try again in {time}.',
    tokensIn: '{n} tokens in',
    tokensOut: '{n} out',
    cached: '{n} cached',
    errors: {
      invalid_request:
        'I could not read the question. Try a shorter one ({max} characters at most).',
      forbidden_origin: 'This request does not come from the portfolio site.',
      turnstile_failed:
        'I could not verify that you are not a bot. Reload the page and try again.',
      method_not_allowed: 'Method not allowed.',
      rate_limited: 'Too many questions in a row. Wait a moment and try again.',
      budget_exhausted:
        'The AI has reached its limit for today. Meanwhile, use the console commands or reach out to me.',
      unavailable:
        'The AI is not available right now. Use the console commands or reach out to me.',
      internal:
        'Something went wrong while answering. Use the console commands or reach out to me.',
      network: "I couldn't reach the AI. Check your connection and try again.",
      timeout: 'The AI took too long to answer. Try again.',
      interrupted: 'The answer was interrupted. Try again.',
      bad_response:
        "The AI sent something I don't understand. Try again later.",
      turnstile_unavailable:
        "I couldn't run the anti-bot check (an ad blocker, maybe?). The commands still work.",
      too_long:
        'That question is too long ({max} characters at most). Shorten it and try again.',
      turn_limit:
        'This conversation already has {questions} questions, the maximum. Start a new one with:',
    },
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
