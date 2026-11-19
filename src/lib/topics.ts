/**
 * The map's colour groups ("clusters") and how an item's `topic` and tags
 * map to one. Pure, shared by the map and its tests.
 */

/** Clusters in legend and list order (ui-direction.md). */
export const CLUSTER_ORDER = [
  'android',
  'cloud',
  'ai',
  'fundamentals',
] as const;
export type ClusterId = (typeof CLUSTER_ORDER)[number];

/** Fallback when nothing says where an item belongs. */
export const DEFAULT_CLUSTER: ClusterId = 'fundamentals';

/** Keywords (lowercase, matched against topic and tags) per cluster. */
export const CLUSTER_KEYWORDS: Record<ClusterId, readonly string[]> = {
  android: [
    'android',
    'kotlin',
    'compose',
    'jetpack',
    'gradle',
    'room',
    'coroutines',
    'kmp',
    'multiplatform',
    'mobile',
    'wear-os',
  ],
  cloud: [
    'cloud',
    'aws',
    'serverless',
    'lambda',
    'infrastructure',
    'iac',
    'sst',
    'devops',
    'terraform',
    'cdn',
    'backend',
  ],
  ai: [
    'ai',
    'ia',
    'llm',
    'ml',
    'rag',
    'evals',
    'embeddings',
    'agents',
    'claude',
    'prompting',
    'mcp',
  ],
  fundamentals: [
    'fundamentals',
    'education',
    'computer-science',
    'architecture',
    'testing',
    'algorithms',
    'career',
    'notes',
  ],
};

export const isCluster = (value: string): value is ClusterId =>
  (CLUSTER_ORDER as readonly string[]).includes(value);

function clusterFromWords(words: readonly string[]): ClusterId | undefined {
  const score = new Map<ClusterId, number>();
  for (const word of words.map((w) => w.toLowerCase())) {
    for (const id of CLUSTER_ORDER) {
      if (CLUSTER_KEYWORDS[id].includes(word)) {
        score.set(id, (score.get(id) ?? 0) + 1);
      }
    }
  }
  let best: ClusterId | undefined;
  for (const id of CLUSTER_ORDER) {
    // Strictly greater: ties go to the first cluster in `CLUSTER_ORDER`.
    if ((score.get(id) ?? 0) > (best ? (score.get(best) ?? 0) : 0)) best = id;
  }
  return best;
}

export interface TopicSource {
  readonly id: string;
  readonly topic?: string | undefined;
  readonly tags: readonly string[];
  /** Id of the app the item belongs to. */
  readonly app?: string | undefined;
}

/**
 * Topic → cluster. Order: explicit `topic` (cluster id or keyword), then
 * tags, then the cluster of the app the item belongs to, then the default.
 */
export function inferCluster(
  item: TopicSource,
  byId: ReadonlyMap<string, TopicSource>,
  seen: ReadonlySet<string> = new Set(),
): ClusterId {
  if (item.topic) {
    const topic = item.topic.toLowerCase();
    if (isCluster(topic)) return topic;
    const fromTopic = clusterFromWords([topic]);
    if (fromTopic) return fromTopic;
  }
  const fromTags = clusterFromWords(item.tags);
  if (fromTags) return fromTags;
  const app = item.app ? byId.get(item.app) : undefined;
  if (app && !seen.has(app.id)) {
    return inferCluster(app, byId, new Set([...seen, item.id]));
  }
  return DEFAULT_CLUSTER;
}
