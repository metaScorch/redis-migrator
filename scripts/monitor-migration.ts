import Redis from 'ioredis';

async function monitorMigration() {
  // Source Redis
  const sourceRedis = new Redis();

  // Target Redis
  const targetRedis = new Redis();

  try {
    // Initial counts
    const sourceCount = await sourceRedis.dbsize();
    const targetCount = await targetRedis.dbsize();
    
    console.log('Initial state:');
    console.log(`Source keys: ${sourceCount}`);
    console.log(`Target keys: ${targetCount}`);
    
    // Monitor progress
    setInterval(async () => {
      const currentSourceCount = await sourceRedis.dbsize();
      const currentTargetCount = await targetRedis.dbsize();
      
      console.log('\nCurrent state:');
      console.log(`Source keys: ${currentSourceCount}`);
      console.log(`Target keys: ${currentTargetCount}`);
      
      if (currentTargetCount > 0) {
        const progress = ((currentTargetCount / sourceCount) * 100).toFixed(2);
        console.log(`Progress: ${progress}%`);
      }
      
    }, 5000); // Check every 5 seconds

  } catch (error) {
    console.error('Error monitoring migration:', error);
  }
}

// Run the monitoring
monitorMigration().catch(console.error);
