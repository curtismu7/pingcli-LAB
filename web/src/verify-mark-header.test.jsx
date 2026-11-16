import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import App from "./App";

// The header shows this lab's own Verified / In progress mark, read from the same /api/shelf call the Shelf link makes (through the lab-proxy that
// call reaches the shelf, whose payload lists every demo with its mark). The lab's own /api/shelf has no demos, so there is no mark then.
const mark = (status, label, extra = {}) => ({ status, label, note: "", updatedAt: "2026-11-15", source: "shipped", ...extra });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function stubLab(shelfPayload) {
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const u = new URL(url, "http://127.0.0.1:7806");
    if (u.pathname === "/api/shelf") return json(shelfPayload);
    if (u.pathname === "/api/info") return json({ mode: "mock", source: "mock", realAvailable: false, realHowTo: null, banner: "MOCK" });
    if (u.pathname === "/api/commands") return json([]);
    if (u.pathname === "/api/story") return json({ intro: "i", verticals: ["retail"], scenarios: [], facts: [], talkTrack: [], tokenLabel: "MOCK" });
    return json({ error: "not_found" }, 404);
  }));
}
beforeEach(() => { localStorage.clear(); window.location.hash = ""; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("verification mark in the header", () => {
  test("shows this lab's own mark beside the Shelf link, and no other lab's; the note is the tooltip", async () => {
    stubLab({ shelfUrl: "http://shelf.example", demos: [
      { id: "other-lab", verification: mark("in-progress", "In progress") },
      { id: "pingcli-lab", verification: mark("verified", "Verified", { note: "Every command run on the mock" }) },
    ] });
    render(<App />);
    const bar = within(await screen.findByTestId("top-menu"));
    expect(await bar.findByText("Verified")).toBeInTheDocument();
    expect(bar.getByText("Shelf", { selector: "a.shelf-link" })).toBeInTheDocument();
    expect(bar.queryByText("In progress")).toBeNull();
    expect(document.querySelectorAll(".verify")).toHaveLength(1);
    expect(bar.getByText("Verified").closest(".verify")).toHaveAttribute("title", expect.stringContaining("Every command run on the mock"));
  });

  test("shows nothing when the lab is opened on its own port (its /api/shelf has only shelfUrl) or the shelf has no mark for it", async () => {
    for (const payload of [{ shelfUrl: "http://shelf.example" }, { shelfUrl: "http://shelf.example", demos: [{ id: "pingcli-lab", verification: null }, { id: "pingcli-lab-x", verification: mark("verified", "Verified") }] }]) {
      stubLab(payload);
      const { unmount } = render(<App />);
      const bar = within(await screen.findByTestId("top-menu"));
      expect(await bar.findByText("Shelf", { selector: "a.shelf-link" })).toBeInTheDocument(); // the shelf answered, and still no badge
      expect(document.querySelector(".verify")).toBeNull();
      unmount();
      vi.unstubAllGlobals();
    }
  });
});
