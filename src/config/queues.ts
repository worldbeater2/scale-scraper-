import { Queue } from 'bullmq';



import { 
  DiscoveryJobData, 
  FetchJobData, 
  ExtractJobData, 
  ProcessJobData, 
  EmbedJobData, 
  StoreJobData 
} from '../types/scraper';

const connection = { 
  url: process.env.REDIS_URL || 'redis://localhost:6379' 
};

// Define the Queues with their respective Job Data types
export const Queues = {
  discovery: new Queue<DiscoveryJobData>('discovery', { connection }),
  fetch:     new Queue<FetchJobData>('fetch',         { connection }),
  extract:   new Queue<ExtractJobData>('extract',     { connection }),
  process:   new Queue<ProcessJobData>('process',     { connection }),
  embed:     new Queue<EmbedJobData>('embed',         { connection }),
  store:     new Queue<StoreJobData>('store',         { connection }),
};