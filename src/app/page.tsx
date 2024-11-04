/* eslint-disable @typescript-eslint/no-unused-vars */
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Image from 'next/image';

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

// Add this near the feature cards section
const featureCards = [
  {
    title: "Real-Time Monitoring",
    description: "Track your migration progress in real-time with detailed metrics, speed analysis, and estimated completion time."
  },
  {
    title: "Real-Time Synchronization",
    description: "Continuously monitor and sync changes between source and target Redis instances during migration, ensuring zero data loss."
  },
  {
    title: "Secure Transfer",
    description: "Support for TLS encryption and password protection ensures your data remains secure during migration."
  }
];

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

  // Add new state for validation errors
  const [validationError, setValidationError] = useState<string | null>(null);

  // Add environment check function
  const isDevelopment = process.env.NEXT_PUBLIC_ENV === 'development';

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
    // Reset validation error
    setValidationError(null);

    // Check if source and target are the same
    if (source.host === target.host && source.port === target.port) {
      setValidationError("Source and target cannot be the same Redis instance");
      return;
    }

    // Check localhost restriction
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
      {/* Update the header section */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Image 
            src="/images/redswish-logo.png" 
            alt="RedSwish Logo" 
            width={32} 
            height={32} 
          />
          <div>
            <span className="text-red-600">Red</span>
            <span>Zwitch</span>
          </div>
        </h1>
        <p className="text-gray-600 max-w-3xl">
          A powerful Redis migration tool with real-time synchronization. Migrate your Redis instances while maintaining data consistency through continuous monitoring and automatic updates of any changes during the migration process.
        </p>
      </div>

      {/* Update the feature cards section */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        {featureCards.map((card, index) => (
          <Card key={index}>
            <CardHeader>
              <CardTitle>{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Update the features list */}
      <div className="bg-gray-50 p-8 rounded-lg mb-12">
        <h3 className="text-2xl font-bold mb-4">Features</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>Real-time data synchronization during migration</li>
            <li>Zero downtime migration support</li>
            <li>Performance optimization with batch processing</li>
            <li>Support for all Redis data types</li>
          </ul>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>Live change monitoring and replication</li>
            <li>Real-time performance metrics</li>
            <li>Secure TLS connection support</li>
            <li>Automatic error recovery</li>
          </ul>
        </div>
      </div>

      {/* Add validation error alert before the migration controls */}
      {validationError && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      {/* Migration Interface */}
      <div id="migration-interface">
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

        {/* Add this section for migration controls */}
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

        {/* Add error alerts if any */}
        {status.errors.length > 0 && (
          <div className="mt-4">
            {status.errors.map((error, index) => (
              <Alert variant="destructive" key={index} className="mb-2">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* Add progress information when migration is running */}
        {status.isRunning && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Progress</p>
                <p className="text-lg font-semibold">{Math.round(status.progress)}%</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Keys Processed</p>
                <p className="text-lg font-semibold">{status.keysProcessed} / {status.totalKeys}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Current Speed</p>
                <p className="text-lg font-semibold">{Math.round(status.currentSpeed)} keys/sec</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Time Remaining</p>
                <p className="text-lg font-semibold">{estimateTimeRemaining()}</p>
              </div>
            </div>
          </div>
        )}

        {/* Add right after the progress information section, before the closing div of migration-interface */}
        <div className="mt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="logs">Live Changes During Migration</TabsTrigger>
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
      </div>

      {/* FAQ Section */}
      <div className="mt-12 mb-8">
        <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>How do I start a migration?</AccordionTrigger>
            <AccordionContent>
              <p className="text-gray-600">
                1. Enter your source Redis instance details (host, port, password if required)<br />
                2. Enter your target Redis instance details<br />
                3. Enable TLS if your Redis instances require secure connections<br />
                4. Click the &quot;Start Migration&quot; button to begin the process
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-2">
            <AccordionTrigger>Can I migrate between different Redis versions?</AccordionTrigger>
            <AccordionContent>
              <p className="text-gray-600">
                Yes, RedZwitch supports migration between different Redis versions. However, it&apos;s recommended to migrate to the same or newer version to ensure compatibility with all data types and commands.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-3">
            <AccordionTrigger>What happens if the migration is interrupted?</AccordionTrigger>
            <AccordionContent>
              <p className="text-gray-600">
                If the migration is interrupted, you can safely restart it. RedZwitch keeps track of migrated keys and will resume from where it left off. Any changes made to the source database during the interruption will be synchronized when the migration resumes.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-4">
            <AccordionTrigger>Is my data safe during migration?</AccordionTrigger>
            <AccordionContent>
              <p className="text-gray-600">
                Yes, RedZwitch ensures data safety through:<br />
                - Read-only operations on the source database<br />
                - TLS encryption support for secure data transfer<br />
                - Real-time verification of migrated data<br />
                - Automatic error handling and recovery
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-5">
            <AccordionTrigger>Can I use localhost Redis instances?</AccordionTrigger>
            <AccordionContent>
              <p className="text-gray-600">
                No, localhost connections aren&apos;t allowed as the migration tool is designed to run on the web.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-6">
            <AccordionTrigger>How does RedZwitch handle data privacy and security?</AccordionTrigger>
            <AccordionContent>
              <p className="text-gray-600">
                RedZwitch takes data protection seriously. We operate strictly as a transit service and do not store or log any of your Redis data. The migration process happens in real-time, with data flowing directly between your source and target Redis instances. We never persist, cache, or store your data on our servers. The only information we maintain is basic migration statistics (like progress and speed) to support the migration process, but this never includes your actual Redis data.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}

