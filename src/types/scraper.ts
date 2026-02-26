// src/types/scraper.ts
export type Archetype = 'static' | 'spa' | 'pdf-only';

export interface DocSelectors {
  document_links: string;
  content: string;
  title: string;
  pdf_links: string;
}

export interface RegulatorConfig {
  id: string;
  name: string;
  seed_urls: string[];
  archetype: Archetype;
  follow_links: boolean;
  max_depth: number;
  allowed_domains: string[];
  doc_selectors: DocSelectors;
  rate_limit: {
    requests_per_minute: number;
    delay_ms: number;
  };
  doc_type_hints: string[];
  respect_robots_txt: boolean;
  wait_for_selector?: string; // Optional for SPA archetype
}

export interface DiscoveryJobData {
  source_config: RegulatorConfig;
  url: string;
  depth: number;
}



export interface FetchJobData {
  url: string;
  source_config: RegulatorConfig;
  is_pdf: boolean;
  depth: number;
}

export interface ExtractJobData {
  url: string;
  gcs_path: string;
  is_pdf: boolean;
  source_config: RegulatorConfig;
}

export interface ProcessJobData extends ExtractJobData {
  extracted_text: string;
  is_ocr: boolean;
  ocr_confidence: number | null;
  content_hash: string;
}

export interface EmbedJobData {
  url: string;
  source_config: RegulatorConfig;
  metadata: any;
  chunk_text: string;
  chunk_index: number;
  total_chunks: number;
  is_ocr: boolean;
  ocr_confidence: number | null;
  content_hash: string;
}

export interface StoreJobData extends EmbedJobData {
  embedding: number[];
}



export interface SourceConfig {
  id: string;
  archetype: 'static' | 'spa' | 'pdf-only';
  [key: string]: any;
}

export interface DocumentMetadata {
  doc_type: 'act' | 'legislative_instrument' | 'bye_law' | 'guideline' | 'directive' | 'circular' | 'notice' | 'form' | 'report' | 'other';
  doc_subtype?: string;
  title: string;
  year: number | null;
  reference_number: string | null;
  issuing_body: string;
  summary: string;
}
