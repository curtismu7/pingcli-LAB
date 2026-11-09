import test from 'node:test';
import assert from 'node:assert/strict';
import { VERTICALS } from '../src/cast.js';
import { COMMAND_KEYS } from '../src/commands.js';
import { MOCK_VERSION, mockChunks, mockEnvId, mockOutput, mockUuid } from '../src/mockOutput.js';
import { buildReadableView } from '../src/readable.js';
import { CAPTURE } from '../src/pingcliCapture.js';
import { scanHosts, scanKeys } from '../src/safety.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('every command has deterministic Mock output in every vertical, with only .example hosts and no keys', () => {
  for (const [name, cast] of Object.entries(VERTICALS)) {
    for (const k of COMMAND_KEYS) {
      const a = mockOutput(k, cast); const b = mockOutput(k, cast);
      assert.equal(a.text, b.text, `${name}/${k} deterministic`);
      assert.equal(a.exitCode, 0);
      assert.ok(a.text.length > 0);
      assert.deepEqual(scanHosts(a.text), [], `${name}/${k} hosts`);
      assert.deepEqual(scanKeys(a.text), []);
    }
  }
  assert.throws(() => mockOutput('__proto__', VERTICALS.retail));
});

test('pingone api commands: data._embedded.<collection> envelope that becomes a table; ids are fake UUIDs', () => {
  const cast = VERTICALS.banking;
  for (const [k, coll] of [['pingone_users_list', 'users'], ['pingone_apps_list', 'applications'], ['pingone_groups_list', 'groups'], ['pingone_populations_list', 'populations'], ['pingone_idps_list', 'identityProviders'], ['pingone_resources_list', 'resources'], ['pingone_roles_list', 'roles'], ['pingone_policies_list', 'signOnPolicies'], ['pingone_mfa_policies_list', 'deviceAuthenticationPolicies']]) {
    const j = JSON.parse(mockOutput(k, cast).text);
    assert.equal(j.schemaVersion, '1.1'); assert.equal(j.status, 'success');
    const items = j.data._embedded[coll];
    assert.ok(items.length >= 2, k);
    for (const it of items) assert.match(it.id, UUID, k);
    const view = buildReadableView(mockOutput(k, cast).text);
    assert.equal(view.kind, 'table'); assert.equal(view.rows.length, items.length);
  }
  const users = JSON.parse(mockOutput('pingone_users_list', cast).text).data._embedded.users;
  assert.equal(users[0].name.formatted, 'Ava Lindqvist');
  assert.match(users[0].email, /@fabrikam\.example$/);
  assert.equal(buildReadableView(mockOutput('pingone_users_list', cast).text).rows[0].name, 'Ava Lindqvist');
});

test('environments list is data: [...] with the cast env name; text commands are plain text', () => {
  const cast = VERTICALS.healthcare;
  const j = JSON.parse(mockOutput('pingone_envs_list', cast).text);
  assert.ok(Array.isArray(j.data));
  assert.equal(j.data[0].name, 'Contoso Patient Access');
  assert.equal(j.data[0].id, mockEnvId(cast));
  assert.match(mockOutput('version', cast).text, new RegExp(`^pingcli version ${MOCK_VERSION.replace(/\./g, '\\.')} \\(commit: [0-9a-f]{40}\\)\\n$`));
  assert.equal(MOCK_VERSION, '1.2.0');
  assert.equal(buildReadableView(mockOutput('config_list_keys', cast).text), null);
});

test('agent-skills list/install and config list-keys replay the output captured from pingcli 1.2.0 verbatim', () => {
  const cast = VERTICALS.retail;
  assert.equal(CAPTURE.version, '1.2.0');
  assert.equal(CAPTURE.date, '2026-11-09');
  assert.equal(mockOutput('agent_skills_list', cast).text, CAPTURE.agentSkillsListJson);
  assert.equal(mockOutput('agent_skills_install', cast).text, CAPTURE.agentSkillsInstallText);
  assert.equal(mockOutput('config_list_keys', cast).text, CAPTURE.configListKeysText);
  const list = JSON.parse(CAPTURE.agentSkillsListJson);
  assert.equal(list.schemaVersion, '1.1');
  assert.equal(list.data, null);
  assert.match(list.message, /^pingcli-usage - /);
  assert.equal(buildReadableView(CAPTURE.agentSkillsListJson).kind, 'form');
  assert.match(CAPTURE.agentSkillsInstallText, /installed to '<sandbox>\/pingcli-usage'/);
  assert.doesNotMatch(CAPTURE.agentSkillsInstallText, /\/tmp\//, 'the capture machine\'s path is not shipped');
  assert.match(CAPTURE.configListKeysText, /^Valid Keys:\n- auth\.storage\.type\n/);
  assert.match(CAPTURE.configListKeysText, /- service\.pingOne\.endpoint\.rootDomain\n/);
  assert.doesNotMatch(CAPTURE.configListKeysText, /accessTokenAuth/, '1.2.0 list, not the 1.1.0 one');
});

test('verticals differ; mock UUIDs are stable and v4-shaped; chunks rejoin exactly', () => {
  assert.notEqual(mockOutput('pingone_users_list', VERTICALS.retail).text, mockOutput('pingone_users_list', VERTICALS.banking).text);
  assert.equal(mockUuid('a', 1), mockUuid('a', 1));
  assert.match(mockUuid('x'), UUID);
  const text = mockOutput('pingone_users_list', VERTICALS.retail).text;
  const chunks = mockChunks(text);
  assert.ok(chunks.length > 1 && chunks.length <= 4);
  assert.equal(chunks.join(''), text);
  assert.deepEqual(mockChunks('short\n'), ['short\n']);
});
