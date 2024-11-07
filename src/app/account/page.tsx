"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function AccountPage() {
  const [user, setUser] = useState(null);
  const [migrations, setMigrations] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      // Fetch user's migrations
      const { data: migrations } = await supabase
        .from('migration_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      setMigrations(migrations || []);
    };

    getUser();
  }, [router, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const handleUpdateProfile = async () => {
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { full_name: newName }
      });

      if (error) throw error;
      setUser(data.user);
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  if (!user) return null;

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold">My Account</h1>
          <p className="text-gray-500">{user?.user_metadata?.full_name}</p>
        </div>
        <Button variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {isEditing ? (
                <div className="flex gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Enter new name"
                  />
                  <Button onClick={handleUpdateProfile}>Save</Button>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <p><strong>Name:</strong> {user?.user_metadata?.full_name}</p>
                  <Button variant="ghost" onClick={() => {
                    setNewName(user?.user_metadata?.full_name || '');
                    setIsEditing(true);
                  }}>
                    Edit
                  </Button>
                </div>
              )}
              <p><strong>Email:</strong> {user?.email}</p>
              <p><strong>Account created:</strong> {new Date(user?.created_at).toLocaleDateString()}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Migration History</CardTitle>
          </CardHeader>
          <CardContent>
            {migrations.length > 0 ? (
              <div className="space-y-4">
                {migrations.map((migration) => (
                  <div
                    key={migration.id}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex justify-between">
                      <p><strong>Migration ID:</strong> {migration.migration_id}</p>
                      <span className={`px-2 py-1 rounded-full text-sm ${
                        migration.status === 'completed' ? 'bg-green-100 text-green-800' :
                        migration.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {migration.status}
                      </span>
                    </div>
                    <p><strong>Source:</strong> {migration.source_host}</p>
                    <p><strong>Target:</strong> {migration.target_host}</p>
                    <p><strong>Date:</strong> {new Date(migration.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No migrations found</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}