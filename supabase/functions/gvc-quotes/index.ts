// GVC Shop - Compare quotes (Supabase Edge Function "gvc-quotes"). Kyle, Nov 5 2026.
// On demand, nothing stored: a report only.
//   { action: "find", job_id }          -> quote documents for the job found in Outlook (+ files already saved on the job)
//   { action: "compare", job_id, docs } -> reads the chosen quotes and reports who is higher/lower on what
// Signed-in shop member only (same check as the rest of the app).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MODEL = Deno.env.get("GVC_MODEL") || "claude-sonnet-5-5";
const ME = ["kyle.gvc@hotmail.com", "kdhinter85@hotmail.ca"];
// shop people send drawings and packages, not quotes (Kyle: Randy, Joe, Jessie, Robin are not vendors)
const INTERNAL = /gordeyville|hinteregger|derksen|dirksen|\brandy\b|\bjoe\b|\brobin\b|joe\.gvc|robin\.gvc/i;
const NUM_RE = /^\s*(\d{4}[A-Za-z0-9_]{0,4})\b/;

let tokCache = "";
async function msToken(db: any): Promise<string> {
  if (tokCache) return tokCache;
  const { data: row } = await db.from("gvc_ms").select("refresh_token").eq("id", "main").maybeSingle();
  if (!row?.refresh_token) throw new Error("Outlook isn't connected (Ask Claude → Outlook)");
  const body = new URLSearchParams({ client_id: Deno.env.get("MS_CLIENT_ID") || "", client_secret: Deno.env.get("MS_CLIENT_SECRET") || "", grant_type: "refresh_token", refresh_token: row.refresh_token, scope: "offline_access Mail.ReadWrite User.Read" });
  const r = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", { method: "POST", body });
  const t = await r.json();
  if (!r.ok || !t.access_token) throw new Error("Outlook sign-in expired - reconnect it (Ask Claude → Outlook). " + (t.error_description || t.error || ""));
  if (t.refresh_token && t.refresh_token !== row.refresh_token) await db.from("gvc_ms").update({ refresh_token: t.refresh_token, updated_at: new Date().toISOString() }).eq("id", "main");
  return (tokCache = t.access_token);
}
async function graph(db: any, path: string): Promise<any> {
  const r = await fetch("https://graph.microsoft.com/v1.0" + path, { headers: { Authorization: "Bearer " + (await msToken(db)), ConsistencyLevel: "eventual" } });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error("Outlook: " + (j?.error?.message || r.status)); }
  return r.json();
}
const DOC = /\.(pdf|png|jpe?g)$/i;
const LIKELY = /quot|estimate|proposal|pricing|price|bid|invoice|order ack|acknowledg/i;

async function find(db: any, job: any) {
  const d = job.data || {};
  const name: string = d.name || "";
  const num = (name.match(NUM_RE) || [])[1] || "";
  const sups: any[] = (d.suppliers || []).filter((s: any) => s.status !== "dropped" && s.status !== "declined");
  // what to search Outlook for: the job number, its digits, each quote number on the job, and the job name
  const terms = new Set<string>();
  if (num) { terms.add(num); if (num.replace(/\D/g, "") !== num) terms.add(num.replace(/\D/g, "")); }
  sups.forEach((s) => { if (s.quoteNo) terms.add(String(s.quoteNo)); });
  const words = name.replace(NUM_RE, "").replace(/^[\s\-–:]+/, "").trim();
  if (words.length > 4) terms.add(words.split(/\s+/).slice(0, 3).join(" "));
  const msgs = new Map<string, any>();
  for (const t of terms) {
    try {
      const r = await graph(db, `/me/messages?$search=${encodeURIComponent('"' + t.replace(/"/g, "") + '"')}&$select=id,subject,from,receivedDateTime,hasAttachments&$top=40`);
      (r.value || []).forEach((m: any) => { if (m.hasAttachments) msgs.set(m.id, m); });
    } catch (_) { /* keep going with other terms */ }
  }
  const supFirst = sups.map((s) => String(s.name || "").split(/\s+/)[0].toLowerCase()).filter((x) => x.length > 2);
  const out: any[] = [];
  for (const m of [...msgs.values()].sort((a, b) => String(b.receivedDateTime).localeCompare(String(a.receivedDateTime))).slice(0, 25)) {
    const from = String(m.from?.emailAddress?.address || "").toLowerCase();
    const fromName = m.from?.emailAddress?.name || from;
    if (ME.includes(from) || INTERNAL.test(fromName + " " + from)) continue;   // Kyle's own packages, shop people's drawings
    let atts: any[] = [];
    try { atts = (await graph(db, `/me/messages/${m.id}/attachments?$select=id,name,contentType,size`)).value || []; } catch (_) { continue; }
    for (const a of atts) {
      if (!DOC.test(a.name || "") || (a.size || 0) > 9_000_000) continue;
      if (/^(image|img|logo|outlook)[\w-]*\.(png|jpe?g)$/i.test(a.name)) continue;   // signature logos / pasted screenshots
      const vendor = supFirst.find((f) => (fromName + " " + from + " " + m.subject).toLowerCase().includes(f)) || "";
      out.push({ id: `mail:${m.id}:${a.id}`, name: a.name, size: a.size, from: fromName, subject: m.subject, at: m.receivedDateTime,
        likely: LIKELY.test(a.name) || /^O_?Ack/i.test(a.name) || (!!vendor && LIKELY.test(m.subject)) });
    }
  }
  // quote files already saved on the job (from earlier emails)
  const { data: files } = await db.from("gvc_job_files").select("path,size,created_at").eq("job_id", job.id);
  (files || []).forEach((f: any) => {
    const base = String(f.path).split("/").pop() || "";
    if (!DOC.test(base) || !LIKELY.test(f.path) || /BOM|DXF|bend|drawing/i.test(base)) return;
    if (out.some((o) => o.name === base)) return;
    out.push({ id: `file:${f.path}`, name: base, size: f.size, from: "Saved on the job", subject: String(f.path).split("/").slice(-2, -1)[0] || "", at: f.created_at, likely: true });
  });
  return { job: name, suppliers: sups.map((s) => ({ name: s.name, status: s.status, quoteNo: s.quoteNo || "", total: s.total || "" })), docs: out };
}

