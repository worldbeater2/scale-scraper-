// index.ts
import 'dotenv/config';
import './src/workers/discoveryWorker';
import './src/workers/fetchWorker';
import './src/workers/extractWorker';
import './src/workers/processWorker';
import './src/workers/embedWorker';
import './src/workers/storeWorker';

console.log('🚀 All ScalePal Scraper workers running in dev mode...');
