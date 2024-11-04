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
import { Activity, Shield, Radio } from 'lucide-react';
import { Slider } from "@/components/ui/slider";

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

// Add this near the feature cards section
const featureCards = [
  {
    title: "Real-Time Monitoring",
    description: "Track your migration progress in real-time with detailed metrics, speed analysis, and estimated completion time.",
    icon: <Activity className="w-8 h-8 text-red-600 mb-2" />
  },
  {
    title: "Real-Time Synchronization",
    description: "Continuously monitor and sync changes between source and target Redis instances during migration, ensuring zero data loss.",
    icon: <Radio className="w-8 h-8 text-red-600 mb-2" />
  },
  {
    title: "Secure Transfer",
    description: "Support for TLS encryption and password protection ensures your data remains secure during migration.",
    icon: <Shield className="w-8 h-8 text-red-600 mb-2" />
  }
];

// Add these interfaces after your existing interfaces
interface PricingTier {
  name: string;
  maxKeys: number;
  costPerKey: number;
  flatCost?: number;
}

// Add this constant after your existing constants
const pricingTiers: PricingTier[] = [
  { name: 'Free Plan', maxKeys: 5000, costPerKey: 0 },
  { name: 'Starter Plan', maxKeys: 10000, costPerKey: 0.005 },
  { name: 'Basic Plan', maxKeys: 100000, costPerKey: 0.002 },
  { name: 'Growth Plan', maxKeys: 500000, costPerKey: 0.0015 },
  { name: 'Pro Plan', maxKeys: 1000000, costPerKey: 0.001 },
  { name: 'Enterprise Plan', maxKeys: 10000000, costPerKey: 0.0001, flatCost: 1000 },
];

// Add this near the top of your component, after the imports
const navLinks = [
  { name: 'Features', href: '#features' },
  { name: 'Migration', href: '#migration-interface' },
  { name: 'Pricing', href: '#pricing' },
  { name: 'FAQ', href: '#faq' }
];

