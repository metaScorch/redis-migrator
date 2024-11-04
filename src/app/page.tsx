"use client";
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { PerformanceChart } from '@/components/performance-chart';
import { createClient } from '@supabase/supabase-js';

interface RedisConfig {
  host: string;
  port: string;
  password?: string;
  tls: boolean;
}

interface MigrationStatus {
  isRunning: boolean;
  progress: number;
  keysProcessed: number;
  totalKeys: number;
  currentSpeed: number;
  errors: string[];
  lastUpdate?: Date;
  recentOperations?: Array<{
    key: string;
    operation: string;
    timestamp: Date;
  }>;
  recentChanges?: Array<{
    key: string;
    operation: string;
    timestamp: Date;
  }>;
  totalSize: number;
  migrationId?: string;
}

interface PerformanceData {
  timestamp: number;
  speed: number;
  keysProcessed: number;
}

interface MigrationStats {
  totalSize: number;  // in bytes
  keysProcessed: number;
  totalKeys: number;
  currentSpeed: number;
  startTime?: Date;
  endTime?: Date;
}

interface MigrationLog {
  id?: string;
  migration_id: string;
  source_host: string;
  target_host: string;
  status: 'started' | 'completed' | 'failed' | 'stopped';
  stats: MigrationStats;
  error?: string;
  created_at?: Date;
}

