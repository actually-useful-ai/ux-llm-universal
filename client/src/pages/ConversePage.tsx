// ============================================================
// Converse Page — Chat interface (refactored from Home.tsx)
// Route: /
// ============================================================

import { useRef, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { useConversation } from '@/contexts/ConversationContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import EmptyState from '@/components/EmptyState';
import ManusTaskView from '@/components/manus/ManusTaskView';

export default function ConversePage() {
  const { state, activeConversation, createConversation } = useConversation();
  const { settings, setSettingsOpen } = useSettings();

  const isManus = settings.provider === 'manus';
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConversation?.messages]);

  // Track scroll position
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShowScrollDown(scrollHeight - scrollTop - clientHeight > 200);
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [activeConversation?.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { keys: 'ctrl+n', description: 'New chat', handler: createConversation },
    { keys: 'ctrl+,', description: 'Toggle settings', handler: () => setSettingsOpen(prev => !prev) },
    { keys: '/', description: 'Focus input', noInputFocus: true, handler: () => {
      const textarea = document.querySelector('textarea');
      textarea?.focus();
    }},
  ]);

  // Manus provider shows task view
  if (isManus) return <ManusTaskView />;

  const messages = activeConversation?.messages || [];
  const hasMessages = messages.length > 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      {hasMessages ? (
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto chat-scroll"
        >
          <div className="py-4">
            {messages.map((msg, i) => (
              <div key={msg.id} className="group">
                <ChatMessage
                  message={msg}
                  isLast={i === messages.length - 1}
                />
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      ) : (
        <EmptyState />
      )}

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollDown && hasMessages && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={scrollToBottom}
              className="shadow-md bg-card h-8 px-3 gap-1 rounded-full"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              <span className="text-xs">Scroll down</span>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error banner */}
      {state.error && (
        <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
          <p className="text-sm text-destructive text-center max-w-3xl mx-auto">
            {state.error}
          </p>
        </div>
      )}

      {/* Input */}
      <ChatInput />
    </div>
  );
}
