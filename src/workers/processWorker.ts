import { Worker, Job } from 'bullmq';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { Queues } from '../config/queues';
import chunkText from "../utils/chunker";
import { ProcessJobData, DocumentMetadata } from '../types/scraper';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');
const model: GenerativeModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const META_PROMPT = `You are a Ghana legal document classifier.
Given this document text, return a JSON object with these fields:
- doc_type: one of ['act', 'legislative_instrument', 'bye_law', 'guideline', 'directive', 'circular', 'notice', 'form', 'report', 'other']
- doc_subtype: more specific type if applicable
- title: the full official title of the document
- year: publication/enactment year (number or null)
- reference_number: act number, LI number, or other ref if present
- issuing_body: the regulator or government body that issued this
- summary: 2-3 sentence plain-English summary of what this document does
- section_labels: short array of the main section headings in this document (e.g. ["Definitions", "Penalties"]) so we understand the structure
Respond ONLY with valid JSON, no markdown fences.`;

const processWorker = new Worker<ProcessJobData>(
  'process',
  async (job: Job<ProcessJobData>) => {
    const { url, source_config, extracted_text, is_ocr, ocr_confidence, content_hash } = job.data;

    // ── Confidence Thresholding ──
    const requiresReview = is_ocr && typeof ocr_confidence === 'number' && ocr_confidence < 0.7;

    // ── Step 1: Extract metadata via Gemini ──
    const first5k = extracted_text.substring(0, 5000);
    const metaResult = await model.generateContent(`${META_PROMPT}\n\nDOCUMENT TEXT:\n${first5k}`);
    
    let metadata: DocumentMetadata;
    let sectionLabels: string[] = [];
    try {
      let textResponse = metaResult.response.text();
      textResponse = textResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(textResponse);
      metadata = parsed;
      sectionLabels = parsed.section_labels || [];
    } catch (e) {
      // Fallback if JSON parsing fails
      metadata = { 
        doc_type: 'other', 
        title: url, 
        issuing_body: source_config.name,
        year: null,
        reference_number: null,
        summary: 'Failed to parse metadata'
      } as DocumentMetadata;
    }

    if (requiresReview) {
      // Add flag and skip embeddings for low quality text
      const { supabase } = await import('../services/supabase');
      await supabase.from('scraped_documents').upsert({
        title: metadata.title,
        doc_type: metadata.doc_type,
        issuing_body: metadata.issuing_body,
        is_ocr,
        ocr_confidence,
        content_hash,
        metadata: { url, require_manual_review: true, reason: 'Low OCR confidence' }
      });
      return;
    }

    // ── Step 2: Semantic Chunking ──
    // Section detection context prepended
    const contextPrefix = sectionLabels.length > 0 ? `Document Sections: ${sectionLabels.join(', ')}\n\n` : '';
    
    const chunks = chunkText(extracted_text, {
      maxTokens: 500,
      overlap: 50,
      strategy: 'semantic'
    });

    // ── Step 3: Queue Embedding for each chunk ──
    for (let i = 0; i < chunks.length; i++) {
      await Queues.embed.add('embed', {
        url,
        source_config,
        metadata,
        chunk_text: contextPrefix + chunks[i],
        chunk_index: i,
        total_chunks: chunks.length,
        is_ocr,
        ocr_confidence,
        content_hash
      }, { 
        attempts: 3, 
        backoff: { type: 'exponential', delay: 2000 } 
      });
    }
  },
  { connection: { url: process.env.REDIS_URL }, concurrency: 8 }
);

export default processWorker;