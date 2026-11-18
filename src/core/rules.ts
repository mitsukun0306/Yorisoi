import type { Mention, Platform } from './types.ts';

/**
 * 自動返信ルール。ユーザーが自分で書いたルールに一致したときだけ返信する。
 * 誰にでも返信してしまわないよう、from か contains のどちらかは必須。
 */
export interface AutoReplyRule {
  name: string;
  /** 対象のSNS（省略時は全部） */
  platforms?: Platform[];
  /** 相手のハンドル（どれかに一致） */
  from?: string[];
  /** 本文に含まれる語（どれかに一致） */
  contains?: string[];
  /** 返信する文面 */
  reply: string;
}

export interface AutoReplyConfig {
  /** false の間は一切自動返信しない（初期値） */
  enabled: boolean;
  /** true の間は「送るはずだった返信」を表示するだけで送らない（初期値） */
  dryRun: boolean;
  rules: AutoReplyRule[];
}

export const DEFAULT_AUTO_REPLY: AutoReplyConfig = { enabled: false, dryRun: true, rules: [] };

const normalizeHandle = (h: string) => h.replace(/^@/, '').toLowerCase();

export function validateRules(rules: AutoReplyRule[]): void {
  for (const r of rules) {
    if (!r.name) throw new Error('自動返信ルールには name が必要です');
    if (!r.reply?.trim()) throw new Error(`ルール「${r.name}」に reply（返信文）がありません`);
    if (!r.from?.length && !r.contains?.length) {
      throw new Error(`ルール「${r.name}」は from か contains のどちらかを指定してください（全員への自動返信を防ぐため）`);
    }
  }
}

/** 最初に一致したルールを返す。どれにも一致しなければ undefined。 */
export function matchRule(m: Mention, rules: AutoReplyRule[]): AutoReplyRule | undefined {
  return rules.find((r) => {
    if (r.platforms?.length && !r.platforms.includes(m.platform)) return false;
    if (r.from?.length && !r.from.some((h) => normalizeHandle(h) === normalizeHandle(m.author))) return false;
    if (r.contains?.length && !r.contains.some((w) => m.text.includes(w))) return false;
    return true;
  });
}
