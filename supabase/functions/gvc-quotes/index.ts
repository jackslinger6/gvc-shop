// GVC Shop - Compare quotes (Supabase Edge Function "gvc-quotes"). Kyle, Nov 5 2026.
// On demand, nothing stored: a report only.
//   { action: "find", job_id }          -> quote documents for the job found in Outlook (+ files already saved on the job)
//   { action: "compare", job_id, docs } -> reads the chosen quotes and reports who is higher/lower on what
// Signed-in shop member only (same check as the rest of the app).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-gvc-key", "Access-Control-Allow-Methods": "POST, OPTIONS" };
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
const LIKELY = /quot|estimate|proposal|pricing|price|bid|FAB-\d/i;     // competing prices - ticked for Compare
const PRICED = /quot|estimate|proposal|pricing|price|bid|invoice|inv\d|ack|acknowledg|order|FAB-\d|^\d{6,}\.pdf$/i;   // any vendor doc with prices on it
const docType = (n: string) => /^O_?Ack|\back\b|acknowledg/i.test(n) ? "order ack" : /invoice|^inv/i.test(n) ? "invoice" : /quot|estimate|proposal|bid|FAB-\d/i.test(n) ? "quote" : "document";

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
      out.push({ id: `mail:${m.id}:${a.id}`, name: a.name, size: a.size, from: fromName, subject: m.subject, at: m.receivedDateTime, type: docType(a.name + " " + m.subject),
        likely: LIKELY.test(a.name) || (!!vendor && LIKELY.test(m.subject) && !/ack/i.test(a.name)) });
    }
  }
  // quote files already saved on the job (from earlier emails)
  const { data: files } = await db.from("gvc_job_files").select("path,size,created_at").eq("job_id", job.id);
  (files || []).forEach((f: any) => {
    const base = String(f.path).split("/").pop() || "";
    if (!DOC.test(base) || !LIKELY.test(f.path) || /BOM|DXF|bend|drawing/i.test(base)) return;
    if (out.some((o) => o.name === base)) return;
    out.push({ id: `file:${f.path}`, name: base, size: f.size, from: "Saved on the job", subject: String(f.path).split("/").slice(-2, -1)[0] || "", at: f.created_at, type: docType(base), likely: LIKELY.test(base) });
  });
  return { job: name, suppliers: sups.map((s) => ({ name: s.name, status: s.status, quoteNo: s.quoteNo || "", total: s.total || "" })), docs: out };
}

function b64(u8: Uint8Array) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }

/* Compare from the price lines already read into gvc_prices (the app reads each doc first, one request each),
   so this call is text-only and quick - no more 150 s timeouts with many PDFs. (Nov 5) */
