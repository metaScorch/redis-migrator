import Redis from 'ioredis';
import { EventEmitter } from 'events';

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  tls?: boolean;
}

interface MigrationStats {
  processed: number;
  total: number;
  errors: string[];
  startTime: number;
  keysPerSecond: number;
  totalSize: number;
}

interface RedisError extends Error {
  code?: string;
  errno?: number;
  syscall?: string;
  hostname?: string;
  command?: string;
}

interface MigratorOptions {
  enableRealtimeSync?: boolean;
}

interface MigrationMetrics {
  timestamp: string;            // ISO string format: "2024-03-14T12:34:56.789Z"
  totalSize: number;           // Total size in bytes
  keysProcessed: number;       // Number of keys processed
  totalKeys: number;           // Total number of keys
  currentSpeed: number;        // Keys processed per second
  progress: number;            // Percentage complete (0-100)
  errors?: string[];          // Optional array of error messages
  status: 'running' | 'completed' | 'failed' | 'stopped';
}

export class RedisMigrator extends EventEmitter {
  private source: Redis;
  private target: Redis;
  private options: MigratorOptions;
  private migrationId: string;
  private stats: MigrationStats = {
    processed: 0,
    total: 0,
    errors: [],
    startTime: Date.now(),
    keysPerSecond: 0,
    totalSize: 0
  };
  private isRunning = false;
  private initialScanRunning = false;
  private realtimeSyncEnabled = false;
  private subscriber: Redis | null = null;
  private keyUpdateQueue = new Set<string>();
  private processingQueue = false;
  private scanCursor = '0';
  private lastMetricLog = 0;
  private readonly METRIC_LOG_INTERVAL = 5000;

  constructor(
    sourceConfig: RedisConfig,
    targetConfig: RedisConfig,
    migrationId: string,
    options: MigratorOptions = { enableRealtimeSync: false }
  ) {
    super();

    this.source = new Redis({
      host: sourceConfig.host,
      port: sourceConfig.port,
      password: sourceConfig.password,
      tls: sourceConfig.tls ? {} : undefined,
      retryStrategy: () => null, // Disable auto-retry
      maxRetriesPerRequest: 1,
    });
    
    this.target = new Redis({
      host: targetConfig.host,
      port: targetConfig.port,
      password: targetConfig.password,
      tls: targetConfig.tls ? {} : undefined,
      retryStrategy: () => null, // Disable auto-retry
      maxRetriesPerRequest: 1,
    });

    this.migrationId = migrationId;
    this.options = options;

    // Add error handlers
    this.source.on('error', (err) => {
      console.error('Source Redis error:', err);
      this.emit('error', new Error(`Source Redis error: ${err.message}`));
    });

    this.target.on('error', (err) => {
      console.error('Target Redis error:', err);
      this.emit('error', new Error(`Target Redis error: ${err.message}`));
    });
  }

  private async setupKeyspaceNotifications() {
    try {
      if (!this.subscriber) {
        throw new Error('Subscriber not initialized');
      }
      
      await this.source.config('SET', 'notify-keyspace-events', 'AKE');
      await this.subscriber.psubscribe('__keyspace@0__:*');
      
      this.subscriber.on('pmessage', async (_pattern, channel, message) => {
        if (!this.realtimeSyncEnabled) return;
        
        const key = channel.split(':').slice(1).join(':');
        const operation = message;

        try {
          if (['lpush', 'rpush', 'lpop', 'rpop', 'lset', 'lrem', 'ltrim'].includes(operation)) {
            const keyType = await this.source.type(key);
            if (keyType === 'list') {
              const listItems = await this.source.lrange(key, 0, -1);
              await this.target.del(key);
              if (listItems.length > 0) {
                await this.target.rpush(key, ...listItems);
              }
              this.emit('keyProcessed', { key, operation: 'list-update' });
            }
          } else {
            switch (operation) {
              case 'del':
                await this.target.del(key);
                this.emit('keyProcessed', { key, operation: 'delete' });
                break;
              case 'set':
              case 'hset':
              case 'sadd':
              case 'zadd':
                this.keyUpdateQueue.add(key);
                if (!this.processingQueue) {
                  await this.processKeyUpdateQueue();
                }
                break;
            }
          }
        } catch (err) {
          console.error(`Error processing operation ${operation} for key ${key}:`, err);
          this.emit('error', err);
        }
      });

    } catch (err) {
      const redisError = err as RedisError;
      const errorMessage = redisError?.message || 'Unknown error during keyspace notification setup';
      this.stats.errors.push(`Failed to setup keyspace notifications: ${errorMessage}`);
      this.emit('error', redisError);
    }
  }

