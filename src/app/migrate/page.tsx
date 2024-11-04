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
  startTime?: Date;
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

export default function MigrationPage() {
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
  const [validationError, setValidationError] = useState<string | null>(null);
  const [completionDuration, setCompletionDuration] = useState<number | null>(null);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_API_KEY!
  );

  const isDevelopment = process.env.NEXT_PUBLIC_ENV === 'development';

  useEffect(() => {
    if (status.isRunning) {
      const eventSource = new EventSource('/api/migration/events');
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setStatus(prev => ({
            ...prev,
            ...data,
            lastUpdate: new Date(),
          }));
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE Error:', error);
        eventSource.close();
      };

      return () => {
        eventSource.close();
      };
    }
  }, [status.isRunning]);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    if (status.isRunning) {
      pollStatus();
      pollInterval = setInterval(pollStatus, 1000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [status.isRunning]);

  useEffect(() => {
    if (status.progress >= 100 && !completionDuration && status.startTime) {
      setCompletionDuration(Date.now() - new Date(status.startTime).getTime());
    }
  }, [status.progress, status.startTime, completionDuration]);

  const startMigration = async () => {
    setValidationError(null);
    setStatus(prev => ({ ...prev, errors: [] }));

    if (source.host === target.host && source.port === target.port) {
      setValidationError("Source and target cannot be the same Redis instance");
      return;
    }

    if (!isDevelopment && (source.host === 'localhost' || target.host === 'localhost')) {
      setValidationError("localhost is not allowed");
      return;
    }

    try {
      const migrationId = crypto.randomUUID();
      const response = await fetch('/api/migration/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, target, migrationId }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        if (data.error?.includes('Source Redis:') || data.error?.includes('Target Redis:')) {
          setValidationError(data.error);
        } else {
          throw new Error(data.error || 'Failed to start migration');
        }
        return;
      }

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
        migrationId,
        startTime: new Date()
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
    if (!window.confirm('Are you sure you want to stop the migration? This will halt the real-time synchronization process.')) {
      return;
    }

    try {
      const response = await fetch('/api/migration/stop', { method: 'POST' });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to stop migration');
      }

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
      
      setPerformanceHistory(prev => [
        ...prev,
        {
          timestamp: Date.now(),
          speed: data.currentSpeed,
          keysProcessed: data.keysProcessed,
        },
      ].slice(-60));
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    parts.push(`${seconds % 60}s`);
    
    return parts.join(' ');
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
      {validationError && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

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
                  placeholder="Source Host"
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
                  placeholder="Target Host"
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

      <div className="mt-6 flex justify-center gap-4">
        <Button
          size="lg"
          onClick={startMigration}
          disabled={status.isRunning || !source.host || !target.host}
        >
          Start Migration
        </Button>
        <Button
          size="lg"
          variant="destructive"
          onClick={stopMigration}
          disabled={!status.isRunning}
        >
          Stop Migration
        </Button>
      </div>

      {status.errors.length > 0 && (
        <div className="mt-4">
          {status.errors.map((error, index) => (
            <Alert variant="destructive" key={index} className="mb-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {status.isRunning && (
        <div className="mt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="logs">Live Changes</TabsTrigger>
              <TabsTrigger value="errors">Errors</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-semibold mb-2">Migration Details</h3>
                      <div className="space-y-2 text-sm">
                        <p>Total Size: {formatBytes(status.totalSize)}</p>
                        <p>Total Keys: {status.totalKeys}</p>
                        <p>Keys Processed: {status.keysProcessed}</p>
                        <p>Average Speed: {Math.round(status.currentSpeed)} keys/sec</p>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Connection Details</h3>
                      <div className="space-y-2 text-sm">
                        <p>Source: {source.host}:{source.port}</p>
                        <p>Target: {target.host}:{target.port}</p>
                        <p>Status: {status.isRunning ? 
                          <span className="text-green-600">Running</span> : 
                          <span className="text-gray-600">Stopped</span>
                        }</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="performance">
              <Card>
                <CardContent className="pt-6">
                  <div className="h-[300px]">
                    {performanceHistory.length > 0 ? (
                      <LineChart
                        width={800}
                        height={300}
                        data={performanceHistory}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="timestamp" 
                          tickFormatter={(timestamp) => new Date(timestamp).toLocaleTimeString()}
                        />
                        <YAxis />
                        <Tooltip 
                          labelFormatter={(timestamp) => new Date(timestamp).toLocaleTimeString()}
                          formatter={(value) => [`${value} keys/sec`, 'Speed']}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="speed" 
                          stroke="#8884d8" 
                          name="Migration Speed"
                        />
                      </LineChart>
                    ) : (
                      <div className="h-full flex items-center justify-center text-gray-500">
                        No performance data available
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="logs">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {status.recentOperations?.length ? (
                      status.recentOperations.map((op, index) => (
                        <div key={index} className="text-sm border-b border-gray-100 pb-1">
                          <span className="text-gray-500">
                            {new Date(op.timestamp).toLocaleTimeString()}
                          </span>
                          {' - '}
                          <span className="font-medium">{op.operation}</span>
                          {' - '}
                          <span className="font-mono text-xs">{op.key}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-gray-500">No recent operations</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="errors">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {status.errors.length > 0 ? (
                      status.errors.map((error, index) => (
                        <div 
                          key={index} 
                          className="p-3 bg-red-50 border border-red-200 rounded-md mb-2"
                        >
                          <div className="flex items-start">
                            <div className="text-red-600 mr-2">
                              <svg 
                                className="w-5 h-5" 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path 
                                  strokeLinecap="round" 
                                  strokeLinejoin="round" 
                                  strokeWidth={2} 
                                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                                />
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm text-red-700">{error}</p>
                              <p className="text-xs text-red-500 mt-1">
                                {new Date().toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        No errors recorded during migration
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}