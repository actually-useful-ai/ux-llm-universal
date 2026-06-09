// ============================================================
// Contextual Sidebar — Route-aware nav rail + dynamic body
// Top: 5 fixed nav items (Converse, Create, Research, Evaluate, Gallery)
// Body: contextual content based on current route
// Footer: collapsed links
// ============================================================

import { useLocation } from 'wouter';
import {
  MessageCircle, Sparkles, Shield, LayoutGrid,
  Plus, MessageSquare, Trash2, X, HelpCircle, ExternalLink,
  Mic, Star, BookOpen, Cpu, BarChart3, Hash, Layers, Wrench, Share2, Sliders,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useConversation } from '@/contexts/ConversationContext';
import { cn } from '@/lib/utils';

interface Props {
  onClose?: () => void;
  collapsed?: boolean;
}

const NAV_ITEMS = [
  { path: '/', label: 'Converse', icon: MessageCircle },
  { path: '/create', label: 'Create', icon: Sparkles },
  { path: '/voice', label: 'Voice', icon: Mic },
  { path: '/research', label: 'Research', icon: Wrench },
  { path: '/evaluate', label: 'Evaluate', icon: Shield },
] as const;

const GALLERY_NAV = { path: '/gallery', label: 'Gallery', icon: LayoutGrid } as const;
const SECONDARY_ITEMS = [
  { path: '/favorites', label: 'Favorites', icon: Star },
  { path: '/templates', label: 'Templates', icon: BookOpen },
  { path: '/presets', label: 'Presets', icon: Sliders },
  { path: '/models', label: 'Models', icon: Cpu },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/tokenizer', label: 'Tokenizer', icon: Hash },
  { path: '/batches', label: 'Batches', icon: Layers },
  { path: '/showcase', label: 'Showcase', icon: Share2 },
] as const;

