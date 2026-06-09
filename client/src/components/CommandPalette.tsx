// ============================================================
// Command Palette — Cmd+K universal search/navigate/action
// Uses shadcn Command component (cmdk)
// ============================================================

import { useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  MessageCircle, Sparkles, Shield, LayoutGrid,
  Mic, Star, BookOpen, Cpu, BarChart3, Hash, Layers, Wrench, Share2, Sliders,
  Plus, Search, ArrowRight,
  Image, Paintbrush, Film, RefreshCw, Columns2, Key,
} from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useConversation } from '@/contexts/ConversationContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CommandPalette({ open, onOpenChange }: Props) {
  const [, navigate] = useLocation();
  const { state, createConversation, dispatch } = useConversation();

  const runCommand = useCallback((fn: () => void) => {
    onOpenChange(false);
    fn();
  }, [onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Navigation */}
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => runCommand(() => navigate('/'))}>
            <MessageCircle className="w-4 h-4" />
            <span>Go to Converse</span>
            <CommandShortcut>
              <ArrowRight className="w-3 h-3" />
            </CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/create'))}>
            <Sparkles className="w-4 h-4" />
            <span>Go to Create</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/evaluate'))}>
            <Shield className="w-4 h-4" />
            <span>Go to Evaluate</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/gallery'))}>
            <LayoutGrid className="w-4 h-4" />
            <span>Go to Gallery</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/voice'))}>
            <Mic className="w-4 h-4" />
            <span>Go to Live Voice</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/favorites'))}>
            <Star className="w-4 h-4" />
            <span>Go to Favorites</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/templates'))}>
            <BookOpen className="w-4 h-4" />
            <span>Go to Templates</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/presets'))}>
            <Sliders className="w-4 h-4" />
            <span>Go to Presets</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/models'))}>
            <Cpu className="w-4 h-4" />
            <span>Go to Models</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/analytics'))}>
            <BarChart3 className="w-4 h-4" />
            <span>Go to Analytics</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/tokenizer'))}>
            <Hash className="w-4 h-4" />
            <span>Go to Tokenizer</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/batches'))}>
            <Layers className="w-4 h-4" />
            <span>Go to Batches</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/research/tools'))}>
            <Wrench className="w-4 h-4" />
            <span>Go to Research Tools</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/showcase'))}>
            <Share2 className="w-4 h-4" />
            <span>Go to Showcase</span>
          </CommandItem>
          {/* Stage 4 universal merge — surfaces ported from ux-llm-media */}
          <CommandItem onSelect={() => runCommand(() => navigate('/images'))}>
            <Image className="w-4 h-4" />
            <span>Go to Images</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/images/edit'))}>
            <Paintbrush className="w-4 h-4" />
            <span>Go to Image Edit</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/videos/edit'))}>
            <Film className="w-4 h-4" />
            <span>Go to Video Edit</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/rewrites'))}>
            <RefreshCw className="w-4 h-4" />
            <span>Go to Rewrites</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/compare'))}>
            <Columns2 className="w-4 h-4" />
            <span>Go to Compare</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/api-key'))}>
            <Key className="w-4 h-4" />
            <span>Go to API Key</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Quick Actions */}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => {
            createConversation();
            navigate('/');
          })}>
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
            <CommandShortcut>Ctrl+N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/create'))}>
            <Sparkles className="w-4 h-4" />
            <span>Generate Image</span>
          </CommandItem>
        </CommandGroup>

        {/* Recent Conversations */}
        {state.conversations.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Conversations">
              {state.conversations.slice(0, 8).map(conv => (
                <CommandItem
                  key={conv.id}
                  onSelect={() => runCommand(() => {
                    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: conv.id });
                    navigate('/');
                  })}
                >
                  <Search className="w-4 h-4" />
                  <span className="truncate">{conv.title}</span>
                  <CommandShortcut>
                    {conv.messages.length} msg{conv.messages.length !== 1 ? 's' : ''}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
