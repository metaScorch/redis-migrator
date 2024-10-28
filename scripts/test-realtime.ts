import Redis from 'ioredis';
import { RedisMigrator } from '../src/lib/redis-migrator';

async function testRealTimeSync() {
  console.log('Starting real-time sync test...');

  const migrator = new RedisMigrator(
    { host: 'localhost', port: 6379, password: '' },
    { host: 'localhost', port: 6380, password: '' }
  );

  // Setup Redis connections
  const source = new Redis(6379);
  const target = new Redis(6380);
  let counter = 0;

  // Start migration
  await migrator.start();

  // Monitor sync progress
  const monitorInterval = setInterval(async () => {
    const sourceCount = await source.dbsize();
    const targetCount = await target.dbsize();
    const syncPercentage = ((targetCount / sourceCount) * 100 || 0).toFixed(2);
    
    // Verify if the latest key exists in target
    const latestKey = `test:${counter}`;
    const targetValue = await target.get(latestKey);
    const sourceValue = await source.get(latestKey);
    const isSynced = targetValue === sourceValue;
    
    console.log(`\nSync Status:`);
    console.log(`Source: ${sourceCount} keys`);
    console.log(`Target: ${targetCount} keys`);
    console.log(`Sync: ${syncPercentage}%`);
    console.log(`Latest key "${latestKey}" synced: ${isSynced ? '✓' : '×'}`);
    if (!isSynced) {
      console.log(`Source value: ${sourceValue}`);
      console.log(`Target value: ${targetValue}`);
    }
  }, 1000);

  // Add test data ONLY to source every 100ms
  const dataInterval = setInterval(async () => {
    try {
      // Simplified key format for easier verification
      const key = `test:${counter}`;
      await source.set(key, `value-${counter}`);
      counter++;

      if (counter >= 1000) {
        clearInterval(dataInterval);
        await cleanup();
      }
    } catch (error) {
      console.error('Error generating data:', error);
      await cleanup();
    }
  }, 100);

  async function cleanup() {
    console.log('\nCleaning up...');
    clearInterval(monitorInterval);
    clearInterval(dataInterval);
    await source.quit();
    await target.quit();
    await migrator.cleanup();
    process.exit(0);
  }


  process.on('SIGINT', cleanup);
}

testRealTimeSync().catch(async (error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
