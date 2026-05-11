import { useEffect, useMemo, useState } from 'react';
import {
  Image as ImageIcon, Loader2, MoreVertical, Pencil, Plus, Settings2, Sliders, Trash2, Video, Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpcMutate, trpcQuery } from '@/lib/trpc-fetch';

type FeatureType = 'image_gen' | 'image_edit' | 'video_gen' | 'video_edit' | 'tts';

type Preset = {
  id: number;
  feature: FeatureType;
  name: string;
  settings: Record<string, unknown>;
  isDefault: number;
  useCount: number;
  createdAt: string;
  updatedAt: string;
};

const FEATURE_TYPES: Array<{ value: FeatureType; label: string; icon: typeof ImageIcon }> = [
  { value: 'image_gen', label: 'Image Generation', icon: ImageIcon },
  { value: 'image_edit', label: 'Image Editing', icon: ImageIcon },
  { value: 'video_gen', label: 'Video Generation', icon: Video },
  { value: 'video_edit', label: 'Video Editing', icon: Video },
  { value: 'tts', label: 'Text to Speech', icon: Volume2 },
];

const DEFAULT_SETTINGS: Record<FeatureType, Record<string, unknown>> = {
  image_gen: { provider: 'xai', model: 'grok-2-image', size: '1024x1024', quality: 'high' },
  image_edit: { provider: 'xai', model: 'grok-2-image', strength: 0.65, preserveSubject: true },
  video_gen: { provider: 'xai', model: 'grok-video', duration: 8, aspectRatio: '16:9' },
  video_edit: { provider: 'xai', model: 'grok-video', duration: 8, mode: 'extend' },
  tts: { provider: 'xai', model: 'grok-voice', voice: 'alloy', format: 'mp3' },
};

function prettyJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

export default function PresetsPage() {
  const [selectedFeature, setSelectedFeature] = useState<FeatureType>('image_gen');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [settingsText, setSettingsText] = useState(prettyJson(DEFAULT_SETTINGS.image_gen));

  const editingPreset = useMemo(
    () => presets.find(preset => preset.id === editingId) ?? null,
    [editingId, presets],
  );

  const loadPresets = async (feature: FeatureType = selectedFeature) => {
    setLoading(true);
    try {
      const data = await trpcQuery<Preset[]>('presets.list', { feature });
      setPresets(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load presets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPresets(selectedFeature);
  }, [selectedFeature]);

  const resetForm = (feature: FeatureType = selectedFeature) => {
    setEditingId(null);
    setName('');
    setSettingsText(prettyJson(DEFAULT_SETTINGS[feature]));
  };

  const parseSettings = () => {
    const parsed = JSON.parse(settingsText || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Settings must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  };

  const submitPreset = async () => {
    if (!name.trim()) return;

    let parsedSettings: Record<string, unknown>;
    try {
      parsedSettings = parseSettings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid preset settings');
      return;
    }

    setSaving(true);
    try {
      if (editingPreset) {
        await trpcMutate('presets.update', {
          id: editingPreset.id,
          name: name.trim(),
          settings: parsedSettings,
        });
        toast.success('Preset updated');
      } else {
        await trpcMutate('presets.save', {
          feature: selectedFeature,
          name: name.trim(),
          settings: parsedSettings,
          isDefault: presets.length === 0,
        });
        toast.success('Preset created');
      }

      resetForm(selectedFeature);
      await loadPresets(selectedFeature);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save preset');
    } finally {
      setSaving(false);
    }
  };

  const editPreset = (preset: Preset) => {
    setEditingId(preset.id);
    setName(preset.name);
    setSettingsText(prettyJson(preset.settings || {}));
  };

  const setDefault = async (preset: Preset) => {
    try {
      await trpcMutate('presets.update', { id: preset.id, isDefault: true });
      toast.success('Default preset updated');
      await loadPresets(selectedFeature);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update preset');
    }
  };

  const removePreset = async (preset: Preset) => {
    try {
      await trpcMutate('presets.delete', { id: preset.id });
      if (editingId === preset.id) resetForm(selectedFeature);
      toast.success('Preset deleted');
      await loadPresets(selectedFeature);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete preset');
    }
  };

  return (
    <div className="grid flex-1 min-h-0 gap-0 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col border-r border-border/30 bg-background/55">
        <div className="border-b border-border/30 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/8">
              <Sliders className="h-5 w-5 text-primary/75" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Presets</h1>
              <p className="text-sm text-muted-foreground">
                Save reusable settings for canonical image, video, and voice workflows.
              </p>
            </div>
          </div>
        </div>

        <div className="border-b border-border/30 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {FEATURE_TYPES.map(type => {
              const Icon = type.icon;
              const active = selectedFeature === type.value;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => {
                    setSelectedFeature(type.value);
                    resetForm(type.value);
                  }}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-border/40 text-muted-foreground hover:border-primary/25 hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {type.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : presets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/50 p-6 text-center">
              <Settings2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium">No presets yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a named settings profile for this workflow family.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {presets.map(preset => (
                <div key={preset.id} className="rounded-2xl border border-border/50 bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{preset.name}</p>
                        {preset.isDefault ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Used {preset.useCount} time{preset.useCount === 1 ? '' : 's'} · Updated {new Date(preset.updatedAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {!preset.isDefault ? (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void setDefault(preset)}>
                          <Settings2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editPreset(preset)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => void removePreset(preset)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <pre className="mt-3 overflow-x-auto rounded-xl bg-muted/35 p-3 text-xs text-muted-foreground">
                    {prettyJson((preset.settings || {}) as Record<string, unknown>)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="border-b border-border/30 px-6 py-4">
          <h2 className="text-lg font-semibold">{editingPreset ? 'Edit preset' : 'New preset'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Define a reusable settings object that can be applied to future create workflows.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <label className="mb-2 block text-sm font-medium">Preset name</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Cinematic 16:9, Portrait Voice, etc." />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Feature</label>
                <div className="rounded-xl border border-border/50 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
                  {FEATURE_TYPES.find(type => type.value === selectedFeature)?.label}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium">Settings JSON</label>
                <Button variant="ghost" size="sm" onClick={() => setSettingsText(prettyJson(DEFAULT_SETTINGS[selectedFeature]))}>
                  <Plus className="mr-2 h-4 w-4" />
                  Reset example
                </Button>
              </div>
              <textarea
                value={settingsText}
                onChange={e => setSettingsText(e.target.value)}
                rows={20}
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 font-mono text-sm outline-none transition-colors focus:border-primary/40"
                spellCheck={false}
                placeholder='{"model":"grok-2-image","size":"1024x1024"}'
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void submitPreset()} disabled={saving || !name.trim()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sliders className="mr-2 h-4 w-4" />}
                {editingPreset ? 'Save preset' : 'Create preset'}
              </Button>
              {editingPreset ? (
                <Button variant="outline" onClick={() => resetForm(selectedFeature)}>
                  Cancel edit
                </Button>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border/40 bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">How this route fits the canonical app</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Presets are stored in `ux-glm-chat` and grouped by feature so `/io/chat` can absorb the reusable settings workflows that previously lived in separate media surfaces.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
