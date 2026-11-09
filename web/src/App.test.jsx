import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App, { BANNER_UNKNOWN } from "./App";
import { parseSseBlock } from "./components/PingCliPage";
import ModeToggle from "./components/ModeToggle";

// A fake lab server: just enough of /api for the page, with SSE runs built from a script of frames.
const USERS = JSON.stringify({ schemaVersion: "1.1", status: "success", message: "Custom request successful", data: { _embedded: { users: [
  { id: "u-1", username: "mia.fischer", email: "mia.fischer@northwind.example", enabled: true, name: { formatted: "Mia Fischer" } },
  { id: "u-2", username: "leo.haddad", email: "leo.haddad@northwind.example", enabled: false, name: { formatted: "Leo Haddad" } },
] } } }, null, 2);
const HOPS = [
  { n: 1, kind: "pingcli-run-request", from: "browser", to: "lab", verdict: "ok", mock: true, traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01", title: "Run request", narrative: "The page asks the lab", fact: "one allow-listed key", spec: { none: true, why: "w", failure: "f" }, request: { method: "GET", url: "/api/stream?commandKey=pingone_users_list" }, response: { status: 200 } },
  { n: 2, kind: "pingcli-auth-login", from: "pingcli", to: "pingone-auth", verdict: "ok", mock: true, traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203332-01", title: "Worker token", narrative: "MOCK token", fact: "worker token issued", spec: { mandate: "m", why: "w", failure: "f", refs: [{ label: "RFC 6749 §4.4", url: "https://www.rfc-editor.org/rfc/rfc6749#section-4.4" }] }, request: { method: "POST", url: "https://auth.pingone.example/e/as/token", body: "client_secret=[write-only]" }, response: { status: 200, body: { access_token: "MOCK-ACCESS-TOKEN-not-a-real-token" } } },
];
const COMMANDS = [
  { key: "pingone_users_list", title: "List users", category: "Identity and directory", label: "pingcli pingone api environments/81ec279a-7b44-4595-a0ba-0fec2079c592/users -O json", runnable: true, auth: true, prereqs: [{ title: "Install PingCLI", command: "brew install pingidentity/tap/pingcli", note: "Mock" }, { title: "Configure credentials", command: "pingcli init" }, { title: "Authenticate", command: "pingcli pingone auth login" }, { title: "Run command", command: "pingcli pingone api x -O json", note: "n" }] },
  { key: "config_list_keys", title: "Config keys", category: "Platform and config", label: "pingcli config list-keys", runnable: true, auth: false, prereqs: [{ title: "Install PingCLI", command: "brew install pingidentity/tap/pingcli" }, { title: "Configure credentials", command: "pingcli init" }, { title: "Run command", command: "pingcli config list-keys" }] },
  { key: "version", title: "Version", category: "Platform and config", label: "pingcli --version", runnable: true, auth: false, prereqs: [{ title: "Install PingCLI", command: "brew install pingidentity/tap/pingcli" }, { title: "Run command", command: "pingcli --version" }] },
];
const STORY = (v) => ({ intro: `${v === "banking" ? "Dana Okafor at Fabrikam Bank" : "Jordan Ellis at Northwind Retail"} automates PingOne.`, verticals: ["banking", "healthcare", "retail"], scenarios: [{ id: "who-is-in-the-directory", title: "Who is in the directory", commandKey: "pingone_users_list", say: "Users of the org", lesson: "JSON a script can use" }], facts: [{ id: "f", status: "UNVERIFIED", text: "shapes are illustrative" }], talkTrack: [{ title: "Open", say: "Say this first." }, { title: "Follow the hops", say: "Open the hops." }], tokenLabel: "MOCK" });
const sse = (frames, { trailing = true } = {}) => frames.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}`).join("\n\n") + (trailing ? "\n\n" : "");

let server;
function fakeServer({ realAvailable = false, runText = USERS, trailing = true, runStatus = 200, refuseReal = false, done = { exitCode: 0 }, version = null, versionStatus = 200 } = {}) {
  const s = { mode: "mock", calls: [] };
  s.fetch = vi.fn(async (url, opts = {}) => {
    const u = new URL(url, "http://127.0.0.1:7806");
    const method = opts.method || "GET";
    s.calls.push(`${method} ${u.pathname}`);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (u.pathname === "/api/info") return json({ mode: s.mode, source: s.mode, realAvailable, realHowTo: realAvailable ? null : "Real needs PINGONE_ENVIRONMENT_ID in ~/Development/.env", banner: s.mode === "mock" ? "MOCK: no pingcli binary runs and nothing leaves this machine." : "REAL: the pinned pingcli binary runs." });
    if (u.pathname === "/api/mode") {
      const { source } = JSON.parse(opts.body);
      if (source === "real" && (!realAvailable || refuseReal)) return json({ error: "real_not_configured", detail: "not configured" }, 409);
      s.mode = source; return json({ source });
    }
    if (u.pathname === "/api/story") return json(STORY(u.searchParams.get("vertical")));
    if (u.pathname === "/api/commands") return json(COMMANDS);
    if (u.pathname === "/api/version") return versionStatus === 200 ? json(version || { version: "1.2.0", source: s.mode }) : json({ error: "pingcli binary not installed" }, versionStatus);
    if (u.pathname === "/api/reset") return json({ reset: "ok" });
    if (u.pathname === "/api/shelf") return json({ shelfUrl: null });
    if (u.pathname === "/api/diagram") return json({ title: "One pingcli command", intro: "i", nodes: [{ id: "browser", label: "Browser", kind: "client", x: 0, y: 0 }, { id: "lab", label: "Lab", kind: "lab", x: 300, y: 0 }], steps: [{ from: "browser", to: "lab", label: "Pick a command", say: "s" }] });
    if (u.pathname === "/api/stream") {
      if (runStatus !== 200) return json({ error: "run_in_progress", detail: "busy" }, runStatus);
      const cmd = COMMANDS.find((c) => c.key === u.searchParams.get("commandKey")) || COMMANDS[0];
      const half = Math.floor(runText.length / 2);
      return new Response(sse([["meta", { command: cmd.label, source: s.mode, prereqs: cmd.prereqs }], ["chunk", { text: runText.slice(0, half) }], ["chunk", { text: runText.slice(half) }], ["done", { source: s.mode, traceId: "0af7651916cd43dd8448eb211c80319c", hops: HOPS, ...done }]], { trailing }), { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return json({ error: "not_found" }, 404);
  });
  return s;
}

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
  delete document.documentElement.dataset.theme;
  server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const runUsers = async () => {
  await screen.findByTestId("run-pingone_users_list");
  fireEvent.click(screen.getByTestId("run-pingone_users_list"));
  await screen.findByTestId("easy-table");
};

describe("shell, banner and mode", () => {
  test("the dark shell bar comes first, then the banner is the first thing in the page, before the title", async () => {
    render(<App />);
    const bar = document.querySelector("header.shell-bar");
    expect(bar).toBeTruthy();
    const main = document.querySelector("main.page");
    expect(main.firstElementChild).toBe(screen.getByTestId("banner"));
    expect(screen.getByTestId("banner")).toHaveAttribute("role", "note");
    expect(screen.getByTestId("banner").textContent).toBe(BANNER_UNKNOWN);
    await waitFor(() => expect(screen.getByTestId("banner").textContent).toMatch(/^MOCK: no pingcli binary runs/));
    expect(screen.getByTestId("mode-badge").textContent).toBe("Mock");
    expect(within(bar).getByTestId("nav-commands")).toHaveAttribute("aria-current", "page");
  });

  test("Real unconfigured: the Real button is disabled with the how-to as its tooltip, and the how-to card shows", async () => {
    render(<App />);
    const real = await screen.findByTestId("mode-real");
    expect(real).toBeDisabled();
    expect(real.getAttribute("title")).toMatch(/PINGONE_ENVIRONMENT_ID/);
    expect(screen.getByTestId("mode-mock")).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByTestId("real-howto")).toHaveTextContent(/Real mode is not configured/);
  });

  test("the toggle switches both ways through POST /api/mode and reloads every panel's data", async () => {
    server = fakeServer({ realAvailable: true }); vi.stubGlobal("fetch", server.fetch);
    render(<App />);
    const real = await screen.findByTestId("mode-real");
    await waitFor(() => expect(real).not.toBeDisabled());
    const before = server.calls.filter((c) => c === "GET /api/commands").length;
    fireEvent.click(real);
    await waitFor(() => expect(screen.getByTestId("mode-badge").textContent).toBe("Real"));
    expect(server.calls).toContain("POST /api/mode");
    await waitFor(() => expect(server.calls.filter((c) => c === "GET /api/commands").length).toBeGreaterThan(before));
    expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "live");
    fireEvent.click(screen.getByTestId("mode-mock"));
    await waitFor(() => expect(screen.getByTestId("mode-badge").textContent).toBe("Mock"));
    expect(screen.getByTestId("banner")).not.toHaveAttribute("data-state");
  });

  test("a 409 from /api/mode is reported and the mode stays Mock", async () => {
    server = fakeServer({ realAvailable: true, refuseReal: true }); vi.stubGlobal("fetch", server.fetch);
    render(<App />);
    const real = await screen.findByTestId("mode-real");
    await waitFor(() => expect(real).not.toBeDisabled());
    fireEvent.click(real);
    expect(await screen.findByTestId("notice")).toHaveTextContent(/Real is not configured/);
    expect(screen.getByTestId("mode-badge").textContent).toBe("Mock");
    cleanup();
    render(<ModeToggle info={{ mode: "mock", realAvailable: false, realHowTo: "how" }} onSwitch={() => {}} />);
    expect(screen.getByTestId("mode-real")).toBeDisabled();
  });

  test("theme toggle sets data-theme on <html> and remembers it", async () => {
    render(<App />);
    await screen.findByTestId("mode-real");
    const btn = screen.getByTestId("theme-toggle");
    const first = document.documentElement.dataset.theme;
    fireEvent.click(btn);
    expect(document.documentElement.dataset.theme).not.toBe(first);
    expect(localStorage.getItem("pingcli-lab.theme")).toBe(document.documentElement.dataset.theme);
  });
});

describe("running a command", () => {
  test("SSE run: prereq chain, MOCK label, exit chip, Easy read table, then JSON with highlighting", async () => {
    render(<App />);
    await runUsers();
    expect(screen.getByTestId("prereq-chain")).toBeTruthy();
    expect(screen.getByTestId("mock-output")).toHaveTextContent("MOCK output");
    expect(screen.getByTestId("exit-chip")).toHaveTextContent("exit 0");
    expect(screen.getByTestId("run-status")).toHaveTextContent(/Done/);
    const table = screen.getByTestId("easy-table");
    expect(table).toHaveTextContent("Mia Fischer");
    expect(table).toHaveTextContent("2 items");
    fireEvent.click(screen.getByTestId("view-json"));
    const json = screen.getByTestId("json-view");
    expect(json.querySelector(".j-key")).toBeTruthy();
    expect(screen.getByTestId("view-json")).toHaveAttribute("aria-pressed", "true");
  });

  test("the trailing done frame without a final blank line is still applied (flush)", async () => {
    server = fakeServer({ trailing: false }); vi.stubGlobal("fetch", server.fetch);
    render(<App />);
    await runUsers();
    expect(screen.getByTestId("exit-chip")).toHaveTextContent("exit 0");
  });

  test("hostile output stays inert text: markup is not parsed, bidi and ANSI escapes become visible escapes", async () => {
    const evil = `<img src=x onerror="window.__pwned=1"> ‮evil‬ \u001b[31mred\u001b[0m`;
    server = fakeServer({ runText: evil }); vi.stubGlobal("fetch", server.fetch);
    render(<App />);
    await screen.findByTestId("run-pingone_users_list");
    fireEvent.click(screen.getByTestId("run-pingone_users_list"));
    const raw = await screen.findByTestId("raw-output");
    await waitFor(() => expect(screen.getByTestId("exit-chip")).toBeTruthy());
    expect(document.querySelector("main img")).toBeNull();
    expect(window.__pwned).toBeUndefined();
    expect(raw.textContent).toContain("<img src=x");
    expect(raw.textContent).toContain("\\u202e");
    expect(raw.textContent).toContain("\\u001b[31m");
    expect(raw.textContent).not.toMatch(/[‮\u001b]/);
  });

  test("a 409 (run in progress) is reported as the reason, the buttons come back", async () => {
    server = fakeServer({ runStatus: 409 }); vi.stubGlobal("fetch", server.fetch);
    render(<App />);
    fireEvent.click(await screen.findByTestId("run-pingone_users_list"));
    expect(await screen.findByTestId("run-error")).toHaveTextContent(/Another run is in progress/);
    await waitFor(() => expect(screen.getByTestId("run-pingone_users_list")).not.toBeDisabled());
  });

  test("parseSseBlock skips a corrupt frame", () => {
    expect(parseSseBlock("event: chunk\ndata: {bad")).toBeNull();
    expect(parseSseBlock('event: chunk\ndata: {"text":"a"}')).toEqual({ type: "chunk", payload: { text: "a" } });
  });

  test("sections remember open/closed across renders", async () => {
    render(<App />);
    const toggle = within(await screen.findByTestId("section-configure")).getAllByRole("button")[0];
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(JSON.parse(localStorage.getItem("pingcli-lab.sectionOpen")).configure).toBe(false);
    cleanup();
    render(<App />);
    expect(within(await screen.findByTestId("section-configure")).getAllByRole("button")[0]).toHaveAttribute("aria-expanded", "false");
  });
});

describe("review fixes (step 2)", () => {
  const deep = `${"[".repeat(50000)}${"]".repeat(50000)}`;
  test("BLOCKING: 50000-deep JSON output renders as inert raw text; the shell, banner and toggle stay", async () => {
    server = fakeServer({ runText: deep }); vi.stubGlobal("fetch", server.fetch);
    render(<App />);
    fireEvent.click(await screen.findByTestId("run-pingone_users_list"));
    await waitFor(() => expect(screen.getByTestId("exit-chip")).toHaveTextContent("exit 0"));
    expect(screen.getByTestId("raw-output").textContent.startsWith("[[[[")).toBe(true);
    expect(screen.queryByTestId("view-easy")).toBeNull();
    expect(document.querySelector("header.shell-bar")).toBeTruthy();
    expect(screen.getByTestId("banner")).toBeTruthy();
    expect(screen.getByTestId("mode-toggle")).toBeTruthy();
  });

  test("a render failure in the output shows an error card and keeps the page (error boundary)", async () => {
    const ErrorBoundary = (await import("./components/ErrorBoundary")).default;
    const Boom = () => { throw new Error("boom <b>not markup</b>"); };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<div><p data-testid="outside">still here</p><ErrorBoundary testId="eb"><Boom /></ErrorBoundary></div>);
    spy.mockRestore();
    expect(screen.getByTestId("eb")).toHaveTextContent("boom <b>not markup</b>");
    expect(screen.getByTestId("eb").querySelector("b")).toBeNull();
    expect(screen.getByTestId("outside")).toBeTruthy();
  });

  test("SHOULD-FIX: a timeout keeps the output and shows the reason on its own line", async () => {
    server = fakeServer({ runText: "hanging\n", done: { exitCode: 1, error: "timed out after 15000 ms" } }); vi.stubGlobal("fetch", server.fetch);
    render(<App />);
    fireEvent.click(await screen.findByTestId("run-pingone_users_list"));
    expect(await screen.findByTestId("run-error")).toHaveTextContent("timed out after 15000 ms");
    expect(screen.getByTestId("raw-output").textContent).toBe("hanging\n");
    expect(screen.getByTestId("run-status")).toHaveTextContent(/Failed/);
  });

  test("SHOULD-FIX: the output cap shows its reason and a truncation marker", async () => {
    server = fakeServer({ runText: "x".repeat(5000), done: { exitCode: 1, error: "output over 1048576 bytes: stopped", truncated: true } }); vi.stubGlobal("fetch", server.fetch);
    render(<App />);
    fireEvent.click(await screen.findByTestId("run-pingone_users_list"));
    expect(await screen.findByTestId("run-error")).toHaveTextContent("output over 1048576 bytes");
    expect(screen.getByTestId("truncated")).toHaveTextContent("Truncated");
  });

  test("SHOULD-FIX: a plain failure with output shows both; a success shows no reason line", async () => {
    server = fakeServer({ runText: "Error: forbidden\n", done: { exitCode: 1, error: "exit status 1" } }); vi.stubGlobal("fetch", server.fetch);
    render(<App />);
    fireEvent.click(await screen.findByTestId("run-pingone_users_list"));
    expect(await screen.findByTestId("run-error")).toHaveTextContent("exit status 1");
    expect(screen.getByTestId("raw-output")).toHaveTextContent("Error: forbidden");
    cleanup();
    server = fakeServer(); vi.stubGlobal("fetch", server.fetch);
    render(<App />);
    await runUsers();
    expect(screen.queryByTestId("run-error")).toBeNull();
    expect(screen.queryByTestId("truncated")).toBeNull();
  });

  test("nit (a): a Real binary that is not the pinned version is flagged", async () => {
    server = fakeServer({ version: { version: "1.1.0", source: "real", pinned: "1.2.0", matchesPinned: false } }); vi.stubGlobal("fetch", server.fetch);
    render(<App />);
    expect(await screen.findByTestId("version-mismatch")).toHaveTextContent("not the pinned 1.2.0");
  });

  test("nit (b): a duplicated tab (same id) takes a fresh workspace; the original keeps its id; a lone tab keeps its id", async () => {
    const { BroadcastChannel: Channel } = await import("node:worker_threads");
    const { startWorkspaceClaim } = await import("./workspace");
    let a = "w-same"; let b = "w-same"; let lone = "w-lone";
    let n = 0; const makeId = () => `w-new${++n}`;
    const stopA = startWorkspaceClaim({ getId: () => a, setId: (v) => { a = v; }, nonce: "A", Channel, makeId });
    const stopL = startWorkspaceClaim({ getId: () => lone, setId: (v) => { lone = v; }, nonce: "L", Channel, makeId });
    await new Promise((r) => setTimeout(r, 50));
    const stopB = startWorkspaceClaim({ getId: () => b, setId: (v) => { b = v; }, nonce: "B", Channel, makeId });
    await waitFor(() => expect(b).not.toBe("w-same"));
    expect(a).toBe("w-same");
    expect(lone).toBe("w-lone");
    stopA(); stopB(); stopL();
  });
});

describe("owner UI feedback (result placement, prereq chain, install collapsed)", () => {
  const sectionOf = (el) => el.closest("[data-testid^='section-cat-']")?.dataset.testid;
  const installToggle = async () => within(await screen.findByTestId("section-install")).getAllByRole("button")[0];

  test("the result renders inside the run card's category section, and moves when a card in another category runs", async () => {
    render(<App />);
    await runUsers();
    expect(sectionOf(screen.getByTestId("output"))).toBe("section-cat-identity-and-directory");
    expect(within(screen.getByTestId("section-cat-identity-and-directory")).getByTestId("easy-table")).toBeTruthy();
    fireEvent.click(screen.getByTestId("run-config_list_keys"));
    await waitFor(() => expect(sectionOf(screen.getByTestId("output"))).toBe("section-cat-platform-and-config"));
    expect(screen.getAllByTestId("output")).toHaveLength(1);
    expect(within(screen.getByTestId("section-cat-identity-and-directory")).queryByTestId("output")).toBeNull();
    // Reset clears it wherever it is.
    fireEvent.click(screen.getByTestId("reset"));
    await waitFor(() => expect(screen.queryByTestId("output")).toBeNull());
  });

  test("the category holding the result stays open while the result is there", async () => {
    render(<App />);
    await runUsers();
    const cat = screen.getByTestId("section-cat-identity-and-directory");
    fireEvent.click(within(cat).getAllByRole("button")[0]);
    expect(within(cat).getByTestId("output")).toBeTruthy();
    expect(within(cat).getAllByRole("button")[0]).toHaveAttribute("aria-expanded", "true");
  });

  test("one compact chain, no second install block: links open sections 1 and 2, Copy copies the command", async () => {
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: write } });
    render(<App />);
    await runUsers();
    expect(screen.queryByTestId("section-prereqs")).toBeNull();
    expect(screen.queryByText("What was needed to run this")).toBeNull();
    const chain = screen.getByTestId("prereq-chain");
    expect(chain.textContent).toMatch(/✓ installed \(simulated\)\s*→\s*✓ configured \(simulated\)\s*→\s*✓ authenticated \(simulated\)\s*→\s*▶ pingcli pingone api x -O json/);
    expect(screen.getByTestId("chain-installed")).toHaveAttribute("href", "#section-install");
    expect(screen.getByTestId("chain-configured")).toHaveAttribute("href", "#section-configure");
    expect(screen.getByTestId("chain-authenticated")).toHaveAttribute("href", "#section-configure");
    expect(await installToggle()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByTestId("chain-installed"));
    await waitFor(async () => expect(await installToggle()).toHaveAttribute("aria-expanded", "true"));
    fireEvent.click(screen.getByTestId("chain-copy"));
    expect(write).toHaveBeenCalledWith("pingcli pingone api x -O json");
    expect(screen.getByTestId("chain-copy")).toHaveTextContent("Copied!");
  });

  test("steps a command does not need are left out (version: installed then the command)", async () => {
    render(<App />);
    fireEvent.click(await screen.findByTestId("run-version"));
    const chain = await screen.findByTestId("prereq-chain");
    expect(screen.getByTestId("chain-installed")).toBeTruthy();
    expect(screen.queryByTestId("chain-configured")).toBeNull();
    expect(screen.queryByTestId("chain-authenticated")).toBeNull();
    expect(chain.textContent).toMatch(/▶ pingcli --version/);
  });

  test("Install starts collapsed when a version is known, with the MOCK version chip in its header", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("pingcli-version")).toHaveTextContent("✓ pingcli 1.2.0 (MOCK)"));
    expect(within(screen.getByTestId("section-install")).getByTestId("pingcli-version")).toBeTruthy();
    expect(await installToggle()).toHaveAttribute("aria-expanded", "false");
    expect(within(screen.getByTestId("section-install")).queryByText(/Trust the Ping Identity tap/)).toBeNull();
  });

  test("Install starts open when no version is known (binary missing / version call failed)", async () => {
    server = fakeServer({ versionStatus: 503 }); vi.stubGlobal("fetch", server.fetch);
    render(<App />);
    await waitFor(() => expect(server.calls).toContain("GET /api/version"));
    expect(await installToggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByTestId("pingcli-version")).toBeNull();
  });

  test("a remembered choice wins over the installed default", async () => {
    localStorage.setItem("pingcli-lab.sectionOpen", JSON.stringify({ install: true }));
    render(<App />);
    await screen.findByTestId("pingcli-version");
    expect(await installToggle()).toHaveAttribute("aria-expanded", "true");
  });

  test("Real: '✓ pingcli 1.2.0 installed'; a mismatch shows the warning chip in the Install header", async () => {
    server = fakeServer({ version: { version: "1.2.0", source: "real", pinned: "1.2.0", matchesPinned: true } }); vi.stubGlobal("fetch", server.fetch);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("pingcli-version")).toHaveTextContent("✓ pingcli 1.2.0 installed"));
    expect(screen.queryByTestId("version-mismatch")).toBeNull();
    cleanup();
    server = fakeServer({ version: { version: "1.1.0", source: "real", pinned: "1.2.0", matchesPinned: false } }); vi.stubGlobal("fetch", server.fetch);
    render(<App />);
    expect(await within(await screen.findByTestId("section-install")).findByTestId("version-mismatch")).toHaveTextContent("not the pinned 1.2.0");
    expect(screen.getByTestId("pingcli-version")).toHaveTextContent("✓ pingcli 1.1.0 installed");
  });
});

describe("demo extras", () => {
  test("Trace shows the run's hops in the shared evidence screens, with the MOCK tag and traceparent", async () => {
    render(<App />);
    await runUsers();
    fireEvent.click(screen.getByTestId("nav-trace"));
    expect(await screen.findByTestId("trace")).toHaveTextContent("MOCK hops");
    expect(screen.getByTestId("trace")).toHaveTextContent("0af7651916cd43dd8448eb211c80319c");
  });

  test("Story renders the chosen vertical's cast and opens a command", async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("nav-story"));
    expect(await screen.findByTestId("story")).toHaveTextContent("Northwind Retail");
    fireEvent.change(screen.getByTestId("vertical"), { target: { value: "banking" } });
    await waitFor(() => expect(screen.getByTestId("story")).toHaveTextContent("Fabrikam Bank"));
    expect(screen.getByTestId("story")).toHaveTextContent("UNVERIFIED");
    fireEvent.click(within(screen.getByTestId("scenario-who-is-in-the-directory")).getByRole("button"));
    expect(screen.getByTestId("nav-commands")).toHaveAttribute("aria-current", "page");
  });

  test("presenter mode keeps the banner first and shows the talk track; Escape leaves", async () => {
    render(<App />);
    await screen.findByTestId("mode-real");
    fireEvent.click(screen.getByTestId("presenter"));
    expect(document.querySelector(".app--presenter")).toBeTruthy();
    expect(document.querySelector("main.page").firstElementChild).toBe(screen.getByTestId("banner"));
    expect(await screen.findByTestId("presenter-say")).toBeTruthy();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(document.querySelector(".app--presenter")).toBeNull();
  });

  test("Reset calls the API, clears the run and the trace", async () => {
    render(<App />);
    await runUsers();
    fireEvent.click(screen.getByTestId("reset"));
    await waitFor(() => expect(server.calls).toContain("POST /api/reset"));
    await waitFor(() => expect(screen.queryByTestId("output")).toBeNull());
    fireEvent.click(screen.getByTestId("nav-trace"));
    expect(screen.getByTestId("trace-empty")).toBeTruthy();
  });

  test("Diagram loads by name and has Simulate and the positions reset", async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("nav-diagram"));
    expect(await screen.findByTestId("pattern-reset")).toBeTruthy();
    expect(server.calls.some((c) => c === "GET /api/diagram")).toBe(true);
    expect(screen.getByTestId("pattern-step-bar")).toBeTruthy();
  });
});
