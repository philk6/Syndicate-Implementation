'use client';

import { useState } from 'react';
import { Plus, Play, Image as ImageIcon, FileText, ExternalLink, Trash2, BookOpen } from 'lucide-react';
import { AddMediaDialog } from './AddMediaDialog';
import { deleteMissionMedia, type MissionMedia } from '@/lib/missionControl';
import { cn } from '@/lib/utils';

interface MissionMediaSectionProps {
  missionId: number;
  media: MissionMedia[];
  phaseColor: string;
  isAdmin: boolean;
  onChange: () => void;
}

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return m?.[1] ?? null;
}

function getVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:.*\/)?(\d+)/);
  return m?.[1] ?? null;
}

function mediaIcon(type: MissionMedia['media_type']) {
  if (type === 'video') return <Play className="w-3.5 h-3.5" />;
  if (type === 'image') return <ImageIcon className="w-3.5 h-3.5" />;
  return <FileText className="w-3.5 h-3.5" />;
}

function MediaThumb({ item, phaseColor }: { item: MissionMedia; phaseColor: string }) {
  const ytId = item.media_type === 'video' ? getYouTubeId(item.url) : null;
  const vimeoId = item.media_type === 'video' && !ytId ? getVimeoId(item.url) : null;

  const thumb =
    item.thumbnail_url ??
    (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null);

  const canEmbed = Boolean(ytId || vimeoId);

  if (canEmbed) {
    const src = ytId
      ? `https://www.youtube.com/embed/${ytId}`
      : `https://player.vimeo.com/video/${vimeoId}`;
    return (
      <div
        className="relative aspect-video w-full rounded-lg overflow-hidden border"
        style={{ borderColor: `${phaseColor}55` }}
      >
        <iframe
          src={src}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          title={item.title}
        />
      </div>
    );
  }

  if (thumb) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative aspect-video w-full rounded-lg overflow-hidden border block group"
        style={{ borderColor: `${phaseColor}55` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumb} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold font-mono uppercase tracking-widest border"
            style={{
              backgroundColor: `${phaseColor}26`,
              color: phaseColor,
              borderColor: `${phaseColor}66`,
            }}
          >
            {mediaIcon(item.media_type)} Open
          </span>
        </div>
      </a>
    );
  }

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative aspect-video w-full rounded-lg overflow-hidden border flex items-center justify-center bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
      style={{ borderColor: `${phaseColor}55` }}
    >
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold font-mono uppercase tracking-widest border"
        style={{
          backgroundColor: `${phaseColor}26`,
          color: phaseColor,
          borderColor: `${phaseColor}66`,
        }}
      >
        {mediaIcon(item.media_type)} Open
        <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
      </span>
    </a>
  );
}

export function MissionMediaSection({
  missionId,
  media,
  phaseColor,
  isAdmin,
  onChange,
}: MissionMediaSectionProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const hasMedia = media.length > 0;

  if (!hasMedia && !isAdmin) return null;

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this resource?')) return;
    setDeletingId(id);
    try {
      await deleteMissionMedia(id);
      onChange();
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="border-t border-white/[0.05] px-5 pl-6 py-4">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="w-3.5 h-3.5" style={{ color: phaseColor }} />
        <h4
          className="text-[10px] font-bold font-mono uppercase tracking-widest"
          style={{ color: phaseColor }}
        >
          Training Resources
        </h4>
        {hasMedia && (
          <span className="text-[10px] text-neutral-500 font-mono">({media.length})</span>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold font-mono uppercase tracking-widest border transition-colors cursor-pointer"
            style={{
              backgroundColor: `${phaseColor}1a`,
              color: phaseColor,
              borderColor: `${phaseColor}55`,
            }}
          >
            <Plus className="w-3 h-3" />
            Add Media
          </button>
        )}
      </div>

      {hasMedia ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {media.map((item) => (
            <div key={item.id} className="relative group">
              <MediaThumb item={item} phaseColor={phaseColor} />
              <div className="flex items-center gap-2 mt-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-neutral-500 shrink-0">
                  {mediaIcon(item.media_type)}
                  {item.media_type}
                </span>
                <p className="text-xs text-neutral-200 font-medium truncate flex-1">{item.title}</p>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    className={cn(
                      'opacity-0 group-hover:opacity-100 transition-opacity text-neutral-500 hover:text-red-400 shrink-0 cursor-pointer',
                      deletingId === item.id && 'opacity-100',
                    )}
                    aria-label="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-neutral-500 font-mono">
          No resources uploaded yet. Click <span className="text-neutral-300">Add Media</span> to attach a training video or document.
        </p>
      )}

      <AddMediaDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        missionId={missionId}
        onCreated={onChange}
      />
    </div>
  );
}
