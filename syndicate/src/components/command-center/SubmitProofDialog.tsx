'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Send } from 'lucide-react';

interface SubmitProofDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  onSubmit: (proof: string) => Promise<void>;
}

export function SubmitProofDialog({
  open,
  onOpenChange,
  taskTitle,
  onSubmit,
}: SubmitProofDialogProps) {
  const [proof, setProof] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!proof.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(proof.trim());
      setProof('');
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to submit proof:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0a]/95 border border-white/[0.08] backdrop-blur-xl text-white max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-white text-base font-semibold">
            Submit Proof
          </DialogTitle>
          <DialogDescription className="text-neutral-400 text-sm">
            Provide a URL or description to prove you completed: <span className="text-neutral-300 font-medium">{taskTitle}</span>
          </DialogDescription>
        </DialogHeader>

        <textarea
          id="proof-input"
          value={proof}
          onChange={(e) => setProof(e.target.value)}
          placeholder="Paste a URL or describe how you completed this task…"
          rows={4}
          className="w-full resize-none bg-white/[0.03] text-neutral-200 text-sm border border-white/[0.08] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/20 placeholder-neutral-500 transition-all"
        />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.05]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!proof.trim() || submitting}
            className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30 transition-all duration-300 disabled:opacity-40"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <Send className="w-3.5 h-3.5 mr-1.5" />
            )}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
