import Redis from 'ioredis';
import { RedisMigrator } from '../src/lib/redis-migrator';
import { EventEmitter } from 'events';

async function testRealTimeSync() {
  console.log('Starting real-time sync test...');

  const migrator = new RedisMigrator(
    { host: 'localhost', port: 6379, password: '', tls: false },
    { host: 'localhost', port: 6380, password: '', tls: false },
    { enableRealtimeSync: true },
    new EventEmitter()
  );

  // Setup Redis connections - target is only for monitoring
  const source = new Redis(6379);
  const target = new Redis(6380);
  let counter = 0;

  // Start migration
  await migrator.start();
  console.log('Migration started successfully');

  // Monitor sync progress
  const monitorInterval = setInterval(async () => {
    const sourceCount = await source.dbsize();
    const targetCount = await target.dbsize();
    const syncPercentage = ((targetCount / sourceCount) * 100 || 0).toFixed(2);
    
    console.log(`\nSync Status at ${new Date().toISOString()}:`);
    console.log(`Counter: ${counter}`);
    console.log(`Source: ${sourceCount} keys`);
    console.log(`Target: ${targetCount} keys`);
    console.log(`Sync: ${syncPercentage}%`);
  }, 1000);

  // Add test data ONLY to source every 100ms
  const dataInterval = setInterval(async () => {
    try {
      const key = `test:${Date.now()}:${counter}`;  // Make key unique with timestamp
      const value = `value-${counter}`;
      console.log(`Adding new key: ${key} = ${value}`);
      await source.set(key, value);
      counter++;

      if (counter >= 1000) {
        console.log('Reached 1000 keys, cleaning up...');
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

testRealTimeSync().catch(console.error);
