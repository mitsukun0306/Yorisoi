import type { Mention, Notifier } from '../core/types.ts';
import { formatMention } from '../core/format.ts';

export class ConsoleNotifier implements Notifier {
  readonly name = 'console';
  private readonly write: (line: string) => void;

  constructor(write: (line: string) => void = (l) => console.log(l)) {
    this.write = write;
  }

  async notify(mentions: Mention[]): Promise<void> {
    if (mentions.length === 0) return;
    this.write(`🔔 新しい返信・メンションが ${mentions.length} 件あります`);
    for (const m of mentions) this.write(formatMention(m, false));
  }
}
