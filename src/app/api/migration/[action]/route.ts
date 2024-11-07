import { NextRequest, NextResponse } from 'next/server';
import { RedisMigrator } from '../../../../lib/redis-migrator';
import { migrator, migrationStatus, setMigrator } from '../../../../lib/migration-store';
import { createClient } from 'redis';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getSubscription } from '../../../../lib/subscription';

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

interface PricingTier {
  name: string;
  maxKeys: number;
  costPerKey: number;
  flatCost?: number;
}

const pricingTiers: PricingTier[] = [
  { name: 'Free Plan', maxKeys: 5000, costPerKey: 0 },
  { name: 'Starter Plan', maxKeys: 10000, costPerKey: 0.005 },
  { name: 'Basic Plan', maxKeys: 100000, costPerKey: 0.002 },
  { name: 'Growth Plan', maxKeys: 500000, costPerKey: 0.0015 },
  { name: 'Pro Plan', maxKeys: 1000000, costPerKey: 0.001 },
  { name: 'Enterprise Plan', maxKeys: 10000000, costPerKey: 0.0001, flatCost: 1000 },
];

function getApplicableTier(keyCount: number) {
  if (keyCount === 0) return { tier: pricingTiers[0], cost: 0 };
  
  const applicableTier = pricingTiers
    .filter(tier => keyCount <= tier.maxKeys)
    .reduce((best, current) => {
      const bestCost = best.flatCost || (best.costPerKey * keyCount);
      const currentCost = current.flatCost || (current.costPerKey * keyCount);
      return currentCost < bestCost ? current : best;
    });

  const cost = applicableTier.flatCost || (applicableTier.costPerKey * keyCount);
  return { tier: applicableTier, cost };
}

export async function POST(request: NextRequest) {
  try {
    const action = request.nextUrl.pathname.split('/').pop();
    
    if (action === 'start') {
      const body = await request.json();
      const { source, target, migrationId } = body;

      // Create source client to check key count
      const sourceClient = createClient({
        url: `redis${source.tls ? 's' : ''}://${source.host}:${source.port}`,
        password: source.password,
      });

      await sourceClient.connect();
      const totalKeys = await sourceClient.dbSize();
      await sourceClient.quit();

      // Check if migration is allowed based on key count and user status
      if (totalKeys > 5000) {
        const supabase = createServerComponentClient({ cookies });
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (!user || userError) {
          return NextResponse.json(
            { error: 'Authentication required for migrations over 5000 keys' },
            { status: 401 }
          );
        }

        // Check subscription status
        const { data: subscription, error: subError } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .single();

        if (subError || !subscription) {
          const { tier, cost } = getApplicableTier(totalKeys);
          return NextResponse.json({
            error: 'Subscription required',
            requiredPlan: tier.name,
            estimatedCost: cost,
            keyCount: totalKeys
          }, { status: 403 });
        }
      }

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
