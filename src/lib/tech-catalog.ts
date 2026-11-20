/**
 * The site's technology catalog (S15), parsed once. Vite inlines the YAML
 * text, so this works in Astro pages, in Vitest and in the browser bundle
 * alike (the AI context builder reads the same file with `fs`).
 */
import raw from '../content/tech.yaml?raw';
import { parseTechCatalog } from './tech';

export const techCatalog = parseTechCatalog(raw);
