export interface BaseRerankConfig {
  provider?: string;
  enabled?: boolean;
  model?: string;
  apiKey?: string;
  apiBaseUrl?: string;
  topN?: number;
}
