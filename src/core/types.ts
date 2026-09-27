export interface MatrixRef {
  url?: string;
  rows: number;
  cols: number;
  encoding?: 'f32-gzip' | 'f32';
  values?: number[] | number[][];
}
export interface Matrix {
  rows: number;
  cols: number;
  data: Float32Array;
}
export interface Item {
  id: string;
  name?: string;
  label: number | null;
  group?: string;
  category?: string;
  split?: string;
  media?: string;
  mediaFallback?: string;
  scores?: Record<string, number | null>;
  annotations?: Record<string, string | number | null>;
}
export interface Projection {
  method: string;
  positions?: MatrixRef;
  mean?: number[];
  components?: number[][];
  explained?: number[];
}
export interface Representation {
  id: string;
  name: string;
  kind: 'embedding' | 'similarity' | 'features' | 'activation' | 'score' | 'custom';
  dimensions: number;
  matrix: MatrixRef;
  space?: string;
  projection?: Projection;
  overview?: { method: string; positions: MatrixRef; parameters?: Record<string, unknown> };
}
export interface Query {
  id: string;
  text: string;
  family: string;
  polarity: 'positive' | 'negative';
}
export interface QueryBank {
  id: string;
  representation: string;
  items: Query[];
  vectors: MatrixRef;
  similarities: string;
  features: string;
}
export interface FeatureDefinition {
  name: string;
  kind: 'max' | 'second' | 'gap' | 'margin' | 'gate' | 'lse' | 'groupMargin';
  family?: string;
  polarity?: 'positive' | 'negative' | null;
  temperature?: number;
}
export interface GraphNode {
  id: string;
  name?: string;
  op: 'normalize' | 'dense' | 'concat' | 'add' | 'mean' | 'sigmoid';
  inputs: string[];
  mean?: number[];
  scale?: number[];
  weight?: number[][];
  bias?: number[];
  activation?: 'relu' | 'linear' | 'tanh';
}
export interface ModelGraph {
  id: string;
  output: string;
  inputs: string[];
  nodes: GraphNode[];
  threshold?: number;
  fit?: string;
  reference?: string;
  description?: string;
  kind?: 'probability' | 'vector';
}
export interface Manifest {
  schemaVersion: 1;
  id: string;
  title: string;
  description?: string;
  items: Item[];
  representations: Representation[];
  queries?: QueryBank[];
  featureDefinitions?: Record<string, FeatureDefinition[]>;
  model?: ModelGraph;
  provenance?: Record<string, unknown>;
  files?: Record<string, string>;
  primaryScore?: string;
  scoreDefinitions?: Record<
    string,
    { label?: string; kind: 'score' | 'probability' | 'quantity'; unit?: string }
  >;
  presets?: {
    groupBy?: 'group' | 'category';
    queryFamily?: string;
    ranking?: { left: string; right: string };
    relatedDataset?: { label: string; url: string };
  };
}
export interface Dataset {
  manifest: Manifest;
  matrices: Map<string, Matrix>;
  positions: Map<string, Matrix>;
  baseUrl: string;
  sourceUrl?: string;
  imported: boolean;
  graphValues?: Map<string, Matrix>;
}
export type ToolId = 'space' | 'transform' | 'compose' | 'rank' | 'uncertainty';
export interface Intervention {
  disabled: string[];
  temperature: number | null;
  zeroFamilies: string[];
  bankId?: string;
  /** Removed phrases keep smooth pools at their original cardinality: LSE + τ·log(N/k). */
  countNeutral?: boolean;
}
export interface EngineResult {
  matrices: Record<string, Matrix>;
  positions?: Record<string, Matrix>;
  elapsed: number;
  backend: string;
  threads: number;
  error?: number;
}
export interface Selection {
  indices: number[];
  pinned: number[];
}