async function compareLines(db: any, job: any, ids: string[]) {
  const { data: rows } = await db.from("gvc_prices").select("source,vendor,doc_type,doc_no,doc_date,doc_name,item,part_no,kind,material,size,length_ft,qty,unit,unit_price,line_total,per_ft,note").in("source", ids);
  const have = new Set((rows || []).map((r: any) => r.source)); const need = ids.filter((i) => !have.has(i));
  if (!rows?.length) throw new Error("no prices could be read off those documents");
  const d = job.data || {};
  const docs: any = {}; (rows || []).forEach((r: any) => { const k = r.source; (docs[k] = docs[k] || { vendor: r.vendor, type: r.doc_type, no: r.doc_no, date: r.doc_date, name: r.doc_name, lines: [] }).lines.push(
    [r.item, r.part_no, r.size, r.material, r.length_ft ? r.length_ft + "ft" : "", r.qty != null ? "qty " + r.qty + (r.unit ? " " + r.unit : "") : "", r.unit_price != null ? "@" + r.unit_price : "", r.line_total != null ? "= $" + r.line_total : "", r.per_ft != null ? "($" + r.per_ft + "/ft)" : "", r.note || ""].filter(Boolean).join(" | ")); });
  const text = Object.values(docs).map((x: any) => `=== ${x.vendor} · ${x.type || ""} ${x.no || ""} · ${x.date || ""} · ${x.name}\n${x.lines.join("\n")}`).join("\n\n");
  const used = Object.values(docs).map((x: any) => x.name);
  return { text, used, need, job: d.name };
}
async function compare(db: any, job: any, ids: string[]) {
  const pre = await compareLines(db, job, ids);
  if (pre) return await compareText(job, pre);
  return null;
}
async function compareOld(db: any, job: any, ids: string[]) {
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
Read every document. Order acknowledgements and invoices are prices already agreed, not competing bids - still list each as a vendor with its total. If no item was priced by two different vendors, say that plainly in the first line of the summary (e.g. "Nothing here overlaps - these are separate orders, not competing quotes") and still fill vendors with each document's total.
A document that isn't a quote (a drawing, a BOM Kyle sent, a signature) - ignore it and say so in gaps.
Line items up across vendors: same part or same material/size on one row even if worded differently. Use the vendors' own numbers - never estimate a price that isn't written. If one vendor quotes per piece and another per lot, compare like for like and say so. Point out what they charge more or less for, quantity/material differences, extra charges (cutting, freight, setup, minimums), lead times. Dollars as written (CAD).`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 16000, system: sys, tools: [tool],
      messages: [{ role: "user", content: [...blocks, { type: "text", text: "Compare these quotes. Answer only by calling the report tool." }] }] }),
  });
  const out = await r.json();
  if (!r.ok) throw new Error("Claude: " + (out?.error?.message || r.status));
  const tu = (out.content || []).find((c: any) => c.type === "tool_use");
  if (!tu) throw new Error("no report came back");
  return { job: d.name, used, report: tu.input };
}
async function compareText(job: any, pre: any) {
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
Read every document. Order acknowledgements and invoices are prices already agreed, not competing bids - still list each as a vendor with its total. If no item was priced by two different vendors, say that plainly in the first line of the summary (e.g. "Nothing here overlaps - these are separate orders, not competing quotes") and still fill vendors with each document's total.
A document that isn't a quote (a drawing, a BOM Kyle sent, a signature) - ignore it and say so in gaps.
Line items up across vendors: same part or same material/size on one row even if worded differently. Use the vendors' own numbers - never estimate a price that isn't written. If one vendor quotes per piece and another per lot, compare like for like and say so. Point out what they charge more or less for, quantity/material differences, extra charges (cutting, freight, setup, minimums), lead times. Dollars as written (CAD).`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 16000, system: sys, tools: [tool],
      messages: [{ role: "user", content: "Price lines read off each document (one block per document):\n\n" + pre.text + "\n\nCompare these quotes. Answer only by calling the report tool." }] }),
  });
  const out = await r.json();
  if (!r.ok) throw new Error("Claude: " + (out?.error?.message || r.status));
  const tu = (out.content || []).find((c: any) => c.type === "tool_use");
  if (!tu) throw new Error("no report came back");
  return { job: pre.job, used: pre.used, report: tu.input, missing: pre.need.length };
}

/* ---------- price history (Kyle, Nov 5): read every priced line off a vendor doc into gvc_prices ---------- */
async function docBlock(db: any, id: string) {
  if (id.startsWith("mail:")) { const [, mid, aid] = id.split(":"); const a = await graph(db, `/me/messages/${mid}/attachments/${aid}`);
    const m = await graph(db, `/me/messages/${mid}?$select=subject,from,receivedDateTime`);
    return { data: a.contentBytes, name: a.name, mt: a.contentType || "", from: m.from?.emailAddress?.name || "", fromAddr: m.from?.emailAddress?.address || "", subject: m.subject, at: m.receivedDateTime }; }
  const path = id.slice(5); const { data: blob } = await db.storage.from("gvc-parts").download(path);
  if (!blob) throw new Error("file gone");
  return { data: b64(new Uint8Array(await blob.arrayBuffer())), name: path.split("/").pop() || path, mt: "", from: "", fromAddr: "", subject: "", at: "" };
}
/* ---------- per-part prices (Kyle, Nov 5): every quote broken down to OUR part numbers ----------
   Lines that name our parts -> that price (a line for several parts is shared by flat area).
   Sheet / nest lines (Russel) -> the sheet cost is shared over our parts of that metal + thickness by flat area. */
