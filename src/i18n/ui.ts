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
    sampleQuestion: '¿Ha trabajado en apps con millones de usuarios?',
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
      summary: 'mi trayectoria como un árbol que crece',
      label:
        'Árbol de mi trayectoria: formación en las raíces, etapas profesionales en el tronco y proyectos personales en un tallo propio',
      hint: 'Crece de abajo arriba, de la formación a hoy. Pasa el ratón o usa Tab para ver las conexiones; pulsa un elemento para abrir su card.',
      hintTouch:
        'Crece de abajo arriba, de la formación a hoy. Toca un elemento para ver sus conexiones y abrir su card.',
      stages: {
        tuenti: 'Tuenti',
        merlyn: 'Merlyn',
      } as Record<string, string>,
      stage: 'Etapa',
      roots: 'Formación',
      rootsLine: 'raíces',
      rootsBadge: 'Ed',
      rootsCount: '{n} títulos y certificados',
      ordinal: '{n}º',
      personal: 'Proyectos personales',
      replay: 'repetir',
      replayLabel: 'Repetir la animación del árbol',
      types: 'tipos',
      topics: 'temas',
      filterTypes: 'Filtrar por tipo',
      filterTopics: 'Filtrar por tema',
      panelIdle: 'Enfoca un elemento para ver sus conexiones.',
      connections: 'Conexiones',
      noConnections: 'sin conexiones',
      openCard: 'abrir card',
      list: 'ver como lista',
      empty: 'Aún no hay nada en el mapa. Prueba ',
      future: '¿{company}?',
      nextChapter: '¿Siguiente capítulo?',
      futureAction: 'Analiza la oferta con la IA',
      futureCommand: 'analiza-oferta',
    },
    stack: {
      summary: 'tecnologías agrupadas por stack',
      heading:
        'Stack: tecnologías con las que he trabajado, con sus años y proyectos.',
      hint: 'Pulsa una tecnología para ver dónde la usé y resaltarla en el árbol.',
      unknown: 'stack: no conozco esa tecnología',
      empty: 'Aún no hay tecnologías publicadas.',
      projects: '{n} proyectos',
      project: '1 proyecto',
      usedIn: 'Dónde usé {tech}',
      showInTree: 'ver en el árbol',
      clearFilter: 'quitar filtro',
      filtered: 'El árbol muestra solo los proyectos con {tech}.',
    },
    offer: {
      summary: 'analiza cómo encajo en una oferta',
      intro:
        'Pega la descripción de una oferta y la IA la compara con mi experiencia: qué encaja, con proyectos concretos, y qué huecos hay.',
      introCompany:
        'Pega la descripción de la oferta de {company} y la IA la compara con mi experiencia: qué encaja, con proyectos concretos, y qué huecos hay.',
      label: 'Descripción de la oferta',
      placeholder: 'Pega aquí el texto de la oferta…',
      submit: 'analizar',
      hint: 'Ctrl/⌘ + Enter para enviar · máximo {max} caracteres',
      counter: '{n} / {max}',
      privacy:
        'El texto se envía a Anthropic para analizarlo y se guarda 90 días en el registro de preguntas, como las preguntas a la IA.',
      empty: 'Pega primero el texto de la oferta.',
      tooLong:
        'La oferta es demasiado larga (máximo {max} caracteres). Recórtala y vuelve a intentarlo.',
      invalid:
        'No he podido leer la oferta. Revisa que no supere los {max} caracteres y vuelve a intentarlo.',
      rateLimited:
        'Has pedido muchos análisis seguidos (máximo {perDay} al día). Vuelve a intentarlo más tarde o escríbeme.',
      analyzing: 'analizando la oferta…',
      heading: 'Análisis de la oferta',
      headingCompany: 'Análisis de la oferta de {company}',
      matches: 'Lo que encaja',
      gaps: 'Huecos',
      questions: 'Preguntas para la entrevista',
      noMatches: 'El portfolio no muestra experiencia directa con lo que pide.',
      noGaps: 'No veo huecos claros con lo que cuenta el portfolio.',
      unreadable:
        'La IA no ha devuelto un análisis válido. Inténtalo de nuevo más tarde.',
    },
  },
  card: {
    close: 'Cerrar',
    inside: 'Dentro de:',
    related: 'Relacionado',
    stack: 'Stack',
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
    stack: 'Stack',
    stackIntro:
      'Tecnologías con las que he trabajado, agrupadas por stack, con sus años y los proyectos donde las usé.',
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
    sampleQuestion: 'Has he worked on apps with millions of users?',
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
      summary: 'my career as a growing tree',
      label:
        'My career as a tree: education in the roots, career stages on the trunk and side projects on a stem of their own',
      hint: 'It grows bottom to top, from education to today. Hover or use Tab to see the connections; click an item to open its card.',
      hintTouch:
        'It grows bottom to top, from education to today. Tap an item to see its connections and open its card.',
      stages: {
        tuenti: 'Tuenti',
        merlyn: 'Merlyn',
      } as Record<string, string>,
      stage: 'Stage',
      roots: 'Education',
      rootsLine: 'roots',
      rootsBadge: 'Ed',
      rootsCount: '{n} degrees and certificates',
      ordinal: '{n}',
      personal: 'Personal projects',
      replay: 'replay',
      replayLabel: 'Replay the tree animation',
      types: 'types',
      topics: 'topics',
      filterTypes: 'Filter by type',
      filterTopics: 'Filter by topic',
      panelIdle: 'Focus an item to see its connections.',
      connections: 'Connections',
      noConnections: 'no connections',
      openCard: 'open card',
      list: 'view as a list',
      empty: 'Nothing on the map yet. Try ',
      future: '{company}?',
      nextChapter: 'Next chapter?',
      futureAction: 'Analyze the job offer with the AI',
      futureCommand: 'analyze-job',
    },
    stack: {
      summary: 'technologies grouped by stack',
      heading:
        "Stack: technologies I've worked with, with their years and projects.",
      hint: 'Click a technology to see where I used it and highlight it in the tree.',
      unknown: "stack: I don't know that technology",
      empty: 'No technologies published yet.',
      projects: '{n} projects',
      project: '1 project',
      usedIn: 'Where I used {tech}',
      showInTree: 'show in the tree',
      clearFilter: 'clear filter',
      filtered: 'The tree only shows the projects with {tech}.',
    },
    offer: {
      summary: 'see how I fit a job offer',
      intro:
        'Paste a job description and the AI compares it with my experience: what fits, with concrete projects, and where the gaps are.',
      introCompany:
        "Paste {company}'s job description and the AI compares it with my experience: what fits, with concrete projects, and where the gaps are.",
      label: 'Job description',
      placeholder: 'Paste the job description here…',
      submit: 'analyze',
      hint: 'Ctrl/⌘ + Enter to send · {max} characters at most',
      counter: '{n} / {max}',
      privacy:
        'The text is sent to Anthropic for the analysis and kept for 90 days in the question log, like questions to the AI.',
      empty: 'Paste the job description first.',
      tooLong:
        'The job description is too long ({max} characters at most). Trim it and try again.',
      invalid:
        "I couldn't read the job description. Check it isn't over {max} characters and try again.",
      rateLimited:
        'Too many analyses in a row ({perDay} a day at most). Try again later or reach out to me.',
      analyzing: 'analyzing the job offer…',
      heading: 'Job offer analysis',
      headingCompany: "{company}'s job offer analysis",
      matches: 'What fits',
      gaps: 'Gaps',
      questions: 'Questions for the interview',
      noMatches:
        "The portfolio doesn't show direct experience with what it asks for.",
      noGaps: "I don't see clear gaps with what the portfolio covers.",
      unreadable: "The AI didn't return a valid analysis. Try again later.",
    },
  },
  card: {
    close: 'Close',
    inside: 'Part of:',
    related: 'Related',
    stack: 'Stack',
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
    stack: 'Stack',
    stackIntro:
      "Technologies I've worked with, grouped by stack, with their years and the projects where I used them.",
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
