// GVC Shop - save an email's attachments as the job's paper trail (Supabase Edge Function "gvc-mail-files").
// Called by the database (trigger on gvc_suggestions when changes.files is set) with header x-gvc-key,
// or from the app by a signed-in shop member: { suggestion_id }  or  { message_id: "<internetMessageId>", job_id, parts }.
//  - Finds the message in kyle.gvc's mailbox through Microsoft Graph (same Outlook connection as gvc-ai).
//  - Saves every attachment to storage gvc-parts/jobs/<job_no>/mail/<date> <subject>/..., zips unpacked too,
//    and records each file in gvc_job_files.
//  - If changes.files.parts is true (an order Kyle sent): every DXF named like
//      "<part> ________ <material> - QTY n.dxf"  /  "<part> - <material> - QTY n.dxf"  /  "<material> <part> (QTY n).dxf"
//    becomes a row in gvc_job_parts (the job's parts list = the count list when the order arrives).
//    Existing rows keep their name, assembly, bend drawing and PDF; the DXF, qty and material follow what was sent.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { unzipSync } from "npm:fflate@0.8.2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-gvc-key", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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
async function graph(db: any, path: string, raw = false): Promise<any> {
  const r = await fetch("https://graph.microsoft.com/v1.0" + path, { headers: { Authorization: "Bearer " + (await msToken(db)) } });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error("Outlook: " + (j?.error?.message || r.status)); }
  return raw ? new Uint8Array(await r.arrayBuffer()) : r.json();
}