export default function RedisMigration() {
  const [source, setSource] = useState<RedisConfig>({
    host: '',
    port: '6379',
    password: '',
    tls: false,
  });

  const [target, setTarget] = useState<RedisConfig>({
    host: '',
    port: '6379',
    password: '',
    tls: false,
  });

  const [status, setStatus] = useState<MigrationStatus>({
    isRunning: false,
    progress: 0,
    keysProcessed: 0,
    totalKeys: 0,
    currentSpeed: 0,
    errors: [],
    totalSize: 0,
  });

  const [performanceHistory, setPerformanceHistory] = useState<PerformanceData[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_API_KEY!
  );

  useEffect(() => {
    if (status.isRunning) {
      const eventSource = new EventSource('/api/migration/events');
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setStatus(prev => ({
          ...prev,
          ...data,
        }));
      };

      return () => {
        eventSource.close();
      };
    }
  }, [status.isRunning]);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    if (status.isRunning) {
      // Initial poll
      pollStatus();
      
      // Set up polling interval (every second)
      pollInterval = setInterval(pollStatus, 1000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [status.isRunning]);

  const startMigration = async () => {
    try {
      const migrationId = crypto.randomUUID();
      const response = await fetch('/api/migration/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, target, migrationId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start migration');
      }

      const data = await response.json();
      
      const timestamp = new Date().toISOString();
      const { error: logsError } = await supabase
        .from('migration_logs')
        .insert({
          migration_id: migrationId,
          source_host: source.host,
          target_host: target.host,
          status: 'started',
          stats: {
            totalSize: data.totalSize || 0,
            keysProcessed: 0,
            totalKeys: data.totalKeys || 0,
            currentSpeed: 0,
            startTime: timestamp
          }
        });

      if (logsError) {
        throw new Error(`Failed to create migration log: ${logsError.message}`);
      }

      setStatus(prev => ({
        ...prev,
        isRunning: true,
        errors: [],
        progress: 0,
        keysProcessed: 0,
        totalKeys: data.totalKeys || 0,
        totalSize: data.totalSize || 0,
        currentSpeed: 0,
        migrationId
      }));
      setPerformanceHistory([]);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Migration error:', errorMessage);
      setStatus(prev => ({
        ...prev,
        errors: [...prev.errors, errorMessage],
        isRunning: false
      }));
    }
  };

  const stopMigration = async () => {
    try {
      const response = await fetch('/api/migration/stop', { method: 'POST' });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to stop migration');
      }

      // Log migration stop to Supabase
      if (status.migrationId) {
        await supabase.from('migration_logs').insert({
          migration_id: status.migrationId,
          source_host: source.host,
          target_host: target.host,
          status: 'stopped',
          stats: {
            totalSize: status.totalSize,
            keysProcessed: status.keysProcessed,
            totalKeys: status.totalKeys,
            currentSpeed: status.currentSpeed,
            endTime: new Date(),
          }
        });
      }

      setStatus(prev => ({ ...prev, isRunning: false }));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setStatus(prev => ({
        ...prev,
        errors: [...prev.errors, errorMessage],
      }));
    }
  };

  const pollStatus = async () => {
    try {
      const response = await fetch('/api/migration/status');
      const data = await response.json();
      
      setStatus(prev => ({ ...prev, ...data }));
      
      // Update performance history
      setPerformanceHistory(prev => [
        ...prev,
        {
          timestamp: Date.now(),
          speed: data.currentSpeed,
          keysProcessed: data.keysProcessed,
        },
      ].slice(-60)); // Keep last 60 seconds
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  };

  const estimateTimeRemaining = () => {
    if (status.currentSpeed <= 0) return 'Calculating...';
    const remainingKeys = status.totalKeys - status.keysProcessed;
    const secondsRemaining = remainingKeys / status.currentSpeed;
    return formatDuration(secondsRemaining * 1000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <img src="/images/redswish-logo.png" alt="RedSwish Logo" className="h-8 w-8" />
        <div>
          <span className="text-red-600">Red</span>
          <span>Zwitch</span>
        </div>
        - Redis Migration Utility Tool
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Source Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Source Redis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Host</Label>
                <Input
                  value={source.host}
                  onChange={e => setSource(prev => ({ ...prev, host: e.target.value }))}
                  placeholder="localhost"
                />
              </div>
              <div>
                <Label>Port</Label>
                <Input
                  value={source.port}
                  onChange={e => setSource(prev => ({ ...prev, port: e.target.value }))}
                  placeholder="6379"
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={source.password}
                  onChange={e => setSource(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={source.tls}
                  onCheckedChange={checked => setSource(prev => ({ ...prev, tls: checked }))}
                />
                <Label>TLS Enabled</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Target Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Target Redis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Host</Label>
                <Input
                  value={target.host}
                  onChange={e => setTarget(prev => ({ ...prev, host: e.target.value }))}
                  placeholder="localhost"
                />
              </div>
              <div>
                <Label>Port</Label>
                <Input
                  value={target.port}
                  onChange={e => setTarget(prev => ({ ...prev, port: e.target.value }))}
                  placeholder="6379"
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={target.password}
                  onChange={e => setTarget(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={target.tls}
                  onCheckedChange={checked => setTarget(prev => ({ ...prev, tls: checked }))}
                />
                <Label>TLS Enabled</Label>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Migration Controls & Status */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Migration Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="operations">Recent Operations</TabsTrigger>
              <TabsTrigger value="errors">Errors</TabsTrigger>
              <TabsTrigger value="realtime">Realtime Changes</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="space-x-4">
                    <Button
                      onClick={startMigration}
                      disabled={status.isRunning || !source.host || !target.host}
                    >
                      Start Migration
                    </Button>
                    <Button
                      onClick={stopMigration}
                      disabled={!status.isRunning}
                      variant="destructive"
                    >
                      Stop Migration
                    </Button>
                  </div>
                  <div className="text-sm text-gray-500">
                    {status.isRunning ? 'Migration in progress' : 'Migration stopped'}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${status.progress}%` }}
                  ></div>
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label>Progress</Label>
                    <div className="text-xl font-bold">{status.progress.toFixed(1)}%</div>
                  </div>
                  <div>
                    <Label>Keys Processed</Label>
                    <div className="text-xl font-bold">{status.keysProcessed.toLocaleString()}</div>
                  </div>
                  <div>
                    <Label>Total Keys</Label>
                    <div className="text-xl font-bold">{status.totalKeys.toLocaleString()}</div>
                  </div>
                  <div>
                    <Label>Current Speed</Label>
                    <div className="text-xl font-bold">{status.currentSpeed.toLocaleString()} keys/sec</div>
                  </div>
                  <div>
                    <Label>Estimated Time Remaining</Label>
                    <div className="text-xl font-bold">{estimateTimeRemaining()}</div>
                  </div>
                  <div>
                    <Label>Total Size</Label>
                    <div className="text-xl font-bold">{formatBytes(status.totalSize)}</div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="performance">
              <PerformanceChart data={performanceHistory} />
            </TabsContent>

            <TabsContent value="operations">
              <div className="space-y-2">
                {status.recentOperations?.map((op, index) => (
                  <div key={index} className="flex justify-between items-center text-sm">
                    <span>{op.key}</span>
                    <span className="text-gray-500">{op.operation}</span>
                    <span className="text-gray-500">
                      {new Date(op.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="errors">
              {status.errors.length > 0 ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {status.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="text-gray-500">No errors reported</div>
              )}
            </TabsContent>

            <TabsContent value="realtime">
              <div className="space-y-2">
                {status.recentChanges?.map((change, index) => (
                  <div key={index} className="flex justify-between items-center text-sm">
                    <span>{change.key}</span>
                    <span className="text-gray-500">{change.operation}</span>
                    <span className="text-gray-500">
                      {new Date(change.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
