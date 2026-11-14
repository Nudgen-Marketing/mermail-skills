import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const tracked = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
for (const endings of ['LF', 'CRLF']) {
  test(`full current validator accepts a ${endings} checkout without changing skill content`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mermail-validate-endings-'));
    try {
      for (const file of tracked) {
        const source = path.join(root, file), dest = path.join(dir, file);
        if (!fs.existsSync(source) || !fs.lstatSync(source).isFile()) continue;
        fs.mkdirSync(path.dirname(dest), {recursive: true});
        const bytes = fs.readFileSync(source);
        if (/\.(?:md|mjs|json|ya?ml)$/.test(file)) {
          const normalized = bytes.toString('utf8').replace(/\r\n/g, '\n');
          fs.writeFileSync(dest, endings === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized);
        } else fs.writeFileSync(dest, bytes);
      }
      const result = spawnSync(process.execPath, ['tests/validate.mjs'], {
        cwd: dir, encoding: 'utf8', timeout: 30000,
        env: {PATH: process.env.PATH ?? '', LANG: 'C.UTF-8'},
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /Validated \d+ skills and \d+ business tools/);
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  });
}