/* ---------- names, materials ---------- */
const clean = (s: string) => s.replace(/[\\#%?*:|"<>{}^~`\[\]]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
const kindOf = (n: string) => { const e = (n.split(".").pop() || "").toLowerCase();
  return e === "dxf" ? "dxf" : e === "pdf" ? "pdf" : e === "zip" ? "zip" : ["xlsx", "xls", "csv"].includes(e) ? "sheet" : ["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(e) ? "image" : ["step", "stp", "sldprt", "sldasm", "f3d", "f3z"].includes(e) ? "model" : "other"; };
const CT: Record<string, string> = { dxf: "application/dxf", pdf: "application/pdf", zip: "application/zip", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv" };
const ctOf = (n: string) => CT[(n.split(".").pop() || "").toLowerCase()] || "application/octet-stream";
const GA: Record<string, number> = { "7": 0.1793, "8": 0.1644, "10": 0.1345, "11": 0.1196, "12": 0.1046, "14": 0.0747, "16": 0.0598, "18": 0.0478, "20": 0.0359 };
function thkOf(mat: string): number | null {
  const g = mat.match(/(\d+)\s*GA/i); if (g && GA[g[1]]) return GA[g[1]];
  const f = mat.match(/(?:^|\s)(\d+)?-?(\d+)\/(\d+)"?/); if (f) return (f[1] ? +f[1] : 0) + +f[2] / +f[3];
  const d = mat.match(/(\d*\.\d+)/); if (d) return +d[1];
  return null;
}
const MATRX = /^((?:\d+\s*GA|\d*\.\d+"?|\d+\/\d+"?)\s+(?:SS\s*304|SS\s*316|SS|MS|AL|ALUM\w*|STEEL|HRPO|CR|GALV\w*)(?:\s+#\d+|\s+2B)?)\s+(.+)$/i;
function parseName(file: string, folder: string): { part: string; mat: string; qty: number } | null {
  const n = file.replace(/\.dxf$/i, "").trim();
  let m = n.match(/^(.*?)\s*_{3,}\s*(.*?)\s*-\s*QTY\s*(\d+)/i);
  if (m) return { part: m[1].trim(), mat: m[2].trim(), qty: +m[3] };
  m = n.match(/^(.*?)\s+-\s+(.*?)\s+-\s+QTY\s*(\d+)/i);
  if (m) return { part: m[1].trim(), mat: m[2].trim(), qty: +m[3] };
  m = n.match(/^(.*?)\s*\(\s*QTY\s*(\d+)\s*\)/i);
  if (m) { const rest = m[1].trim(); const mm = rest.match(MATRX);
    return mm ? { part: mm[2].trim(), mat: mm[1].trim(), qty: +m[2] } : { part: rest, mat: folder, qty: +m[2] }; }
  m = n.match(/^(.*?)\s*-?\s*QTY\s*(\d+)\s*$/i);
  if (m) return { part: m[1].replace(/[-_\s]+$/, "").trim(), mat: folder, qty: +m[2] };
  return null;
}

/* ---------- DXF: extents + small SVG picture ---------- */
function dxfShape(txt: string) {
  const L = txt.split(/\r?\n/).map((s) => s.trim());
  let i = 0; while (i < L.length - 1 && !(L[i] === "2" && L[i + 1] === "ENTITIES")) i++;
  const ents: any[] = [];
  for (; i < L.length - 1; i += 2) {
    if (L[i] !== "0") continue;
    const t = L[i + 1]; if (t === "ENDSEC") break;
    if (!["LINE", "ARC", "CIRCLE", "LWPOLYLINE", "SPLINE", "POLYLINE", "VERTEX"].includes(t)) continue;
    const e: any = { t, xs: [], ys: [] }; let j = i + 2;
    for (; j < L.length - 1 && L[j] !== "0"; j += 2) {
      const c = L[j], v = L[j + 1];
      if (c === "8") e.layer = v; else if (c === "10") e.xs.push(+v); else if (c === "20") e.ys.push(+v);
      else if (c === "11") e.x2 = +v; else if (c === "21") e.y2 = +v; else if (c === "40") e.r = +v;
      else if (c === "50") e.a0 = +v; else if (c === "51") e.a1 = +v; else if (c === "70") e.flag = +v; else if (c === "230") e.ez = +v;
    }
    // Object coordinate system with a downward extrusion (Fusion/SolidWorks often write circles and arcs that way): X is mirrored
    if (e.ez < 0 && e.t !== "LINE") { e.xs = e.xs.map((x: number) => -x);
      if (e.t === "ARC") { const a0 = e.a0 || 0, a1 = e.a1 || 0; e.a0 = 180 - a1; e.a1 = 180 - a0; } }
    ents.push(e); i = j - 2;
  }
  const pts: [number, number][] = [];
  const isMark = (e: any) => /ENGRAV|BEND|MARK|ETCH/i.test(e.layer || "");
  const segs: { d: string; mark: boolean }[] = [];
  let poly: any = null;
  for (const e of ents) {
    if (e.t === "LINE" && e.xs.length) { pts.push([e.xs[0], e.ys[0]], [e.x2, e.y2]); segs.push({ d: `M${e.xs[0]} ${e.ys[0]}L${e.x2} ${e.y2}`, mark: isMark(e) }); }
    else if (e.t === "CIRCLE" && e.xs.length) { const [x, y, r] = [e.xs[0], e.ys[0], e.r];
      pts.push([x - r, y - r], [x + r, y + r]); segs.push({ d: `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`, mark: isMark(e) }); }
    else if (e.t === "ARC" && e.xs.length) { const [x, y, r] = [e.xs[0], e.ys[0], e.r]; let a0 = (e.a0 || 0) * Math.PI / 180, a1 = (e.a1 || 0) * Math.PI / 180; if (a1 <= a0) a1 += 2 * Math.PI;
      const P = (a: number): [number, number] => [x + r * Math.cos(a), y + r * Math.sin(a)];
      for (let k = 0; k <= 12; k++) pts.push(P(a0 + (a1 - a0) * k / 12));
      const s = P(a0), f = P(a1); segs.push({ d: `M${s[0]} ${s[1]}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f[0]} ${f[1]}`, mark: isMark(e) }); }
    else if ((e.t === "LWPOLYLINE" || e.t === "SPLINE") && e.xs.length) {
      e.xs.forEach((x: number, k: number) => pts.push([x, e.ys[k]]));
      segs.push({ d: "M" + e.xs.map((x: number, k: number) => `${x} ${e.ys[k]}`).join("L") + ((e.flag & 1) ? "Z" : ""), mark: isMark(e) }); }
    else if (e.t === "POLYLINE") poly = { xs: [], ys: [], mark: isMark(e) };
    else if (e.t === "VERTEX" && poly && e.xs.length) { poly.xs.push(e.xs[0]); poly.ys.push(e.ys[0]); pts.push([e.xs[0], e.ys[0]]); }
  }
  if (poly && poly.xs.length) segs.push({ d: "M" + poly.xs.map((x: number, k: number) => `${x} ${poly.ys[k]}`).join("L"), mark: poly.mark });
  const cut = pts.filter((p) => isFinite(p[0]) && isFinite(p[1]));
  if (!cut.length) return null;
  const xs = cut.map((p) => p[0]), ys = cut.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = x1 - x0, h = y1 - y0, pad = Math.max(w, h) * 0.04 || 0.1, sw = Math.max(w, h) / 220 || 0.01;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0 - pad} ${-(y1 + pad)} ${w + 2 * pad} ${h + 2 * pad}" width="400" height="${Math.max(60, Math.round(400 * (h + 2 * pad) / (w + 2 * pad)))}"><rect x="${x0 - pad}" y="${-(y1 + pad)}" width="${w + 2 * pad}" height="${h + 2 * pad}" fill="#fff"/><g transform="scale(1,-1)" fill="none" stroke-linecap="round">` +
    segs.map((s) => `<path d="${s.d}" stroke="${s.mark ? "#c0392b" : "#111"}" stroke-width="${sw}"/>`).join("") + `</g></svg>`;
  const bends = ents.filter((e) => e.t === "LINE" && isMark(e)).length;
  return { w: Math.round(w * 1000) / 1000, h: Math.round(h * 1000) / 1000, svg, marks: bends };
}

/* ---------- main ---------- */
async function run(db: any, opt: { sid?: string; message_id?: string; job_id?: string | null; parts?: boolean; supplier?: string }) {
  let s: any = null;
  if (opt.sid) {
    const { data } = await db.from("gvc_suggestions").select("id,source_ref,job_id,changes,from_name").eq("id", opt.sid).maybeSingle();
    if (!data) throw new Error("no such suggestion");
    s = data;
  }
  const f = s?.changes?.files || {};
  const mid = opt.message_id || String(s?.source_ref || "").replace(/^mail:/, "").replace(/>#[^>]*$/, ">");
  if (!mid.startsWith("<")) throw new Error("not an email: " + mid);
  const jobId = opt.job_id ?? s?.job_id ?? null;
  const wantParts = opt.parts ?? !!f.parts;
  let job: any = null;
  if (jobId) { const { data } = await db.from("gvc_jobs").select("id,data").eq("id", jobId).maybeSingle(); job = data; }
  // same job-number rule as the app (www/jobs-extra.js NUM_RE); a job without a number files under its id
  const num = String(job?.data?.name || "").match(/^\s*(\d{4}[A-Za-z0-9_]{0,4}|INV)\b/i)?.[1]?.toUpperCase() || "";
  const jobNo = job ? (num || "job-" + job.id) : "_unfiled";

  const found = await graph(db, `/me/messages?$filter=${encodeURIComponent(`internetMessageId eq '${mid.replace(/'/g, "''")}'`)}&$select=id,subject,from,toRecipients,sentDateTime,receivedDateTime,hasAttachments`);
  const msg = found?.value?.[0];
  if (!msg) throw new Error("email not found in the mailbox");
  const atts = (await graph(db, `/me/messages/${msg.id}/attachments?$select=id,name,size,contentType,isInline`)).value || [];
  const when = msg.sentDateTime || msg.receivedDateTime || new Date().toISOString();
  const folder = `jobs/${clean(jobNo)}/mail/${when.slice(0, 10)} ${clean(msg.subject || "email").slice(0, 70)}`;
  const base = { job_id: jobId, job_no: jobNo, source_ref: s?.source_ref || "mail:" + mid, subject: msg.subject || "", mail_from: msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || "", mail_at: when, supplier: f.supplier || opt.supplier || null };

  const files: any[] = []; const dxfs: { name: string; folder: string; path: string; bytes: Uint8Array }[] = [];
  const put = async (path: string, name: string, bytes: Uint8Array, inZip: string | null) => {
    const { error } = await db.storage.from("gvc-parts").upload(path, bytes, { upsert: true, contentType: ctOf(name) });
    if (error) throw new Error("storage " + name + ": " + error.message);
    files.push({ ...base, path, name, size: bytes.length, content_type: ctOf(name), kind: kindOf(name), in_zip: inZip });
  };
  for (const a of atts) {
    if (a.isInline || a["@odata.type"] === "#microsoft.graph.itemAttachment" || a["@odata.type"] === "#microsoft.graph.referenceAttachment") continue;
    const bytes: Uint8Array = await graph(db, `/me/messages/${msg.id}/attachments/${a.id}/$value`, true);
    const nm = clean(a.name || "attachment");
    await put(`${folder}/${nm}`, nm, bytes, null);
    if (kindOf(nm) === "dxf") dxfs.push({ name: nm, folder: "", path: `${folder}/${nm}`, bytes });
    if (kindOf(nm) === "zip") {
      let inner: Record<string, Uint8Array> = {};
      try { inner = unzipSync(bytes); } catch (_e) { continue; }
      const zdir = `${folder}/${nm.replace(/\.zip$/i, "")}`;
      for (const [p, b] of Object.entries(inner)) {
        if (p.endsWith("/") || !b.length || /(^|\/)(__MACOSX|\.DS_Store)/.test(p)) continue;
        const parts = p.split("/").map(clean); const fn = parts.pop()!;
        const path = `${zdir}/${parts.length ? parts.join("/") + "/" : ""}${fn}`;
        await put(path, fn, b, nm);
        if (kindOf(fn) === "dxf") dxfs.push({ name: fn, folder: (parts[parts.length - 1] || "").replace(/^\d+\s+/, ""), path, bytes: b });
      }
    }
  }
  if (files.length) {
    const { error } = await db.from("gvc_job_files").upsert(files, { onConflict: "path" });
    if (error) throw new Error("files table: " + error.message);
  }

  // parts list from the order's DXFs
  let nParts = 0, partsNote = "";
  if (wantParts && job && !num) partsNote = " (job has no number yet - give it one and use Get files again to fill the count list)";
  if (wantParts && job && num && dxfs.length) {
    const { data: have } = await db.from("gvc_job_parts").select("part_no,thumb_path,name").eq("job_no", jobNo);
    const old = new Map((have || []).map((r: any) => [r.part_no, r]));
    const rows: any[] = [];
    for (const d of dxfs) {
      const p = parseName(d.name, d.folder); if (!p || !p.part) continue;
      const sh = dxfShape(new TextDecoder().decode(d.bytes));
      const prev: any = old.get(p.part);
      let thumb = prev?.thumb_path || null;
      if (!thumb && sh) { thumb = `jobs/${clean(jobNo)}/thumb/${clean(p.part)}.svg`;
        await db.storage.from("gvc-parts").upload(thumb, new TextEncoder().encode(sh.svg), { upsert: true, contentType: "image/svg+xml" }); }
      const row: any = { job_no: jobNo, part_no: p.part, material: p.mat || null, thickness: thkOf(p.mat || ""), qty: p.qty, dxf_path: d.path,
        flat_w: sh ? Math.max(sh.w, sh.h) : null, flat_h: sh ? Math.min(sh.w, sh.h) : null, thumb_path: thumb,
        source: `Order email ${when.slice(0, 10)}: ${msg.subject || ""}`.slice(0, 200), updated_at: new Date().toISOString() };
      if (!prev) row.name = p.part;
      rows.push(row);
    }
    // same part twice in one order (e.g. two folders) - keep the higher count
    const byPart = new Map<string, any>(); rows.forEach((r) => { const o = byPart.get(r.part_no); if (!o || r.qty > o.qty) byPart.set(r.part_no, r); });
    const up = [...byPart.values()].map((r) => { Object.keys(r).forEach((k) => r[k] === undefined && delete r[k]); return r; });
    for (let i = 0; i < up.length; i += 200) {
      const { error } = await db.from("gvc_job_parts").upsert(up.slice(i, i + 200), { onConflict: "job_no,part_no" });
      if (error) throw new Error("parts: " + error.message);
    }
    nParts = up.length;
  }

  const note = `${files.length} file${files.length === 1 ? "" : "s"} saved` + (nParts ? `, ${nParts} parts in the count list` : "") + partsNote;
  if (job && files.length) {
    const { data: fresh } = await db.from("gvc_jobs").select("data").eq("id", job.id).maybeSingle();
    const d = fresh?.data || job.data;
    d.log = [...(d.log || []), { at: new Date().toISOString(), text: `Email "${msg.subject}": ${note} (Files on the job card)`, auto: true }];
    await db.from("gvc_jobs").update({ data: d, updated_at: new Date().toISOString() }).eq("id", job.id);
  }
  if (s) await db.from("gvc_suggestions").update({ files_status: "done: " + note, files_at: new Date().toISOString() }).eq("id", s.id);
  return { ok: true, files: files.length, parts: nParts, folder };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = admin();
  let body: any = {};
  try { body = await req.json(); } catch (_e) { /* empty */ }
  try {
    const key = req.headers.get("x-gvc-key");
    let ok = false;
    if (key) { const { data } = await db.from("gvc_secret").select("v").eq("k", "files_key").maybeSingle(); ok = !!data && data.v === key; }
    else {
      const u = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
      const { data } = await u.rpc("gvc_is_member"); ok = !!data;
    }
    if (!ok) return json({ error: "not allowed" }, 403);
    return json(await run(db, { sid: body.suggestion_id, message_id: body.message_id, job_id: body.job_id, parts: body.parts, supplier: body.supplier }));
  } catch (e) {
    const m = String((e as Error)?.message || e).slice(0, 300);
    if (body?.suggestion_id) await db.from("gvc_suggestions").update({ files_status: "error: " + m, files_at: new Date().toISOString() }).eq("id", body.suggestion_id);
    return json({ error: m }, 500);
  }
});
