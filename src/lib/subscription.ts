import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function getSubscription(userId: string) {
  const supabase = createServerComponentClient({ cookies });
  
  const { data: subscription, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (error) {
    console.error('Error fetching subscription:', error);
    return null;
  }

  return subscription;
}