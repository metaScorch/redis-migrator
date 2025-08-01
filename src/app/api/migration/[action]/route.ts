import { NextRequest, NextResponse } from 'next/server';
import { RedisMigrator } from '../../../../lib/redis-migrator';
import { migrator, migrationStatus, setMigrator } from '../../../../lib/migration-store';

/* eslint-disable @typescript-eslint/no-unused-vars */
interface MigrationStatus {
  isRunning: boolean;
  progress: number;
  keysProcessed: number;
  totalKeys: number;
  currentSpeed: number;
  lastUpdate: Date;
  errors: string[];
  recentOperations: Array<{ key: string; operation: string; timestamp: Date }>;
  recentChanges: Array<{ key: string }>;
  totalSize: number;
}

export async function POST(request: NextRequest) {
  try {
    const action = request.nextUrl.pathname.split('/').pop();
    
    if (action === 'start') {
      const body = await request.json();
      const { source, target, migrationId } = body;

      if (migrationStatus.isRunning) {
        return NextResponse.json(
          { error: 'Migration already in progress' },
          { status: 400 }
        );
      }

      // Create migrator instance
      const migratorInstance = new RedisMigrator(
        {
          host: source.host || 'localhost',
          port: parseInt(source.port) || 6379,
          password: source.password,
          tls: source.tls || false,
        },
        {
          host: target.host || 'localhost',
          port: parseInt(target.port) || 6379,
          password: target.password,
          tls: target.tls || false,
        },
        migrationId,
        { enableRealtimeSync: true }
      );

      // Validate connections before proceeding
      try {
        await migratorInstance.validateConnections();
      } catch (error) {
        // Clean up the instance
        await migratorInstance.cleanup();
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Connection validation failed' },
          { status: 400 }
        );
      }

      // Only set up event handlers and start migration if validation passes
      migratorInstance.on('progress', (stats) => {
        migrationStatus.progress = stats.percent;
        migrationStatus.keysProcessed = stats.processed;
        migrationStatus.totalKeys = stats.total;
        migrationStatus.currentSpeed = stats.keysPerSecond;
        migrationStatus.totalSize = stats.totalSize || 0;
        migrationStatus.lastUpdate = new Date();
      });

      setMigrator(migratorInstance);
      migrationStatus.isRunning = true;
      
      // Start migration in the background
      migratorInstance.start().catch((error) => {
        console.error('Migration error:', error);
        migrationStatus.errors.push(error.message);
        migrationStatus.isRunning = false;
      });
      
      return NextResponse.json({ message: 'Migration started' });
    }

    if (action === 'stop') {
      if (migrator) {
        await migrator.stop();
        setMigrator(null);
      }
      migrationStatus.isRunning = false;
      return NextResponse.json({ message: 'Migration stopped' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.pathname.split('/').pop();
    
    if (action === 'status') {
      return NextResponse.json(migrationStatus);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
