export type EventName = 'pre-bash' | 'pre-edit' | 'post-edit';
export type Verdict = 'pass' | 'warn' | 'block';

export interface HookEvent {
  event: EventName;
  command?: string;
  path?: string;
  content?: string;
  added?: string;
}
