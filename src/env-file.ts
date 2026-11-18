import { readFile, writeFile } from 'node:fs/promises';

/** .env の指定したキーだけを書き換える（無ければ末尾に足す）。ほかの行やコメントはそのまま残す。 */
export function updateEnvText(text: string, values: Record<string, string>): string {
  const lines = text === '' ? [] : text.split(/\r?\n/);
  const rest = new Map(Object.entries(values));
  const out = lines.map((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && rest.has(m[1])) {
      const v = rest.get(m[1])!;
      rest.delete(m[1]);
      return `${m[1]}=${v}`;
    }
    return line;
  });
  while (out.length && out[out.length - 1] === '') out.pop();
  for (const [k, v] of rest) out.push(`${k}=${v}`);
  return out.join('\n') + '\n';
}

export async function updateEnvFile(path: string, values: Record<string, string>): Promise<void> {
  let text = '';
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  await writeFile(path, updateEnvText(text, values), 'utf8');
}
