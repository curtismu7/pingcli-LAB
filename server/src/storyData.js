// The story as data. {{cast}} tokens are filled per vertical (cast.js); a test fails on any token a vertical does not define.
// Every product claim carries a status: `observed-in-AI-DEMO2` (named source file; still UNVERIFIED in this lab),
// `captured` (output of the real pingcli 1.2.0 binary, no tenant, dated), `UNVERIFIED`, or `lab` (a property of this
// lab's own code, pinned by its tests).
export const TITLE = 'PingCLI Lab';
export const INTRO = '{{castAdmin}}, the identity admin at {{castOrg}}, automates the {{castEnvName}} PingOne environment from a terminal with Ping CLI: install, configure, authenticate once, then read users, apps, groups and policies as JSON that a script (or an AI coding agent) can use.';

// Simulation honesty banner (rule 2), defined here so every page and presenter mode show the same words.
export const BANNER = {
  mock: 'MOCK: no pingcli binary runs and nothing leaves this machine. Every output is canned, shaped like pingcli 1.2.0 output, with made-up ids and .example hosts for {{castOrg}}. The token request is simulated.',
  real: 'REAL: the pingcli binary this lab is configured with runs against YOUR PingOne environment with worker client credentials from your settings (the Docker image bakes the pinned 1.2.0; on the host it is PINGCLI_BIN or pingcli on PATH, and the page flags a version that is not 1.2.0). Only the 14 read-only commands below can run. The client secret is write-only: never shown, logged or returned.',
};

export const FACTS = [
  { id: 'pingone-api-path', status: 'observed-in-AI-DEMO2', source: 'AI-DEMO2 demo_api_server/routes/pingcli.js',
    text: 'pingcli 1.2.0 env-scoped subcommands (pingone users list ...) fail with worker client credentials, so the lab uses `pingone api <uri>`, which returns the management-API JSON under data._embedded. Observed in AI-DEMO2; UNVERIFIED in this lab.' },
  { id: 'auth-login', status: 'observed-in-AI-DEMO2', source: 'AI-DEMO2 demo_api_server/routes/pingcli.js',
    text: '`pingcli pingone auth login` with a client-credentials profile is non-interactive and stores a token under $HOME/.pingcli, so later commands succeed. Observed in AI-DEMO2; UNVERIFIED in this lab.' },
  { id: 'env-vars-win', status: 'observed-in-AI-DEMO2', source: 'AI-DEMO2 demo_api_server/routes/pingcli.js',
    text: 'PingOne environment variables take priority over the config file and conflict with it, so the lab strips them from the child environment. Observed in AI-DEMO2; UNVERIFIED in this lab.' },
  { id: 'output-shapes', status: 'UNVERIFIED',
    text: 'Mock output for the tenant commands (pingone api, environments list) follows the envelope the AI-DEMO2 page parses ({schemaVersion, status, message, data}); field-level detail (which attributes each resource has) is illustrative until the owner\'s Real run.' },
  { id: 'agent-skills', status: 'captured', source: 'pingcli 1.2.0, 2026-11-09',
    text: '`agent-skills list -O json` returns a 1.1 envelope whose message names each skill (data is null); `agent-skills install pingcli-usage` writes a SKILL.md and references into the output directory. Mock replays the captured output.' },
  { id: 'config-keys', status: 'captured', source: 'pingcli 1.2.0, 2026-11-09',
    text: '`config list-keys` prints the valid configuration keys as plain text. Mock replays the captured list.' },
  { id: 'no-shell', status: 'lab', text: 'The lab starts pingcli without a shell, with arguments fixed server-side; a caller can only pick one of 14 keys.' },
  { id: 'secret-write-only', status: 'lab', text: 'The client secret goes only into a private config file (mode 600); every byte of output is scrubbed of it and of the client id before it is sent.' },
];

// Scenarios: one command each, in the order a presenter walks them. `expect` is checked by the doctor against the Mock output.
export const SCENARIOS = [
  { id: 'check-the-tool', title: 'Check the tool', commandKey: 'version', expect: { view: 'text' },
    say: 'Before {{castAdmin}} automates anything, they check which Ping CLI build is installed: the version pins what the commands and output shapes look like.',
    lesson: 'A pinned CLI version is part of the automation contract.' },
  { id: 'what-can-be-configured', title: 'What can be configured', commandKey: 'config_list_keys', expect: { view: 'text' },
    say: 'Every setting pingcli reads has a key. The worker client id, secret, environment id and root domain are the four that matter for {{castEnvName}}.',
    lesson: 'Configuration is data: a profile, not a pile of flags.' },
  { id: 'where-am-i', title: 'Where am I', commandKey: 'pingone_envs_list', expect: { view: 'table', minRows: 2 },
    say: 'With a token, {{castAdmin}} lists the environments the worker can see, and finds {{castEnvName}} and its sandbox.',
    lesson: 'Authenticate once, then every command reuses the token.' },
  { id: 'who-is-in-the-directory', title: 'Who is in the directory', commandKey: 'pingone_users_list', expect: { view: 'table', minRows: 5 },
    say: 'The users of {{castOrg}} come back as JSON a script can filter: name, username, email, enabled.',
    lesson: 'pingone api returns the same JSON as the management API, under data._embedded.' },
  { id: 'what-apps-exist', title: 'What apps exist', commandKey: 'pingone_apps_list', expect: { view: 'table', minRows: 4 },
    say: 'The applications registered for {{castOrg}}: web, mobile, single-page and the worker this lab itself uses.',
    lesson: 'An inventory you can diff in CI beats a screenshot of the console.' },
  { id: 'how-people-sign-in', title: 'How people sign in', commandKey: 'pingone_policies_list', expect: { view: 'table', minRows: 2 },
    say: 'Sign-on policies decide how {{castOrg}} users authenticate; the default is the one most people hit.',
    lesson: 'Read policy before you change it.' },
  { id: 'who-can-do-what', title: 'Who can do what', commandKey: 'pingone_roles_list', expect: { view: 'table', minRows: 3 },
    say: 'The built-in roles are not environment-scoped, so this is the one command whose URI has no environment id.',
    lesson: 'Least privilege starts with knowing the roles.' },
  { id: 'hand-it-to-an-agent', title: 'Hand it to an agent', commandKey: 'agent_skills_list', expect: { view: 'form' },
    say: 'Ping CLI ships agent skills: instructions a coding agent can load so it drives pingcli for {{castAdmin}} correctly.',
    lesson: 'The same allow-listed commands work for a person and for an agent.' },
];

export const TALK_TRACK = [
  { title: 'Open', say: 'This is {{castOrg}}. {{castAdmin}} wants to stop clicking through the console and script the {{castEnvName}} environment. Ping CLI is the tool. The banner says whether we are in Mock or Real.' },
  { title: 'Install, configure, authenticate', say: 'Each command shows the steps it needs: install, pingcli init for a worker profile, pingone auth login once. The lab writes the profile for you, privately, and never shows the secret.' },
  { title: 'Read the directory', say: 'Run List users. The raw JSON streams in, then the easy-read table picks the useful columns. The same JSON is what a script would parse.' },
  { title: 'Follow the hops', say: 'Open the hops: browser to lab, lab to pingcli, pingcli to the PingOne token endpoint once, then to the management API. In Mock those last two are simulated and say so.' },
  { title: 'Hand it to an agent', say: 'Agent skills turn the CLI into something a coding agent can use safely: install one into a throwaway folder and look at what it would get.' },
  { title: 'Close', say: 'Fourteen allow-listed, read-only commands; no shell, no free-form input, the secret write-only. Switch to Real to run the same thing against your own environment.' },
];
