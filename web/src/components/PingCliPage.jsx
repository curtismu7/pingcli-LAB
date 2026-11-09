// The PingCLI page, ported from AI-DEMO2's PingCliPage (read-only source, never imported) onto the Ping UI standard.
// Same story: install -> configure + authenticate -> how to run, then command cards by category with Copy and Run, the
// streamed result (run status, a one-line install -> configure -> auth -> command chain, Easy read vs JSON), shown
// directly under the category of the card that was run.
// Differences: no admin sign-in (this lab has none; the Real how-to takes its place), colours from tokens only, every
// piece of command output is React text passed through visible() (control, bidi and ANSI escape characters shown as
// visible escapes), and output is bounded on the client too.
import { useCallback, useEffect, useRef, useState } from "react";
import { buildReadableView, tokenizeJson } from "../../../server/src/readable.js";
import { visible } from "../safeText";
import { getJson } from "../api";
import { workspaceFetch } from "../workspace";
import ErrorBoundary from "./ErrorBoundary";

// Client-side cap on how long a streamed run may take before it is aborted (as in the source page).
export const RUN_TIMEOUT_MS = 30000;
// The server caps output at 1 MiB; the page caps what it keeps too, so a misbehaving stream cannot grow without bound.
export const MAX_OUTPUT_CHARS = 2_000_000;
// The easy-read table shows at most this many rows (the JSON view still has them all).
export const MAX_TABLE_ROWS = 500;

