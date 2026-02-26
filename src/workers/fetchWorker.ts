import { Worker, Job } from 'bullmq';
import { Storage } from '@google-cloud/storage';
import axios from 'axios';
import { chromium, Browser, Page } from 'playwright';
import { Queues } from '../config/queues';
import { updateCrawlUrlGcsPath } from '../services/supabase';
import { FetchJobData } from '../types/scraper';
import {SourceConfig} from '../types/scraper';





const storage = new Storage();
const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);

const fetchWorker = new Worker<FetchJobData>(
  'fetch',
  async (job: Job<FetchJobData>) => {
    const { url, source_config, is_pdf } = job.data;
    let content: Buffer;
    let contentType: string;

    try {
      if (is_pdf) {
        // Stream PDF directly to GCS 
        const res = await axios.get<ArrayBuffer>(url, { 
          responseType: 'arraybuffer', 
          timeout: 30000 
        });
        content = Buffer.from(res.data);
        contentType = 'application/pdf'; 
      } else if (source_config.archetype === 'spa') {
        // Handle Archetype B: JavaScript-Rendered SPAs 
        const browser: Browser = await chromium.launch({ headless: true });
        const page: Page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        
        content = Buffer.from(await page.content(), 'utf-8'); 
        contentType = 'text/html';
        await browser.close(); 
      } else {
        // Archetype A: Simple HTTP GET 
        const res = await axios.get<string>(url, { timeout: 15000 });
        content = Buffer.from(res.data, 'utf-8');
        contentType = 'text/html'; 
      }

      // Organize into GCS folders 
      const folder = is_pdf ? 'pdfs' : 'html';
      const filename = `${folder}/${encodeURIComponent(url)}.${is_pdf ? 'pdf' : 'html'}`;
      const file = bucket.file(filename);

      // Save raw binary/text to Cloud Storage 
      await file.save(content, { contentType });

      // Update Supabase with the GCS path 
      await updateCrawlUrlGcsPath(url, filename);

      // Pass to Stage 3: Extraction 
      await Queues.extract.add('extract', {
        url,
        gcs_path: filename,
        is_pdf,
        source_config
      }, { 
        attempts: 3, 
        backoff: { type: 'exponential', delay: 5000 } 
      });

    } catch (error) {
      console.error(`Failed to fetch ${url}:`, error);
      throw error; // Let BullMQ handle the retry 
    }
  },
  { 
    connection: { url: process.env.REDIS_URL }, 
    concurrency: 5 // Process 5 downloads in parallel 
  }
);

export default fetchWorker;