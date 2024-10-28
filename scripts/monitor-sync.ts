import Redis from 'ioredis';

async function monitorSync() {
  const source = new Redis(6379);
  const target = new Redis(6380);
  let lastSourceCount = 0;
  let lastTargetCount = 0;
  let startTime = Date.now();

  console.log('Starting monitoring...');

  setInterval(async () => {
    try {
      // Get current counts
      const sourceCount = await source.dbsize();
      const targetCount = await target.dbsize();
      const elapsed = (Date.now() - startTime) / 1000;

      // Calculate rates
      const sourceRate = (sourceCount - lastSourceCount);
      const targetRate = (targetCount - lastTargetCount);

      console.log('\n=== Status Update ===');
      console.log(`Time elapsed: ${elapsed.toFixed(1)}s`);
      console.log(`Source keys: ${sourceCount} (+${sourceRate}/sec)`);
      console.log(`Target keys: ${targetCount} (+${targetRate}/sec)`);
      console.log(`Lag: ${sourceCount - targetCount} keys`);
      console.log(`Sync rate: ${((targetCount / sourceCount) * 100).toFixed(1)}%`);

      lastSourceCount = sourceCount;
      lastTargetCount = targetCount;
    } catch (error) {
      console.error('Monitoring error:', error);
    }
  }, 1000);
}

monitorSync().catch(console.error);