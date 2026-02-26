import { Worker, Job } from 'bullmq';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Queues } from '../config/queues';
import { EmbedJobData } from '../types/scraper';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

const embedWorker = new Worker<EmbedJobData>(
  'embed',
  async (job: Job<EmbedJobData>) => {
    const { chunk_text } = job.data;

    const embModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await embModel.embedContent(chunk_text);
    const embedding = result.embedding.values;

    await Queues.store.add('store', {
      ...job.data,
      embedding
    }, { 
      attempts: 5, 
      backoff: { type: 'exponential', delay: 1000 } 
    });
  },
  {
    connection: { url: process.env.REDIS_URL },
    concurrency: 10,
    limiter: { 
      max: 1500, 
      duration: 60000 
    }
  }
);

export default embedWorker;