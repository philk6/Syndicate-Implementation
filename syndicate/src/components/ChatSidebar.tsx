'use client';

import { ChatRoom } from '@/hooks/useChat';
import { cn } from '@/lib/utils';
import { Hash, MessageCircle, Users } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ChatSidebarProps {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  loading: boolean;
}

export default function ChatSidebar({
  rooms,
  activeRoomId,
  onSelectRoom,
  loading,
}: ChatSidebarProps) {
  const globalRooms = rooms.filter((r) => r.type === 'global');
  const oneOnOneRooms = rooms.filter((r) => r.type === '1on1');

  return (
    <aside className="w-72 shrink-0 flex flex-col border-r border-white/[0.06] bg-white/[0.015]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <MessageCircle className="w-4 h-4 text-black" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-wide">Chat</h2>
            <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Messages</p>
          </div>
        </div>
      </div>

      {/* Room list */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Global Rooms */}
          {globalRooms.length > 0 && (
            <div>
              <p className="px-2 mb-1.5 text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">
                Announcements
              </p>
              <div className="space-y-0.5">
                {globalRooms.map((room) => (
                  <RoomItem
                    key={room.id}
                    room={room}
                    isActive={room.id === activeRoomId}
                    onClick={() => onSelectRoom(room.id)}
                    icon={<Hash className="w-4 h-4" />}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 1-on-1 Rooms */}
          {oneOnOneRooms.length > 0 && (
            <div>
              <p className="px-2 mb-1.5 text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">
                1-on-1 Mentoring
              </p>
              <div className="space-y-0.5">
                {oneOnOneRooms.map((room) => (
                  <RoomItem
                    key={room.id}
                    room={room}
                    isActive={room.id === activeRoomId}
                    onClick={() => onSelectRoom(room.id)}
                    icon={<Users className="w-4 h-4" />}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="px-2 py-6 flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              <p className="text-xs text-neutral-500">Loading chats…</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && rooms.length === 0 && (
            <div className="px-2 py-8 text-center">
              <MessageCircle className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
              <p className="text-xs text-neutral-500">No chats available yet.</p>
              <p className="text-[10px] text-neutral-600 mt-1">
                Chats will appear here once you&apos;re added.
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

// ─── Room list item ──────────────────────────────────────────────────────────

function RoomItem({
  room,
  isActive,
  onClick,
  icon,
}: {
  room: ChatRoom;
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      id={`chat-room-${room.id}`}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 group',
        isActive
          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.06)]'
          : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03] border border-transparent',
      )}
    >
      <span
        className={cn(
          'shrink-0 transition-colors duration-200',
          isActive ? 'text-amber-400' : 'text-neutral-500 group-hover:text-neutral-400',
        )}
      >
        {icon}
      </span>
      <span className="truncate text-sm font-medium">{room.name}</span>
    </button>
  );
}
