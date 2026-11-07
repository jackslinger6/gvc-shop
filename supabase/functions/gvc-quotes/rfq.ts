// Robin's order tracker (Nov 6 2026): find quote emails and read one quote into lines matched to the order's items.
// Mailbox: Robin's own once she connects it (gvc_ms id 'robin'); until then Kyle's ('main') - and then Robin only sees
// emails she forwarded to Kyle, not the rest of his mail.
// @ts-nocheck
const tok: Record<string, string> = {};
async function token(db, box) {
  if (tok[box]) return tok[box];
  const { data: row } = await db.from("gvc_ms").select("refresh_token").eq("id", box).maybeSingle();
  if (!row?.refresh_token) throw new Error(box === "robin" ? "Robin's email isn't connected yet" : "Outlook isn't connected");
  const body = new URLSearchParams({ client_id: Deno.env.get("MS_CLIENT_ID") || "", client_secret: Deno.env.get("MS_CLIENT_SECRET") || "", grant_type: "refresh_token", refresh_token: row.refresh_token, scope: "offline_access Mail.ReadWrite User.Read" });
  const r = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", { method: "POST", body });
  const t = await r.json();
  if (!r.ok || !t.access_token) throw new Error("Email sign-in expired - connect it again. " + (t.error_description || t.error || ""));
  if (t.refresh_token && t.refresh_token !== row.refresh_token) await db.from("gvc_ms").update({ refresh_token: t.refresh_token, updated_at: new Date().toISOString() }).eq("id", box);
  return (tok[box] = t.access_token);
}
async function g(db, box, path) {
  const r = await fetch("https://graph.microsoft.com/v1.0" + path, { headers: { Authorization: "Bearer " + (await token(db, box)), ConsistencyLevel: "eventual" } });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error("Outlook: " + (j?.error?.message || r.status)); }
  return r.json();
}
export async function boxFor(db) { const { data } = await db.from("gvc_ms").select("id,email").eq("id", "robin").maybeSingle(); return data ? { box: "robin", email: data.email } : { box: "main", email: "" }; }
const QUOTEY = /quot|pricing|price|estimate|bid|proposal|rfq/i;
const ROBIN = /robin\.gvc@hotmail\.com/i;

