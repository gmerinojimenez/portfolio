/**
 * The site's CV configuration (S16), parsed once. Vite inlines the YAML
 * text, so this works in Astro pages, in Vitest and in the browser bundle.
 */
import raw from '../content/cv.yaml?raw';
import { parseCvConfig } from './cv';

export const cvConfig = parseCvConfig(raw);
