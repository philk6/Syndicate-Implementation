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
Buyers Group Terms of Service

By joining the Buyers Group (“Group”) operated by CauseNEffectLLC (“we,” “our,” “us”), you (“Member”) acknowledge and agree to the following legally binding terms:

1. Inventory Storage, Response Time & Fees
- Members are responsible for coordinating product shipment or pickup within 30 calendar days of inventory being received by CauseNEffectLLC.
- After 30 days without communication or action, a storage fee of $75 per pallet per week or $20 per box per week (whichever is greater) will be applied.
- On Day 60, if no response or payment is received, the inventory is considered abandoned, and we reserve the right to liquidate, resell, or dispose of the inventory with no refund issued.
- No inventory will be released or shipped until all outstanding storage and handling fees are paid in full.

2. No Liability for Amazon or Third-Party Platform Issues
CauseNEffectLLC is not liable for any changes, limitations, or restrictions that occur on Amazon, Walmart, or any other third-party selling platform, including but not limited to:
- Listing removals  
- Brand/category gating  
- Price changes or unprofitability  
- ASIN suspensions  
- Account health issues  
- Platform policy updates  

By joining the Group, you acknowledge that selling on these platforms involves inherent risk, and all sourcing decisions are made voluntarily by the Member.

3. Inventory Rights & Release
- Title and ownership of all inventory remain with the Member at all times.
- However, if the Member fails to maintain communication or pay outstanding fees, CauseNEffectLLC reserves the right to handle, liquidate, or dispose of the inventory at its sole discretion.
- If inventory needs to be returned or forwarded, the Member is responsible for all shipping costs and related coordination.

4. No Refunds, Withdrawals, or Chargebacks
Once funds are submitted to CauseNEffectLLC for participation in a product buy, those funds are considered fully committed and allocated toward purchasing inventory.  
No refunds, partial refunds, or withdrawals of funds will be permitted under any circumstance.

This includes—but is not limited to—situations involving:  
- Profitability or market condition changes  
- Account or listing restrictions  
- Shipment or processing delays  
- Third-party platform bans or suspensions  

Inventory is often purchased immediately upon receipt of funds. CauseNEffectLLC does not hold funds in escrow or reserve, and all payments are final. By participating in a buy, you affirm that you understand and accept these terms.

5. Communication Expectations
- Members must respond promptly to all communications related to inventory, shipping, or group updates.
- Lack of communication may result in inventory being stored at the Member’s expense.
- Inventory left unclaimed after 60 days of no response will be considered abandoned and subject to liquidation or disposal.

6. Chargebacks and Dispute Policy
- By submitting payment, the Member agrees not to initiate chargebacks or payment disputes with any bank, credit card provider, or payment processor.
- All sales are final once inventory is purchased on the Member’s behalf.
- Any disputes must be resolved directly with CauseNEffectLLC through communication or, if necessary, legal arbitration.
- Initiating a chargeback after receiving products or services will be treated as a breach of this agreement and may be considered fraudulent activity. CauseNEffectLLC reserves the right to pursue legal remedies and recover fees, losses, or damages caused by a wrongful chargeback.

7. Agreement Acceptance
By joining the Buyers Group, you confirm that you:
- Have read and fully understand this agreement  
- Accept the risks associated with selling on third-party platforms  
- Agree to all storage terms, payment commitments, and non-refundable conditions listed herein  

This agreement is legally binding and enforceable under the laws of the State of Missouri.

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