export default function ContextualSidebar({ onClose, collapsed }: Props) {
  const [location, navigate] = useLocation();
  const { state, dispatch, createConversation, deleteConversation } = useConversation();

  const handleNav = (path: string) => {
    navigate(path);
    onClose?.();
  };

  const handleNewChat = () => {
    createConversation();
    if (location !== '/') navigate('/');
    onClose?.();
  };

  const handleSelectConversation = (id: string) => {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: id });
    if (location !== '/') navigate('/');
    onClose?.();
  };

  const isActive = (path: string) => {
    if (path === '/') return location === '/';
    return location.startsWith(path);
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Group conversations by date
  const grouped = state.conversations.reduce<Record<string, typeof state.conversations>>(
    (acc, conv) => {
      const label = formatDate(conv.updatedAt);
      if (!acc[label]) acc[label] = [];
      acc[label].push(conv);
      return acc;
    },
    {}
  );

  return (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground">
      {/* Nav Rail */}
      <div className="p-2 space-y-0.5">
        {/* Close button (mobile) */}
        {onClose && (
          <div className="flex justify-end mb-1 lg:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 rounded-full hover:bg-sidebar-accent"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-accent/60 text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/30 hover:text-sidebar-foreground'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}

        <Separator className="my-2 bg-sidebar-border" />

        {/* Gallery — below separator */}
        <button
          onClick={() => handleNav(GALLERY_NAV.path)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
            isActive(GALLERY_NAV.path)
              ? 'bg-sidebar-accent/60 text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/30 hover:text-sidebar-foreground'
          )}
        >
          <GALLERY_NAV.icon className="w-4 h-4 shrink-0" />
          {!collapsed && <span>{GALLERY_NAV.label}</span>}
        </button>

        {!collapsed && (
          <>
            <Separator className="my-2 bg-sidebar-border" />
            {SECONDARY_ITEMS.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => handleNav(item.path)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                    isActive(item.path)
                      ? 'bg-sidebar-accent/60 text-sidebar-accent-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-accent/30 hover:text-sidebar-foreground'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </>
        )}
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Contextual Body */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Converse route — conversation history */}
          {(location === '/' || location === '') && (
            <>
              <div className="flex items-center justify-between px-3 py-1.5 mb-1">
                <span className="eyebrow">Conversations</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNewChat}
                  className="h-6 w-6 p-0 rounded-full hover:bg-sidebar-accent"
                  title="New chat"
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>

              {state.conversations.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground/60">No conversations yet</p>
                  <p className="text-xs text-muted-foreground/40 mt-1">Start a new chat to begin</p>
                </div>
              ) : (
                Object.entries(grouped).map(([label, convs]) => (
                  <div key={label} className="mb-3">
                    <p className="eyebrow px-3 py-1">{label}</p>
                    {convs.map(conv => (
                      <div
                        key={conv.id}
                        className={cn(
                          'group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors rounded-xl',
                          conv.id === state.activeConversationId
                            ? 'bg-sidebar-accent/60 backdrop-blur-sm text-sidebar-accent-foreground'
                            : 'hover:bg-sidebar-accent/30'
                        )}
                        onClick={() => handleSelectConversation(conv.id)}
                      >
                        <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{conv.title}</p>
                          <p className="text-xs text-muted-foreground/60 truncate">
                            {conv.messages.length} message{conv.messages.length !== 1 ? 's' : ''}
                            {conv.model ? ` · ${conv.model}` : ''}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:bg-destructive/10 hover:text-destructive"
                          onClick={e => {
                            e.stopPropagation();
                            deleteConversation(conv.id);
                          }}
                          title="Delete chat"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </>
          )}

          {/* Create route */}
          {location.startsWith('/create') && (
            <div className="px-3 py-4">
              <p className="eyebrow mb-2">Recent Generations</p>
              <p className="text-sm text-muted-foreground/60">No generations yet</p>
            </div>
          )}

          {/* Research route — provider tool catalog */}
          {location.startsWith('/research') && (
            <div className="px-3 py-4">
              <p className="eyebrow mb-2">Research Tools</p>
              <p className="text-sm text-muted-foreground/60">Provider tool catalog</p>
            </div>
          )}

          {/* Evaluate route */}
          {location.startsWith('/evaluate') && (
            <div className="px-3 py-4">
              <p className="eyebrow mb-2">Recent Evaluations</p>
              <p className="text-sm text-muted-foreground/60">No evaluations yet</p>
            </div>
          )}

          {/* Gallery route */}
          {location.startsWith('/gallery') && (
            <div className="px-3 py-4">
              <p className="eyebrow mb-2">Filters</p>
              <p className="text-sm text-muted-foreground/60">All artifacts</p>
            </div>
          )}

          {location.startsWith('/voice') && (
            <div className="px-3 py-4">
              <p className="eyebrow mb-2">Voice Session</p>
              <p className="text-sm text-muted-foreground/60">Realtime audio chat with live transcripts</p>
            </div>
          )}

          {(location.startsWith('/favorites')
            || location.startsWith('/templates')
            || location.startsWith('/presets')
            || location.startsWith('/models')
            || location.startsWith('/analytics')
            || location.startsWith('/tokenizer')
            || location.startsWith('/batches')
            || location.startsWith('/showcase')) && (
            <div className="px-3 py-4">
              <p className="eyebrow mb-2">Workspace</p>
              <p className="text-sm text-muted-foreground/60">Canonical utility routes for the unified chat app</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        {location === '/' && (
          <Button
            variant="outline"
            className="w-full justify-start gap-2 h-10 rounded-xl text-sm font-medium mb-2"
            onClick={handleNewChat}
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
        )}

        <div className="flex items-center justify-center gap-3 pt-1">
          <a
            href="https://lukesteuber.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
          >
            <HelpCircle className="w-3 h-3" />
            <span>lukesteuber.com</span>
          </a>
          <span className="text-muted-foreground/20">·</span>
          <a
            href="https://dr.eamer.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
          >
            <span>dr.eamer.dev</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
