"use client";
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { Activity, Shield, Radio } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Slider } from "@/components/ui/slider";
import { Input } from '@/components/ui/input';
import { useState } from 'react';

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

interface PricingTier {
  minKeys: number;
  maxKeys: number;
  costPerKey: number;
  flatCost?: number;
}

const pricingTiers: PricingTier[] = [
  { minKeys: 0, maxKeys: 5000, costPerKey: 0 }, // Free
  { minKeys: 5001, maxKeys: 10000, costPerKey: 0.005 },
  { minKeys: 10001, maxKeys: 100000, costPerKey: 0.002 },
  { minKeys: 100001, maxKeys: 500000, costPerKey: 0.0015 },
  { minKeys: 500001, maxKeys: 1000000, costPerKey: 0.001 },
  { minKeys: 1000001, maxKeys: 10000000, costPerKey: 0.0001, flatCost: 1000 },
  { minKeys: 10000001, maxKeys: 100000000, costPerKey: 0, flatCost: 799 } // Unlimited/Year
];

function PricingCalculator() {
  const [keyCount, setKeyCount] = useState<number>(10000);

  const handleKeyCountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value.replace(/,/g, ''), 10);
    if (!isNaN(value) && value >= 0) {
      setKeyCount(Math.min(value, 10000000));
    }
  };

  const handleSliderChange = (value: number[]) => {
    setKeyCount(value[0]);
  };

  const calculatePrice = (keys: number): { cost: number; costPerKey: number } => {
    if (keys <= 5000) return { cost: 0, costPerKey: 0 };
    if (keys <= 10000) return { cost: 50, costPerKey: 0.005 };
    if (keys <= 100000) return { cost: 200, costPerKey: 0.002 };
    if (keys <= 500000) return { cost: 750, costPerKey: 0.0015 };
    if (keys <= 1000000) return { cost: 1000, costPerKey: 0.001 };
    return { cost: 1000, costPerKey: 0.0001 };
  };

  const { cost, costPerKey } = calculatePrice(keyCount);
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat().format(num);
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6">Pricing Calculator</h2>
      
      <div className="space-y-8 mb-8">
        <div className="space-y-4">
          <div className="flex justify-between items-center gap-4">
            <label className="text-sm font-medium">Number of Keys</label>
            <div className="flex items-center gap-4">
              <Input
                type="text"
                value={formatNumber(keyCount)}
                onChange={handleKeyCountChange}
                className="w-32 text-right"
              />
              <Button
                variant="outline"
                disabled
                className="opacity-50"
              >
                ♾️ Unlimited
              </Button>
            </div>
          </div>

          <Slider
            value={[keyCount]}
            min={1000}
            max={10000000}
            step={1000}
            onValueChange={handleSliderChange}
            className="w-full"
          />
          <div className="flex justify-between text-sm text-gray-500">
            <span>1K</span>
            <span>10M</span>
          </div>
        </div>

        <div className="bg-gray-50 p-6 rounded-lg">
          <div className="flex justify-between items-baseline">
            <span className="text-lg font-medium">Estimated Cost</span>
            <div className="text-right">
              <span className="text-3xl font-bold">
                ${cost.toFixed(2)}
              </span>
              <span className="text-sm text-gray-500 ml-1">
                (${costPerKey.toFixed(4)} per key)
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative my-12">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">or</span>
        </div>
      </div>

      <div className="bg-red-50 p-6 rounded-lg mb-8">
        <div className="text-center space-y-4">
          <h3 className="text-xl font-bold">Buy Unlimited Plan for $799/Year</h3>
          <div className="text-gray-600">
            <p>Unlimited Keys</p>
            <p>Unlimited Migrations</p>
          </div>
          <Button 
            className="bg-red-600 hover:bg-red-700 w-full max-w-sm"
            size="lg"
          >
            Get Started
          </Button>
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-4">Included Features:</h3>
        <ul className="space-y-2">
          <li className="flex items-center text-sm">
            <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
            Real-time synchronization
          </li>
          <li className="flex items-center text-sm">
            <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
            Secure TLS encryption
          </li>
          <li className="flex items-center text-sm">
            <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
            24/7 monitoring & support
          </li>
        </ul>
      </div>
    </div>
  );
}

export function LandingPage() {
  const router = useRouter();

  return (
    <div className="container mx-auto p-4">
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
        <Button 
          size="lg" 
          className="mt-4"
          onClick={() => router.push('/migrate')}
        >
          Migrate Redis
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-12">
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

      <div className="bg-gray-50 p-8 rounded-lg mb-12">
        <h3 className="text-2xl font-bold mb-4">Features</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>Real-time data synchronization during migration</li>
            <li>Zero downtime migration support</li>
            <li>Fast and reliable migration with batch processing</li>
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

      <div className="mt-12 mb-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible>
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
          </Accordion>
        </div>

        <div>
          <PricingCalculator />
        </div>
      </div>
    </div>
  );
}