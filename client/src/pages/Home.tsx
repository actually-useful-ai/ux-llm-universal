// ============================================================
// Home — Main layout with mode switching + theme-aware header
// Modes: chat, generate, task, research, process
// ============================================================

import { useRef, useEffect, useState } from 'react';
import {
  Menu, Settings, Sparkles, Plus, ChevronDown, PanelLeftClose, PanelLeft,
  MessageCircle, Image as ImageIcon, ListTodo, Mic, Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { AnimatePresence, motion } from 'framer-motion';
import { useChat } from '@/contexts/ChatContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import Sidebar from '@/components/Sidebar';
import SettingsPanel from '@/components/SettingsPanel';
import EmptyState from '@/components/EmptyState';
import ConnectionStatus from '@/components/ConnectionStatus';
import ManusTaskView from '@/components/manus/ManusTaskView';
import ImageGenPanel from '@/components/ImageGenPanel';
import AudioPanel from '@/components/AudioPanel';
import AltTextPanel from '@/components/AltTextPanel';
import AgentOrchestratorView from '@/components/AgentOrchestratorView';
import type { AppSettings } from '@/lib/types';

type AppMode = 'chat' | 'generate' | 'task' | 'research' | 'process';

const MODES: { id: AppMode; label: string; icon: typeof MessageCircle }[] = [
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'generate', label: 'Image', icon: ImageIcon },
  { id: 'research', label: 'Vision', icon: Eye },
  { id: 'task', label: 'Voice', icon: Mic },
  { id: 'process', label: 'Agents', icon: ListTodo },
];

