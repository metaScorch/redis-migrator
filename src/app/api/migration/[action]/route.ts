import { NextRequest, NextResponse } from 'next/server';
import { RedisMigrator } from '@/lib/redis-migrator';
import { migrator, migrationStatus, setMigrator } from '@/lib/migration-store';

export async function POST(
  request: NextRequest,
) {
  const action = request.nextUrl.pathname.split('/').pop();
  
  if (action === 'start') {
    try {
      const body = await request.json();
      const { source, target } = body;

      if (migrationStatus.isRunning) {
        return NextResponse.json(
          { error: 'Migration already in progress' },
          { status: 400 }
        );
      }

      const migratorInstance = new RedisMigrator(
        {
          host: source.host,
          port: parseInt(source.port),
          password: source.password,
          tls: source.tls,
        },
        {
          host: target.host,
          port: parseInt(target.port),
          password: target.password,
          tls: target.tls,
        }
      );

      setMigrator(migratorInstance);
      migrationStatus.isRunning = true;
      
      return NextResponse.json({ message: 'Migration started' });
    } catch (error) {
      console.error('Failed to start migration:', error);
      return NextResponse.json(
        { error: 'Failed to start migration' },
        { status: 500 }
      );
    }
  }

  if (action === 'stop') {
    try {
      if (migrator) {
        await migrator.stop();
        setMigrator(null);
      }
      migrationStatus.isRunning = false;
      return NextResponse.json({ message: 'Migration stopped' });
    } catch (error) {
      console.error('Failed to stop migration:', error);
      return NextResponse.json(
        { error: 'Failed to stop migration' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(
  request: NextRequest,
) {
  const action = request.nextUrl.pathname.split('/').pop();
  
  if (action === 'status') {
    return NextResponse.json(migrationStatus);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
