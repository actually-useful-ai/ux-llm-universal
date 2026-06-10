// ============================================================
// Tool Service — Dynamic tool discovery and execution
// Fetches tools from dr.eamer.dev API gateway via server proxy
// Executes tools server-side and returns results
// ============================================================

import { apiUrl } from './api-base';
import type { OllamaTool } from './types';

// --- Types ---

export interface ToolInfo {
  name: string;
  module: string;
  description: string;
  parameters: {
    type: string;
    required?: string[];
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  };
}

export interface ToolCategory {
  name: string;
  icon: string;
  description: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: unknown;
  }>;
}

export interface ToolRegistry {
  categories: Record<string, ToolCategory>;
  tools: ToolInfo[];
  count: number;
}

export interface ToolExecutionResult {
  tool: string;
  result: unknown;
  error?: string;
}

// --- Built-in tools (always available, executed client-side) ---

const BUILTIN_TOOL_NAMES = new Set(['get_current_time', 'calculate']);

export function isBuiltinTool(name: string): boolean {
  return BUILTIN_TOOL_NAMES.has(name);
}

export function executeBuiltinTool(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'get_current_time': {
      const tz = (args.timezone as string) || Intl.DateTimeFormat().resolvedOptions().timeZone;
      try {
        return new Date().toLocaleString('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' });
      } catch {
        return new Date().toLocaleString();
      }
    }
    case 'calculate': {
      const expr = args.expression as string;
      try {
        const result = new Function(`"use strict"; return (${expr})`)();
        return String(result);
      } catch (e) {
        return `Error: Could not evaluate "${expr}" — ${e instanceof Error ? e.message : 'unknown error'}`;
      }
    }
    default:
      return `Unknown built-in tool: ${name}`;
  }
}

// --- Builtin tool schemas (always included) ---

export const BUILTIN_TOOLS: OllamaTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current date and time in any timezone',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'IANA timezone, e.g. "America/New_York", "Europe/London"',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Evaluate a mathematical expression',
      parameters: {
        type: 'object',
        required: ['expression'],
        properties: {
          expression: {
            type: 'string',
            description: 'JavaScript math expression, e.g. "2 + 2", "Math.sqrt(144)"',
          },
        },
      },
    },
  },
];

// --- Remote tool fetching ---

let cachedRegistry: ToolRegistry | null = null;
let cacheTimestamp = 0;
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchToolRegistry(): Promise<ToolRegistry> {
  if (cachedRegistry && Date.now() - cacheTimestamp < CLIENT_CACHE_TTL) {
    return cachedRegistry;
  }
  try {
    const res = await fetch(apiUrl('/api/tools'), {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: ToolRegistry = await res.json();
    cachedRegistry = data;
    cacheTimestamp = Date.now();
    return data;
  } catch {
    return cachedRegistry || { categories: {}, tools: [], count: 0 };
  }
}

/**
 * Get all tool schemas in Ollama/OpenAI function-calling format.
 * Combines built-in tools with remote API tools.
 * Filters by enabled tool modules if provided.
 */
export async function getToolSchemas(enabledModules?: Set<string>): Promise<OllamaTool[]> {
  const tools: OllamaTool[] = [...BUILTIN_TOOLS];

  try {
    const registry = await fetchToolRegistry();
    for (const tool of registry.tools) {
      // Skip if module filtering is active and this module is disabled
      if (enabledModules && !enabledModules.has(tool.module)) continue;

      tools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || tool.name,
          parameters: tool.parameters || { type: 'object', properties: {} },
        },
      });
    }
  } catch {
    // If remote tools fail, we still have builtins
  }

  return tools;
}

// --- Remote tool execution ---

export async function executeRemoteTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  try {
    const res = await fetch(apiUrl('/api/tools/execute'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args }),
    });
    const data = await res.json();
    if (!res.ok) {
      return `Error executing ${name}: ${data.error || 'Unknown error'}`;
    }
    // Format the result as a readable string for the LLM
    const result = data.result;
    if (typeof result === 'string') return result;
    return JSON.stringify(result, null, 2);
  } catch (err) {
    return `Error executing ${name}: ${err instanceof Error ? err.message : 'Network error'}`;
  }
}

/**
 * Execute a tool call — routes to builtin or remote execution.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  if (isBuiltinTool(name)) {
    return executeBuiltinTool(name, args);
  }
  return executeRemoteTool(name, args);
}
