import { Worker, Job } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { StoreJobData } from '../types/scraper';

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost',
  process.env.SUPABASE_SERVICE_KEY || 'dummy'
);

const storeWorker = new Worker<StoreJobData>(
  'store',
  async (job: Job<StoreJobData>) => {
    const { 
      url, source_config, metadata, chunk_text, 
      chunk_index, embedding, is_ocr, ocr_confidence 
    } = job.data;

    // 1. Idempotent upsert of the document record
    const { data: doc, error: docError } = await supabase
      .from('scraped_documents')
      .upsert({
        title: metadata.title,
        doc_type: metadata.doc_type,
        doc_subtype: metadata.doc_subtype,
        year: metadata.year,
        reference_number: metadata.reference_number,
        issuing_body: metadata.issuing_body,
        content_hash: job.data.content_hash,
        is_ocr,
        ocr_confidence,
        metadata: { 
          url, 
          source: source_config.name, 
          summary: metadata.summary 
        }
      }, { onConflict: 'title, issuing_body' })
      .select('id')
      .single();

    if (docError || !doc) throw new Error(`DB Error (doc): ${docError?.message}`);

    // 2. Insert the specific knowledge chunk with its vector
    const { error: chunkError } = await supabase.from('knowledge_chunks').upsert({
      source_type: metadata.doc_type === 'act' ? 'regulation_text' : 'license',
      source_id: doc.id,
      chunk_text,
      embedding,
      metadata: {
        ...metadata,
        chunk_index,
        source_url: url,
      }
    }, { onConflict: 'source_id, chunk_index' });

    if (chunkError) throw new Error(`DB Error (chunk): ${chunkError.message}`);

    // 3. Mark URL as fully processed in the crawl log
    await supabase.from('crawl_urls')
      .update({ 
        status: 'stored', 
        processed_at: new Date().toISOString() 
      })
      .eq('url', url);
  },
  { 
    connection: { url: process.env.REDIS_URL }, 
    concurrency: 15 
  }
);

export default storeWorker;