// src/workers/discoveryWorker.ts
import { Worker, Job } from 'bullmq';
import { chromium, Browser, Page } from 'playwright';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { DiscoveryJobData } from '../types/scraper';
import { Queues } from '../config/queues';
import { upsertCrawlUrl } from '../services/supabase';

const connection = { url: process.env.REDIS_URL };

const discoveryWorker = new Worker<DiscoveryJobData>(
  'discovery',
  async (job: Job<DiscoveryJobData>) => {
    const { source_config, url, depth } = job.data;
    
    if (depth > source_config.max_depth) return;

    let html: string;

    if (source_config.archetype === 'spa') {
      const browser: Browser = await chromium.launch({ headless: true });
      const page: Page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      
      if (source_config.wait_for_selector) {
        await page.waitForSelector(source_config.wait_for_selector, { timeout: 15000 });
      }
      
      html = await page.content();
      await browser.close();
    } else {
      const res = await axios.get(url, { 
        timeout: 15000,
        headers: { 'User-Agent': 'ScalePal-Bot/1.0' }
      });
      html = res.data;
    }

    const $ = cheerio.load(html);
    const sel = source_config.doc_selectors;
    const foundLinks = new Set<string>();

    // Extract links based on selectors
    $(sel.document_links).each((_, el) => {
      const href = $(el).attr('href');
      if (href) foundLinks.add(href);
    });

    for (const href of foundLinks) {
      const absUrl = new URL(href, url).toString();
      const isNew = await upsertCrawlUrl(absUrl, source_config.id);

      if (isNew) {
        const isPdf = absUrl.toLowerCase().endsWith('.pdf');
        await Queues.fetch.add('fetch', {
          url: absUrl,
          source_config,
          is_pdf: isPdf,
          depth: depth + 1
        }, { 
          attempts: 3, 
          backoff: { type: 'exponential', delay: 3000 } 
        });
      }
    }
  },
  { connection, concurrency: 3 }
);

export default discoveryWorker;