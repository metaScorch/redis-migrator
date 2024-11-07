import { createClient } from 'redis';
import { NextResponse } from 'next/server';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export async function POST(request: Request) {
  try {
    const { source } = await request.json();
    const supabase = createClientComponentClient();

    // Get current user session
    const { data: { session } } = await supabase.auth.getSession();

    // Create Redis client for source
    const sourceClient = createClient({
      url: `redis${source.tls ? 's' : ''}://${source.host}:${source.port}`,
      password: source.password,
    });

    await sourceClient.connect();

    try {
      const totalKeys = await sourceClient.dbSize();
      await sourceClient.quit();

      // If keys are under free tier limit, allow migration
      if (totalKeys <= 5000) {
        return NextResponse.json({ 
          canProceed: true,
          totalKeys,
          requiresSubscription: false 
        });
      }

      // If over free tier, check if user is logged in
      if (!session) {
        return NextResponse.json({
          canProceed: false,
          totalKeys,
          requiresSubscription: true,
          message: "Please login to migrate more than 5000 keys"
        });
      }

      // Get user's subscription status from Supabase
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      // Calculate cost for pay-as-you-go
      const { tier, cost } = getApplicableTier(totalKeys);

      return NextResponse.json({
        canProceed: subscription?.status === 'active',
        totalKeys,
        requiresSubscription: true,
        subscriptionStatus: subscription?.status || 'none',
        payAsYouGoCost: cost,
        recommendedTier: tier.name
      });

    } catch (error) {
      await sourceClient.quit();
      throw error;
    }
  } catch (error: any) {
    console.error('Error checking limits:', error);
    return NextResponse.json(
      { error: `Error checking limits: ${error.message}` },
      { status: 500 }
    );
  }
}