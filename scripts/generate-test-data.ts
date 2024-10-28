import Redis from 'ioredis';

async function generateTestData() {
  // Connect to local Redis
  const redis = new Redis({
    host: 'localhost',
    port: 6379,
  });

  try {
    console.log('Starting test data generation...');

    // Generate different types of data
    const promises = [];

    // Strings with different sizes
    for (let i = 0; i < 100000; i++) {
      const value = 'x'.repeat(Math.floor(Math.random() * 1000));
      promises.push(redis.set(`test:string:${i}`, value));
    }

    // Hashes (user profiles)
    for (let i = 0; i < 500; i++) {
      promises.push(redis.hset(`test:user:${i}`, {
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        created_at: Date.now(),
        status: ['active', 'inactive', 'suspended'][Math.floor(Math.random() * 3)]
      }));
    }

    // Sets (user permissions)
    for (let i = 0; i < 200; i++) {
      const permissions = ['read', 'write', 'delete', 'admin', 'user'];
      const userPerms = permissions.slice(0, Math.floor(Math.random() * 5) + 1);
      promises.push(redis.sadd(`test:permissions:${i}`, ...userPerms));
    }

    // Sorted Sets (leaderboard)
    for (let i = 0; i < 300; i++) {
      promises.push(redis.zadd('test:leaderboard', Math.random() * 1000, `player:${i}`));
    }

    // Lists (activity logs)
    for (let i = 0; i < 100; i++) {
      const activities = Array.from({ length: 10 }, (_, j) => 
        `Activity ${j} at ${new Date().toISOString()}`
      );
      promises.push(redis.rpush(`test:activity:${i}`, ...activities));
    }

    // Execute all promises
    await Promise.all(promises);

    // Get statistics
    const keyCount = await redis.dbsize();
    console.log(`Generated ${keyCount} keys`);
    
    // Get memory usage
    const info = await redis.info('memory');
    console.log(`Memory usage:\n${info}`);

  } catch (error) {
    console.error('Error generating test data:', error);
  } finally {
    await redis.quit();
  }
}

// Run the function
generateTestData()
  .then(() => console.log('Test data generation complete!'))
  .catch(console.error);