// Add this helper function to get the applicable tier and cost
const getApplicableTier = (keyCount: number) => {
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
};

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

  // Add new state for completion time
  const [completionDuration, setCompletionDuration] = useState<number | null>(null);

  // Add these state variables inside your RedisMigration component
  const [selectedTier, setSelectedTier] = useState<string>('Free Plan');
  const [customKeyCount, setCustomKeyCount] = useState<string>("10000");

  // Update the calculateCost function to automatically determine the best tier
  const calculateCost = (keyCount: number) => {
    if (keyCount === 0) return 0;
    
    // Find the most cost-effective tier for the given key count
    const applicableTier = pricingTiers
      .filter(tier => keyCount <= tier.maxKeys)
      .reduce((best, current) => {
        const bestCost = best.flatCost || (best.costPerKey * keyCount);
        const currentCost = current.flatCost || (current.costPerKey * keyCount);
        return currentCost < bestCost ? current : best;
      });

    return applicableTier.flatCost || (applicableTier.costPerKey * keyCount);
  };

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

  useEffect(() => {
    if (status.progress >= 100 && !completionDuration && status.startTime) {
      setCompletionDuration(Date.now() - new Date(status.startTime).getTime());
    }
  }, [status.progress, status.startTime, completionDuration]);

  const startMigration = async () => {
    // Reset validation error and status errors
    setValidationError(null);
    setStatus(prev => ({ ...prev, errors: [] }));

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

      const data = await response.json();
      
      if (!response.ok) {
        // Handle specific connection errors
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
    // Add confirmation dialog
    if (!window.confirm('Are you sure you want to stop the migration? This will halt the real-time synchronization process.')) {
      return;
    }

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
    
    // Only include hours/minutes if they're non-zero
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

  // Add this function inside the RedisMigration component, before the return statement
  const scrollToMigration = () => {
    document.getElementById('migration-interface')?.scrollIntoView({ 
      behavior: 'smooth',
      block: 'start'
    });
  };

  return (
    <div className="container mx-auto p-4">
      {/* Add the header navigation */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="container flex h-14 items-center">
          <div className="flex items-center gap-2 mr-8">
            <Image 
              src="/images/redswish-logo.png" 
              alt="RedSwish Logo" 
              width={32} 
              height={32} 
            />
            <div>
              <span className="text-red-600 font-bold">Red</span>
              <span className="font-bold">Zwitch</span>
            </div>
          </div>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-red-600"
              >
                {link.name}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {/* Add this right after the header */}
      <div className="py-16 text-center">
        <h1 className="text-4xl font-bold mb-4">
          A powerful Redis migration tool with real-time synchronization
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
          Migrate your Redis instances while maintaining data consistency through continuous monitoring 
          and automatic updates of any changes during the migration process.
        </p>
        <Button 
          size="lg" 
          onClick={() => document.getElementById('migration-interface')?.scrollIntoView({ behavior: 'smooth' })}
        >
          Migrate Redis
        </Button>
      </div>

      {/* Update the feature cards section */}
      <div id="features" className="grid md:grid-cols-3 gap-6 mb-12">
        {featureCards.map((card, index) => (
          <Card key={index}>
            <CardHeader>
              {card.icon}
              <CardTitle>{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <div>
                <p className="text-sm text-gray-500">Elapsed Time</p>
                <p className="text-lg font-semibold">
                  {status.startTime ? formatDuration(Date.now() - status.startTime.getTime()) : '-'}
                </p>
              </div>
            </div>
            {status.progress >= 100 && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg shadow-sm">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <svg 
                      className="w-5 h-5 text-green-600" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" 
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-green-800 font-medium mb-1">
                      Initial migration completed successfully in {completionDuration ? 
                        formatDuration(completionDuration) : '-'}
                    </p>
                    <p className="text-green-700 text-sm">
                      Now monitoring source instance for real-time changes and synchronizing to target instance.
                    </p>
                    <p className="text-green-600 text-sm mt-2 font-medium">
                      Click "Stop Migration" when you're ready to complete the process.
                    </p>
                  </div>
                </div>
              </div>
            )}
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

      {/* Pricing Section */}
      <div id="pricing" className="mt-12 mb-8">
        <h2 className="text-2xl font-bold mb-6">Simple, Transparent Pricing</h2>
        
        <div className="overflow-x-auto rounded-xl shadow-lg">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Plan Type</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Keys Processed</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Cost per Key</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pricingTiers.map((tier) => (
                <tr 
                  key={tier.name} 
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{tier.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    Up to {tier.maxKeys.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {tier.costPerKey ? `$${tier.costPerKey.toFixed(4)}` : 'Free'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Update the unlimited plan section with reduced height */}
        <div className="text-center my-12">
          <div className="text-xl font-bold text-gray-400 mb-8">— OR —</div>
          <div className="mt-6 p-6 border-2 border-red-600 rounded-2xl shadow-lg w-full">
            <div className="flex justify-center items-center gap-2 mb-2">
              <h3 className="text-2xl font-bold text-red-600">Unlimited Plan</h3>
              <span className="px-2 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full">
                Popular
              </span>
            </div>
            <p className="text-5xl font-bold text-gray-900 mb-2">
              $799
              <span className="text-lg text-gray-600 ml-2">/year</span>
            </p>
            <p className="text-gray-600 text-lg">Unlimited Keys & Migrations</p>
            <Button className="mt-3" size="lg">Get Started</Button>
          </div>
        </div>

        <Card className="mt-12 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Cost Calculator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <Label>Number of Keys to Migrate</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={customKeyCount}
                    onChange={(e) => {
                      const value = Math.min(Math.max(0, parseInt(e.target.value) || 0), 10000000);
                      setCustomKeyCount(value.toString());
                    }}
                    className="w-32 text-right"
                  />
                  <span className="text-sm text-gray-500">keys</span>
                </div>
              </div>
              <Slider
                defaultValue={[10000]}
                max={10000000}
                step={1000}
                value={[parseInt(customKeyCount)]}
                onValueChange={(value) => setCustomKeyCount(value[0].toString())}
                className="w-full"
              />
              <div className="flex justify-between mt-1">
                <span className="text-sm text-gray-500">0</span>
                <span className="text-sm text-gray-500">10M</span>
              </div>
            </div>
            
            <div className="p-6 bg-gray-50 rounded-xl space-y-4">
              <div className="flex justify-between items-baseline">
                <span className="text-gray-600">Recommended Plan:</span>
                <span className="text-lg font-semibold text-gray-900">
                  {getApplicableTier(parseInt(customKeyCount) || 0).tier.name}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-gray-600">Cost per Key:</span>
                <span className="text-lg font-semibold text-gray-900">
                  ${getApplicableTier(parseInt(customKeyCount) || 0).tier.costPerKey.toFixed(4)}
                </span>
              </div>
              <div className="pt-4 border-t">
                <div className="flex justify-between items-baseline">
                  <span className="text-gray-600">Total Estimated Cost:</span>
                  <span className="text-3xl font-bold text-gray-900">
                    ${getApplicableTier(parseInt(customKeyCount) || 0).cost.toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Based on the most cost-effective plan for your needs
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FAQ Section */}
      <div id="faq" className="mt-12 mb-8">
        <h2 className="text-2xl font-bold mb-6 text-left">Frequently Asked Questions</h2>
        <Accordion type="single" collapsible className="w-full text-left">
          <AccordionItem value="item-1">
            <AccordionTrigger className="text-left">How do I start a migration?</AccordionTrigger>
            <AccordionContent>
              <p className="text-gray-600 text-left">
                1. Enter your source Redis instance details (host, port, password if required)<br />
                2. Enter your target Redis instance details<br />
                3. Enable TLS if your Redis instances require secure connections<br />
                4. Click the &quot;Start Migration&quot; button to begin the process
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-2">
            <AccordionTrigger className="text-left">Can I migrate between different Redis versions?</AccordionTrigger>
            <AccordionContent>
              <p className="text-gray-600 text-left">
                Yes, RedZwitch supports migration between different Redis versions. However, it&apos;s recommended to migrate to the same or newer version to ensure compatibility with all data types and commands.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-3">
            <AccordionTrigger className="text-left">What happens if the migration is interrupted?</AccordionTrigger>
            <AccordionContent>
              <p className="text-gray-600 text-left">
                If the migration is interrupted, you can safely restart it. RedZwitch keeps track of migrated keys and will resume from where it left off. Any changes made to the source database during the interruption will be synchronized when the migration resumes.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-4">
            <AccordionTrigger className="text-left">Is my data safe during migration?</AccordionTrigger>
            <AccordionContent>
              <p className="text-gray-600 text-left">
                Yes, RedZwitch ensures data safety through:<br />
                - Read-only operations on the source database<br />
                - TLS encryption support for secure data transfer<br />
                - Real-time verification of migrated data<br />
                - Automatic error handling and recovery
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-5">
            <AccordionTrigger className="text-left">Can I use localhost Redis instances?</AccordionTrigger>
            <AccordionContent>
              <p className="text-gray-600 text-left">
                No, localhost connections aren&apos;t allowed as the migration tool is designed to run on the web. However if you must use localhost, you can use services like ngrok or cloudflare tunnel to expose your localhost Redis instance to the web.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="item-6">
            <AccordionTrigger className="text-left">How does RedZwitch handle data privacy and security?</AccordionTrigger>
            <AccordionContent>
              <p className="text-gray-600 text-left">
                RedZwitch takes data protection seriously. We operate strictly as a transit service and do not store or log any of your Redis data. The migration process happens in real-time, with data flowing directly between your source and target Redis instances. We never persist, cache, or store your data on our servers. The only information we maintain is basic migration statistics (like progress and speed) to support the migration process, but this never includes your actual Redis data.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}

