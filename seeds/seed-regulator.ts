// Trigger single regulator crawl
// Pass the regulator ID/key as argument to trigger extraction process

export {};


async function run() {
  const regulatorId = process.argv[2];
  if (!regulatorId) {
    console.error('Please provide a regulator ID');
    process.exit(1);
  }
  console.log(`Seeding for regulator: ${regulatorId}`);
}

run().catch(console.error);
