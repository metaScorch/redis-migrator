import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog";
  import { Button } from "@/components/ui/button";
  import Link from "next/link";
  
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
  
  interface PricingModalProps {
    isOpen: boolean;
    onClose: () => void;
    keyCount: number;
  }
  
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
    
    return {
      tier: applicableTier,
      cost: cost
    };
  };
  
  export function PricingModal({
    isOpen,
    onClose,
    keyCount,
  }: PricingModalProps) {
    const { tier, cost } = getApplicableTier(keyCount);
  
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Subscription Required</DialogTitle>
            <DialogDescription>
              To migrate {keyCount.toLocaleString()} keys, you'll need a subscription or pay-as-you-go plan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <h3 className="font-semibold">Recommended Options:</h3>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium">Pay As You Go</h4>
                  <p className="text-sm text-gray-500 mb-2">One-time payment for this migration</p>
                  <p className="text-2xl font-bold">${cost.toFixed(2)}</p>
                  <p className="text-sm text-gray-500 mb-2">Using {tier.name} ({(tier.costPerKey * 100).toFixed(2)}¢ per key)</p>
                  <Button className="w-full mt-2">
                    Continue with Pay As You Go
                  </Button>
                </div>
                
                <div className="p-4 border rounded-lg border-red-200 bg-red-50">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">Unlimited Plan</h4>
                    <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                      Recommended
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-2">Unlimited migrations for a year</p>
                  <p className="text-2xl font-bold">$799<span className="text-base font-normal text-gray-500">/year</span></p>
                  <Button className="w-full mt-2" variant="destructive">
                    Subscribe to Unlimited Plan
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="text-sm text-gray-500 text-center">
            Already have a subscription?{" "}
            <Link href="/login" className="text-red-600 hover:text-red-700">
              Log in
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    );
  }