function b64(u8: Uint8Array) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }

async function compare(db: any, job: any, ids: string[]) {
  if (!ids?.length) throw new Error("pick at least one quote");
  const blocks: any[] = []; const used: string[] = [];
  for (const id of ids.slice(0, 8)) {
    let data = "", name = "", mt = "";
    if (id.startsWith("mail:")) {
      const [, mid, aid] = id.split(":");
      const a = await graph(db, `/me/messages/${mid}/attachments/${aid}`);
      data = a.contentBytes; name = a.name; mt = a.contentType || "";
    } else if (id.startsWith("file:")) {
      const path = id.slice(5);
      const { data: blob, error } = await db.storage.from("gvc-parts").download(path);
      if (error || !blob) continue;
      data = b64(new Uint8Array(await blob.arrayBuffer())); name = path.split("/").pop() || path;
    } else continue;
    if (!data) continue;
    const isPdf = /\.pdf$/i.test(name) || /pdf/i.test(mt);
    const img = /\.png$/i.test(name) ? "image/png" : "image/jpeg";
    blocks.push({ type: "text", text: `Document ${used.length + 1}: "${name}"` });
    blocks.push(isPdf ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } } : { type: "image", source: { type: "base64", media_type: img, data } });
    used.push(name);
  }
  if (!blocks.length) throw new Error("couldn't open any of those files");
  const d = job.data || {};
  const tool = {
    name: "report", description: "The quote comparison for Kyle",
    input_schema: { type: "object", properties: {
      summary: { type: "string", description: "2-4 short lines, shop language: who is cheaper overall and by how much, the biggest differences, anything that makes the totals not apples-to-apples" },
      vendors: { type: "array", items: { type: "object", properties: {
        name: { type: "string" }, quote_no: { type: "string" }, date: { type: "string" }, total: { type: "string", description: "as written, with currency; say if before/after tax" },
        total_num: { type: "number", description: "pre-tax total as a number, if known" }, lead: { type: "string" }, terms: { type: "string", description: "freight, delivery, validity, payment, tax, cutting/handling charges" },
        doc: { type: "string", description: "document name it came from" } }, required: ["name"] } },
      lines: { type: "array", description: "Items lined up across vendors (same part/material on one row). Include every priced item.", items: { type: "object", properties: {
        item: { type: "string" }, qty: { type: "string" },
        prices: { type: "array", items: { type: "object", properties: { vendor: { type: "string" }, price: { type: "string", description: "line total as written, or 'not quoted'" }, unit: { type: "string" } }, required: ["vendor", "price"] } },
        low: { type: "string", description: "vendor with the lowest price, blank if only one quoted it" }, diff: { type: "string", description: "how much more the highest is than the lowest, $ and %" }, note: { type: "string" } }, required: ["item", "prices"] } },
      gaps: { type: "array", items: { type: "string" }, description: "items one vendor quoted and another didn't, quantity or material mismatches, things to ask about" },
    }, required: ["summary", "vendors", "lines"] },
  };
  const sys = `You compare supplier quotes for Kyle (shop lead at Gordeyville Customs, a fab shop in Grande Prairie). Job: ${d.name}. Suppliers on the job: ${(d.suppliers || []).map((s: any) => s.name + (s.quoteNo ? " #" + s.quoteNo : "")).join(", ") || "none listed"}.
Read every document. A document that isn't a quote (a drawing, a BOM Kyle sent, a signature) - ignore it and say so in gaps.
Line items up across vendors: same part or same material/size on one row even if worded differently. Use the vendors' own numbers - never estimate a price that isn't written. If one vendor quotes per piece and another per lot, compare like for like and say so. Point out what they charge more or less for, quantity/material differences, extra charges (cutting, freight, setup, minimums), lead times. Dollars as written (CAD).`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: sys, tools: [tool], tool_choice: { type: "tool", name: "report" },
      messages: [{ role: "user", content: [...blocks, { type: "text", text: "Compare these quotes." }] }] }),
  });
  const out = await r.json();
  if (!r.ok) throw new Error("Claude: " + (out?.error?.message || r.status));
  const tu = (out.content || []).find((c: any) => c.type === "tool_use");
  if (!tu) throw new Error("no report came back");
  return { job: d.name, used, report: tu.input };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const u = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: ok } = await u.rpc("gvc_is_member");
    if (!ok) return json({ error: "Not on the shop list" }, 403);
    const body = await req.json().catch(() => ({}));
    const db = admin();
    const { data: job } = await db.from("gvc_jobs").select("id,data").eq("id", body.job_id || "").maybeSingle();
    if (!job) return json({ error: "job not found" }, 404);
    if (body.action === "find") return json(await find(db, job));
    if (body.action === "compare") return json(await compare(db, job, body.docs || []));
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e).slice(0, 300) }, 500);
  }
});
