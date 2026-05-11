import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Phone, PhoneOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { apiUrl } from '@/lib/api-base';
import { toast } from 'sonner';

type TranscriptEntry = {
  role: 'user' | 'assistant';
  text: string;
};

type ConversationState = 'idle' | 'connecting' | 'connected' | 'error';

export default function VoicePage() {
  const [state, setState] = useState<ConversationState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a concise, helpful voice assistant. Keep responses conversational and direct.',
  );

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    if (!scrollRef.current) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [transcript, scrollToBottom]);

  const cleanup = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(track => track.stop());
    wsRef.current?.close();

    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    wsRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const playPCM16 = useCallback((pcmData: Uint8Array) => {
    if (!audioContextRef.current) return;

    const context = audioContextRef.current;
    const int16 = new Int16Array(pcmData.buffer);
    const float32 = new Float32Array(int16.length);

    for (let i = 0; i < int16.length; i += 1) {
      float32[i] = int16[i] / 0x8000;
    }

    const buffer = context.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
  }, []);

  const handleRealtimeEvent = useCallback((event: any) => {
    switch (event.type) {
      case 'response.audio.delta': {
        if (!event.delta) return;
        const binary = atob(event.delta);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        playPCM16(bytes);
        break;
      }
      case 'response.audio_transcript.delta': {
        if (!event.delta) return;
        setTranscript(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return [...prev.slice(0, -1), { role: 'assistant', text: last.text + event.delta }];
          }
          return [...prev, { role: 'assistant', text: event.delta }];
        });
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        if (!event.transcript) return;
        setTranscript(prev => [...prev, { role: 'user', text: event.transcript }]);
        break;
      }
      case 'error': {
        toast.error(event.error?.message || 'Realtime voice error');
        break;
      }
      default:
        break;
    }
  }, [playPCM16]);

  const startAudioCapture = useCallback((ws: WebSocket, stream: MediaStream) => {
    const audioContext = new AudioContext({ sampleRate: 24000 });
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    sourceRef.current = source;
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN || isMuted) return;

      const input = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(input.length);
      for (let i = 0; i < input.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, input[i]));
        pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      const bytes = new Uint8Array(pcm16.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }

      ws.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: btoa(binary),
      }));
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  }, [isMuted]);

  const stopConversation = useCallback(() => {
    cleanup();
    setState('idle');
  }, [cleanup]);

  const startConversation = useCallback(async () => {
    try {
      setState('connecting');
      setTranscript([]);

      const secretRes = await fetch(apiUrl('/api/voice/realtime/session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresAfterSeconds: 300 }),
      });
      const secretData = await secretRes.json();
      const secret = secretData?.value ?? secretData?.client_secret?.value ?? secretData?.client_secret;

      if (!secretRes.ok || !secret) {
        throw new Error(secretData?.error || 'Failed to create realtime voice session');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const ws = new WebSocket('wss://api.x.ai/v1/realtime', [`xai-client-secret.${secret}`]);
      wsRef.current = ws;

      ws.onopen = () => {
        setState('connected');
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: systemPrompt,
            voice: 'sage',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 250,
              silence_duration_ms: 450,
            },
          },
        }));
        startAudioCapture(ws, stream);
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          handleRealtimeEvent(JSON.parse(event.data));
        } catch {
          // Ignore malformed frames.
        }
      };

      ws.onerror = () => {
        setState('error');
        toast.error('Realtime voice connection failed');
      };

      ws.onclose = () => {
        cleanup();
        setState('idle');
      };
    } catch (error) {
      cleanup();
      setState('error');
      toast.error(error instanceof Error ? error.message : 'Failed to start voice conversation');
    }
  }, [cleanup, handleRealtimeEvent, startAudioCapture, systemPrompt]);

  return (
    <div className="flex flex-1 flex-col min-w-0">
      <div className="border-b border-border/30 bg-background/70 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">Live Voice</h1>
              <Badge variant="outline">xAI Realtime</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a live two-way voice session from the canonical chat app.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={isMuted ? 'destructive' : 'outline'}
              size="sm"
              disabled={state !== 'connected'}
              onClick={() => setIsMuted(prev => !prev)}
            >
              {isMuted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
              {isMuted ? 'Muted' : 'Mic On'}
            </Button>
            {state === 'connected' ? (
              <Button size="sm" variant="destructive" onClick={stopConversation}>
                <PhoneOff className="mr-2 h-4 w-4" />
                End
              </Button>
            ) : (
              <Button size="sm" disabled={state === 'connecting'} onClick={startConversation}>
                {state === 'connecting' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="mr-2 h-4 w-4" />
                )}
                Start
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid flex-1 min-h-0 gap-0 md:grid-cols-[320px_minmax(0,1fr)]">
        <div className="border-b border-border/30 p-4 md:border-b-0 md:border-r">
          <label htmlFor="voice-system-prompt" className="mb-2 block text-sm font-medium">
            Voice system prompt
          </label>
          <Textarea
            id="voice-system-prompt"
            rows={8}
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="Instructions for the voice assistant"
          />
          <div className="mt-4 rounded-xl border border-border/40 bg-muted/20 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Session status</p>
            <p className="mt-2 text-sm capitalize">{state}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Audio is streamed through xAI realtime sessions; provider/model settings for text chat are unchanged.
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="border-b border-border/30 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Volume2 className="h-4 w-4" />
              <span>Transcript</span>
            </div>
          </div>
          <ScrollArea className="flex-1" ref={scrollRef as any}>
            <div className="space-y-3 p-4">
              {transcript.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/50 p-6 text-sm text-muted-foreground">
                  Voice activity and transcripts will appear here once a session is active.
                </div>
              ) : (
                transcript.map((entry, index) => (
                  <div
                    key={`${entry.role}-${index}`}
                    className={`max-w-3xl rounded-2xl px-4 py-3 text-sm ${
                      entry.role === 'assistant'
                        ? 'bg-primary/10 text-foreground'
                        : 'ml-auto bg-muted text-foreground'
                    }`}
                  >
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {entry.role}
                    </div>
                    <p className="whitespace-pre-wrap">{entry.text}</p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
