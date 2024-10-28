import { RedisMigrator } from './redis-migrator';

export let migrator: RedisMigrator | null = null;

export const migrationStatus = {
  isRunning: false,
  progress: 0,
  keysProcessed: 0,
  totalKeys: 0,
  currentSpeed: 0,
  errors: [] as string[],
  lastUpdate: null as Date | null,
  recentOperations: [] as Array<{
    key: string;
    operation: string;
    timestamp: Date;
  }>,
};

export function setMigrator(instance: RedisMigrator | null) {
  migrator = instance;
}