export async function mailList(db, role, body) {
  const { box, email } = await boxFor(db);
  const sel = "$select=id,subject,from,receivedDateTime,hasAttachments,bodyPreview";
  let path;
  const q = String(body.q || "").replace(/["\\]/g, "").trim();
  if (q) path = `/me/messages?$search="${encodeURIComponent(q)}"&$top=40&${sel}`;
  else { const since = new Date(Date.now() - Math.min(365, Number(body.days) || 60) * 864e5).toISOString();
    path = `/me/messages?$filter=receivedDateTime ge ${since}&$orderby=receivedDateTime desc&$top=100&${sel}`; }
  const r = await g(db, box, path);
  let msgs = (r.value || []).map((m) => ({ id: m.id, subject: m.subject || "(no subject)", from: m.from?.emailAddress?.name || "", fromAddr: m.from?.emailAddress?.address || "", at: m.receivedDateTime, att: !!m.hasAttachments, preview: String(m.bodyPreview || "").slice(0, 220) }));
  if (box === "main" && role !== "admin") msgs = msgs.filter((m) => ROBIN.test(m.fromAddr));   // Kyle's mailbox: only what Robin forwarded
  if (!q && !body.all) msgs = msgs.filter((m) => QUOTEY.test(m.subject + " " + m.preview));
  msgs.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { box, email, msgs };
}

const strip = (h) => String(h || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, "\n").replace(/<\/t[dh]>/gi, " | ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t\u00a0]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

export async function readQuote(db, body, MODEL) {
  const { box } = await boxFor(db);
  const id = String(body.msg || ""); if (!id) throw new Error("no email picked");
  const m = await g(db, box, `/me/messages/${id}?$select=subject,from,receivedDateTime,body`);
  const text = strip(m.body?.content).slice(0, 40000);
  const atts = ((await g(db, box, `/me/messages/${id}/attachments?$select=id,name,contentType,size,isInline`)).value || []);
  const docs = atts.filter((a) => /\.pdf$/i.test(a.name || "") && a.size < 8e6).slice(0, 3);
  const imgs = atts.filter((a) => !a.isInline && /\.(jpe?g|png)$/i.test(a.name || "") && a.size > 60000 && a.size < 5e6).slice(0, 2);
  const blocks = [];
  for (const a of [...docs, ...imgs]) { const f = await g(db, box, `/me/messages/${id}/attachments/${a.id}`);
    blocks.push({ type: "text", text: `Attachment "${a.name}":` });
    blocks.push(/\.pdf$/i.test(a.name) ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.contentBytes } }
      : { type: "image", source: { type: "base64", media_type: /png/i.test(a.name) ? "image/png" : "image/jpeg", data: f.contentBytes } }); }
  const items = (body.items || []).map((x, i) => `${i}: ${x}`).join("\n");
  const tool = { name: "quote", description: "The supplier's quote", input_schema: { type: "object", properties: {
    vendor: { type: "string", description: "the SUPPLIER company that quoted (e.g. Fastenal, Gregg Distributors, RPSI, Risley Steel, Price Steel) - never GordeyVille Customs / Robin" },
    contact: { type: "string" }, quote_no: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD the supplier sent it" },
    total: { type: "number", description: "pre-tax total of the priced lines" }, valid: { type: "string", description: "how long the prices are good for" },
    lead: { type: "string", description: "availability / when it can be ready, per the supplier" }, terms: { type: "string", description: "freight, FOB/pickup, tax, cutting, payment - short" },
    note: { type: "string", description: "one short line: anything Robin must know (items not available, substitutions, partial)" },
    requested: { type: "array", items: { type: "string" }, description: "the items GordeyVille ASKED for, if the request is visible in the thread (e.g. Robin's original email) - one line each, with qty/length if given" },
    lines: { type: "array", items: { type: "object", properties: {
      item: { type: "string", description: "the item as the supplier wrote it (part no + description)" }, qty: { type: "number" }, unit: { type: "string", description: "ea, ft, length, box, lb..." },
      unit_price: { type: "number" }, line_total: { type: "number" }, note: { type: "string", description: "length, not in stock, substitute, etc." },
      match: { type: "integer", description: "number of OUR requested item this line prices (from the list given), or -1 if none matches" } }, required: ["item", "match"] } } },
    required: ["vendor", "lines"] } };
  const sys = `You read supplier quotes for Robin, the parts person at GordeyVille Customs (fab shop, Grande Prairie AB). The email may be a forward - the supplier's reply is inside it; the supplier is whoever sent the quote, never GordeyVille/Robin.
Read the prices from the email text and the attachments. Use the supplier's own numbers only - never estimate. line_total = extended price before tax. Skip tax/total rows as lines, but include freight, cutting or handling charges as lines (match -1).
${items ? `OUR ITEMS for this order (number: item):\n${items}\nFor each priced line set match to the number of our item it is for - same part even if worded differently (sizes like 2 1/2 x 3/8 flat bar = 3/8 X 2 1/2 HR FLAT). -1 if it isn't one of ours.` : "This order has no item list yet - set match -1 on every line, and fill requested if the original request is visible."}
Answer only by calling the quote tool.`;
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 12000, system: sys, tools: [tool], tool_choice: { type: "tool", name: "quote" },
      messages: [{ role: "user", content: [{ type: "text", text: `Email "${m.subject}" from ${m.from?.emailAddress?.name || ""} <${m.from?.emailAddress?.address || ""}>, received ${String(m.receivedDateTime).slice(0, 10)}:\n\n${text}` }, ...blocks] }] }) });
  const out = await r.json();
  if (!r.ok) { const e = out?.error?.message || String(r.status); throw new Error(/credit balance/i.test(e) ? "The Claude account the app uses is out of credit - top it up at console.anthropic.com, then try again." : "Claude: " + e); }
  const tu = (out.content || []).find((c) => c.type === "tool_use"); if (!tu) throw new Error("couldn't read a quote in that email");
  const x = tu.input || {};
  x.lines = (x.lines || []).filter((l) => l && l.item).map((l) => ({ ...l, line_total: Number(l.line_total) || (Number(l.unit_price) && Number(l.qty) ? Math.round(l.unit_price * l.qty * 100) / 100 : null) }));
  if (!(Number(x.total) > 0)) { const s = x.lines.reduce((a, l) => a + (Number(l.line_total) || 0), 0); x.total = s ? Math.round(s * 100) / 100 : null; }
  x.src = { msg: id, subject: m.subject, from: m.from?.emailAddress?.name || "", at: m.receivedDateTime, files: [...docs, ...imgs].map((a) => a.name) };
  return x;
}

export async function msStartRobin(db) {
  if (!Deno.env.get("MS_CLIENT_ID")) throw new Error("Outlook isn't set up on the server (MS_CLIENT_ID missing)");
  const state = "robin-" + crypto.randomUUID();
  const { error } = await db.from("gvc_ms_state").insert({ state }); if (error) throw new Error(error.message);
  const q = new URLSearchParams({ client_id: Deno.env.get("MS_CLIENT_ID"), response_type: "code", redirect_uri: (Deno.env.get("SUPABASE_URL") || "") + "/functions/v1/gvc-ms-auth", response_mode: "query", scope: "offline_access Mail.ReadWrite User.Read", state, prompt: "select_account", login_hint: "robin.gvc@hotmail.com" });
  return { url: "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?" + q.toString() };
}
