import type { Mention, StoredMention } from './types.ts';

const STATUS_LABEL: Record<string, string> = {
  new: '未通知',
  notified: '未返信',
  replied: '返信済み',
  ignored: '対応不要',
};

export function formatMention(m: Mention | StoredMention, showStatus = true): string {
  const who = m.authorName ? `${m.authorName} (${m.author})` : m.author;
  const status = showStatus && 'status' in m ? ` [${STATUS_LABEL[m.status] ?? m.status}]` : '';
  const lines = [`[${m.platform}] ${who}${status}`, `  ${m.text.replace(/\n/g, '\n  ')}`, `  ID: ${m.id}`];
  if (m.url) lines.push(`  ${m.url}`);
  return lines.join('\n');
}
