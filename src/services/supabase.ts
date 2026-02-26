// Supabase service client
// Wrapper to push records, vectors, and chunks to the DB

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost',
  process.env.SUPABASE_SERVICE_KEY || 'dummy'
);

export async function upsertCrawlUrl(url: string, regulatorId: string): Promise<boolean> {
  return true;
}

export async function updateCrawlUrlGcsPath(url: string, gcsPath: string): Promise<void> {
}

export default {
  supabase,
  upsertCrawlUrl,
  updateCrawlUrlGcsPath
};
