/**
 * Lean tool surface: a few core tools are listed to the AI, everything else is
 * found with ae_find_tool and run with ae_call, so the tool list stays small.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { RECIPES } from './recipes.js';

export type ToolMode = 'lean' | 'full';

export function getToolMode(): ToolMode {
  return process.env.AE_MCP_TOOL_MODE === 'full' ? 'full' : 'lean';
}

export const SERVER_INSTRUCTIONS = [
  'After Effects control server. Work in this order:',
  '1. Use a listed core tool when it fits the job.',
  '2. For anything else call ae_find_tool with a short query. It searches ~100 hidden tools and the recipe library, and returns exact input schemas. Run hidden tools with ae_call.',
  '3. For repeatable brand jobs (sticker pop, wiggle, push-in, captions, SRT import, fades) prefer ae_recipe over writing scripts.',
  '4. Only when nothing fits, write ExtendScript (ES3: var, function, no arrow functions, no let/const, no Array.indexOf or trim) and run it with run_script. The last expression is the result; there is no top-level return.',
  'Every call runs in one undo group, so Ctrl+Z in After Effects reverts it. Verify visual work with render_frame and look at the PNG; do not assume it is right.'
].join('\n');

export const CORE_TOOL_NAMES = [
  'get_project_info',
  'list_compositions',
  'get_comp_report',
  'list_layers',
  'create_composition',
  'import_footage',
  'add_av_layer',
  'add_text_layer',
  'render_frame',
  'save_project'
];

export const META_TOOLS: Tool[] = [
  {
    name: 'run_script',
    description:
      'Run raw ExtendScript (ES3) inside After Effects for anything the other tools cannot do. ' +
      'The value of the last expression is returned (no top-level return; wrap results in an object). ' +
      'Runs in one undo group with dialogs suppressed. Blocked unless allowSystem=true: system.callSystem and app.quit.',
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string', minLength: 1, description: 'ExtendScript source. Example: var c = app.project.activeItem; ({ name: c.name, layers: c.numLayers });' },
        allowSystem: { type: 'boolean', description: 'Allow system.callSystem and app.quit. Default false' }
      },
      required: ['script']
    }
  },
  {
    name: 'ae_find_tool',
    description:
      'Search the ~100 hidden After Effects tools and the recipe library by keyword and get their exact input schemas. ' +
      'Topics covered: project, compositions, layers, text, shapes and bezier paths, masks, 3D, cameras and lights, keyframes and easing, expressions, effects and templates, markers, render queue and Media Encoder, footage and proxies, captions, stickers, wiggle, zoom.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, description: 'Keywords, for example "mask keyframes" or "caption srt"' },
        limit: { type: 'integer', minimum: 1, maximum: 15, description: 'Max results. Default 6' }
      },
      required: ['query']
    }
  },
  {
    name: 'ae_call',
    description: 'Run any tool by name, including hidden ones found with ae_find_tool. Pass the tool arguments in "arguments".',
    inputSchema: {
      type: 'object',
      properties: {
        tool: { type: 'string', minLength: 1 },
        arguments: { type: 'object', description: 'Arguments for the tool, matching its schema from ae_find_tool' }
      },
      required: ['tool']
    }
  },
  {
    name: 'ae_recipe',
    description:
      'Brand recipe library: ' + RECIPES.map(r => r.name).join(', ') + '. ' +
      'action=list shows all recipes, action=describe shows one recipe\'s parameters, action=run runs it.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'describe', 'run'] },
        name: { type: 'string', description: 'Recipe name (describe and run)' },
        params: { type: 'object', description: 'Recipe parameters (run)' }
      },
      required: ['action']
    }
  }
];

const BLOCKED_PATTERNS: Array<[RegExp, string]> = [
  [/\bsystem\s*\.\s*callSystem\b/, 'system.callSystem'],
  [/\bapp\s*\.\s*quit\b/, 'app.quit']
];

/** Returns the reason a script is blocked, or null when it may run. */
export function checkScript(script: string, allowSystem: boolean): string | null {
  if (allowSystem) return null;
  for (const [pattern, label] of BLOCKED_PATTERNS) {
    if (pattern.test(script)) {
      return `Script uses ${label}, which is blocked by default. Pass allowSystem=true only if the user asked for it.`;
    }
  }
  return null;
}

export interface CatalogEntry {
  name: string;
  kind: 'tool' | 'recipe';
  description: string;
  inputSchema: unknown;
  listed: boolean;
  extraTerms?: string[];
}

/** Keyword search over names, descriptions and parameter names. Best match first. */
export function searchCatalog(query: string, catalog: CatalogEntry[], limit: number): CatalogEntry[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1);
  if (!words.length) return [];
  const scored: Array<{ entry: CatalogEntry; score: number }> = [];
  for (const entry of catalog) {
    const name = entry.name.toLowerCase();
    const nameWords = name.split('_');
    const desc = entry.description.toLowerCase();
    const props = Object.keys(((entry.inputSchema as any)?.properties ?? {})).join(' ').toLowerCase();
    const extra = (entry.extraTerms ?? []).join(' ').toLowerCase();
    let score = 0;
    for (const word of words) {
      if (name === word) score += 10;
      else if (nameWords.includes(word)) score += 6;
      else if (name.includes(word)) score += 3;
      if (extra.includes(word)) score += 3;
      if (desc.includes(word)) score += 2;
      if (props.includes(word)) score += 1;
    }
    if (entry.kind === 'recipe' && score > 0) score += 1;
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  return scored.slice(0, limit).map(s => s.entry);
}
