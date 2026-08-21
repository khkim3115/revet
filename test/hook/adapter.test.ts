import { describe, it, expect } from 'vitest';
import { adapt } from '../../src/hook/adapter.js';

describe('adapt', () => {
  it('extracts command from a Bash tool payload', () => {
    const raw = { tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/x' } };
    expect(adapt('pre-bash', raw)).toEqual({ event: 'pre-bash', command: 'rm -rf /tmp/x' });
  });

  it('extracts path and content from a Write tool payload', () => {
    const raw = { tool_name: 'Write', tool_input: { file_path: '/a/b.php', content: '<? echo 1;' } };
    expect(adapt('post-edit', raw)).toEqual({
      event: 'post-edit', path: '/a/b.php', content: '<? echo 1;', added: '<? echo 1;',
    });
  });

  it('derives added lines from an Edit tool payload', () => {
    const raw = { tool_name: 'Edit', tool_input: { file_path: '/a/b.php', old_string: 'a', new_string: 'a\nTODO' } };
    expect(adapt('post-edit', raw).added).toBe('TODO');
  });

  it('returns a bare event when the payload is unrecognized', () => {
    expect(adapt('pre-bash', { nonsense: true })).toEqual({ event: 'pre-bash' });
  });
});
