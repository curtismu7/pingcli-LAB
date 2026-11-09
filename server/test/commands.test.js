import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, COMMAND_KEYS, ENV_PLACEHOLDER, buildPrereqs, labelFor, lookupCommand } from '../src/commands.js';

const EXPECTED = ['pingone_users_list', 'pingone_apps_list', 'pingone_groups_list', 'pingone_populations_list', 'pingone_idps_list', 'pingone_resources_list', 'pingone_roles_list', 'pingone_policies_list', 'pingone_mfa_policies_list', 'pingone_envs_list', 'config_list_keys', 'version', 'agent_skills_list', 'agent_skills_install'];

test('the allow-list is exactly the 14 AI-DEMO2 commands, frozen and prototype-free', () => {
  assert.deepEqual([...COMMAND_KEYS], EXPECTED);
  assert.equal(Object.getPrototypeOf(COMMANDS), null);
  assert.ok(Object.isFrozen(COMMANDS));
});

test('labels are exactly what runs (minus --config), env-scoped ones use pingone api', () => {
  const env = '11111111-2222-4333-8444-555555555555';
  assert.equal(labelFor(COMMANDS.pingone_users_list, env), `pingcli pingone api environments/${env}/users -O json`);
  assert.equal(labelFor(COMMANDS.pingone_roles_list, env), 'pingcli pingone api roles -O json');
  assert.equal(labelFor(COMMANDS.pingone_mfa_policies_list), `pingcli pingone api environments/${ENV_PLACEHOLDER}/deviceAuthenticationPolicies -O json`);
  assert.equal(labelFor(COMMANDS.pingone_envs_list), 'pingcli pingone environments list -O json');
  assert.equal(labelFor(COMMANDS.config_list_keys), 'pingcli config list-keys');
  assert.equal(labelFor(COMMANDS.version), 'pingcli --version');
  assert.equal(labelFor(COMMANDS.agent_skills_list), 'pingcli agent-skills list -O json');
  assert.equal(labelFor(COMMANDS.agent_skills_install), 'pingcli agent-skills install pingcli-usage');
  for (const k of EXPECTED) {
    const args = COMMANDS[k].args(env);
    assert.ok(!args.includes('--config'), k);
    for (const a of args) assert.match(a, /^[A-Za-z0-9._/-]+$/, `${k}: no shell metacharacters in ${a}`);
  }
  assert.ok(COMMANDS.agent_skills_install.sandboxInstall);
});

test('lookup: missing, unknown, hostile and copy-only keys are 400; a hostile key is never echoed', () => {
  assert.deepEqual(lookupCommand(undefined), { status: 400, error: 'missing_command_key' });
  assert.deepEqual(lookupCommand(''), { status: 400, error: 'missing_command_key' });
  assert.deepEqual(lookupCommand('not_a_real_key'), { status: 400, error: 'unknown_command', commandKey: 'not_a_real_key' });
  for (const bad of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'x'.repeat(5000), 'version; rm -rf /', '$(id)', 'versión', 'v‮ersion', 'VERSION', ['version'], { a: 1 }, 42, true]) {
    const r = lookupCommand(bad);
    assert.equal(r.status, 400, String(bad).slice(0, 30));
    assert.ok(!r.cmd);
    if (typeof bad !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(bad)) assert.equal(r.commandKey, undefined, 'not echoed');
  }
  const table = Object.assign(Object.create(null), { copy_me: { ...COMMANDS.version, runnable: false } });
  assert.deepEqual(lookupCommand('copy_me', table), { status: 400, error: 'copy_only_command', commandKey: 'copy_me', command: 'pingcli --version' });
  assert.equal(lookupCommand('version').key, 'version');
});

test('prereqs teach install -> init -> auth -> run, and say Mock or Real', () => {
  const titles = (k, o) => buildPrereqs(COMMANDS[k], o).map((s) => s.title);
  assert.deepEqual(titles('pingone_users_list'), ['Install PingCLI', 'Configure credentials', 'Authenticate', 'Run command']);
  assert.deepEqual(titles('config_list_keys'), ['Install PingCLI', 'Configure credentials', 'Run command']);
  assert.deepEqual(titles('version'), ['Install PingCLI', 'Run command']);
  assert.match(buildPrereqs(COMMANDS.pingone_users_list, { source: 'mock' })[0].note, /Mock/);
  assert.doesNotMatch(buildPrereqs(COMMANDS.pingone_users_list, { source: 'real' })[0].note, /Mock/);
  assert.equal(buildPrereqs(COMMANDS.pingone_users_list, { envId: 'e' }).at(-1).command, 'pingcli pingone api environments/e/users -O json');
});