export default function Home() {
  const { state, dispatch, activeConversation, createConversation } = useChat();
  const { themeName } = useTheme();

  const currentMode = 'chat' as AppMode;
  // Modes with their own provider/model selectors — hide header dropdowns
  const modeHasOwnSelectors = ['generate', 'research'].includes(currentMode);
  const isManus = state.settings.provider === 'manus';
  const isOllama = !state.settings.provider || state.settings.provider === 'ollama';
  const currentProvider = state.providers.find(p => p.id === state.settings.provider);
  const providerModels = isOllama
    ? state.models.map(m => m.name)
    : (currentProvider?.models || []);

  const handleProviderChange = (id: string) => {
    const p = state.providers.find(pr => pr.id === id);
    const updates: Partial<AppSettings> = { provider: id };
    if (id !== 'ollama' && p?.models.length) {
      updates.defaultModel = p.models[0];
    } else if (id === 'ollama') {
      updates.defaultModel = 'glm-5';
    }
    dispatch({ type: 'SET_SETTINGS', payload: updates });
  };

  const setMode = (mode: AppMode) => {
    dispatch({ type: 'SET_SETTINGS', payload: { mode } });
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConversation?.messages]);

  // Track scroll position for "scroll to bottom" button
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
    { keys: 'ctrl+b', description: 'Toggle sidebar', handler: () => dispatch({ type: 'TOGGLE_SIDEBAR' }) },
    { keys: 'ctrl+,', description: 'Toggle settings', handler: () => dispatch({ type: 'TOGGLE_SETTINGS' }) },
    { keys: '/', description: 'Focus input', noInputFocus: true, handler: () => {
      const textarea = document.querySelector('textarea');
      textarea?.focus();
    }},
  ]);

  const messages = activeConversation?.messages || [];
  const hasMessages = messages.length > 0;

  // Determine which main content to render based on mode
  const renderMainContent = () => {
    // Manus provider always shows task view regardless of mode
    if (isManus) return <ManusTaskView />;

    switch (currentMode) {
      case 'generate':
        return <ImageGenPanel />;
      case 'research':
        return <AltTextPanel />;
      case 'task':
        return <AudioPanel />;
      case 'process':
        return <AgentOrchestratorView />;
      case 'chat':
      default:
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
  };

  return (
    <div className={`h-screen flex overflow-hidden bg-background ${
      themeName === 'lumen' ? '' :
      themeName === 'nebula' ? 'ambient-bg' : 'ambient-bg'
    }`}>
      {/* Desktop Sidebar — collapsible */}
      <AnimatePresence initial={false}>
        {desktopSidebarOpen && !isMobile && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 288, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="hidden lg:block shrink-0 border-r border-border/30 overflow-hidden"
          >
            <div className="w-72 h-full">
              <Sidebar onClose={() => setDesktopSidebarOpen(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar Sheet */}
      <Sheet
        open={state.sidebarOpen}
        onOpenChange={open => dispatch({ type: 'SET_SIDEBAR', payload: open })}
      >
        <SheetContent side="left" className="p-0 w-80">
          <SheetTitle className="sr-only">Chat History</SheetTitle>
          <SheetDescription className="sr-only">Your conversation history</SheetDescription>
          <Sidebar onClose={() => dispatch({ type: 'SET_SIDEBAR', payload: false })} />
        </SheetContent>
      </Sheet>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-background/60 backdrop-blur-md shrink-0 z-10">
          <div className="flex items-center gap-2">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden h-9 w-9 p-0 rounded-full"
              onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            >
              <Menu className="w-5 h-5" />
            </Button>

            {/* Desktop sidebar toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="hidden lg:flex h-9 w-9 p-0 rounded-full"
              onClick={() => setDesktopSidebarOpen(prev => !prev)}
              title={desktopSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              {desktopSidebarOpen ? <PanelLeftClose className="w-4.5 h-4.5" /> : <PanelLeft className="w-4.5 h-4.5" />}
            </Button>

            {/* App icon — theme-aware gradient */}
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-sm shrink-0 ${
              themeName === 'nebula' ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
              : themeName === 'slate' ? 'bg-gradient-to-br from-teal-600 to-cyan-700'
              : 'bg-gradient-to-br from-amber-600 to-orange-700'
            }`}>
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>

            {/* Provider + Model dropdowns — hidden when mode has its own selectors */}
            {!modeHasOwnSelectors && (
              <>
                {state.providers.length > 0 && (
                  <Select value={state.settings.provider || 'ollama'} onValueChange={handleProviderChange}>
                    <SelectTrigger className="h-8 text-sm border-border/60 bg-transparent min-w-0 w-auto max-w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {state.providers.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {providerModels.length > 0 ? (
                  <Select
                    value={state.settings.defaultModel}
                    onValueChange={v => dispatch({ type: 'SET_SETTINGS', payload: { defaultModel: v } })}
                  >
                    <SelectTrigger className="h-8 text-sm border-border/60 bg-transparent min-w-0 w-auto max-w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providerModels.map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-muted-foreground px-1 truncate max-w-[140px]">
                    {state.settings.defaultModel}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Mode switcher — center/right area */}
          <div className="hidden md:flex items-center gap-0.5 bg-muted/50 p-0.5 rounded-lg">
            {MODES.map(mode => {
              const Icon = mode.icon;
              const isActive = currentMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setMode(mode.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-all rounded-md ${
                    isActive
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title={mode.label}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">{mode.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            {isOllama && !modeHasOwnSelectors && <ConnectionStatus />}

            {/* Mobile mode selector */}
            <div className="md:hidden">
              <Select value={currentMode} onValueChange={v => setMode(v as AppMode)}>
                <SelectTrigger className="h-8 text-sm border-border/60 bg-transparent w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map(mode => (
                    <SelectItem key={mode.id} value={mode.id}>{mode.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 rounded-full"
              onClick={createConversation}
              title="New chat (Ctrl+N)"
            >
              <Plus className="w-4.5 h-4.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 rounded-full"
              onClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
              title="Settings (Ctrl+,)"
            >
              <Settings className="w-4.5 h-4.5" />
            </Button>
          </div>
        </header>

        {/* Content + Settings split */}
        <div className="flex-1 flex min-h-0">
          {renderMainContent()}

          {/* Settings Panel — Desktop */}
          <AnimatePresence>
            {state.settingsOpen && !isMobile && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="shrink-0 overflow-hidden h-full"
              >
                <div className="w-80 h-full overflow-hidden">
                  <SettingsPanel />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Settings Panel — Mobile Sheet */}
          {isMobile && (
            <Sheet
              open={state.settingsOpen}
              onOpenChange={open => dispatch({ type: 'SET_SETTINGS_OPEN', payload: open })}
            >
              <SheetContent side="right" className="p-0 w-full sm:w-96">
                <SheetTitle className="sr-only">Settings</SheetTitle>
                <SheetDescription className="sr-only">Configure your chat settings</SheetDescription>
                <SettingsPanel />
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>
    </div>
  );
}
