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
import { Loader2, Plus } from 'lucide-react';
import { createMissionMedia } from '@/lib/missionControl';

interface AddMediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missionId: number;
  onCreated: () => void;
}

export function AddMediaDialog({ open, onOpenChange, missionId, onCreated }: AddMediaDialogProps) {
  const [title, setTitle] = useState('');
  const [mediaType, setMediaType] = useState<'video' | 'image' | 'document'>('video');
  const [url, setUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle(''); setUrl(''); setThumbnailUrl(''); setMediaType('video'); setError(null);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !url.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createMissionMedia({
        mission_id: missionId,
        title: title.trim(),
        media_type: mediaType,
        url: url.trim(),
        thumbnail_url: thumbnailUrl.trim() || null,
      });
      reset();
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add media');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="bg-[#0a0a0f]/95 border border-white/[0.08] backdrop-blur-xl text-white max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-white text-base font-semibold font-mono uppercase tracking-wider">
            Add Training Resource
          </DialogTitle>
          <DialogDescription className="text-neutral-400 text-sm">
            Attach a video, image, or document to this mission.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. LLC Filing Walkthrough"
              className="mt-1 w-full bg-white/[0.03] text-neutral-200 text-sm border border-white/[0.08] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Type</span>
            <select
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value as 'video' | 'image' | 'document')}
              className="mt-1 w-full bg-white/[0.03] text-neutral-200 text-sm border border-white/[0.08] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            >
              <option value="video">Video (YouTube / Vimeo / direct)</option>
              <option value="image">Image</option>
              <option value="document">Document</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">URL</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="mt-1 w-full bg-white/[0.03] text-neutral-200 text-sm border border-white/[0.08] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              Thumbnail URL <span className="text-neutral-600 normal-case font-medium">(optional)</span>
            </span>
            <input
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full bg-white/[0.03] text-neutral-200 text-sm border border-white/[0.08] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

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
            disabled={!title.trim() || !url.trim() || submitting}
            className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-40"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
