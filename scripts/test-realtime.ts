import Redis from 'ioredis';
import { RedisMigrator } from '../src/lib/redis-migrator';

async function testRealTimeSync() {
  console.log('Starting real-time sync test...');

  const migrator = new RedisMigrator(
    { host: 'localhost', port: 6379, password: '' },
    { host: 'localhost', port: 6380, password: '' }
  );

  // Monitor migration progress
  migrator.on('progress', (stats) => {
    console.log(`Progress: ${stats.percent}% - ${stats.keysPerSecond} keys/sec`);
  });

  migrator.on('keyProcessed', (data) => {
    console.log(`Processed key: ${data.key} (${data.operation})`);
  });

  migrator.on('error', (error) => {
    console.error('Error:', error.message);
  });

  // Start migration
  await migrator.start();

  // Generate test data
  const source = new Redis(6379);
  let counter = 0;

  // Add test data every 100ms
  const interval = setInterval(async () => {
    try {
      const key = `test:${Date.now()}:${counter}`;
      await source.set(key, `value-${counter}`);
      counter++;

      // Print stats every 10 keys
      if (counter % 10 === 0) {
        const sourceCount = await source.dbsize();
        const targetCount = await new Redis(6380).dbsize();
        console.log(`\nSource: ${sourceCount} keys`);
        console.log(`Target: ${targetCount} keys`);
        console.log(`Difference: ${sourceCount - targetCount} keys`);
      }

      // Stop after 1000 keys
      if (counter >= 1000) {
        clearInterval(interval);
        await cleanup();
      }
    } catch (error) {
      console.error('Error generating data:', error);
    }
  }, 100);

  async function cleanup() {
    console.log('\nCleaning up...');
    await migrator.cleanup();
    process.exit(0);
  }

  // Handle interrupts
  process.on('SIGINT', cleanup);
}

testRealTimeSync().catch(console.error);
