// ============================================================
// AppShell — Shared layout: sidebar rail + header + content area
// Manages sidebar state (desktop collapsible + mobile sheet)
// ============================================================

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  Menu, Settings, Sparkles, Plus, PanelLeftClose, PanelLeft, Search,
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
import { useTheme } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useProviders } from '@/contexts/ProviderContext';
import { useConversation } from '@/contexts/ConversationContext';
import ContextualSidebar from './ContextualSidebar';
import SettingsPanel from './SettingsPanel';
import ConnectionStatus from './ConnectionStatus';
import CommandPalette from './CommandPalette';
import type { AppSettings } from '@/lib/types';

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Converse',
  '/create': 'Create',
  '/voice': 'Live Voice',
  '/research': 'Research',
  '/research/tools': 'Research Tools',
  '/evaluate': 'Evaluate',
  '/gallery': 'Gallery',
  '/favorites': 'Favorites',
  '/templates': 'Templates',
  '/models': 'Models',
  '/analytics': 'Analytics',
  '/tokenizer': 'Tokenizer',
  '/batches': 'Batches',
};

interface Props {
  children: React.ReactNode;
}

export default function AppShell({ children }: Props) {
  const [location] = useLocation();
  const { themeName } = useTheme();
  const { settings, updateSettings, settingsOpen, setSettingsOpen } = useSettings();
  const { providers, models, isConnected } = useProviders();
  const { createConversation } = useConversation();

  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const isOllama = !settings.provider || settings.provider === 'ollama';
  const isConverse = location === '/' || location === '';
  const currentProvider = providers.find(p => p.id === settings.provider);
  const providerModels = isOllama
    ? models.map(m => m.name)
    : (currentProvider?.models || []);

  // Page title — match route or show "Converse" for root
  const pageTitle = ROUTE_TITLES[location] || ROUTE_TITLES[Object.keys(ROUTE_TITLES).find(k => k !== '/' && location.startsWith(k)) || '/'] || '';

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Cmd+K handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleProviderChange = (id: string) => {
    const p = providers.find(pr => pr.id === id);
    const updates: Partial<AppSettings> = { provider: id };
    if (id !== 'ollama' && p?.models.length) {
      updates.defaultModel = p.models[0];
    } else if (id === 'ollama') {
      updates.defaultModel = 'glm-5';
    }
    updateSettings(updates);
  };

  const handleNewAction = () => {
    if (isConverse) {
      createConversation();
    }
    // Other routes will have their own "new" actions
  };

  return (
    <div className={`h-screen flex overflow-hidden bg-background ${
      themeName === 'lumen' ? '' : 'ambient-bg'
    }`}>
      {/* Desktop Sidebar */}
      <AnimatePresence initial={false}>
        {desktopSidebarOpen && !isMobile && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 272, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="hidden md:block shrink-0 border-r border-border/30 overflow-hidden"
          >
            <div className="w-68 h-full">
              <ContextualSidebar />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-80">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Application navigation and contextual content</SheetDescription>
          <ContextualSidebar onClose={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-background/60 backdrop-blur-md shrink-0 z-10">
          <div className="flex items-center gap-2">
            {/* Mobile menu */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden h-9 w-9 p-0 rounded-full"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>

            {/* Desktop sidebar toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="hidden md:flex h-9 w-9 p-0 rounded-full"
              onClick={() => setDesktopSidebarOpen(prev => !prev)}
              title={desktopSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              {desktopSidebarOpen ? <PanelLeftClose className="w-4.5 h-4.5" /> : <PanelLeft className="w-4.5 h-4.5" />}
            </Button>

            {/* App icon */}
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-sm shrink-0 ${
              themeName === 'nebula' ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
              : themeName === 'slate' ? 'bg-gradient-to-br from-teal-600 to-cyan-700'
              : 'bg-gradient-to-br from-amber-600 to-orange-700'
            }`}>
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>

            {/* Page title / breadcrumb */}
            <span className="text-sm font-semibold text-foreground/80 hidden sm:inline">
              {pageTitle}
            </span>

            {/* Provider + Model selectors — only on Converse */}
            {isConverse && (
              <>
                {providers.length > 0 && (
                  <Select value={settings.provider || 'ollama'} onValueChange={handleProviderChange}>
                    <SelectTrigger className="h-8 text-sm border-border/60 bg-transparent min-w-0 w-auto max-w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {providerModels.length > 0 ? (
                  <Select
                    value={settings.defaultModel}
                    onValueChange={v => updateSettings({ defaultModel: v })}
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
                    {settings.defaultModel}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {isOllama && isConverse && <ConnectionStatus />}

            {/* Cmd+K search */}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 px-2.5 rounded-full text-muted-foreground"
              onClick={() => setCommandOpen(true)}
              title="Command palette (Ctrl+K)"
            >
              <Search className="w-4 h-4" />
              <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span className="text-xs">&#8984;</span>K
              </kbd>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 rounded-full"
              onClick={handleNewAction}
              title="New chat (Ctrl+N)"
            >
              <Plus className="w-4.5 h-4.5" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 rounded-full"
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="Settings (Ctrl+,)"
            >
              <Settings className="w-4.5 h-4.5" />
            </Button>
          </div>
        </header>

        {/* Content + Settings */}
        <div className="flex-1 flex min-h-0">
          {children}

          {/* Settings Panel — Desktop */}
          <AnimatePresence>
            {settingsOpen && !isMobile && (
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
            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
              <SheetContent side="right" className="p-0 w-full sm:w-96">
                <SheetTitle className="sr-only">Settings</SheetTitle>
                <SheetDescription className="sr-only">Configure your settings</SheetDescription>
                <SettingsPanel />
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
