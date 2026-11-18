/**
 * Fixed parts of the semantic map: clusters, their centers and how tags map
 * to a cluster (docs/specs/06-embeddings-map.md, design/ui-direction.md).
 */

export const clusterIds = ['android', 'cloud', 'ai', 'fundamentals'] as const;
export type ClusterId = (typeof clusterIds)[number];

export interface ClusterDef {
  id: ClusterId;
  label: string;
  /** Desktop center in the unit square (y grows downwards). */
  center: { x: number; y: number };
  /** Radius in the same units; nodes stay inside it. */
  radius: number;
}

export const clusterDefs: ClusterDef[] = [
  {
    id: 'android',
    label: 'Android',
    center: { x: 0.24, y: 0.34 },
    radius: 0.17,
  },
  { id: 'cloud', label: 'Cloud', center: { x: 0.74, y: 0.3 }, radius: 0.17 },
  { id: 'ai', label: 'IA', center: { x: 0.56, y: 0.76 }, radius: 0.17 },
  {
    id: 'fundamentals',
    label: 'Fundamentos',
    center: { x: 0.14, y: 0.78 },
    radius: 0.14,
  },
];

/** Fallback when nothing says where an item belongs. */
export const defaultCluster: ClusterId = 'fundamentals';

/** Keywords (lowercase, matched against topic and tags) per cluster. */
export const clusterKeywords: Record<ClusterId, string[]> = {
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

/** Seed of the projection used to place nodes inside a cluster. */
export const PROJECTION_SEED = 'portfolio-map-v1';
/** Nearest neighbours kept per node for similarity edges. */
export const SIMILARITY_K = 3;
