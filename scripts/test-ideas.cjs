// Exercise the real adapter in a disposable BD database; never touches user boards.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const Module = require('node:module');
// Load server-only TypeScript helpers without booting Next.
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  return id === 'server-only' ? {} : originalLoad.call(this, id, ...args);
};
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename,
);
const { createBdStore } = require('../lib/bd.ts');
const { createInputSchema, updateInputSchema } = require('../lib/schema.ts');
const { BOARD_COLUMNS } = require('../lib/board-columns.ts');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scotty-ideas-'));
const bd = (...args) => execFileSync(process.env.BD_BIN || 'bd', ['--sandbox', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const rows = (...args) => JSON.parse(bd(...args, '--json'));
(async () => {
  execFileSync('git', ['init', '-q', dir]);
  bd('init', '--prefix', 'ideas', '--skip-agents', '--skip-hooks', '--non-interactive');
  bd('config', 'set', 'status.custom', 'review:wip');
  const store = createBdStore(dir);
  const idea = await store.create(createInputSchema.parse({ title: 'Explore before committing', labels: ['project:test'] }), 'codex');
  assert.equal(idea.status, 'idea');
  assert.ok(bd('config', 'get', 'status.custom').includes('review:wip,idea:wip'));
  assert.ok(rows('list').some(b => b.id === idea.id));
  assert.ok(!rows('ready').some(b => b.id === idea.id));
  const membership = (b) => BOARD_COLUMNS.filter(c => c.test(b, false)).map(c => c.id);
  assert.deepEqual(membership(idea), ['ideas']);
  const ready = await store.setStatus(idea.id, 'open', 'codex');
  assert.deepEqual(membership(ready), ['ready']);
  assert.ok(rows('ready').some(b => b.id === idea.id));
  const held = await store.setStatus(idea.id, 'deferred', 'codex');
  assert.deepEqual(membership(held), ['deferred']);
  assert.ok(!rows('ready').some(b => b.id === idea.id));
  const returned = await store.update(idea.id, updateInputSchema.parse({ status: 'idea' }), 'codex');
  assert.equal(returned.status, 'idea');
  assert.deepEqual(returned.labels, ['project:test']);
  assert.equal(returned.title, idea.title);
  console.log('PASS: default idea creation, custom config preservation, list/ready behavior, Ideas ↔ Ready ↔ On hold, labels preserved');
})().finally(() => fs.rmSync(dir, { recursive: true, force: true })).catch(e => { console.error(e); process.exitCode = 1; });