  private async processKeyUpdateQueue() {
    try {
      if (this.keyUpdateQueue.size === 0) {
        this.processingQueue = false;
        return;
      }

      this.processingQueue = true;
      const keys = Array.from(this.keyUpdateQueue);
      this.keyUpdateQueue.clear();

      await Promise.all(keys.map(async (key) => {
        try {
          await this.migrateKey(key);
          this.emit('keyProcessed', { key, operation: 'update' });
        } catch (error: unknown) {
          const redisError = error as RedisError;
          const errorMessage = redisError?.message || `Unknown error processing key ${key}`;
          this.stats.errors.push(`Error processing key ${key}: ${errorMessage}`);
          this.emit('error', redisError);
        }
      }));
    } catch (error: unknown) {
      const redisError = error as RedisError;
      const errorMessage = redisError?.message || `Unknown error processing queue`;
      this.stats.errors.push(`Error processing queue: ${errorMessage}`);
      this.emit('error', redisError);
    }
  }

  private async migrateKey(key: string): Promise<void> {
    try {
      // Check if key exists in source
      const exists = await this.source.exists(key);
      if (!exists) {
        // Key was deleted, delete from target
        await this.target.del(key);
        return;
      }

      const keyType = await this.source.type(key);
      const ttl = await this.source.ttl(key);

      // Handle different data types
      switch (keyType) {
        case 'string':
          await this.migrateString(key);
          break;
        case 'hash':
          await this.migrateHash(key);
          break;
        case 'set':
          await this.migrateSet(key);
          break;
        case 'zset':
          await this.migrateSortedSet(key);
          break;
        case 'list':
          await this.migrateList(key);
          break;
        default:
          throw new Error(`Unsupported key type: ${keyType}`);
      }

      if (ttl > 0) {
        await this.target.expire(key, ttl);
      }

      this.stats.processed++;
      // Ensure processed never exceeds total
      this.stats.processed = Math.min(this.stats.processed, this.stats.total);
      this.updateSpeed();
      
      const keySize = await this.calculateTotalSize(key);
      this.stats.totalSize = (this.stats.totalSize || 0) + keySize;

      await this.logMetrics();

      this.emit('progress', {
        processed: this.stats.processed,
        total: this.stats.total,
        percent: Math.min((this.stats.processed / this.stats.total) * 100, 100),
        keysPerSecond: this.stats.keysPerSecond,
        totalSize: this.stats.totalSize
      });
    } catch (error: unknown) {
      const redisError = error as RedisError;
      const errorMessage = redisError?.message || `Unknown error migrating key ${key}`;
      throw new Error(`Migration failed for key ${key}: ${errorMessage}`);
    }
  }

  private async migrateString(key: string): Promise<void> {
    const value = await this.source.get(key);
    if (value !== null) {
      await this.target.set(key, value);
    }
  }

  private async migrateHash(key: string): Promise<void> {
    const data = await this.source.hgetall(key);
    if (Object.keys(data).length > 0) {
      await this.target.hmset(key, data);
    }
  }

  private async migrateSet(key: string): Promise<void> {
    const members = await this.source.smembers(key);
    if (members.length > 0) {
      await this.target.sadd(key, ...members);
    }
  }

