import type { Locale } from '../../lib/locales';

/**
 * Text of the privacy page in both languages. `TODO` marks personal data
 * (name, contact) that is filled in at publication time and never lives in
 * the repository. The retention period must match what S09 implements.
 */
export interface PrivacySection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly items?: readonly string[];
}

export interface PrivacyContent {
  readonly title: string;
  readonly description: string;
  readonly back: string;
  readonly updated: string;
  readonly sections: readonly PrivacySection[];
}

const es: PrivacyContent = {
  title: 'Privacidad',
  description:
    'Qué datos recoge esta web, para qué se usan y cómo ejercer tus derechos.',
  back: '← volver a la consola',
  updated: 'Última actualización: 2026',
  sections: [
    {
      heading: 'Quién es el responsable',
      paragraphs: [
        'Responsable del tratamiento: Guillermo Merino Jiménez. Contacto: gmerinojimenez@gmail.com.',
      ],
    },
    {
      heading: 'Resumen',
      paragraphs: [
        'Esta web no usa cookies ni guarda nada en tu navegador para seguirte. Por eso no hay banner de cookies. Hay dos cosas que se procesan: unas estadísticas de uso anónimas y, si tú lo decides, las preguntas que le haces a la IA.',
      ],
    },
    {
      heading: 'Estadísticas de uso',
      paragraphs: [
        'Uso PostHog (servidores en la Unión Europea) en modo sin cookies, para saber qué partes de la web se visitan y mejorar el contenido. No se guarda ningún identificador en tu dispositivo, no se siguen tus visitas entre días ni entre webs, y no se graban pantallas ni lo que escribes en la consola. La IP se usa en el momento de la petición para distinguir visitas de forma anónima y no se guarda.',
        'Se registran estos eventos, sin texto libre:',
      ],
      items: [
        'visita a una página, con el idioma;',
        'si la animación de inicio terminó o se saltó;',
        'qué comando de la consola se ejecutó (solo su nombre);',
        'que escribiste algo que no era un comando (solo una franja de longitud, no el texto);',
        'qué tarjeta de contenido se abrió;',
        'qué tipo de enlace se pulsó (correo, GitHub, LinkedIn, CV u otro), sin la dirección;',
        'si cambiaste de idioma;',
        'que pulsaste el nodo de la empresa en el mapa;',
        'que se completó un análisis de oferta (solo cuántas coincidencias y carencias, no el texto).',
      ],
    },
    {
      heading: 'Enlaces con código (?ref=)',
      paragraphs: [
        'Si llegaste desde un enlace con un código corto (por ejemplo ?ref=empresa-x), ese código se guarda junto a tus eventos de esa visita y se quita de la barra de direcciones. Sirve para saber a qué candidatura corresponde el enlace: identifica el enlace que compartí, no a ti.',
        'Si el enlace lleva el nombre de una empresa (por ejemplo ?company=Amazon), ese nombre se muestra en la página, se mantiene en la dirección y también se guarda junto a tus eventos. Igual que el código, identifica el enlace que compartí, no a ti.',
        'Si el enlace indica un perfil (?track=ai o ?track=android), la página destaca ese perfil, se mantiene en la dirección y el perfil se guarda junto a tus eventos. También identifica el enlace que compartí, no a ti.',
      ],
    },
    {
      heading: 'Preguntas a la IA',
      paragraphs: [
        'Si escribes una pregunta en lenguaje natural, se envía a Anthropic (API de Claude), que la procesa para generar la respuesta. Anthropic actúa como encargado del tratamiento y puede tratar los datos fuera de la UE.',
        'Antes, la pregunta y los últimos mensajes de la conversación se envían a TypeSafe AI, que comprueba si la pregunta trata de mi perfil profesional. Si claramente no, se responde sin llamar a Claude. TypeSafe AI actúa como encargado del tratamiento, trata los datos en EE. UU. y no entrena modelos con ellos. No recibe tu IP.',
        'Para revisar cómo funciona el chat, la pregunta, los mensajes de la conversación y la respuesta se envían también a LangSmith (LangChain), una herramienta de trazas. LangChain actúa como encargado del tratamiento y guarda los datos en la UE durante 14 días. No recibe tu IP.',
        'Además, guardo en AWS (región eu-north-1, Estocolmo) la pregunta, la respuesta, el idioma y el consumo de tokens, para controlar costes y mejorar el contenido. Este registro no incluye tu IP y se borra a los 90 días.',
        'Lo mismo vale para el comando analiza-oferta: el texto de la oferta que pegues se envía a Anthropic para analizarlo, y la oferta, el análisis y el nombre de la empresa (si el enlace lo traía) se guardan en ese mismo registro durante 90 días. Cada IP puede pedir como mucho 5 análisis al día.',
        'Para limitar abusos, tu IP se convierte con un hash irreversible (nunca se guarda en claro) y se usa solo como contador de peticiones por minuto y por día. Esos contadores se borran solos en menos de dos días.',
        'Antes de enviar una pregunta, Cloudflare Turnstile comprueba que no eres un bot. Su script solo se carga cuando haces la primera pregunta, y Cloudflare procesa datos técnicos del navegador para esa comprobación.',
        'No escribas datos personales ni confidenciales en el campo de preguntas.',
      ],
    },
    {
      heading: 'Lo que se guarda en tu navegador',
      paragraphs: [
        'Ninguna cookie. En localStorage solo se guarda el último idioma que viste (`es` o `en`), para que la portada te lleve a él. La consola usa sessionStorage para recordar el historial de comandos y que ya viste la animación de inicio, y se borra al cerrar la pestaña. Nada de esto se envía a ningún sitio.',
        'Las fuentes se sirven desde esta misma web, sin llamadas a Google Fonts.',
      ],
    },
    {
      heading: 'No rastrear',
      paragraphs: [
        'Si tu navegador envía la señal No rastrear (Do Not Track) o Control Global de Privacidad (GPC), las estadísticas ni siquiera se cargan.',
      ],
    },
    {
      heading: 'Tus derechos',
      paragraphs: [
        'Puedes pedir acceso, rectificación, supresión, limitación u oposición al tratamiento, y reclamar ante la Agencia Española de Protección de Datos (aepd.es). Escribe a TODO (email). Como las estadísticas son anónimas y no te identifican, no puedo localizar tus datos en ellas; para las preguntas a la IA, indica la fecha aproximada y el contenido de la pregunta.',
      ],
    },
  ],
};