const fam = (m: string) => /alum|\bal\b|5052|6061|3003/i.test(m || "") ? "alum" : /stain|\bss\b|304|316/i.test(m || "") ? "ss" : "steel";
const normP = (x: string) => String(x || "").toUpperCase().replace(/\s+/g, "").replace(/_+$/, "");
async function jobParts(db: any, jobId: string | null) {
  if (!jobId) return { jobNo: "", parts: [] as any[] };
  const { data: j } = await db.from("gvc_jobs").select("data").eq("id", jobId).maybeSingle();
  const jobNo = (String(j?.data?.name || "").match(NUM_RE) || [])[1] || "";
  if (!jobNo) return { jobNo: "", parts: [] };
  const { data: parts } = await db.from("gvc_job_parts").select("part_no,material,thickness,qty,flat_w,flat_h").eq("job_no", jobNo);
  return { jobNo, parts: parts || [] };
}
const area = (p: any) => Math.max(0.0001, (Number(p.flat_w) || 0) * (Number(p.flat_h) || 0)) * (Number(p.qty) || 1);
async function mapParts(db: any, jobId: string | null, jobNo: string, parts: any[], rows: any[], meta: any) {
  if (!jobNo || !parts.length || !rows.length) return 0;
  const byNo = new Map(parts.map((p) => [normP(p.part_no), p]));
  const out = new Map<string, any>(); const direct = new Set<string>();
  const add = (p: any, total: number, how: string, note: string) => {
    const k = normP(p.part_no); const o = out.get(k) || { part_no: p.part_no, material: p.material, qty: Number(p.qty) || 1, line_total: 0, how, note };
    o.line_total += total; if (how === "quoted") { o.how = "quoted"; o.note = note; } out.set(k, o); };
  // 1) lines that name our parts
  for (const r of rows) {
    const ps = [...new Set([...(r.parts || []), r.part_no].filter(Boolean).map(normP))].map((k) => byNo.get(k)).filter(Boolean);
    if (!ps.length || !(Number(r.line_total) > 0)) continue;
    const A = ps.reduce((s: number, p: any) => s + area(p), 0);
    ps.forEach((p: any) => { add(p, Number(r.line_total) * (ps.length > 1 ? area(p) / A : 1), "quoted", ps.length > 1 ? `one price for ${ps.length} parts, shared by size` : ""); direct.add(normP(p.part_no)); });
  }
  // 2) sheet / plate lines (nests): share by flat area over the job's parts of that metal + thickness not already priced
  const groups = new Map<string, { total: number; lines: string[] }>();
  for (const r of rows) {
    if ((r.parts || []).length || r.part_no || !(Number(r.line_total) > 0) || !(Number(r.thickness_in) > 0)) continue;
    if (!["plate", "sheet"].includes(r.kind || "")) continue;   // raw sheet/plate only - a cut part we can't match stays off the part table
    const key = (r.metal || fam(r.material || r.item)) + "|" + Number(r.thickness_in).toFixed(3);
    const g = groups.get(key) || { total: 0, lines: [] }; g.total += Number(r.line_total); g.lines.push(r.item); groups.set(key, g);
  }
  for (const [key, g] of groups) {
    const [m, t] = key.split("|"); const th = Number(t);
    const ps = parts.filter((p) => !direct.has(normP(p.part_no)) && fam(p.material) === m && Math.abs(Number(p.thickness) - th) <= Math.max(0.012, th * 0.06));
    if (!ps.length) continue;
    const A = ps.reduce((s: number, p: any) => s + area(p), 0);
    ps.forEach((p: any) => add(p, g.total * area(p) / A, "split", `share of ${g.lines.length > 1 ? g.lines.length + " sheet lines" : "the sheet"} ($${g.total.toFixed(2)}) by part size`));
  }
  const recs = [...out.values()].map((o) => ({ job_id: jobId, job_no: jobNo, vendor: meta.vendor, source: meta.source, doc_no: meta.doc_no, doc_date: meta.doc_date, doc_type: meta.doc_type, doc_name: meta.doc_name,
    part_no: o.part_no, material: o.material, qty: o.qty, line_total: Math.round(o.line_total * 100) / 100, unit_price: Math.round(o.line_total / (o.qty || 1) * 100) / 100, how: o.how, note: o.note || null }));
  await db.from("gvc_quote_parts").delete().eq("source", meta.source);
  for (let i = 0; i < recs.length; i += 200) await db.from("gvc_quote_parts").insert(recs.slice(i, i + 200));
  return recs.length;
}