  private async migrateSortedSet(key: string): Promise<void> {
    const members = await this.source.zrange(key, 0, -1, 'WITHSCORES');
    if (members.length > 0) {
      const args = [];
      for (let i = 0; i < members.length; i += 2) {
        args.push(members[i + 1], members[i]);
      }
      await this.target.zadd(key, ...args);
    }
  }

  private async migrateList(key: string): Promise<void> {
    const items = await this.source.lrange(key, 0, -1);
    if (items.length > 0) {
      // First delete the existing list in target
      await this.target.del(key);
      // Then add all items
      await this.target.rpush(key, ...items);
    }
  }

  private updateSpeed(): void {
    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    this.stats.keysPerSecond = Math.round(this.stats.processed / elapsed);
  }

  public async start(): Promise<void> {
    if (this.initialScanRunning) {
      throw new Error('Initial migration already in progress');
    }

    try {
      // Validate connections before starting
      await this.validateConnections();
      
      // Initialize subscriber after validation
      await this.initializeSubscriber();
      
      this.initialScanRunning = true;
      this.isRunning = true;
      this.stats.startTime = Date.now();
      this.scanCursor = '0';
      this.stats.processed = 0;
      this.stats.errors = [];

      try {
        // Enable real-time sync before starting the initial scan
        await this.enableRealtimeSync();

        const dbsize = await this.source.dbsize();
        this.stats.total = Number(dbsize);
        
        // Increase batch size for better performance
        const PIPELINE_BATCH_SIZE = 5000;
        
        while (this.initialScanRunning && this.isRunning) {
          const [cursor, keys] = await this.source.scan(
            this.scanCursor,
            'COUNT',
            PIPELINE_BATCH_SIZE
          );

          this.scanCursor = cursor;

          // Process keys in smaller chunks to avoid memory issues
          const chunkSize = 1000;
          for (let i = 0; i < keys.length; i += chunkSize) {
            const keyChunk = keys.slice(i, i + chunkSize);
            
            // Use pipeline for better performance
            const pipeline = this.target.pipeline();
            
            await Promise.all(
              keyChunk.map(async (key) => {
                try {
                  const keyType = await this.source.type(key);
                  const ttl = await this.source.ttl(key);

                  switch (keyType) {
                    case 'string':
                      const value = await this.source.get(key);
                      if (value !== null) {
                        pipeline.set(key, value);
                      }
                      break;
                    case 'hash':
                      const hash = await this.source.hgetall(key);
                      if (Object.keys(hash).length > 0) {
                        pipeline.hmset(key, hash);
                      }
                      break;
                    // ... other cases remain the same ...
                  }

                  if (ttl > 0) {
                    pipeline.expire(key, ttl);
                  }

                  this.stats.processed++;
                  const keySize = await this.calculateTotalSize(key);
                  this.stats.totalSize += keySize;
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                  this.stats.errors.push(`Error processing key ${key}: ${errorMessage}`);
                }
              })
            );

            // Execute pipeline
            await pipeline.exec();
            
            // Update metrics less frequently
            if (this.stats.processed % 1000 === 0) {
              await this.logMetrics();
              this.updateSpeed();
              this.emit('progress', {
                processed: this.stats.processed,
                total: this.stats.total,
                percent: Math.min((this.stats.processed / this.stats.total) * 100, 100),
                keysPerSecond: this.stats.keysPerSecond,
                totalSize: this.stats.totalSize
              });
            }
          }

          if (cursor === '0') {
            break;
          }
        }

        this.initialScanRunning = false;
        this.emit('scanComplete');

        // Keep real-time sync running after initial scan completes
        if (this.isRunning) {
          this.emit('progress', {
            processed: this.stats.processed,
            total: this.stats.total,
            percent: 100,
            keysPerSecond: this.stats.keysPerSecond,
            totalSize: this.stats.totalSize,
          });
        }
      } catch (error: unknown) {
        const redisError = error as RedisError;
        const errorMessage = redisError?.message || 'Unknown error during migration';
        this.stats.errors.push(`Migration failed: ${errorMessage}`);
        this.emit('error', redisError);
        throw redisError;
      }
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  private async enableRealtimeSync(): Promise<void> {
    try {
      // Enable keyspace notifications if not already enabled
      const config = await this.source.config('GET', 'notify-keyspace-events') as [string, string];
      const currentConfig = config[1] || '';
      
      if (!currentConfig.includes('A') || !currentConfig.includes('K') || !currentConfig.includes('E')) {
        await this.source.config('SET', 'notify-keyspace-events', 'AKE');
      }

      // Subscribe to all keyspace events
      await this.subscriber?.psubscribe('__keyspace@0__:*');
      
      this.realtimeSyncEnabled = true;
      
      // Set up the event handler for real-time updates
      this.subscriber?.on('pmessage', async (_pattern, channel, message) => {
        if (!this.realtimeSyncEnabled) return;
        
        const key = channel.split(':').slice(1).join(':');
        const operation = message;

        try {
          switch (operation) {
            case 'set':
            case 'hset':
            case 'sadd':
            case 'zadd':
            case 'lpush':
            case 'rpush':
              await this.migrateKey(key);
              this.stats.processed++;
              await this.updateCounts();
              this.emit('keyProcessed', { key, operation: 'update' });
              break;
            case 'del':
              await this.target.del(key);
              this.emit('keyProcessed', { key, operation: 'delete' });
              break;
            case 'expire':
              const ttl = await this.source.ttl(key);
              if (ttl > 0) {
                await this.target.expire(key, ttl);
              }
              this.emit('keyProcessed', { key, operation: 'expire' });
              break;
          }
        } catch (error) {
          console.error(`Error processing real-time update for key ${key}:`, error);
          this.emit('error', error);
        }
      });
    } catch (error) {
      console.error('Error enabling real-time sync:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    this.initialScanRunning = false;
    this.isRunning = false;
    this.realtimeSyncEnabled = false;
    
    try {
      // Unsubscribe from keyspace notifications
      await this.subscriber?.punsubscribe('__keyspace@0__:*');
      
      // Clear any pending updates
      this.keyUpdateQueue.clear();
      this.processingQueue = false;
      
      this.emit('stopped');
    } catch (error) {
      console.error('Error stopping migration:', error);
      throw error;
    }
  }

  public pauseSync(): void {
    this.realtimeSyncEnabled = false;
    this.emit('syncPaused');
  }

  public resumeSync(): void {
    this.realtimeSyncEnabled = true;
    this.emit('syncResumed');
  }

  public getStats(): MigrationStats {
    return { ...this.stats };
  }

  public async cleanup(): Promise<void> {
    try {
      if (this.subscriber) {
        await this.subscriber.quit();
      }
      await this.source.quit();
      await this.target.quit();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  private async updateCounts(): Promise<void> {
    try {
      const currentDbSize = await this.source.dbsize();
      this.stats.total = Number(currentDbSize);
      this.stats.processed = Math.min(this.stats.processed, this.stats.total);
      
      this.emit('progress', {
        processed: this.stats.processed,
        total: this.stats.total,
        percent: Math.min((this.stats.processed / this.stats.total) * 100, 100),
        keysPerSecond: this.stats.keysPerSecond,
        totalSize: this.stats.totalSize,
      });
    } catch (error) {
      console.error('Error updating counts:', error);
    }
  }

  private startPeriodicCountUpdate() {
    setInterval(async () => {
      if (this.realtimeSyncEnabled) {
        await this.updateCounts();
      }
    }, 5000); // Update every 5 seconds
  }

  private async calculateTotalSize(key: string): Promise<number> {
    try {
      const keyType = await this.source.type(key);
      let size = 0;

      switch (keyType) {
        case 'string':
          const value = await this.source.get(key);
          size = value ? Buffer.byteLength(value) : 0;
          break;
        case 'hash':
          const hashData = await this.source.hgetall(key);
          size = Object.entries(hashData).reduce((acc, [k, v]) => 
            acc + Buffer.byteLength(k) + Buffer.byteLength(v), 0);
          break;
        case 'set':
          const setMembers = await this.source.smembers(key);
          size = setMembers.reduce((acc, member) => 
            acc + Buffer.byteLength(member), 0);
          break;
        case 'zset':
          const zsetMembers = await this.source.zrange(key, 0, -1, 'WITHSCORES');
          size = zsetMembers.reduce((acc, member) => 
            acc + Buffer.byteLength(member), 0);
          break;
        case 'list':
          const listItems = await this.source.lrange(key, 0, -1);
          size = listItems.reduce((acc, item) => 
            acc + Buffer.byteLength(item), 0);
          break;
      }

      // Add the key size itself
      size += Buffer.byteLength(key);
      return size;
    } catch (error) {
      console.error(`Error calculating size for key ${key}:`, error);
      return 0;
    }
  }

  private async logMetrics() {
    const now = Date.now();
    if (now - this.lastMetricLog >= this.METRIC_LOG_INTERVAL) {
      try {
        const timestamp = new Date().toISOString();
        
        // Create the metrics object with latest data
        const metrics: MigrationMetrics = {
          timestamp,
          totalSize: this.stats.totalSize,
          keysProcessed: this.stats.processed,
          totalKeys: this.stats.total,
          currentSpeed: this.stats.keysPerSecond,
          progress: Math.min((this.stats.processed / this.stats.total) * 100, 100),
          errors: this.stats.errors.length > 0 ? this.stats.errors : undefined,
          status: this.isRunning ? 'running' : 'completed'
        };

        // Emit metrics event instead of trying to use Supabase
        this.emit('metrics', metrics);

        this.lastMetricLog = now;
      } catch (error) {
        console.error('Error logging metrics:', error);
      }
    }
  }

  async testConnection(redis: Redis): Promise<{ success: boolean; error?: string }> {
    try {
      await redis.ping();
      return { success: true };
    } catch (error) {
      const redisError = error as RedisError;
      let errorMessage = 'Connection failed';
      
      if (redisError.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused. Please check if Redis is running and the host/port are correct.';
      } else if (redisError.message?.includes('WRONGPASS') || redisError.message?.includes('AUTH')) {
        errorMessage = 'Authentication failed. Please check your password.';
      } else if (redisError.code === 'ETIMEDOUT') {
        errorMessage = 'Connection timed out. Please check your host address and network connectivity.';
      } else if (redisError.code === 'ENOTFOUND') {
        errorMessage = 'Host not found. Please check your host address.';
      } else if (redisError.code === 'ECONNRESET') {
        errorMessage = 'Connection reset by peer. This might be due to network issues or firewall restrictions.';
      }
      
      console.error('Redis connection error:', {
        code: redisError.code,
        message: redisError.message,
        error: errorMessage
      });
      
      return { success: false, error: errorMessage };
    }
  }

  async validateConnections(): Promise<void> {
    try {
      // Test source connection
      const sourceTest = await this.testConnection(this.source);
      if (!sourceTest.success) {
        throw new Error(`Source Redis: ${sourceTest.error}`);
      }

      // Test target connection
      const targetTest = await this.testConnection(this.target);
      if (!targetTest.success) {
        throw new Error(`Target Redis: ${targetTest.error}`);
      }

      // Additional validation for same instance check
      try {
        const sourceInfo = await this.source.info('server');
        const targetInfo = await this.target.info('server');
        
        if (sourceInfo === targetInfo) {
          throw new Error('Source and target appear to be the same Redis instance. Please use different instances.');
        }
      } catch (error) {
        // If info command fails, it's likely due to connection issues
        throw new Error('Failed to validate Redis instances. Please check your connection settings.');
      }
    } catch (error) {
      // Ensure cleanup happens on validation failure
      await this.cleanup();
      throw error;
    }
  }

  private async initializeSubscriber(): Promise<void> {
    if (!this.subscriber) {
      this.subscriber = this.source.duplicate();
      this.subscriber.on('error', (err) => {
        console.error('Subscriber Redis error:', err);
        this.emit('error', new Error(`Subscriber Redis error: ${err.message}`));
      });
    }
  }
}
