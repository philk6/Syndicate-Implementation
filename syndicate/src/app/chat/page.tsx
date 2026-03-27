'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { useChat } from '@/hooks/useChat';
import ChatSidebar from '@/components/ChatSidebar';
import ChatWindow from '@/components/ChatWindow';

export default function ChatPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  const {
    rooms,
    activeRoom,
    activeRoomId,
    messages,
    loadingRooms,
    loadingMessages,
    sending,
    currentUserId,
    userPlatformRole,
    userMembershipEndDate,
    userRole,
    selectRoom,
    sendMessage,
    deleteMessage,
  } = useChat();

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-[calc(100vh-0px)] w-full overflow-hidden rounded-2xl bg-white/[0.02] border border-white/[0.06] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] backdrop-blur-xl">
      <ChatSidebar
        rooms={rooms}
        activeRoomId={activeRoomId}
        onSelectRoom={selectRoom}
        loading={loadingRooms}
      />
      <ChatWindow
        room={activeRoom}
        messages={messages}
        currentUserId={currentUserId}
        loadingMessages={loadingMessages}
        sending={sending}
        onSend={sendMessage}
        onDelete={deleteMessage}
        userPlatformRole={userPlatformRole}
        userMembershipEndDate={userMembershipEndDate}
        userRole={userRole}
      />
    </div>
  );
}
