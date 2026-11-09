import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CAST_TOKENS, DEFAULT_CAST, VERTICALS, fill, loadCast, unfilled } from '../src/cast.js';
import { buildStory, rawStory, renderTalkTrackMarkdown } from '../src/story.js';
import { COMMANDS } from '../src/commands.js';
import { BANNER, FACTS, SCENARIOS } from '../src/storyData.js';
import { rawDiagram } from '../src/diagramData.js';

test('every {{token}} in the story and the diagram is defined in every vertical pack; three verticals', () => {
  assert.deepEqual(Object.keys(VERTICALS), ['banking', 'healthcare', 'retail']);
  const text = JSON.stringify([rawStory(), rawDiagram('pingcli-flow')]);
  assert.ok(/\{\{cast/.test(text));
  for (const [name, cast] of Object.entries(VERTICALS)) {
    assert.deepEqual(unfilled(text, cast), [], name);
    for (const t of CAST_TOKENS) assert.equal(typeof cast[t], 'string', `${name}.${t}`);
  }
  assert.ok(!JSON.stringify(buildStory(DEFAULT_CAST)).includes('{{'));
});

test('an undefined token is caught', () => {
  assert.deepEqual(unfilled('Hello {{castOrg}} and {{castNope}}', DEFAULT_CAST), ['castNope']);
  assert.deepEqual(unfilled('{{seed}}', DEFAULT_CAST), ['seed'], 'only string cast tokens fill');
  assert.equal(fill('{{castNope}}', DEFAULT_CAST), '{{castNope}}');
});

test('docs/talk-track.md is exactly what the data generates (no drift)', () => {
  const doc = fs.readFileSync(new URL('../../docs/talk-track.md', import.meta.url), 'utf8');
  assert.equal(doc, renderTalkTrackMarkdown(DEFAULT_CAST));
});

test('scenarios name allow-listed commands; facts carry a status, and observed ones name their AI-DEMO2 source', () => {
  assert.ok(SCENARIOS.length >= 5);
  for (const sc of SCENARIOS) assert.ok(Object.hasOwn(COMMANDS, sc.commandKey), sc.id);
  const ok = new Set(['observed-in-AI-DEMO2', 'captured', 'UNVERIFIED', 'lab']);
  for (const f of FACTS) {
    assert.ok(ok.has(f.status), f.id);
    if (f.status === 'observed-in-AI-DEMO2') { assert.match(f.source, /^AI-DEMO2 [\w/.-]+$/); assert.match(f.text, /UNVERIFIED in this lab/); }
    if (f.status === 'captured') assert.equal(f.source, 'pingcli 1.2.0, 2026-11-09');
  }
  assert.match(FACTS.find((f) => f.id === 'pingone-api-path').text, /pingcli 1\.2\.0 env-scoped subcommands .* fail with worker client credentials/);
});

test('the honesty banner is defined server-side for both modes and says what is simulated', () => {
  assert.match(BANNER.mock, /^MOCK: no pingcli binary runs and nothing leaves this machine/);
  assert.match(BANNER.real, /^REAL: /);
  assert.match(BANNER.real, /write-only/);
});

test('customer.config can only set org, admin, envName and host, as short plain text with no URL or markup', () => {
  const file = new URL('../../.tmp-cast.json', import.meta.url).pathname;
  fs.writeFileSync(file, JSON.stringify({ cast: { org: 'Acme https://evil.example/x', admin: 'Pat Lee', envName: 'a@b.c', host: 'Bad Host!', seed: { users: [] }, other: 'x' } }));
  try {
    const cast = loadCast(file, 'banking');
    assert.equal(cast.castOrg, VERTICALS.banking.castOrg, 'an org with a URL is ignored');
    assert.equal(cast.castAdmin, 'Pat Lee');
    assert.equal(cast.castEnvName, VERTICALS.banking.castEnvName);
    assert.equal(cast.castHost, VERTICALS.banking.castHost);
    assert.equal(cast.seed, VERTICALS.banking.seed, 'the seed is never taken from the file');
  } finally { fs.rmSync(file, { force: true }); }
});

test('the tenant-command shapes stay UNVERIFIED until the owner runs Real', () => {
  assert.equal(FACTS.find((f) => f.id === 'output-shapes').status, 'UNVERIFIED');
});
