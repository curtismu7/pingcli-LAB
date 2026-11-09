// Mock: canned pingcli output for every allow-listed command, flavoured by the cast. No binary, no network, no tenant.
// `agent-skills list`, `agent-skills install` and `config list-keys` replay output CAPTURED from the real pingcli 1.2.0
// binary (pingcliCapture.js, 2026-11-09, no tenant). The tenant commands cannot be captured without a tenant: `pingone api`
// prints the management-API response under data._embedded.<collection> and `environments list` prints data: [...], as the
// AI-DEMO2 page and its tests parse them; those shapes and their field-level detail are UNVERIFIED until the owner's Real run.
// Every id is a made-up UUID derived from the cast; every host ends in .example.
import { createHash } from 'node:crypto';
import { COMMANDS } from './commands.js';
import { CAPTURE } from './pingcliCapture.js';

export const MOCK_VERSION = '1.2.0';
export const MOCK_API_HOST = 'api.pingone.example';
export const MOCK_AUTH_HOST = 'auth.pingone.example';
const AT = '2026-10-01T09:00:00.000Z';

// A stable fake UUID (v4 layout) from any seed text.
export function mockUuid(...parts) {
  const h = createHash('sha256').update(`pingcli-lab-mock:${parts.join(':')}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const mockEnvId = (cast) => mockUuid('env', cast.castHost);
const href = (p) => ({ href: `https://${MOCK_API_HOST}/v1/${p}` });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

function collection(cast, name) {
  const env = mockEnvId(cast);
  const s = cast.seed;
  const base = (kind, i) => ({ id: mockUuid(kind, cast.castHost, i), environment: { id: env } });
  const self = (kind, id) => ({ _links: { self: href(`environments/${env}/${kind}/${id}`) } });
  const popId = (i) => mockUuid('populations', cast.castHost, i);
  switch (name) {
    case 'users': return s.users.map(([given, family], i) => {
      const b = base('users', i);
      return { ...self('users', b.id), ...b, account: { canAuthenticate: true, status: 'OK' }, createdAt: AT, email: `${slug(given)}.${slug(family)}@${cast.castHost}.example`, enabled: i !== 3, identityProvider: { type: 'PINGONE' }, lifecycle: { status: 'ACCOUNT_OK' }, mfaEnabled: i % 2 === 0, name: { formatted: `${given} ${family}`, given, family }, population: { id: popId(0) }, updatedAt: AT, username: `${slug(given)}.${slug(family)}`, verifyStatus: 'NOT_INITIATED' };
    });
    case 'applications': return s.apps.map(([appName, type], i) => {
      const b = base('applications', i);
      return { ...self('applications', b.id), ...b, name: appName, description: `${cast.castOrg}: ${appName}`, enabled: true, type, protocol: 'OPENID_CONNECT', createdAt: AT, updatedAt: AT };
    });
    case 'groups': return s.groups.map(([groupName, description], i) => {
      const b = base('groups', i);
      return { ...self('groups', b.id), ...b, name: groupName, description, directMemberCounts: { users: 3 + i * 4 }, createdAt: AT, updatedAt: AT };
    });
    case 'populations': return s.populations.map(([popName, description], i) => {
      const b = base('populations', i);
      return { ...self('populations', b.id), ...b, id: popId(i), name: popName, description, default: i === 0, userCount: i === 0 ? s.users.length : 2, createdAt: AT, updatedAt: AT };
    });
    case 'identityProviders': return [['Social sign-in (mock)', 'FACEBOOK', false], [`${cast.castOrg} workforce OIDC`, 'OPENID_CONNECT', true], [`${cast.castOrg} partner SAML`, 'SAML', true]].map(([idpName, type, enabled], i) => {
      const b = base('identityProviders', i);
      return { ...self('identityProviders', b.id), ...b, name: idpName, type, enabled, createdAt: AT, updatedAt: AT };
    });
    case 'resources': return [['openid', 'OPENID_CONNECT', 'openid'], ['PingOne API', 'PINGONE_API', `https://${MOCK_API_HOST}`], [`${cast.castOrg} API`, 'CUSTOM', `https://api.${cast.castHost}.example`]].map(([resName, type, audience], i) => {
      const b = base('resources', i);
      return { ...self('resources', b.id), ...b, name: resName, type, audience, accessTokenValiditySeconds: 3600, createdAt: AT, updatedAt: AT };
    });
    case 'roles': return ['Organization Admin', 'Environment Admin', 'Identity Data Admin', 'Client Application Developer', 'Identity Data Read Only', 'Configuration Read Only'].map((roleName, i) => {
      const id = mockUuid('roles', i);
      return { _links: { self: href(`roles/${id}`) }, id, name: roleName, description: `Built-in role: ${roleName}`, applicableTo: [i === 0 ? 'ORGANIZATION' : 'ENVIRONMENT'] };
    });
    case 'signOnPolicies': return [['Single_Factor', true, 'Username and password'], ['multi_factor', false, `${cast.castOrg} step-up with MFA`]].map(([polName, isDefault, description], i) => {
      const b = base('signOnPolicies', i);
      return { ...self('signOnPolicies', b.id), ...b, name: polName, default: isDefault, description, createdAt: AT, updatedAt: AT };
    });
    case 'deviceAuthenticationPolicies': return [['Default MFA Policy', true], [`${cast.castOrg} high assurance`, false]].map(([polName, isDefault], i) => {
      const b = base('deviceAuthenticationPolicies', i);
      return { ...self('deviceAuthenticationPolicies', b.id), ...b, name: polName, default: isDefault, sms: { enabled: !isDefault }, email: { enabled: true }, mobile: { enabled: true }, totp: { enabled: true }, fido2: { enabled: !isDefault }, createdAt: AT, updatedAt: AT };
    });
    default: return [];
  }
}

const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

// The whole stdout of one command for this cast, plus its exit code. Pure and deterministic.
export function mockOutput(key, cast) {
  const cmd = COMMANDS[key];
  if (!cmd) throw new Error('not an allow-listed command');
  const env = mockEnvId(cast);
  switch (cmd.mock) {
    case 'api': {
      const items = collection(cast, cmd.collection);
      const uri = cmd.uri(env);
      return { exitCode: 0, text: json({ schemaVersion: '1.1', status: 'success', message: 'Custom request successful', data: { _links: { self: href(uri) }, _embedded: { [cmd.collection]: items }, count: items.length, size: items.length } }) };
    }
    case 'envs': return {
      exitCode: 0,
      text: json({ schemaVersion: '1.0', status: 'success', message: 'Read all successful', data: [
        { _links: { self: href(`environments/${env}`) }, id: env, name: cast.castEnvName, description: `${cast.castOrg} production identities (MOCK)`, region: 'NA', type: 'PRODUCTION', license: { id: mockUuid('license', cast.castHost) }, createdAt: AT, updatedAt: AT },
        { _links: { self: href(`environments/${mockUuid('env-sandbox', cast.castHost)}`) }, id: mockUuid('env-sandbox', cast.castHost), name: `${cast.castEnvName} Sandbox`, description: 'Where the admin tries changes first (MOCK)', region: 'NA', type: 'SANDBOX', license: { id: mockUuid('license', cast.castHost) }, createdAt: AT, updatedAt: AT },
      ] }),
    };
    case 'keys': return { exitCode: 0, text: CAPTURE.configListKeysText };
    case 'version': return { exitCode: 0, text: `pingcli version ${MOCK_VERSION} (commit: ${createHash('sha1').update('pingcli-lab-mock').digest('hex')})\n` };
    case 'skills': return { exitCode: 0, text: CAPTURE.agentSkillsListJson };
    case 'install': return { exitCode: 0, text: CAPTURE.agentSkillsInstallText };
    default: throw new Error('no mock for this command');
  }
}

// The mock output cut into a few chunks, so the stream looks like a real run (the delay is added by the caller).
export function mockChunks(text, max = 4) {
  if (text.length < 120) return [text];
  const lines = text.split(/(?<=\n)/);
  const per = Math.ceil(lines.length / max);
  const out = [];
  for (let i = 0; i < lines.length; i += per) out.push(lines.slice(i, i + per).join(''));
  return out;
}
