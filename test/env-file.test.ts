import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateEnvText } from '../src/env-file.ts';

test('updateEnvText: 既存のキーだけ書き換え、コメントや他の行は残す', () => {
  const before = '# Gmail\nGMAIL_CLIENT_ID=abc\nGMAIL_REFRESH_TOKEN=\nOTHER=1\n';
  assert.equal(
    updateEnvText(before, { GMAIL_REFRESH_TOKEN: 'rt' }),
    '# Gmail\nGMAIL_CLIENT_ID=abc\nGMAIL_REFRESH_TOKEN=rt\nOTHER=1\n',
  );
});

test('updateEnvText: 無いキーは末尾に足す（Windowsの改行でも動く）', () => {
  assert.equal(updateEnvText('A=1\r\n', { B: '2' }), 'A=1\nB=2\n');
  assert.equal(updateEnvText('', { B: '2' }), 'B=2\n');
});
