// src/config/regulators.ts
import { RegulatorConfig } from '../types/scraper';

export const regulators: RegulatorConfig[] = [
  {
    id: 'ghanalli',
    name: 'Ghana Legal Information Institute',
    seed_urls: [
      'https://ghanalli.org/legislation/acts',
      'https://ghanalli.org/legislation/legislative-instruments',
    ],
    archetype: 'static',
    follow_links: true,
    max_depth: 4,
    allowed_domains: ['ghanalli.org'],
    doc_selectors: {
      document_links: 'table.views-table a, .view-content a[href*="/node/"]',
      content: '.field-name-body, .document-content, article.node',
      title: 'h1.page-header, .field-name-title',
      pdf_links: 'a[href$=".pdf"]',
    },
    rate_limit: { requests_per_minute: 20, delay_ms: 3000 },
    doc_type_hints: ['act', 'legislative instrument'],
    respect_robots_txt: true,
  },
  // ... other regulators
];