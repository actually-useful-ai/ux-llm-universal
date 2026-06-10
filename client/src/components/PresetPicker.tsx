// ============================================================
// PresetPicker — apply/save generation presets inside a panel
// Backed by trpc.presets (exportPresets table). The settings
// payload is opaque JSON; each host panel maps the keys it
// understands and ignores the rest.
// ============================================================

import { useState } from 'react';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type PresetFeature = 'image_gen' | 'image_edit' | 'video_gen' | 'video_edit' | 'tts';

interface PresetPickerProps {
  feature: PresetFeature;
  /** Snapshot of the panel's current settings, saved verbatim as the preset payload. */
  getCurrentSettings: () => Record<string, unknown>;
  /** Receives a saved payload; the panel applies the keys it recognizes. */
  onApply: (settings: Record<string, unknown>) => void;
}

export function PresetPicker({ feature, getCurrentSettings, onApply }: PresetPickerProps) {
  const utils = trpc.useUtils();
  const { data: presets } = trpc.presets.list.useQuery({ feature });
  const savePreset = trpc.presets.save.useMutation({
    onSuccess: () => utils.presets.list.invalidate({ feature }),
  });
  const markUsed = trpc.presets.use.useMutation();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const apply = (idStr: string) => {
    const preset = presets?.find(p => String(p.id) === idStr);
    if (!preset) return;
    onApply((preset.settings ?? {}) as Record<string, unknown>);
    markUsed.mutate({ id: preset.id });
    toast.success(`Preset "${preset.name}" applied`);
  };

  const saveCurrent = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await savePreset.mutateAsync({ feature, name: trimmed, settings: getCurrentSettings() });
      toast.success(`Preset "${trimmed}" saved`);
      setName('');
      setNaming(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save preset');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select onValueChange={apply} value="">
        <SelectTrigger className="h-8 w-44 text-xs" aria-label="Apply a saved preset">
          <SelectValue placeholder={presets?.length ? 'Apply preset…' : 'No presets yet'} />
        </SelectTrigger>
        <SelectContent>
          {(presets ?? []).map(p => (
            <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {naming ? (
        <form
          className="flex items-center gap-1"
          onSubmit={e => { e.preventDefault(); void saveCurrent(); }}
        >
          <Input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Preset name"
            className="h-8 w-36 text-xs"
            aria-label="New preset name"
          />
          <Button type="submit" size="sm" className="h-8" disabled={!name.trim() || savePreset.isPending}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setNaming(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button
          type="button" size="sm" variant="outline" className="h-8 text-xs"
          onClick={() => setNaming(true)} aria-label="Save current settings as a preset"
        >
          <Save className="mr-1 h-3.5 w-3.5" /> Save preset
        </Button>
      )}
    </div>
  );
}
