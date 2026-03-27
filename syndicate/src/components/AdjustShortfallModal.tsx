'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, PackageMinus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  calculateShortfallAdjustments,
  applyShortfallAdjustments,
  type ShortfallAdjustment,
} from '@/app/admin/orders/[order_id]/actions';

interface AdjustShortfallModalProps {
  orderId: number;
  sequence: number;
  asin: string;
  currentQuantity: number;
  adminUserId: string;
}

export function AdjustShortfallModal({
  orderId,
  sequence,
  asin,
  currentQuantity,
  adminUserId,
}: AdjustShortfallModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [actualStock, setActualStock] = useState<string>('');
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<ShortfallAdjustment[] | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'input' | 'confirm'>('input');

  const resetState = () => {
    setActualStock('');
    setPreview(null);
    setPreviewMessage('');
    setError(null);
    setStep('input');
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) resetState();
  };

  const handleCalculate = () => {
    const stock = parseInt(actualStock);
    if (isNaN(stock) || stock < 0) {
      setError('Please enter a valid non-negative number.');
      return;
    }
    if (stock >= currentQuantity) {
      setError(`Actual stock must be less than the current quantity (${currentQuantity}).`);
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await calculateShortfallAdjustments(orderId, sequence, stock);

      if (!result.success || !result.adjustments) {
        setError(result.message);
        return;
      }

      setPreview(result.adjustments);
      setPreviewMessage(result.message);
      setStep('confirm');
    });
  };

  const handleApply = () => {
    if (!preview) return;

    startTransition(async () => {
      const result = await applyShortfallAdjustments(
        orderId,
        sequence,
        parseInt(actualStock),
        adminUserId,
        preview
      );

      if (!result.success) {
        setError(result.message);
        return;
      }

      setOpen(false);
      resetState();
      router.refresh();
    });
  };

  const totalUnitsLost = preview?.reduce((sum, a) => sum + a.units_lost, 0) ?? 0;
  const totalRefund = preview?.reduce((sum, a) => sum + a.refund_amount, 0) ?? 0;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
        title="Adjust for inventory shortfall"
      >
        <PackageMinus className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-[#0a0a0a]/90 backdrop-blur-xl border-white/[0.08] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageMinus className="h-5 w-5 text-amber-500" />
              Inventory Shortfall — {asin}
            </DialogTitle>
          </DialogHeader>

          {step === 'input' && (
            <div className="space-y-4 py-2">
              <Alert className="bg-amber-500/10 border-amber-500/30 text-amber-200">
                <AlertTriangle className="h-4 w-4 !text-amber-400" />
                <AlertTitle className="text-amber-300 font-semibold">Warning</AlertTitle>
                <AlertDescription className="text-amber-200/80">
                  This will proportionally reduce allocations and automatically refund company
                  credit balances for the missing units.
                </AlertDescription>
              </Alert>

              <div>
                <Label htmlFor="actualStock" className="block mb-2 text-neutral-400 text-sm">
                  Actual Received Stock
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="actualStock"
                    type="number"
                    value={actualStock}
                    onChange={(e) => {
                      setActualStock(e.target.value);
                      setError(null);
                    }}
                    className="bg-white/[0.02] text-neutral-200 border-white/[0.05]"
                    placeholder={`Less than ${currentQuantity}`}
                    min="0"
                    max={currentQuantity - 1}
                    disabled={isPending}
                  />
                  <span className="text-neutral-500 text-sm whitespace-nowrap">
                    / {currentQuantity}
                  </span>
                </div>
              </div>

              {error && (
                <p className="text-sm text-rose-400">{error}</p>
              )}

              <DialogFooter className="pt-2">
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  className="border-white/[0.08] text-neutral-400 hover:bg-white/[0.05]"
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCalculate}
                  disabled={isPending || !actualStock}
                  className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30 transition-all duration-300"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Calculating…
                    </>
                  ) : (
                    'Calculate Adjustments'
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === 'confirm' && preview && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-neutral-400">{previewMessage}</p>

              <div className="rounded-lg border border-white/[0.05] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.05] bg-white/[0.02]">
                      <th className="text-left p-2.5 text-neutral-400 font-medium">Company</th>
                      <th className="text-right p-2.5 text-neutral-400 font-medium">New Qty</th>
                      <th className="text-right p-2.5 text-neutral-400 font-medium">Lost</th>
                      <th className="text-right p-2.5 text-neutral-400 font-medium">Refund</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((adj) => (
                      <tr
                        key={adj.company_id}
                        className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="p-2.5 text-neutral-200">Company #{adj.company_id}</td>
                        <td className="p-2.5 text-right text-neutral-200">{adj.new_quantity}</td>
                        <td className="p-2.5 text-right text-rose-400">-{adj.units_lost}</td>
                        <td className="p-2.5 text-right text-emerald-400">
                          ${adj.refund_amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-white/[0.02] border-t border-white/[0.08]">
                      <td className="p-2.5 font-semibold text-white">Total</td>
                      <td className="p-2.5 text-right text-white font-semibold">
                        {parseInt(actualStock)}
                      </td>
                      <td className="p-2.5 text-right text-rose-400 font-semibold">
                        -{totalUnitsLost}
                      </td>
                      <td className="p-2.5 text-right text-emerald-400 font-semibold">
                        ${totalRefund.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {error && (
                <p className="text-sm text-rose-400">{error}</p>
              )}

              <DialogFooter className="pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep('input');
                    setError(null);
                  }}
                  className="border-white/[0.08] text-neutral-400 hover:bg-white/[0.05]"
                  disabled={isPending}
                >
                  Back
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={isPending}
                  className="bg-rose-500/10 text-rose-400 font-medium border border-rose-500/20 hover:bg-rose-500/20 hover:border-rose-500/30 transition-all duration-300"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Applying…
                    </>
                  ) : (
                    `Apply Shortfall & Refund $${totalRefund.toFixed(2)}`
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
