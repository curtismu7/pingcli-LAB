// Builds content-pack.json for the Learning Hub from the story data, so the pack cannot drift from the lab.
//   node scripts/build-content-pack.mjs        (writes content-pack.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CAST } from '../server/src/cast.js';
import { buildStory } from '../server/src/story.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
// Family-plan catalog id, assigned by the owner 2026-11-09.
export const CATALOG = 'D126';

export function buildPack() {
  const story = buildStory(DEFAULT_CAST);
  const sid = (n) => `S${String(n).padStart(2, '0')}`;
  const terms = { 'check-the-tool': ['pinned-cli'], 'what-can-be-configured': ['worker-profile'], 'where-am-i': ['worker-profile'], 'who-is-in-the-directory': ['pingone-api'], 'what-apps-exist': ['pingone-api'], 'how-people-sign-in': ['pingone-api'], 'who-can-do-what': ['pingone-api'], 'hand-it-to-an-agent': ['agent-skills'] };
  return {
    schema: 'demo-content-pack/1',
    id: 'pingcli-lab',
    title: 'PingCLI Lab',
    version,
    demo: { id: 'pingcli-lab', name: 'PingCLI Lab', catalog: CATALOG, baseUrl: 'http://localhost:7806', doctor: '/api/health', tags: ['pingcli', 'pingone', 'automation', 'cli', 'management-api', 'agent-skills', 'simulated'] },
    glossary: [
      { id: 'pinned-cli', term: 'Pinned CLI version', definition: 'The lab runs one pingcli version (1.2.0). Commands and output shapes change between versions, so automation pins the version it was written against.', aliases: ['pingcli version'] },
      { id: 'worker-profile', term: 'Worker client-credentials profile', definition: 'A pingcli configuration profile that authenticates as a PingOne worker application with a client id and secret. pingcli pingone auth login turns it into a stored access token.', aliases: ['pingcli init', 'client credentials'] },
      { id: 'pingone-api', term: 'pingcli pingone api', definition: 'A cURL-like command that calls the PingOne management API with the profile\'s token and prints the JSON response, with lists under data._embedded.', aliases: ['management API'] },
      { id: 'agent-skills', term: 'Agent skills', definition: 'Instruction packs a coding agent can install so it uses Ping CLI correctly. The lab installs one only into a throwaway folder.', aliases: ['agent-skills install'] },
    ],
    sources: [
      { id: 'pingcli-repo', title: 'pingidentity/pingcli on GitHub (releases and checksums)', url: 'https://github.com/pingidentity/pingcli', kind: 'vendor', use: 'Where the pinned 1.2.0 binary and its sha256 checksums come from.', status: 'read', checked: '2026-11-09' },
      { id: 'trace-context', title: 'W3C Trace Context', url: 'https://www.w3.org/TR/trace-context/', kind: 'standard', use: 'The traceparent header shown on every hop.', status: 'not-read', checked: '2026-11-09' },
    ],
    cards: [
      ...story.scenarios.map((sc, i) => ({ id: `try-${sc.id}`, label: `Scenario ${i + 1}: ${sc.title}`, description: sc.lesson, group: 'try-it', action: { type: 'route', href: `/#scenario-${sc.id}` }, terms: terms[sc.id], story: sid(i + 1) })),
      { id: 'concept-hops', label: 'Follow the hops', description: 'Browser to lab, lab to pingcli, pingcli to the PingOne token endpoint once, then to the management API, with a traceparent on each hop.', group: 'concept', action: { type: 'route', href: '/#diagram' }, terms: ['worker-profile', 'pingone-api'] },
      { id: 'ref-doctor', label: 'Doctor and health', description: 'Preflight checks and the demo-health/1 endpoint.', group: 'setup', action: { type: 'route', href: '/api/health' } },
    ],
    stories: story.scenarios.map((sc, i) => ({ id: sid(i + 1), title: sc.title, say: sc.say })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(ROOT, 'content-pack.json'), `${JSON.stringify(buildPack(), null, 2)}\n`);
}
