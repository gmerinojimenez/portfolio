/**
 * How the map classifies an item beyond its `type`. Pure functions shared
 * by the card model and the map.
 */
import type { ItemData } from './content-schema';

/**
 * A side project: explicit `context: personal`, the legacy `topic:
 * personal`, or an app or library with no company. Posts and education
 * are never personal on their own (posts follow what they talk about).
 */
export function isPersonal(
  data: Pick<ItemData, 'type' | 'context' | 'topic' | 'company'>,
): boolean {
  if (data.context) return data.context === 'personal';
  if (data.topic === 'personal') return true;
  return !data.company && (data.type === 'app' || data.type === 'oss');
}

/** A course certificate (education tagged `certification`), not a degree. */
export function isCertification(
  data: Pick<ItemData, 'type' | 'tags'>,
): boolean {
  return data.type === 'education' && data.tags.includes('certification');
}