const en: PrivacyContent = {
  title: 'Privacy',
  description:
    'What data this site collects, what it is used for and how to exercise your rights.',
  back: '← back to the console',
  updated: 'Last updated: 2026',
  sections: [
    {
      heading: 'Who is responsible',
      paragraphs: [
        'Data controller: Guillermo Merino Jiménez. Contact: gmerinojimenez@gmail.com.',
      ],
    },
    {
      heading: 'Summary',
      paragraphs: [
        'This site uses no cookies and stores nothing in your browser to track you, so there is no cookie banner. Two things are processed: anonymous usage statistics and, only if you choose to ask, the questions you send to the AI.',
      ],
    },
    {
      heading: 'Usage statistics',
      paragraphs: [
        'I use PostHog (servers in the European Union) in cookieless mode, to learn which parts of the site get visited and improve the content. No identifier is stored on your device, your visits are not followed across days or across other sites, and neither screens nor what you type in the console are recorded. Your IP address is used at request time to tell visits apart anonymously and is not stored.',
        'These events are recorded, with no free text:',
      ],
      items: [
        'a page visit, with its language;',
        'whether the intro animation finished or was skipped;',
        'which console command ran (its name only);',
        'that you typed something that was not a command (only a length range, not the text);',
        'which content card was opened;',
        'which kind of link was clicked (email, GitHub, LinkedIn, CV or other), without the address;',
        'whether you switched language;',
        'that you clicked the company node in the map;',
        'that a job description analysis finished (only how many matches and gaps, not the text).',
      ],
    },
    {
      heading: 'Links with a code (?ref=)',
      paragraphs: [
        'If you arrived through a link with a short code (for example ?ref=company-x), that code is stored with your events for that visit and removed from the address bar. It tells me which application the link belonged to: it identifies the link I shared, not you.',
        'If the link carries a company name (for example ?company=Amazon), that name is shown on the page, kept in the address and also stored with your events. Like the code, it identifies the link I shared, not you.',
        'If the link names a profile (?track=ai or ?track=android), the page highlights that profile, keeps it in the address and stores it with your events. It too identifies the link I shared, not you.',
      ],
    },
    {
      heading: 'Questions to the AI',
      paragraphs: [
        'If you type a question in natural language, it is sent to Anthropic (Claude API), which processes it to generate the answer. Anthropic acts as a processor and may process data outside the EU.',
        'Before that, the question and the latest messages of the conversation are sent to TypeSafe AI, which checks whether the question is about my professional profile. If it clearly is not, the answer is given without calling Claude. TypeSafe AI acts as a processor, processes the data in the US and does not train models on it. It does not receive your IP address.',
        'To review how the chat works, the question, the messages of the conversation and the answer are also sent to LangSmith (LangChain), a tracing tool. LangChain acts as a processor and keeps the data in the EU for 14 days. It does not receive your IP address.',
        'I also store in AWS (eu-north-1 region, Stockholm) the question, the answer, the language and token usage, to control costs and improve the content. This log does not include your IP address and is deleted after 90 days.',
        'The same applies to the analyze-job command: the job description you paste is sent to Anthropic to be analyzed, and the description, the analysis and the company name (if the link had one) are kept in that same log for 90 days. Each IP address can ask for at most 5 analyses a day.',
        'To limit abuse, your IP address is turned into an irreversible hash (it is never stored in plain form) and used only as a per-minute and per-day request counter. Those counters delete themselves within two days.',
        'Before a question is sent, Cloudflare Turnstile checks that you are not a bot. Its script only loads when you ask your first question, and Cloudflare processes technical browser data for that check.',
        'Please do not type personal or confidential data into the question field.',
      ],
    },
    {
      heading: 'What is stored in your browser',
      paragraphs: [
        'No cookies. localStorage only keeps the last language you viewed (`es` or `en`), so the home page takes you back to it. The console uses sessionStorage to remember your command history and that you already saw the intro animation, cleared when you close the tab. None of this is sent anywhere.',
        'Fonts are served from this same site, with no calls to Google Fonts.',
      ],
    },
    {
      heading: 'Do Not Track',
      paragraphs: [
        'If your browser sends the Do Not Track or Global Privacy Control (GPC) signal, the statistics are not even loaded.',
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        'You can request access, rectification, erasure, restriction or objection, and lodge a complaint with your data protection authority (in Spain, aepd.es). Write to TODO (email). Because the statistics are anonymous and do not identify you, I cannot find your data in them; for AI questions, include the approximate date and the content of the question.',
      ],
    },
  ],
};

export const privacyContent: Record<Locale, PrivacyContent> = { es, en };
