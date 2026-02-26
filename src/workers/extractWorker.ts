import { Worker, Job } from 'bullmq';
import { Storage } from '@google-cloud/storage';
// @ts-ignore
import pdfParse from 'pdf-parse';
import { v1 as documentai } from '@google-cloud/documentai';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { Queues } from '../config/queues';
import { ExtractJobData } from '../types/scraper';

const storage = new Storage();
const docAIClient = new documentai.DocumentProcessorServiceClient();
const td = new TurndownService();

const PROCESSOR = `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}` +
  `/locations/${process.env.DOCUMENT_AI_LOCATION}` +
  `/processors/${process.env.DOCUMENT_AI_PROCESSOR_ID}`;

const extractWorker = new Worker<ExtractJobData>(
  'extract',
  async (job: Job<ExtractJobData>) => {
    const { url, gcs_path, is_pdf, source_config } = job.data;

    // Download raw bytes from GCS
    const [rawBytes] = await storage.bucket(process.env.GCS_BUCKET_NAME!)
      .file(gcs_path)
      .download();

    let extractedText = '';
    let isOcr = false;
    let ocrConfidence: number | null = null;

    if (is_pdf) {
      // 1. Try native PDF text extraction first (fast & free)
      try {
        const result = await pdfParse(rawBytes);
        extractedText = result.text;
      } catch (e) {
        /* fall through to OCR */
      }

      // 2. If text is too short, PDF is likely scanned — use Document AI OCR
      const MIN_TEXT_LENGTH = 200;
      if (extractedText.trim().length < MIN_TEXT_LENGTH) {
        const [result] = await docAIClient.processDocument({
          name: PROCESSOR,
          rawDocument: { 
            content: rawBytes.toString('base64'), 
            mimeType: 'application/pdf' 
          }
        });

        extractedText = result.document?.text || '';
        isOcr = true;

        // Post-OCR cleanup — Remove repeated headers/footers and stray characters
        extractedText = extractedText
          .replace(/GAZETTE/gi, '')
          .replace(/page\s*\d+/gi, '')
          .replace(/\b0\b/g, 'O')
          .replace(/\b1\b/g, 'I');

        // Calculate average OCR confidence across tokens
        const tokens = result.document?.pages?.flatMap(p => p.tokens || []) || [];
        if (tokens.length > 0) {
          const sumConfidence = tokens.reduce((sum, t) => 
            sum + (t.layout?.confidence || 0), 0);
          ocrConfidence = sumConfidence / tokens.length;
        }
      }
    } else {
      // 3. HTML: Use selectors and convert to Markdown
      const $ = cheerio.load(rawBytes.toString('utf-8'));
      
      // Clean up junk elements
      $('nav, footer, .cookie-notice, .sidebar, script, style').remove();
      
      const contentHtml = $(source_config.doc_selectors.content).html() || $('body').html();
      extractedText = td.turndown(contentHtml || '');
    }

    // Validation
    if (!extractedText || extractedText.trim().length < 50) {
      throw new Error(`Extraction yielded too little text: ${url}`);
    }

    // ── Content Deduplication ──
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(extractedText).digest('hex');
    const { supabase } = await import('../services/supabase');
    const { data: existing } = await supabase
      .from('scraped_documents')
      .select('id')
      .eq('content_hash', hash)
      .single();

    if (existing) {
      // link URL to existing doc, skip reprocessing
      return;
    }

    // Pass to Stage 4: Processing (Gemini)
    await Queues.process.add('process', {
      url,
      gcs_path,
      is_pdf,
      source_config,
      extracted_text: extractedText,
      is_ocr: isOcr,
      ocr_confidence: ocrConfidence,
      content_hash: hash
    }, { attempts: 3 });
  },
  { connection: { url: process.env.REDIS_URL }, concurrency: 4 }
);

export default extractWorker;