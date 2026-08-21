import type { EventName, HookEvent } from '../types.js';

function addedLines(oldStr: string, newStr: string): string {
  const before = new Set(oldStr.split('\n'));
  return newStr.split('\n').filter((l) => !before.has(l)).join('\n');
}

export function adapt(eventName: EventName, raw: unknown): HookEvent {
  const input = (raw as { tool_input?: Record<string, unknown> })?.tool_input;
  if (!input) return { event: eventName };

  if (typeof input.command === 'string') {
    return { event: eventName, command: input.command };
  }

  const path = typeof input.file_path === 'string' ? input.file_path : undefined;
  if (!path) return { event: eventName };

  if (typeof input.content === 'string') {
    return { event: eventName, path, content: input.content, added: input.content };
  }
  if (typeof input.new_string === 'string') {
    const oldStr = typeof input.old_string === 'string' ? input.old_string : '';
    return {
      event: eventName, path,
      content: input.new_string,
      added: addedLines(oldStr, input.new_string),
    };
  }
  return { event: eventName, path };
}
