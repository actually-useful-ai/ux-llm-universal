// ============================================================
// Emoji Replacement — Strip emoji from LLM output, replace with
// inline SVG icons from lucide-react. Post-processing approach:
// no system prompt needed, works with any model.
// ============================================================

import React from 'react';
import {
  Newspaper, BookOpen, Search, Github, TrendingUp,
  Cloud, Rocket, Globe, GraduationCap,
  BarChart3, Archive, Wrench, Lightbulb, MessageCircle,
  Star, Heart, ThumbsUp, ThumbsDown, AlertTriangle,
  CheckCircle, XCircle, Clock, Zap, Flame,
  Music, Camera, Film, Palette, Code,
  FileText, Mail, Phone, MapPin, Home,
  Users, User, Shield, Lock, Unlock,
  Sun, Moon, CloudRain, Snowflake, Wind,
  ArrowRight, ArrowLeft, ArrowUp, ArrowDown,
  Plus, Minus, X, Check, Info,
  Eye, Ear, Brain, Cpu, Database,
  Wifi, Battery, Volume2, Mic, Play,
  Pause, Square, Circle, Triangle, Diamond,
  Gift, Trophy, Target, Crosshair, Compass,
  Anchor, Ship, Plane, Car, Train,
  TreePine, Flower2, Bug, Fish, Bird,
} from 'lucide-react';

// Map emoji codepoints/characters to lucide icon components
const EMOJI_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  // News & Media
  '📰': Newspaper, '📺': Film, '📻': Volume2, '🎵': Music, '🎶': Music,
  '📷': Camera, '🎬': Film, '🎨': Palette,
  // Books & Knowledge
  '📚': BookOpen, '📖': BookOpen, '📕': BookOpen, '📗': BookOpen, '📘': BookOpen,
  '📙': BookOpen, '🔍': Search, '🔎': Search,
  // Tech & Code
  '💻': Code, '🖥️': Code, '⌨️': Code, '🔧': Wrench, '🔨': Wrench,
  '⚙️': Wrench, '🛠️': Wrench, '💾': Database, '📱': Phone,
  '🤖': Cpu, '🧠': Brain, '👁️': Eye, '👂': Ear,
  // GitHub & Dev
  '🐙': Github, '🐈': Github,
  // Finance & Charts
  '📈': TrendingUp, '📉': TrendingUp, '📊': BarChart3, '💰': TrendingUp,
  '💵': TrendingUp, '💎': Diamond,
  // Weather
  '☀️': Sun, '🌙': Moon, '⛅': Cloud, '🌧️': CloudRain, '❄️': Snowflake,
  '💨': Wind, '🌡️': Cloud, '🔥': Flame, '⚡': Zap,
  // Space & Science
  '🚀': Rocket, '🌍': Globe, '🌎': Globe, '🌏': Globe, '🌐': Globe,
  '⭐': Star, '🌟': Star, '✨': Star, '💫': Star,
  '🔬': Search, '🧪': Search,
  // People & Emotions
  '👤': User, '👥': Users, '❤️': Heart, '💛': Heart, '💚': Heart,
  '💙': Heart, '💜': Heart, '🖤': Heart, '🤍': Heart,
  '👍': ThumbsUp, '👎': ThumbsDown, '👋': User,
  '😊': User, '😃': User, '😄': User, '🙂': User, '😎': User,
  '🤔': Brain, '💡': Lightbulb, '💬': MessageCircle, '🗣️': MessageCircle,
  // Status & Indicators
  '✅': CheckCircle, '❌': XCircle, '⚠️': AlertTriangle, '❓': Info,
  '❗': AlertTriangle, '🔴': Circle, '🟢': Circle, '🟡': Circle,
  '🏁': Target, '🎯': Target, '🔑': Lock, '🔒': Lock, '🔓': Unlock,
  '🛡️': Shield,
  // Arrows & Navigation
  '➡️': ArrowRight, '⬅️': ArrowLeft, '⬆️': ArrowUp, '⬇️': ArrowDown,
  '↩️': ArrowLeft, '↪️': ArrowRight,
  '➕': Plus, '➖': Minus, '✖️': X, '✔️': Check,
  // Objects
  '🎁': Gift, '🏆': Trophy, '🧭': Compass, '⚓': Anchor,
  '📧': Mail, '✉️': Mail, '📍': MapPin, '🏠': Home, '🏢': Home,
  '📄': FileText, '📝': FileText, '📋': FileText,
  '🔗': Globe,
  '🎮': Play, '▶️': Play, '⏸️': Pause, '⏹️': Square,
  '🔊': Volume2, '🎤': Mic, '⏰': Clock, '⏱️': Clock,
  '🔋': Battery, '📡': Wifi,
  // Transport
  '✈️': Plane, '🚗': Car, '🚂': Train, '🚢': Ship,
  // Nature
  '🌲': TreePine, '🌸': Flower2, '🐛': Bug, '🐟': Fish, '🐦': Bird,
  '🌻': Flower2, '🍃': TreePine, '🌿': TreePine,
  // YouTube
  '🎥': Film,
  // Archive
  '🗄️': Archive, '📦': Archive,
  // Academic
  '🎓': GraduationCap, '📐': GraduationCap,
};

// Regex that matches emoji: supplementary plane + common BMP symbols + variation selectors
// Covers: emoticons, symbols, dingbats, misc symbols, transport, flags, skin tones
const EMOJI_REGEX = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*/gu;

// Inline SVG icon component for replaced emoji
function EmojiIcon({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  return <Icon className="inline-block w-[1em] h-[1em] align-[-0.125em] text-primary/70 mx-[0.1em]" />;
}

/**
 * Process a text string and replace emoji with React elements.
 * Returns an array of strings and React elements.
 */
export function replaceEmoji(text: string): (string | React.ReactElement)[] {
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let keyCounter = 0;

  for (const match of text.matchAll(EMOJI_REGEX)) {
    const emoji = match[0];
    const index = match.index!;

    // Add text before this emoji
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    // Look up icon for this emoji
    const Icon = EMOJI_ICON_MAP[emoji];
    if (Icon) {
      parts.push(<EmojiIcon key={`emoji-${keyCounter++}`} icon={Icon} />);
    }
    // If no mapping, just drop the emoji (strip it)

    lastIndex = index + emoji.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * Check if a string contains any emoji characters.
 */
export function containsEmoji(text: string): boolean {
  const re = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u;
  return re.test(text);
}

/**
 * Strip all emoji from a string (plain text version, no React elements).
 */
export function stripEmoji(text: string): string {
  const re = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*/gu;
  return text.replace(re, '').replace(/\s{2,}/g, ' ').trim();
}
