import type { Mention, Notifier } from '../core/types.ts';

type Listener = (mentions: Mention[]) => void;

/** Yorisoiアプリの画面に新着を届ける通知先。画面はサーバーからのイベント（SSE）で受け取る。 */
export class InAppNotifier implements Notifier {
  readonly name = 'app';
  private readonly listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async notify(mentions: Mention[]): Promise<void> {
    for (const fn of this.listeners) fn(mentions);
  }
}
