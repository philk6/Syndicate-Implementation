'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@lib/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

// Import the user cache from auth.tsx
import { userCache } from '../../lib/auth';

interface TosDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const TERMS_OF_SERVICE = `
Buyers Group Terms of Service Agreement

By joining the Buyers Group (“Group”) operated by CauseNEffectLLC (“we,” “our,” “us”), you (“Member”) acknowledge and agree to the following legally binding terms:

1. Inventory Storage, Response Time & Fees
Members are responsible for coordinating product shipment or pickup within 30 calendar days of delivery.
After 30 days without communication or action, a storage fee of 75 dollars per pallet per week or 20 dollars per box per week (whichever is greater) will be charged.
On Day 60, if no response or payment is received, the inventory is considered abandoned, and we reserve the right to liquidate, resell, or dispose of the inventory with no refund issued.
No product will be released or shipped until all outstanding storage and handling fees are paid in full.

2. No Liability for Amazon or Third-Party Platform Issues
CauseNEffectLLC is not liable for changes, issues, or restrictions that occur on Amazon, Walmart, or any other third-party selling platform.
This includes but is not limited to:
- Listing removals
- Gating or brand/category restrictions
- Price drops or sudden unprofitability
- ASIN suspensions
- Account health problems
- Marketplace policy updates
By participating, you acknowledge that selling on platforms like Amazon carries inherent risk, and CauseNEffectLLC does not guarantee profitability or sell-through speed.
All decisions regarding sourcing and participation in product buys are made voluntarily by the Member.

3. Inventory Rights & Release
Title and ownership of inventory remain with the Member at all times.
However, if storage fees are not paid or communication is not maintained, we reserve the right to handle unclaimed goods at our discretion.
If inventory must be returned or forwarded, the Member is responsible for all shipping costs and logistics coordination.

4. No Refunds or Chargebacks
Once funds are allocated for a product purchase, no refunds or chargebacks will be issued, regardless of changes in profitability, market conditions, or platform rules.
Your participation in each buy signals acceptance of that risk.

5. Communication Expectations
Members must provide prompt responses to all communication related to inventory, shipment, and group updates.
Lack of response for extended periods will result in product being stored at the Member’s expense, and ultimately disposed of after 60 days.

6. Agreement Acceptance
By joining the Buyers Group, you confirm that you:
- Have read and understood this agreement
- Accept full responsibility for the risks associated with third-party platforms
- Agree to all fees, timelines, and conditions listed above

This agreement is legally binding and enforceable under Missouri state law.

7. Chargebacks and Dispute Policy
By joining the Buyers Group and submitting payment, the Member agrees not to initiate any chargebacks or payment disputes with their bank, credit card provider, or payment processor.
All sales are final once inventory is purchased on the Member’s behalf. Any disputes must be handled directly with CauseNEffectLLC and will be resolved through internal communication or legal arbitration if necessary.
Initiating a chargeback after receiving products or services will be treated as a breach of this agreement and may be considered fraudulent activity. CauseNEffectLLC reserves the right to pursue legal remedies and recover any fees, losses, or damages incurred as a result of a wrongful chargeback.


Phil Keipp
Owner
CauseNEffectLLC
`;

export default function TosDialog({ isOpen, onClose }: TosDialogProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAgree = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

    const { error } = await supabase
      .from('users')
      .update({ tos_accepted: true })
        .eq('user_id', user.id);
    
    if (error) {
        throw error;
      }

      // Invalidate user cache to ensure fresh data is fetched
      if (user.email) {
        userCache.delete(user.email);
      }

      // Close the dialog and notify parent
      onClose();
    } catch (error) {
      console.error('Error accepting ToS:', error);
      alert('Failed to accept Terms of Service. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/dashboard');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80] max-w-3xl">
        <DialogHeader>
          <DialogTitle>Terms of Service</DialogTitle>
          <DialogDescription>Please read and agree to the Terms of Service to continue.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] p-4">
          <pre className="text-sm whitespace-pre-wrap">{TERMS_OF_SERVICE}</pre>
        </ScrollArea>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            className="bg-amber-500/5 text-amber-400 font-medium border border-amber-500/15 hover:bg-amber-500/10 hover:border-amber-500/25 transition-all duration-300"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAgree}
            className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'I Agree'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}