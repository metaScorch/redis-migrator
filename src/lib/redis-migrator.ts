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
}

interface RedisError extends Error {
  code?: string;
  errno?: number;
  syscall?: string;
  hostname?: string;
  command?: string;
}

export class RedisMigrator extends EventEmitter {
  public source: Redis;
  private target: Redis;
  private subscriber: Redis;
  private stats: MigrationStats;
  private initialScanRunning: boolean = false;
  private realtimeSyncEnabled: boolean = false;
  private scanCursor: string = '0';
  private batchSize: number = 1000;
  private keyUpdateQueue: Set<string> = new Set();
  private processingQueue: boolean = false;
  private isRunning: boolean = false;

  constructor(sourceConfig: RedisConfig, targetConfig: RedisConfig, options: { enableRealtimeSync?: boolean } = {}) {
    super();
    this.source = new Redis({
      host: sourceConfig.host,
      port: sourceConfig.port,
      password: sourceConfig.password,
      tls: sourceConfig.tls ? {} : undefined,
    });

    this.target = new Redis({
      host: targetConfig.host,
      port: targetConfig.port,
      password: targetConfig.password,
      tls: targetConfig.tls ? {} : undefined,
    });

    this.subscriber = this.source.duplicate();

    this.stats = {
      processed: 0,
      total: 0,
      errors: [],
      startTime: 0,
      keysPerSecond: 0,
    };

    this.setupKeyspaceNotifications();

    if (options.enableRealtimeSync) {
      this.setupRealtimeSync();
      this.startPeriodicCountUpdate();
    }
  }

  private async setupKeyspaceNotifications() {
    try {
      await this.source.config('SET', 'notify-keyspace-events', 'AKE');
      await this.subscriber.psubscribe('__keyspace@0__:*');
      
      this.subscriber.on('pmessage', async (_pattern, channel, message) => {
        if (!this.realtimeSyncEnabled) return;
        
        const key = channel.split(':').slice(1).join(':'); // Handle keys with colons
        const operation = message;

        // Handle different operations
        switch (operation) {
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
          case 'set':
          case 'hset':
          case 'sadd':
          case 'zadd':
          case 'lpush':
          case 'rpush':
            this.keyUpdateQueue.add(key);
            if (!this.processingQueue) {
              await this.processKeyUpdateQueue();
            }
            break;
        }
      });

    } catch (error: unknown) {
      const redisError = error as RedisError;
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
      
      // Emit progress after each key
      this.emit('progress', {
        processed: this.stats.processed,
        total: this.stats.total,
        percent: Math.min((this.stats.processed / this.stats.total) * 100, 100),
        keysPerSecond: this.stats.keysPerSecond,
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
      
      while (this.initialScanRunning && this.isRunning) {
        const [cursor, keys] = await this.source.scan(
          this.scanCursor,
          'COUNT',
          this.batchSize
        );

        this.scanCursor = cursor;

        await Promise.all(
          keys.map(key => this.migrateKey(key))
        );

        const currentDbSize = await this.source.dbsize();
        this.stats.total = Number(currentDbSize);

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
        });
      }
    } catch (error: unknown) {
      const redisError = error as RedisError;
      const errorMessage = redisError?.message || 'Unknown error during migration';
      this.stats.errors.push(`Migration failed: ${errorMessage}`);
      this.emit('error', redisError);
      throw redisError;
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
      await this.subscriber.psubscribe('__keyspace@0__:*');
      
      this.realtimeSyncEnabled = true;
      
      // Set up the event handler for real-time updates
      this.subscriber.on('pmessage', async (_pattern, channel, message) => {
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
      await this.subscriber.punsubscribe('__keyspace@0__:*');
      
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
    this.stop();
    if (this.subscriber) {
      await this.subscriber.quit();
    }
    await this.source.quit();
    await this.target.quit();
  }

  private setupRealtimeSync() {
    // Configure Redis keyspace notifications on source
    this.source.config('SET', 'notify-keyspace-events', 'KEA');

    // Subscribe to keyspace notifications
    const subscriber = this.source.duplicate();
    subscriber.subscribe('__keyspace@0__:*', (err, count) => {
      if (err) {
        this.emit('error', new Error('Failed to subscribe to keyspace events'));
        return;
      }
    });

    // Handle changes
    subscriber.on('message', async (channel, message) => {
      const key = channel.split(':')[1];
      try {
        // Get the new value from source
        const value = await this.source.get(key);
        // Replicate to target
        if (value !== null) {
          await this.target.set(key, value);
        } else {
          await this.target.del(key);
        }
        
        this.emit('realtimeSync', {
          key,
          operation: value === null ? 'delete' : 'set',
        });
      } catch (error) {
        this.emit('error', error);
      }
    });
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
}
