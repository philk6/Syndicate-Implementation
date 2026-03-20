'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { ChatMessage, ChatRoom } from '@/hooks/useChat';
import { cn } from '@/lib/utils';
import { Send, MessageCircle, Hash, Users, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface ChatWindowProps {
  room: ChatRoom | null;
  messages: ChatMessage[];
  currentUserId: string | null;
  loadingMessages: boolean;
  sending: boolean;
  onSend: (content: string) => void;
  onDelete: (messageId: string) => void;
  userPlatformRole: string;
  userMembershipEndDate: string | null;
  userRole: string;
}

export default function ChatWindow({
  room,
  messages,
  currentUserId,
  loadingMessages,
  sending,
  onSend,
  onDelete,
  userPlatformRole,
  userMembershipEndDate,
  userRole,
}: ChatWindowProps) {
  const [input, setInput] = useState('');
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isAdmin = userRole === 'admin';

  const handleDelete = (messageId: string) => {
    onDelete(messageId);
    setDeletingMsgId(null);
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when room changes
  useEffect(() => {
    if (room) inputRef.current?.focus();
  }, [room]);

  const handleSend = () => {
    if (!input.trim() || sending) return;
    onSend(input);
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Empty state ─────────────────────────────────────────────────────────

  if (!room) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto">
            <MessageCircle className="w-7 h-7 text-neutral-600" />
          </div>
          <h3 className="text-sm font-medium text-neutral-500">Select a chat</h3>
          <p className="text-xs text-neutral-600 max-w-[240px]">
            Choose a conversation from the sidebar to start messaging.
          </p>
        </div>
      </div>
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  const getInitials = (msg: ChatMessage) => {
    const f = msg.sender?.firstname?.[0]?.toUpperCase() ?? '';
    const l = msg.sender?.lastname?.[0]?.toUpperCase() ?? '';
    return f + l || '?';
  };

  const getSenderName = (msg: ChatMessage) => {
    const f = msg.sender?.firstname ?? '';
    const l = msg.sender?.lastname ?? '';
    const full = `${f} ${l}`.trim();
    return full || 'Unknown';
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Group messages by date
  const groupedMessages: { date: string; msgs: ChatMessage[] }[] = [];
  let lastDateStr = '';
  for (const msg of messages) {
    const dateStr = formatDate(msg.created_at);
    if (dateStr !== lastDateStr) {
      groupedMessages.push({ date: dateStr, msgs: [msg] });
      lastDateStr = dateStr;
    } else {
      groupedMessages[groupedMessages.length - 1].msgs.push(msg);
    }
  }

  // ── Expired membership check ────────────────────────────────────────────

  const isStudentExpired =
    userPlatformRole === 'student' &&
    userMembershipEndDate !== null &&
    new Date() > new Date(userMembershipEndDate);

  // Only block input for expired students in 1-on-1 rooms.
  // Mentors (platform_role) and Admins (role) are never blocked.
  const shouldBlockInput =
    isStudentExpired &&
    room.type === '1on1' &&
    userRole !== 'admin';

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* ── Chat Header ─────────────────────────────────────────────────── */}
      <div className="px-6 py-3.5 border-b border-white/[0.06] bg-white/[0.015] flex items-center gap-3 shrink-0">
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
            room.type === 'global'
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-amber-500/10 text-amber-400',
          )}
        >
          {room.type === 'global' ? (
            <Hash className="w-4 h-4" />
          ) : (
            <Users className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white truncate">{room.name}</h2>
          <p className="text-[11px] text-neutral-500">
            {room.type === 'global' ? 'Global Announcements' : '1-on-1 Mentoring'}
          </p>
        </div>
      </div>

      {/* ── Messages Area ───────────────────────────────────────────────── */}
      <ScrollArea className="flex-1">
        <div className="px-6 py-4 space-y-1">
          {loadingMessages && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            </div>
          )}

          {!loadingMessages && messages.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center space-y-2">
                <MessageCircle className="w-8 h-8 text-neutral-600 mx-auto" />
                <p className="text-sm text-neutral-500">No messages yet</p>
                <p className="text-xs text-neutral-600">
                  Be the first to send a message!
                </p>
              </div>
            </div>
          )}

          {groupedMessages.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">
                  {group.date}
                </span>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>

              {/* Messages */}
              {group.msgs.map((msg) => {
                const isOwn = msg.sender_id === currentUserId;
                const isConfirmingDelete = deletingMsgId === msg.id;
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      'group/msg flex gap-2.5 mb-3',
                      isOwn ? 'flex-row-reverse' : 'flex-row',
                    )}
                  >
                    {/* Avatar */}
                    {!isOwn && (
                      <Avatar className="w-7 h-7 shrink-0 mt-0.5">
                        <AvatarFallback className="text-[10px] font-semibold bg-white/[0.06] text-neutral-400">
                          {getInitials(msg)}
                        </AvatarFallback>
                      </Avatar>
                    )}

                    {/* Bubble */}
                    <div
                      className={cn(
                        'max-w-[70%] min-w-0',
                        isOwn ? 'items-end' : 'items-start',
                      )}
                    >
                      {/* Sender name (only for others) */}
                      {!isOwn && (
                        <p className="text-[11px] font-medium text-neutral-500 mb-0.5 px-1">
                          {getSenderName(msg)}
                        </p>
                      )}
                      <div className="relative">
                        <div
                          className={cn(
                            'px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words',
                            isOwn
                              ? 'bg-gradient-to-br from-amber-600/40 to-amber-700/30 text-amber-50 border border-amber-500/15 rounded-br-md'
                              : 'bg-white/[0.04] text-neutral-200 border border-white/[0.06] rounded-bl-md',
                          )}
                        >
                          {msg.content}
                        </div>

                        {/* Admin delete button — appears on hover */}
                        {isAdmin && !isConfirmingDelete && (
                          <button
                            onClick={() => setDeletingMsgId(msg.id)}
                            className={cn(
                              'absolute top-1/2 -translate-y-1/2 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150',
                              'w-7 h-7 rounded-lg flex items-center justify-center',
                              'bg-white/[0.06] hover:bg-red-500/20 border border-white/[0.08] hover:border-red-500/30',
                              'text-neutral-500 hover:text-red-400 cursor-pointer',
                              isOwn ? '-left-9' : '-right-9',
                            )}
                            title="Delete message"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Delete confirmation inline */}
                        {isConfirmingDelete && (
                          <div
                            className={cn(
                              'absolute top-1/2 -translate-y-1/2 flex items-center gap-1.5 z-10',
                              isOwn ? 'right-[calc(100%+8px)]' : 'left-[calc(100%+8px)]',
                            )}
                          >
                            <button
                              onClick={() => setDeletingMsgId(null)}
                              className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white/[0.06] text-neutral-400 hover:bg-white/[0.1] hover:text-neutral-200 border border-white/[0.08] transition-all cursor-pointer whitespace-nowrap"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDelete(msg.id)}
                              className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 border border-red-500/20 transition-all cursor-pointer whitespace-nowrap"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                      <p
                        className={cn(
                          'text-[10px] text-neutral-600 mt-0.5 px-1',
                          isOwn ? 'text-right' : 'text-left',
                        )}
                      >
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* ── Input Area / Expired Banner ─────────────────────────────────── */}
      {shouldBlockInput ? (
        <div className="px-4 py-3 border-t border-red-900/30 shrink-0">
          <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-[#7f1d1d]/15 border border-red-900/25">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-300">
                Membership Expired
              </p>
              <p className="text-xs text-red-400/70 mt-0.5 leading-relaxed">
                Your 1-on-1 membership expired on{' '}
                <span className="font-semibold text-red-300">
                  {new Date(userMembershipEndDate!).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                . You can still read past messages, but cannot send new ones.
                Please contact an admin to renew.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-white/[0.06] bg-white/[0.015] shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              id="chat-message-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${room.name}…`}
              rows={1}
              className="flex-1 resize-none bg-white/[0.03] text-neutral-200 text-sm border border-white/[0.08] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/20 placeholder-neutral-500 transition-all backdrop-blur-md min-h-[40px] max-h-[120px]"
              style={{
                height: 'auto',
                overflow: input.split('\n').length > 1 ? 'auto' : 'hidden',
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
            <button
              id="chat-send-button"
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200',
                input.trim() && !sending
                  ? 'bg-gradient-to-t from-amber-700/50 to-amber-500/80 text-white shadow-[0_4px_12px_#f59e0b33] hover:brightness-110 cursor-pointer'
                  : 'bg-white/[0.03] text-neutral-600 border border-white/[0.06] cursor-not-allowed',
              )}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
