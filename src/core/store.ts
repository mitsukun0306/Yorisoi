import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Mention, MentionStatus, StoredMention } from './types.ts';

interface StoreData {
  version: 1;
  mentions: Record<string, StoredMention>;
}

/**
 * 集めたメンションをJSONファイルに保存する小さなストア。
 * 自分用アプリなのでDBは使わず、ファイル1つで済ませる。
 */
export class MentionStore {
  private data: StoreData = { version: 1, mentions: {} };
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  async load(): Promise<void> {
    try {
      this.data = JSON.parse(await readFile(this.path, 'utf8')) as StoreData;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    await rename(tmp, this.path);
  }

  /** 未保存のメンションだけを追加し、追加したものを返す。 */
  addNew(mentions: Mention[], now = new Date()): StoredMention[] {
    const added: StoredMention[] = [];
    for (const m of mentions) {
      if (this.data.mentions[m.id]) continue;
      const stored: StoredMention = { ...m, status: 'new', fetchedAt: now.toISOString() };
      this.data.mentions[m.id] = stored;
      added.push(stored);
    }
    return added;
  }

  get(id: string): StoredMention | undefined {
    return this.data.mentions[id];
  }

  /** IDの前方一致でも探せるようにする（CLIで短く打てるように）。 */
  find(idOrPrefix: string): StoredMention | undefined {
    const exact = this.get(idOrPrefix);
    if (exact) return exact;
    const hits = this.list().filter((m) => m.id.startsWith(idOrPrefix));
    return hits.length === 1 ? hits[0] : undefined;
  }

  list(filter?: { status?: MentionStatus[] }): StoredMention[] {
    return Object.values(this.data.mentions)
      .filter((m) => !filter?.status || filter.status.includes(m.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  setStatus(id: string, status: MentionStatus): void {
    const m = this.data.mentions[id];
    if (!m) throw new Error(`メンションが見つかりません: ${id}`);
    m.status = status;
  }

  recordReply(id: string, text: string, by: 'manual' | 'rule', now = new Date()): void {
    const m = this.data.mentions[id];
    if (!m) throw new Error(`メンションが見つかりません: ${id}`);
    m.status = 'replied';
    m.reply = { text, sentAt: now.toISOString(), by };
  }
}
