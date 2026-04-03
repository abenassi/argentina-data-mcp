export interface CollectorResult {
  source: string;
  recordsUpserted: number;
  errors: string[];
  durationMs: number;
}

export type Collector = () => Promise<CollectorResult>;