async function extract(db: any, id: string, jobId: string | null) {
  const { count } = await db.from("gvc_prices").select("id", { count: "exact", head: true }).eq("source", id);
  const JP = await jobParts(db, jobId);
  if ((count || 0) > 0) {
    const { count: qp } = await db.from("gvc_quote_parts").select("id", { count: "exact", head: true }).eq("source", id);
    if (!JP.parts.length || (qp || 0) > 0) return { id, saved: 0, already: count };
    const { data: old } = await db.from("gvc_prices").select("*").eq("source", id);
    if ((old || []).some((r: any) => r.thickness_in != null || (r.parts || []).length)) {   // read with part info already - just map
      const o = old![0]; const n = await mapParts(db, jobId, JP.jobNo, JP.parts, old!, { vendor: o.vendor, source: id, doc_no: o.doc_no, doc_date: o.doc_date, doc_type: o.doc_type, doc_name: o.doc_name });
      return { id, saved: 0, parts: n }; }
    await db.from("gvc_prices").delete().eq("source", id);   // read before parts were tracked - read again with the job's part list
  }
  const d = await docBlock(db, id);
  const isPdf = /\.pdf$/i.test(d.name) || /pdf/i.test(d.mt);
  const tool = { name: "lines", description: "Every priced line on the document", input_schema: { type: "object", properties: {
    vendor: { type: "string", description: "supplier company (e.g. Russel Metals, Grandview Fabrication, Starfab)" }, doc_type: { type: "string", enum: ["quote", "order ack", "invoice", "other"] },
    doc_no: { type: "string" }, doc_date: { type: "string", description: "YYYY-MM-DD" }, job_ref: { type: "string", description: "our job/PO reference on the doc, e.g. 1086WT" },
    lines: { type: "array", items: { type: "object", properties: {
      item: { type: "string", description: "description as written" }, part_no: { type: "string", description: "our part number if the line names one (e.g. CENTERLOC.13-FW35)" },
      parts: { type: "array", items: { type: "string" }, description: "OUR part numbers this line prices, exactly as in the job's part list (empty for a sheet/nest/stock line)" },
      thickness_in: { type: "number", description: "plate/sheet thickness in decimal inches (3/8 = 0.375, 11GA = 0.1196, 10GA = 0.1345, .120 = 0.12)" },
      metal: { type: "string", enum: ["steel", "ss", "alum", "other"] },
      kind: { type: "string", enum: ["tube", "angle", "channel", "flat bar", "plate", "sheet", "round", "pipe", "beam", "laser part", "hardware", "service", "other"] },
      material: { type: "string", description: "grade/alloy e.g. A500 MS, 44W, 304 SS, 5052 AL" },
      size: { type: "string", description: "normalized size: HSS 2x2x1/8, HSS 5x3x1/4, L 2x2x1/4, C 4x5.4, FB 2-1/2x3/8, PL 3/16, SHT 14GA, RD 1, PIPE 2 SCH40, W 6x15. Fractions like 1/8, not decimals, where the doc uses gauge/fraction; wall thickness last." },
      length_ft: { type: "number" }, qty: { type: "number" }, unit: { type: "string", description: "ea, ft, lb, cwt, sheet, lot" },
      unit_price: { type: "number" }, line_total: { type: "number" }, note: { type: "string", description: "cutting charge, partial length, etc." } }, required: ["item"] } } }, required: ["vendor", "lines"] } };
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 12000, tools: [tool],
      system: "You read supplier documents for Gordeyville Customs (a fab shop) and pull out every line that has a price - material, cut parts, hardware (bolts, nuts, hinges, latches - Fastenal etc.), cutting/freight charges. Use the document's own numbers only. line_total is the line's extended price. Answer only by calling the lines tool." +
        (JP.parts.length ? `\nThis document is for job ${JP.jobNo}. Our part list (part number - material - qty): ${JP.parts.map((p: any) => `${p.part_no} - ${p.material} - ${p.qty}`).join("; ")}.\nFor every line that prices one or more of OUR parts, put those part numbers in parts (match names even when the vendor writes them slightly differently). Lines that price a whole sheet or a nest of parts get parts empty plus thickness_in and metal.` : ""),
      messages: [{ role: "user", content: [{ type: "text", text: `Document "${d.name}"${d.from ? ` from ${d.from} <${d.fromAddr}>` : ""}${d.subject ? `, email subject "${d.subject}"` : ""}${d.at ? `, received ${d.at.slice(0, 10)}` : ""}.` },
        isPdf ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: d.data } } : { type: "image", source: { type: "base64", media_type: /png/i.test(d.name) ? "image/png" : "image/jpeg", data: d.data } }] }] }) });
  const out = await r.json(); if (!r.ok) throw new Error("Claude: " + (out?.error?.message || r.status));
  const tu = (out.content || []).find((c: any) => c.type === "tool_use"); if (!tu) return { id, saved: 0 };
  const x = tu.input || {}; const date = /^\d{4}-\d{2}-\d{2}$/.test(x.doc_date || "") ? x.doc_date : (d.at ? d.at.slice(0, 10) : null);
  let job = jobId;
  if (!job && x.job_ref) { const n = String(x.job_ref).match(/\d{4}[A-Za-z]{0,3}/); if (n) { const { data: js } = await db.from("gvc_jobs").select("id,data"); const hit = (js || []).find((j: any) => String(j.data?.name || "").replace(/\s/g, "").toUpperCase().startsWith(n[0].toUpperCase())); job = hit?.id || null; } }
  const rows = (x.lines || []).filter((l: any) => l && l.item).map((l: any) => {
    const lt = Number(l.line_total) || (Number(l.unit_price) && Number(l.qty) ? Number(l.unit_price) * Number(l.qty) : null);
    let pf: number | null = null;
    if (l.unit === "ft" && Number(l.unit_price)) pf = Number(l.unit_price);
    else if (Number(l.length_ft) && lt && Number(l.qty) && ["tube", "angle", "channel", "flat bar", "round", "pipe", "beam"].includes(l.kind)) pf = lt / (Number(l.qty) * Number(l.length_ft));
    return { vendor: x.vendor || d.from || "?", doc_type: x.doc_type || docType(d.name), doc_no: x.doc_no || null, doc_date: date, doc_name: d.name, source: id, job_id: job,
      item: String(l.item).slice(0, 300), part_no: l.part_no || null, kind: l.kind || null, material: l.material || null, size: l.size || null, length_ft: Number(l.length_ft) || null,
      qty: Number(l.qty) || null, unit: l.unit || null, unit_price: Number(l.unit_price) || null, line_total: lt, per_ft: pf ? Math.round(pf * 10000) / 10000 : null, note: l.note || null,
      thickness_in: Number(l.thickness_in) || null, metal: l.metal || null, parts: Array.isArray(l.parts) && l.parts.length ? l.parts.map(String) : null };
  });
  if (rows.length) { const { error } = await db.from("gvc_prices").insert(rows);
    if (error) { for (const rw of rows) await db.from("gvc_prices").insert(rw); } }   // a duplicate line skips itself
  const np = await mapParts(db, job, JP.jobNo || (await jobParts(db, job)).jobNo, JP.parts.length ? JP.parts : (await jobParts(db, job)).parts, rows,
    { vendor: x.vendor || d.from || "?", source: id, doc_no: x.doc_no || null, doc_date: date, doc_type: x.doc_type || docType(d.name), doc_name: d.name });
  return { id, saved: rows.length, parts: np, vendor: x.vendor, doc_no: x.doc_no, date };
}
// vendor documents with prices in the last N days that aren't in price history yet
async function scan(db: any, days: number) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const seen = new Set<string>(); const { data: have } = await db.from("gvc_prices").select("source"); (have || []).forEach((h: any) => seen.add(h.source));
  const out: any[] = []; let url = `/me/messages?$filter=receivedDateTime ge ${since} and hasAttachments eq true&$select=id,subject,from,receivedDateTime&$orderby=receivedDateTime desc&$top=50`;
  for (let page = 0; page < 6 && url; page++) {
    const r = await graph(db, url);
    for (const m of r.value || []) {
      const from = String(m.from?.emailAddress?.address || "").toLowerCase(), fromName = m.from?.emailAddress?.name || from;
      if (ME.includes(from) || INTERNAL.test(fromName + " " + from)) continue;
      let atts: any[] = []; try { atts = (await graph(db, `/me/messages/${m.id}/attachments?$select=id,name,size`)).value || []; } catch (_) { continue; }
      for (const a of atts) { if (!/\.pdf$/i.test(a.name || "") || !PRICED.test(a.name + " " + m.subject)) continue; const id = `mail:${m.id}:${a.id}`; if (seen.has(id)) continue;
        out.push({ id, name: a.name, from: fromName, subject: m.subject, at: m.receivedDateTime, type: docType(a.name + " " + m.subject) }); }
    }
    url = r["@odata.nextLink"] ? String(r["@odata.nextLink"]).replace("https://graph.microsoft.com/v1.0", "") : "";
  }
  return { docs: out };
}

