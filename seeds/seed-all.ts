import { regulators } from '../src/config/regulators';
import {Queues} from '../src/config/queues';

/**
 * Initiates a full crawl by seeding the discovery queue with
 * root URLs for all configured Ghana regulators.
 */
async function seedAll(): Promise<void> {
  console.log(`Seeding ${regulators.length} regulators...`);

  for (const reg of regulators) {
    for (const seedUrl of reg.seed_urls) {
      // Base64 encode a portion of the URL to create a unique, deterministic Job ID
      const urlHash = Buffer.from(seedUrl).toString('base64').substring(0, 20);
      
      await Queues.discovery.add(
        'discover',
        {
          source_config: reg,
          url: seedUrl,
          depth: 0,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          // Using a custom jobId prevents duplicate seeding if the script runs twice
          jobId: `discover-${reg.id}-${urlHash}`,
        }
      );
    }
  }

  console.log('All seed jobs successfully queued.');
}

// Execute the seeding process
seedAll().catch((err) => {
  console.error('Fatal error during seeding:', err);
  process.exit(1);
});