const SECTION_OPEN_KEY = "pingcli-lab.sectionOpen";
function readSectionOpenMap() {
  try { const parsed = JSON.parse(localStorage.getItem(SECTION_OPEN_KEY) || "{}"); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
}
function writeSectionOpen(id, open) {
  try { localStorage.setItem(SECTION_OPEN_KEY, JSON.stringify({ ...readSectionOpenMap(), [id]: open })); } catch { /* private mode: still toggles in memory */ }
}

function copyToClipboard(text) {
  try { navigator.clipboard?.writeText(text).catch(() => {}); } catch { /* no clipboard */ }
}

// Collapsible section whose open state is remembered across reloads. forceOpen true/false wins while it is set.
// defaultOpen applies until the person opens or closes the section themselves (a remembered choice always wins), and it
// may change after mount (Install collapses once /api/version says pingcli is there). badge: shown in the header.
// openSection(id) opens a section from anywhere (the result chain's links) and scrolls it into view.
const OPEN_EVENT = "pingcli-lab:open-section";
export const openSection = (id) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
export const scrollBehavior = () => { try { return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; } catch { return "auto"; } };

export function CollapsibleSection({ id, title, defaultOpen = true, children, forceOpen = null, level = 2, badge = null }) {
  const [open, setOpen] = useState(() => {
    const saved = readSectionOpenMap()[id];
    return typeof saved === "boolean" ? saved : defaultOpen;
  });
  const ref = useRef(null);
  useEffect(() => {
    if (typeof readSectionOpenMap()[id] !== "boolean") setOpen(defaultOpen);
  }, [id, defaultOpen]);
  useEffect(() => {
    const on = (e) => {
      if (e.detail !== id) return;
      setOpen(true); writeSectionOpen(id, true);
      setTimeout(() => ref.current?.scrollIntoView?.({ behavior: scrollBehavior(), block: "start" }), 0);
    };
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, [id]);
  const toggle = () => setOpen((prev) => { const next = !prev; writeSectionOpen(id, next); return next; });
  const shown = forceOpen === null ? open : Boolean(forceOpen);
  const H = level === 3 ? "h3" : "h2";
  return (
    <section ref={ref} id={`section-${id}`} className={`collapse${shown ? " is-open" : ""}`} data-testid={`section-${id}`}>
      <H className="collapse__heading">
        <button type="button" className="collapse__toggle" aria-expanded={shown} aria-controls={`section-body-${id}`} onClick={toggle}>
          <span aria-hidden="true">{shown ? "▾" : "▸"}</span> {title}
        </button>
        {badge && <span className="collapse__badge">{badge}</span>}
      </H>
      {shown && <div id={`section-body-${id}`} className="collapse__body">{children}</div>}
    </section>
  );
}

function CodeCopyRow({ text, copyId, copied, onCopy }) {
  return (
    <div className="code-row">
      <code>{text}</code>
      <button type="button" onClick={() => onCopy(text, copyId)} data-testid={`copy-${copyId}`}>{copied === copyId ? "Copied!" : "Copy"}</button>
    </div>
  );
}

function useCopied() {
  const [copied, setCopied] = useState(null);
  const copy = useCallback((text, id) => { copyToClipboard(text); setCopied(id); setTimeout(() => setCopied(null), 1500); }, []);
  return [copied, copy];
}

// Real is not configured: what the owner sets up (replaces the source page's admin sign-in prompt).
export function RealHowTo({ info }) {
  if (!info || info.realAvailable) return null;
  return (
    <div className="card card--neutral howto" data-testid="real-howto">
      <h3>Real mode is not configured</h3>
      <p><span className="chip chip--info"><span className="dot" aria-hidden="true" />Mock</span> {info.realHowTo || "Real is not configured. Mock keeps working."}</p>
      <ol>
        <li>Put <code>PINGONE_ENVIRONMENT_ID</code>, <code>PINGONE_REGION</code>, <code>PINGONE_CLIENT_ID</code> and <code>PINGONE_CLIENT_SECRET</code> (a worker app with read roles) in <code>~/Development/.env</code>.</li>
        <li>Host: point <code>PINGCLI_BIN</code> at pingcli 1.2.0, or put it on PATH. Docker: <code>npm run docker:up</code> passes the four settings through (the image bakes pingcli 1.2.0).</li>
        <li>Restart the lab, then press Real in the header. The secret is write-only: never shown, logged or returned.</li>
      </ol>
    </div>
  );
}

// The header chip for Install: what /api/version said (Mock: the labelled mock version), and a mismatch warning in Real.
export function installBadge(version) {
  if (!version?.version) return null;
  return (
    <>
      <span className="chip chip--ok" data-testid="pingcli-version"><span className="dot" aria-hidden="true" />✓ pingcli {version.version}{version.source === "mock" ? " (MOCK)" : " installed"}</span>
      {version.matchesPinned === false && <> <span className="chip chip--warn" data-testid="version-mismatch"><span className="dot" aria-hidden="true" />not the pinned {version.pinned}: output shapes may differ</span></>}
    </>
  );
}

function InstallSection({ envId, version }) {
  const [copied, copy] = useCopied();
  // Installed (a version answered) = start collapsed; no version known = start open. A remembered choice wins.
  const installed = Boolean(version?.version);
  const usersCmd = `pingcli pingone api environments/${envId || "<environment-id>"}/users -O json`;
  return (
    <>
      <CollapsibleSection id="install" title="1. Install PingCLI" defaultOpen={!installed} badge={installBadge(version)}>
        <p>PingCLI is the official command-line tool for PingOne and related Ping Identity services. On a Mac, install it with Homebrew:</p>
        <p className="step-label">Trust the Ping Identity tap</p>
        <CodeCopyRow text="brew trust pingidentity/tap" copyId="trust" copied={copied} onCopy={copy} />
        <p className="step-label">Install PingCLI</p>
        <CodeCopyRow text="brew install pingidentity/tap/pingcli" copyId="brew" copied={copied} onCopy={copy} />
        <p className="step-label">Verify the install</p>
        <CodeCopyRow text="pingcli --version" copyId="verify" copied={copied} onCopy={copy} />
        <p className="step-label">Already installed? Upgrade</p>
        <CodeCopyRow text="brew upgrade pingidentity/tap/pingcli" copyId="upgrade" copied={copied} onCopy={copy} />
      </CollapsibleSection>
      <CollapsibleSection id="configure" title="2. Configure and authenticate">
        <p>Before any PingOne command works you need a profile with credentials and a worker token. In Real this lab writes a private profile and logs in for you on the first run; on your machine you run these yourself.</p>
        <p className="step-label">Initialize a profile (worker client credentials + environment)</p>
        <CodeCopyRow text="pingcli init" copyId="init" copied={copied} onCopy={copy} />
        <p className="hint">Interactive wizard: environment ID, worker client ID and secret, grant type client credentials, storage file system (works headless).</p>
        <p className="step-label">Authenticate (get an access token)</p>
        <CodeCopyRow text="pingcli pingone auth login" copyId="auth" copied={copied} onCopy={copy} />
        <p className="hint">Non-interactive with client credentials. Stores a token under <code>~/.pingcli/credentials</code>; log in again when it expires.</p>
        <p className="step-label">Optional: list the keys a profile can set</p>
        <CodeCopyRow text="pingcli config list-keys" copyId="keys" copied={copied} onCopy={copy} />
      </CollapsibleSection>
      <CollapsibleSection id="howto" title="3. How to run commands">
        <CollapsibleSection id="howto-live" title="Option A: on this page" level={3}>
          <ol className="steps">
            <li>Pick a command card below (for example List users).</li>
            <li>Press <strong>Run</strong>. In Real the lab logs in once, then streams the result; in Mock it plays canned output.</li>
            <li>The result opens right under the card's category: one line shows what the command needed (installed, configured, authenticated) with links back to sections 1 and 2.</li>
            <li>Use <strong>Easy read</strong> for a table or form, <strong>JSON</strong> for the raw payload, and the <strong>Trace</strong> tab for every hop.</li>
            <li>Use <strong>Copy</strong> on a card or a step to paste the same command into your own terminal.</li>
          </ol>
        </CollapsibleSection>
        <CollapsibleSection id="howto-terminal" title="Option B: in your own terminal" level={3}>
          <p>After install, init and auth, run catalog commands like:</p>
          <CodeCopyRow text="pingcli pingone environments list -O json" copyId="envs" copied={copied} onCopy={copy} />
          <CodeCopyRow text={usersCmd} copyId="users" copied={copied} onCopy={copy} />
          <p className="hint">Environment-scoped resources use <code>pingcli pingone api ...</code> with your environment ID; pass <code>-O json</code> for machine-readable output. Every card below shows the complete command.</p>
        </CollapsibleSection>
      </CollapsibleSection>
    </>
  );
}

// Parse one SSE block ("event: x\ndata: {...}"). null for anything malformed (a corrupt frame never wipes output).
export function parseSseBlock(block) {
  const ev = /^event: (\w+)/m.exec(block);
  const data = /^data: (.+)/m.exec(block);
  if (!ev || !data) return null;
  try { return { type: ev[1], payload: JSON.parse(data[1]) }; } catch { return null; }
}

function JsonView({ output }) {
  const tokens = tokenizeJson(output);
  let pretty = output;
  try { pretty = JSON.stringify(JSON.parse(output), null, 2); } catch { /* not JSON */ }
  if (!tokens) return null;
  const lines = pretty.split("\n").length;
  return (
    <div className="editor" data-testid="json-view">
      <div className="editor__bar"><span className="chip">JSON</span><span className="muted">{lines} lines</span><button type="button" onClick={() => copyToClipboard(pretty)}>Copy</button></div>
      <div className="editor__content">
        <div className="editor__lines" aria-hidden="true">{Array.from({ length: Math.min(lines, 20000) }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
        <pre className="editor__code" tabIndex={0} aria-label="Command output as JSON">{tokens.map((t, i) => (t.cls ? <span key={i} className={t.cls}>{visible(t.text)}</span> : visible(t.text)))}</pre>
      </div>
    </div>
  );
}

function EasyRead({ readable }) {
  if (readable.kind === "table") {
    const rows = readable.rows.slice(0, MAX_TABLE_ROWS);
    return (
      <div className="results" data-testid="easy-table">
        <p className="results__head"><strong>Table</strong> <span className="muted">{readable.rows.length} item{readable.rows.length === 1 ? "" : "s"}{readable.message ? ` · ${visible(readable.message)}` : ""}</span></p>
        {readable.rows.length === 0 ? <p className="muted">No rows returned.</p> : (
          <div className="scroll">
            <table className="tbl">
              <thead><tr>{readable.columns.map((c) => <th key={c} scope="col">{visible(c)}</th>)}</tr></thead>
              <tbody>{rows.map((row, i) => <tr key={i}>{readable.columns.map((c) => <td key={c}>{row[c] === undefined || row[c] === null ? "—" : visible(String(row[c]))}</td>)}</tr>)}</tbody>
            </table>
            {readable.rows.length > rows.length && <p className="muted">Showing the first {rows.length} rows; JSON has all {readable.rows.length}.</p>}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="results" data-testid="easy-form">
      <p className="results__head"><strong>Details</strong> <span className="muted">{visible(readable.message || readable.status || "Key / value")}</span></p>
      <dl className="kv">{readable.fields.map((f) => <div key={f.key} className="kv__row"><dt>{visible(f.key)}</dt><dd className="mono">{f.value === "" ? "—" : visible(f.value)}</dd></div>)}</dl>
    </div>
  );
}

// One line instead of a second copy of the install/configure steps: what this command needed, each step linking back to
// (and opening) its section above, then the command itself with Copy. Steps a command does not need are omitted
// (the server's prereqs list them). Mock says "simulated" where the lab did not really do the step.
const CHAIN = [
  [/^Install/i, "installed", "install"],
  [/^Configure/i, "configured", "configure"],
  [/^Authenticate/i, "authenticated", "configure"],
];
export function PrereqChain({ prereqs, source, copied, onCopy }) {
  const mock = source === "mock";
  const steps = [];
  let command = null; let commandIndex = -1;
  prereqs.forEach((p, i) => {
    const hit = CHAIN.find(([re]) => re.test(p.title || ""));
    if (hit) steps.push({ word: hit[1], section: hit[2], title: p.title });
    else if (/^Run/i.test(p.title || "")) { command = p.command; commandIndex = i; }
  });
  return (
    <p className="chain" data-testid="prereq-chain">
      {steps.map((st) => (
        <span key={st.word} className="chain__step">
          <a href={`#section-${st.section}`} data-testid={`chain-${st.word}`} title={`${st.title}: open section ${st.section === "install" ? 1 : 2}`}
            onClick={(e) => { e.preventDefault(); openSection(st.section); }}>✓ {st.word}{mock ? " (simulated)" : ""}</a>
          <span className="chain__arrow" aria-hidden="true"> → </span>
        </span>
      ))}
      {command && (
        <span className="chain__cmd">▶ <code>{command}</code> <button type="button" data-testid="chain-copy" onClick={() => onCopy(commandIndex, command)}>{copied === commandIndex ? "Copied!" : "Copy"}</button></span>
      )}
    </p>
  );
}

export default function PingCliPage({ info, vertical, dataSignal = 0, resetSignal = 0, presenter = false, onRunDone = () => {}, focusKey = null }) {
  const [commands, setCommands] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [version, setVersion] = useState(null);
  const [running, setRunning] = useState(null);
  const [activeKey, setActiveKey] = useState(null);
  const [cmdLabel, setCmdLabel] = useState("");
  const [output, setOutput] = useState("");
  const [exitCode, setExitCode] = useState(null);
  const [prereqs, setPrereqs] = useState([]);
  const [source, setSource] = useState(null);
  const [runStatus, setRunStatus] = useState(null);
  const [viewMode, setViewMode] = useState("json");
  // Why a run failed or stopped (done.error: timeout, output cap, auth failure...), shown on its own line, never merged
  // into the output; and whether the server cut the output at its cap.
  const [runError, setRunError] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [runSeq, setRunSeq] = useState(0);
  const [copiedKey, setCopiedKey] = useState(null);
  const [copiedPrereq, setCopiedPrereq] = useState(null);
  const abortRef = useRef(null);
  const outputRef = useRef(null);

  // Rule 19: every mode switch (dataSignal) reloads the catalog and version and clears the last run.
  const clearRun = useCallback(() => {
    abortRef.current?.abort();
    setRunning(null); setActiveKey(null); setCmdLabel(""); setOutput(""); setExitCode(null); setPrereqs([]); setRunStatus(null); setSource(null); setViewMode("json"); setRunError(null); setTruncated(false);
  }, []);
  useEffect(() => {
    clearRun();
    setLoadError(null);
    getJson(`/api/commands?vertical=${encodeURIComponent(vertical)}`).then(setCommands, (e) => setLoadError(e.message));
    getJson("/api/version").then(setVersion, () => setVersion(null));
  }, [dataSignal, vertical, clearRun]);
  const seenReset = useRef(resetSignal);
  useEffect(() => { if (seenReset.current !== resetSignal) { seenReset.current = resetSignal; clearRun(); } }, [resetSignal, clearRun]);
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!focusKey) return;
    document.getElementById(`card-${focusKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusKey, commands]);

  const byKey = Object.fromEntries(commands.map((c) => [c.key, c]));
  const categories = [];
  for (const c of commands) { if (!categories.includes(c.category)) categories.push(c.category); }

  const copyCmd = (key, text) => { copyToClipboard(text); setCopiedKey(key); setTimeout(() => setCopiedKey(null), 1500); };
  const copyPrereq = (i, text) => { copyToClipboard(text); setCopiedPrereq(i); setTimeout(() => setCopiedPrereq(null), 1500); };

  const run = async (commandKey) => {
    if (running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const human = byKey[commandKey]?.title || commandKey;
    setRunning(commandKey); setActiveKey(commandKey); setCmdLabel(""); setOutput(""); setExitCode(null); setViewMode("json"); setSource(null);
    setRunError(null); setTruncated(false); setRunSeq((n) => n + 1);
    setRunStatus({ phase: "running", key: commandKey, label: human });
    setPrereqs(Array.isArray(byKey[commandKey]?.prereqs) ? byKey[commandKey].prereqs : []);
    setCopiedPrereq(null);

    // Overall client-side timeout: a hung or buffered stream never leaves the Run buttons disabled.
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, RUN_TIMEOUT_MS);
    // Whether an SSE `done` was applied. The final frame often sits in the buffer without a trailing blank line; without
    // the flush below, exitCode stays null and the response pane flashes then disappears (seen in AI-DEMO2).
    let sawDone = false;
    let finalExit = null;
    let kept = 0;
    const finish = (code) => { finalExit = code; setExitCode(code); };
    const append = (text) => {
      if (kept >= MAX_OUTPUT_CHARS) return;
      const piece = String(text).slice(0, MAX_OUTPUT_CHARS - kept);
      kept += piece.length;
      setOutput((prev) => prev + piece + (kept >= MAX_OUTPUT_CHARS ? "\n[output truncated by the page]" : ""));
    };
    try {
      const res = await workspaceFetch(`/api/stream?commandKey=${encodeURIComponent(commandKey)}&vertical=${encodeURIComponent(vertical)}`, { signal: controller.signal });
      if (!res.ok || !res.body) {
        let detail = "";
        try { const b = await res.json(); detail = b.detail || b.error || ""; } catch { /* not JSON */ }
        setRunError(res.status === 409 ? `Another run is in progress in this workspace (${detail || "409"}). Wait for it, or press Reset.` : `Could not run: HTTP ${res.status}${detail ? ` (${detail})` : ""}`);
        finish(1);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const apply = (block) => {
        const ev = parseSseBlock(block);
        if (!ev) return;
        const { type, payload } = ev;
        if (type === "meta") {
          setCmdLabel(String(payload.command || ""));
          setSource(payload.source || null);
          if (Array.isArray(payload.prereqs)) setPrereqs(payload.prereqs);
        } else if (type === "chunk") {
          append(payload.text ?? "");
        } else if (type === "done") {
          sawDone = true;
          if (payload.error) setRunError(String(payload.error).slice(0, 500));
          if (payload.truncated) setTruncated(true);
          finish(Number.isInteger(payload.exitCode) ? payload.exitCode : 0);
          onRunDone({ commandKey, label: human, source: payload.source, traceId: payload.traceId, hops: Array.isArray(payload.hops) ? payload.hops : [], exitCode: payload.exitCode });
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop();
        for (const b of blocks) apply(b);
      }
      // Flush the decoder and any trailing frame that lacked its final blank line (the `done` event is often exactly this).
      buf += decoder.decode();
      if (buf.trim()) for (const b of buf.split("\n\n")) apply(b);
      if (!sawDone) finish(0);
    } catch (err) {
      if (err?.name === "AbortError") {
        if (timedOut) { setRunError(`The page stopped waiting after ${RUN_TIMEOUT_MS / 1000} seconds.`); finish(1); }
        else if (!sawDone) finish(finalExit === null ? 1 : finalExit);
      } else { setRunError(String(err?.message || err).slice(0, 500)); finish(1); }
    } finally {
      clearTimeout(timer);
      setRunning((r) => (r === commandKey ? null : r));
      setRunStatus({ phase: "done", key: commandKey, label: human, exitCode: finalExit === null ? 0 : finalExit });
    }
  };

  const showTerminal = running !== null || exitCode !== null || output !== "";
  const readable = !running && output ? buildReadableView(output) : null;
  const canEasyRead = readable !== null;
  // A finished run with structured output opens in Easy read; the reader can flip back to JSON.
  useEffect(() => {
    if (running !== null || exitCode === null || !output) return;
    if (buildReadableView(output)) setViewMode("easy");
  }, [running, exitCode, output]);
  useEffect(() => {
    if (running === null || !outputRef.current) return;
    outputRef.current.scrollIntoView?.({ behavior: scrollBehavior(), block: "nearest" });
  }, [running]);

  const envId = /environments\/([0-9a-f-]{36})\//.exec(byKey.pingone_users_list?.label || "")?.[1];
  // The one result panel lives directly under the category whose card was run (owner, 2026-11-09).
  const resultCategory = activeKey ? byKey[activeKey]?.category : null;
  const jsonTokens = output && (viewMode === "json" || !canEasyRead) ? tokenizeJson(output) : null;

  const resultPanel = (showTerminal || runStatus) ? (
    <div ref={outputRef} className="output" data-testid="output">
      {runStatus && (
        <div className="run-status" role="status" aria-live="polite" aria-busy={runStatus.phase === "running"} data-testid="run-status">
          {runStatus.phase === "running"
            ? <><span className="chip chip--info"><span className="dot" aria-hidden="true" />Running</span> {runStatus.label}...</>
            : <><span className={`chip ${runStatus.exitCode === 0 ? "chip--ok" : "chip--danger"}`}><span className="dot" aria-hidden="true" />{runStatus.exitCode === 0 ? "Done" : "Failed"}</span> <strong>{runStatus.label}</strong> (exit {runStatus.exitCode})</>}
        </div>
      )}
      {runError && <p className="run-error" role="alert" data-testid="run-error"><span className="chip chip--danger"><span className="dot" aria-hidden="true" />Reason</span> {visible(runError)}</p>}
      {showTerminal && prereqs.length > 0 && <PrereqChain prereqs={prereqs} source={source || info?.mode} copied={copiedPrereq} onCopy={copyPrereq} />}
      {showTerminal && (
        <CollapsibleSection id="response" title="Command response" forceOpen={running !== null ? true : null}>
          {canEasyRead && (
            <div className="tabs" role="group" aria-label="Output view">
              <button type="button" aria-pressed={viewMode === "easy"} onClick={() => setViewMode("easy")} data-testid="view-easy">Easy read</button>
              <button type="button" aria-pressed={viewMode === "json"} onClick={() => setViewMode("json")} data-testid="view-json">JSON</button>
            </div>
          )}
          <ErrorBoundary resetKey={runSeq} title="This output could not be shown" testId="output-error">
          <div className="terminal" data-testid="terminal">
            <div className="terminal__head">
              <code className="terminal__prompt">$ {cmdLabel || "..."}</code>
              {source === "mock" && <span className="chip chip--warn" data-testid="mock-output"><span className="dot" aria-hidden="true" />MOCK output</span>}
              {source === "real" && <span className="chip chip--info"><span className="dot" aria-hidden="true" />Real output</span>}
              {exitCode !== null && <span className={`chip ${exitCode === 0 ? "chip--ok" : "chip--danger"}`} data-testid="exit-chip"><span className="dot" aria-hidden="true" />exit {exitCode}</span>}
            </div>
            {viewMode === "easy" && readable && <EasyRead readable={readable} />}
            {(viewMode === "json" || !canEasyRead) && (jsonTokens
              ? <JsonView output={output} />
              : <pre className="terminal__body" tabIndex={0} aria-label="Command output" data-testid="raw-output">{output ? visible(output) : running ? "Running..." : "(no output)"}</pre>)}
            {truncated && <p className="terminal__note" data-testid="truncated"><span className="chip chip--warn"><span className="dot" aria-hidden="true" />Truncated</span> The server stopped the output at its size cap; what is above is the first part.</p>}
          </div>
          </ErrorBoundary>
        </CollapsibleSection>
      )}
    </div>
  ) : null;

  return (
    <div className="pingcli">
      <p className="lede">The official CLI for PingOne administration. Pick a command to run it{info?.mode === "real" ? " live against your configured environment" : " in Mock (canned output, nothing leaves this machine)"}.
      </p>
      <RealHowTo info={info} />
      {!presenter && <InstallSection envId={envId} version={version} />}

      <CollapsibleSection id="live-commands" title={presenter ? "Commands" : "4. Commands"} forceOpen={resultPanel ? true : null}>
        <p className="hint">Only these 14 read-only commands can run: the page sends a key, the server holds the arguments. Copy any command into your own terminal after you authenticate.</p>
        {loadError && <p className="error" role="alert">Could not load the commands ({loadError}).</p>}
        {categories.map((cat) => (
          <CollapsibleSection key={cat} id={`cat-${cat.toLowerCase().replace(/[^a-z]+/g, "-")}`} title={cat} level={3} forceOpen={resultPanel && resultCategory === cat ? true : null}>
            <div className="card-grid cmd-grid">
              {commands.filter((c) => c.category === cat).map((c) => {
                const isRunning = running === c.key;
                const isDone = runStatus?.phase === "done" && runStatus.key === c.key;
                let runLabel = "Run";
                if (isRunning) runLabel = "Running...";
                else if (isDone) runLabel = runStatus.exitCode === 0 ? "Done" : "Failed";
                return (
                  <div key={c.key} id={`card-${c.key}`} className={`card${activeKey === c.key ? "" : " card--neutral"}${focusKey === c.key ? " card--focus" : ""}`} data-testid={`card-${c.key}`}>
                    <div className="cmd__top">
                      <h3>{c.title}</h3>
                      <button type="button" onClick={() => copyCmd(c.key, c.label)} title="Copy command">{copiedKey === c.key ? "Copied!" : "Copy"}</button>
                    </div>
                    <code className="cmd__label" title={c.label}>{c.label}</code>
                    <button type="button" className="cmd__run" data-testid={`run-${c.key}`} disabled={!c.runnable || running !== null} aria-busy={isRunning} onClick={() => run(c.key)}>{runLabel}</button>
                  </div>
                );
              })}
            </div>
            {resultCategory === cat && resultPanel}
          </CollapsibleSection>
        ))}
      </CollapsibleSection>

    </div>
  );
}
