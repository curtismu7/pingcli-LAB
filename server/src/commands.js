// The allow-list: the same 14 commands as the AI-DEMO2 /pingcli page (read-only source, re-written here, never imported).
// No free-form command ever runs: a caller sends only a key, the arguments are fixed here, and the binary is started
// without a shell. The --config flag is added at run time by the Real runner and never shown.
//
// Env-scoped resource commands use `pingone api <uri>`: the AI-DEMO2 source records that pingcli 1.2.0's env-scoped
// subcommands (`pingone users list ...`) fail with worker client credentials (observed in AI-DEMO2, UNVERIFIED here).
// As in the source, only the PingOne and config commands get --config; version and agent-skills run without it (noConfig).
export const ENV_PLACEHOLDER = '<environment-id>';
export const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

const api = (title, category, resource, collection, { envScoped = true } = {}) => ({
  title, category, auth: true, runnable: true, collection, mock: 'api',
  uri: (envId) => (envScoped ? `environments/${envId}/${resource}` : resource),
  args: (envId) => ['pingone', 'api', envScoped ? `environments/${envId}/${resource}` : resource, '-O', 'json'],
});

const DEFS = {
  pingone_users_list: api('List users', 'Identity and directory', 'users', 'users'),
  pingone_apps_list: api('List applications', 'Applications and resources', 'applications', 'applications'),
  pingone_groups_list: api('List groups', 'Identity and directory', 'groups', 'groups'),
  pingone_populations_list: api('List populations', 'Identity and directory', 'populations', 'populations'),
  pingone_idps_list: api('List identity providers', 'Authentication and MFA', 'identityProviders', 'identityProviders'),
  pingone_resources_list: api('List resources', 'Applications and resources', 'resources', 'resources'),
  pingone_roles_list: api('List built-in roles', 'Applications and resources', 'roles', 'roles', { envScoped: false }),
  pingone_policies_list: api('List sign-on policies', 'Authentication and MFA', 'signOnPolicies', 'signOnPolicies'),
  pingone_mfa_policies_list: api('List MFA policies', 'Authentication and MFA', 'deviceAuthenticationPolicies', 'deviceAuthenticationPolicies'),
  pingone_envs_list: { title: 'List environments', category: 'Platform and config', auth: true, runnable: true, mock: 'envs', args: () => ['pingone', 'environments', 'list', '-O', 'json'] },
  config_list_keys: { title: 'Config keys', category: 'Platform and config', auth: false, runnable: true, mock: 'keys', args: () => ['config', 'list-keys'] },
  version: { title: 'Version', category: 'Platform and config', auth: false, runnable: true, mock: 'version', noConfig: true, args: () => ['--version'] },
  agent_skills_list: { title: 'List agent skills', category: 'AI agent skills', auth: false, runnable: true, mock: 'skills', noConfig: true, args: () => ['agent-skills', 'list', '-O', 'json'] },
  agent_skills_install: { title: 'Install agent skill', category: 'AI agent skills', auth: false, runnable: true, mock: 'install', noConfig: true, sandboxInstall: true, args: () => ['agent-skills', 'install', 'pingcli-usage'] },
};

// A frozen, prototype-free table, so `__proto__`, `constructor` and friends are never a command.
export const COMMANDS = Object.freeze(Object.assign(Object.create(null), DEFS));
export const COMMAND_KEYS = Object.freeze(Object.keys(DEFS));

// What the caller is told: { command } or { error, status, ... }. Never echoes a key that is not a plain key.
export function lookupCommand(raw, table = COMMANDS) {
  if (raw === undefined || raw === null || raw === '') return { status: 400, error: 'missing_command_key' };
  if (typeof raw !== 'string' || !KEY_RE.test(raw)) return { status: 400, error: 'unknown_command' };
  if (!Object.hasOwn(table, raw)) return { status: 400, error: 'unknown_command', commandKey: raw };
  const cmd = table[raw];
  if (!cmd.runnable) return { status: 400, error: 'copy_only_command', commandKey: raw, command: labelFor(cmd, ENV_PLACEHOLDER) };
  return { key: raw, cmd };
}

// The label is exactly what runs, minus the server-internal --config flag (so Copy works with any configured profile).
export const labelFor = (cmd, envId = ENV_PLACEHOLDER) => `pingcli ${cmd.args(envId).join(' ')}`;

// The setup steps a person needs before this command succeeds: install, init, auth, run.
export function buildPrereqs(cmd, { source = 'mock', envId = ENV_PLACEHOLDER } = {}) {
  const mock = source === 'mock';
  const steps = [{
    title: 'Install PingCLI',
    command: 'brew install pingidentity/tap/pingcli',
    note: mock ? 'Mock: no binary runs; the output below is canned.' : 'This lab runs the pinned pingcli build (the Docker image bakes it; on the host PINGCLI_BIN or pingcli on PATH).',
  }];
  if (!cmd.noConfig) {
    steps.push({
      title: 'Configure credentials',
      command: 'pingcli init',
      note: mock ? 'Interactive setup. Mock simulates a worker client-credentials profile.' : 'Interactive setup. This lab writes a private worker client-credentials config for you (mode 600, removed on switch and exit).',
    });
  }
  if (cmd.auth) {
    steps.push({
      title: 'Authenticate',
      command: 'pingcli pingone auth login',
      note: mock ? 'Mock: simulated token request (no network).' : 'Gets a worker access token, non-interactive with client credentials; run once per Real session.',
    });
  }
  steps.push({ title: 'Run command', command: labelFor(cmd, envId), note: mock ? 'Mock output streams below.' : 'Live invocation: output streams below.' });
  return steps;
}