/* the job's parts x every vendor's price for them (no Claude - instant) */
async function partsTable(db: any, jobId: string) {
  const JP = await jobParts(db, jobId);
  const { data: qp } = await db.from("gvc_quote_parts").select("*").eq("job_id", jobId).order("doc_date");
  const { data: docs } = await db.from("gvc_prices").select("source,vendor,doc_no,doc_date,doc_type,doc_name,line_total").eq("job_id", jobId);
  const totals: any = {}; (docs || []).forEach((r: any) => { const t = totals[r.source] = totals[r.source] || { source: r.source, vendor: r.vendor, doc_no: r.doc_no, doc_date: r.doc_date, doc_type: r.doc_type, doc_name: r.doc_name, total: 0, lines: 0 }; t.total += Number(r.line_total) || 0; t.lines++; });
  return { job_no: JP.jobNo, parts: JP.parts, prices: qp || [], docs: Object.values(totals) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    let ok = false; const key = req.headers.get("x-gvc-key");
    if (key) { const { data } = await admin().from("gvc_secret").select("v").eq("k", "files_key").maybeSingle(); ok = !!data && data.v === key; }
    else { const u = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
      const { data } = await u.rpc("gvc_is_member"); ok = !!data; }
    if (!ok) return json({ error: "Not on the shop list" }, 403);
    const body = await req.json().catch(() => ({}));
    const db = admin();
    // the document itself (no Claude) - for reading prices by hand / in the browser
    // text of each document into gvc_doc_text (no Claude) - so prices can be read in without API credit
    if (body.action === "totext") { const { extractText, getDocumentProxy } = await import("npm:unpdf@0.12.1"); const out: any[] = [];
      for (const it of (body.docs || []).slice(0, 8)) { try { const d = await docBlock(db, it.id);
          const bin = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0)); const pdf = await getDocumentProxy(bin);
          const { text } = await extractText(pdf, { mergePages: false }); const t = (text as string[]).map((x, i) => x + "\n--- page " + (i + 1) + " ---").join("\n").replace(/[ \t]+/g, " ");
          await db.from("gvc_doc_text").upsert({ source: it.id, name: d.name, vendor: d.from || it.from || "", subject: d.subject || it.subject || "", at: d.at || it.at || null, type: it.type || null, text: t });
          out.push({ name: d.name, chars: t.length }); } catch (e) { out.push({ name: it.name, err: String((e as Error).message || e).slice(0, 120) }); } }
      return json({ out }); }
    if (body.action === "raw") { const d = await docBlock(db, String(body.doc || "")); return json({ name: d.name, from: d.from, subject: d.subject, at: d.at, b64: d.data }); }
    if (body.action === "remap") { const ids: string[] = body.docs || []; const out: any[] = [];
      for (const id of ids) { await db.from("gvc_quote_parts").delete().eq("source", id); const { data: rws } = await db.from("gvc_prices").select("*").eq("source", id);
        if (!rws?.length) { out.push({ id, parts: 0 }); continue; } const jid = body.job_id || rws[0].job_id; const JP = await jobParts(db, jid); const o = rws[0];
        out.push({ id, parts: await mapParts(db, jid, JP.jobNo, JP.parts, rws, { vendor: o.vendor, source: id, doc_no: o.doc_no, doc_date: o.doc_date, doc_type: o.doc_type, doc_name: o.doc_name }) }); }
      return json({ out }); }
    if (body.action === "parts_table") return json(await partsTable(db, body.job_id));
    if (body.action === "scan") return json(await scan(db, Math.min(365, Number(body.days) || 90)));
    if (body.action === "extract") return json(await extract(db, String(body.doc || ""), body.job_id || null));
    const { data: job } = await db.from("gvc_jobs").select("id,data").eq("id", body.job_id || "").maybeSingle();
    if (!job) return json({ error: "job not found" }, 404);
    if (body.action === "find") return json(await find(db, job));
    if (body.action === "compare") return json(await compare(db, job, body.docs || []));
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e).slice(0, 300) }, 500);
  }
});
