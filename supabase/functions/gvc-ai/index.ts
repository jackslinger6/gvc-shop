// GVC Shop AI function (Supabase Edge Function "gvc-ai").
// Keys live in Supabase secrets, never in the app: ANTHROPIC_API_KEY, OPENAI_API_KEY.
// Actions:
//   { action: "suggest", items: [{ ref, source, from, at, text }] }  -> Claude proposes job-board updates
//   { action: "recording", path, at }                                 -> Whisper transcribes gvc-audio/<path>, then suggest
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODEL = Deno.env.get("GVC_MODEL") || "claude-sonnet-5-5";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const STAGES = {
  released: "Pipeline: Released to Me", drawings: "Pipeline: Check Drawings", dxfs: "Pipeline: Make DXFs",
  prep: "Orders: Preparing Order", quote: "Orders: Quote Requested", prod: "Orders: In Production",
  pickup: "Orders: Ready to Pick Up", arrived: "Orders: Arrived - To Count", recv: "Orders: Received",
  bending: "Shop floor: Bending", fab: "Shop floor: Fabrication", paint: "Shop floor: Paint",
  assembly: "Shop floor: Assembly / Install", done: "Shop floor: Done",
};
const SUP_STATUS = ["sent", "replied", "quote", "approved", "production", "ready", "arrived", "received", "hold", "declined"];

const TOOL = {
  name: "propose_updates",
  description: "Propose job-board updates. One entry per message that contains real job news. Skip chit-chat and personal messages (give them job_id null and no changes, with relevant=false).",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ref: { type: "string", description: "The ref of the message this comes from" },
            relevant: { type: "boolean", description: "false if the message has nothing to do with shop jobs and holds no task for Kyle" },
            job_id: { type: ["string", "null"], description: "id of the existing job it is about, or null" },
            new_job_name: { type: ["string", "null"], description: "Only if it clearly describes a new job not on the board. Start with the job number if the message gives one, e.g. '2015G - Hitch rack'" },
            summary: { type: "string", description: "One short plain sentence for Kyle: what happened and what you suggest" },
            stage: { type: ["string", "null"], enum: [...Object.keys(STAGES), null], description: "Move the job to this stage, only if the message clearly says so" },
            job_summary: { type: ["string", "null"], description: "New one-line status for the job card, if it should change" },
            log: { type: ["string", "null"], description: "Short log entry to add to the job" },
            todos: {
              type: ["array", "null"],
              description: "Tasks Kyle himself has to do that come out of this message, e.g. 'Meet with Jesse about the hitch', 'Draw the rear bracket', 'Email Russel the corrected BOM'. Only tasks for Kyle (in recordings he may be addressed as Kyle). Short imperative wording.",
              items: { type: "object", properties: { text: { type: "string" }, job_id: { type: ["string", "null"] } }, required: ["text"] },
            },
            tasks: {
              type: ["array", "null"],
              description: "Work steps for the job if the message spells them out (e.g. 'strip the deck, then pull the wiring'). Short shop-language names; who = crew doing it if named.",
              items: { type: "object", properties: { name: { type: "string" }, who: { type: "array", items: { type: "string", enum: ["Kyle", "Colton", "Aaron", "Cooper"] } } }, required: ["name"] },
            },
            supplier: {
              type: ["object", "null"],
              properties: {
                id: { type: ["string", "null"], description: "existing supplier id on that job, if it matches" },
                name: { type: "string" },
                status: { type: ["string", "null"], enum: [...SUP_STATUS, null] },
                quoteNo: { type: ["string", "null"] },
                lead: { type: ["string", "null"] },
                total: { type: ["string", "null"] },
                note: { type: ["string", "null"] },
              },
              required: ["name"],
            },
            done_todos: {
              type: ["array", "null"],
              description: "ids of Kyle's OPEN to-dos (from the list given) that this message shows are already handled - e.g. he says he did it, or the thing it waited on happened. Only when clearly done.",
              items: { type: "string" },
            },
          },
          required: ["ref", "relevant", "summary"],
        },
      },
    },
    required: ["suggestions"],
  },
};

function compactJobs(rows: { id: string; data: any }[]) {
  return rows.map(({ id, data: j }) => ({
    id, name: j.name, stage: j.stage, summary: j.summary || "",
    suppliers: (j.suppliers || []).map((s: any) => ({ id: s.id, name: s.name, contact: s.contact, status: s.status, quoteNo: s.quoteNo, note: s.note })),
    recent_log: (j.log || []).slice(-3).map((l: any) => l.text),
  }));
}

async function suggest(sb: any, items: any[]) {
  // skip anything already processed
  const refs = items.map((i) => i.ref).filter(Boolean);
  let fresh = items;
  if (refs.length) {
    const { data: seen } = await sb.from("gvc_suggestions").select("source_ref").in("source_ref", refs);
    const s = new Set((seen || []).map((r: any) => r.source_ref));
    fresh = items.filter((i) => !s.has(i.ref));
  }
  if (!fresh.length) return { added: 0, skipped: items.length };

  const { data: rows, error } = await sb.from("gvc_jobs").select("id,data");
  if (error) throw new Error("jobs: " + error.message);
  const jobs = compactJobs(rows || []);
  const { data: open } = await sb.from("gvc_todos").select("id,text,job_id").is("done_at", null).neq("source", "snooze");

  const system = `You help Kyle, a welder and shop lead at Gordeyville Customs (custom truck decks, BBQ trailers), keep his job board current.
Messages come from his texts and recorded shop conversations. Randy releases jobs, Jesse Dirksen is the engineer, Jesse Eherer is at Russel Metals (laser cutting supplier), William Hofer is at Grandview Fabrication, Robin handles stock, Colton/Aaron/Cooper are crew.
Pull out any to-dos meant for Kyle (things he was asked to do or said he would do). Don't make to-dos the board already reminds him of from stages and supplier statuses (reviewing a quote that is marked 'quote', following up on a sent order, picking up, counting, bending) - set the status instead.
Only propose a change when the message clearly supports it. Never invent quote numbers, prices or dates. Keep summaries short and plain.
Always answer by calling the propose_updates tool exactly once, covering every message ref.
Stages: ${JSON.stringify(STAGES)}
Supplier statuses: ${SUP_STATUS.join(", ")}
If a message shows one of Kyle's open to-dos is already handled, put its id in done_todos.
Updates are applied to the board right away (Kyle can undo), except new jobs, which he approves - so only propose what the message really supports.
Current jobs: ${JSON.stringify(jobs)}
Kyle's open to-dos: ${JSON.stringify((open || []).filter((t: any) => !String(t.id).startsWith("auto")))}`;
  const user = "New messages:\n" + JSON.stringify(fresh.map((i) => ({ ref: i.ref, source: i.source, from: i.from, at: i.at, text: String(i.text || "").slice(0, 20000) })));

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system, tools: [TOOL], tool_choice: { type: "auto" }, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error("Claude API " + r.status + ": " + (await r.text()).slice(0, 300));
  const out = await r.json();
  const use = (out.content || []).find((c: any) => c.type === "tool_use");
  const sugg: any[] = use?.input?.suggestions || [];

  const byRef = new Map(fresh.map((i) => [i.ref, i]));
  const done = new Set<string>();
  const seenCount = new Map<string, number>();
  const insert = sugg.filter((s) => byRef.has(s.ref)).map((s) => {
    const n = (seenCount.get(s.ref) || 0) + 1; seenCount.set(s.ref, n);
    done.add(s.ref);
    const src = byRef.get(s.ref);
    const { ref: _r, relevant, summary, job_id, ...changes } = s;
    return { source: src.source, source_ref: n > 1 ? s.ref + "#" + n : s.ref, from_name: src.from || null, source_at: src.at || null, source_text: String(src.text || "").slice(0, 50000), job_id: job_id || null, summary, changes, status: relevant ? "new" : "none" };
  });
  // messages Claude didn't mention: mark as processed so they aren't sent again
  for (const i of fresh) if (!done.has(i.ref)) insert.push({ source: i.source, source_ref: i.ref, from_name: i.from || null, source_at: i.at || null, source_text: String(i.text || "").slice(0, 50000), job_id: null, summary: "", changes: {}, status: "none" });
  if (insert.length) {
    const { data: saved, error: e2 } = await sb.from("gvc_suggestions").upsert(insert, { onConflict: "source_ref", ignoreDuplicates: true }).select("id,status");
    if (e2) throw new Error("save: " + e2.message);
    // apply straight to the board (Kyle sees them under "Done automatically" with Undo); new jobs stay for review
    for (const r of saved || []) if (r.status === "new") await sb.rpc("gvc_apply_suggestion", { sid: r.id });
  }
  return { added: insert.filter((i) => i.status === "new").length, processed: insert.length };
}

async function transcribe(sb: any, path: string, hint: string) {
  const { data: blob, error } = await sb.storage.from("gvc-audio").download(path);
  if (error) throw new Error("download: " + error.message);
  const fd = new FormData();
  fd.append("file", new File([blob], path.split("/").pop() || "audio.m4a", { type: "audio/mp4" }));
  fd.append("model", "whisper-1");
  fd.append("prompt", hint.slice(0, 800));
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: "Bearer " + (Deno.env.get("OPENAI_API_KEY") || "") }, body: fd,
  });
  if (!r.ok) throw new Error("Whisper " + r.status + ": " + (await r.text()).slice(0, 300));
  return (await r.json()).text as string;
}


// ---------- Outlook (Microsoft Graph) - drafts only, never send ----------
const MS_REDIRECT = (Deno.env.get("SUPABASE_URL") || "") + "/functions/v1/gvc-ms-auth";
const msAdmin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
async function msToken(): Promise<string> {
  const admin = msAdmin();
  const { data: row } = await admin.from("gvc_ms").select("refresh_token").eq("id", "main").maybeSingle();
  if (!row?.refresh_token) throw new Error("Outlook isn't connected yet - tap Outlook at the top of the Ask Claude panel to connect it");
  const body = new URLSearchParams({ client_id: Deno.env.get("MS_CLIENT_ID") || "", client_secret: Deno.env.get("MS_CLIENT_SECRET") || "", grant_type: "refresh_token", refresh_token: row.refresh_token, scope: "offline_access Mail.ReadWrite User.Read" });
  const r = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", { method: "POST", body });
  const t = await r.json();
  if (!r.ok || !t.access_token) throw new Error("Outlook sign-in expired - reconnect it (Ask Claude → Outlook). " + (t.error_description || t.error || ""));
  if (t.refresh_token && t.refresh_token !== row.refresh_token) await admin.from("gvc_ms").update({ refresh_token: t.refresh_token, updated_at: new Date().toISOString() }).eq("id", "main");
  return t.access_token;
}
async function graph(path: string, init: any = {}) {
  const tok = await msToken();
  const r = await fetch("https://graph.microsoft.com/v1.0" + path, { ...init, headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Outlook: " + (j?.error?.message || r.status));
  return j;
}
const addr = (a: string) => ({ emailAddress: { address: a } });
const htmlToText = (h: string) => String(h || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>(\s*)/gi, "\n").replace(/<\/(p|div|tr|li)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();
const textToHtml = (t: string) => String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

// ---------- chat ----------
const ITEM = (TOOL.input_schema.properties.suggestions as any).items;
const CHAT_TOOLS = [
  { name: "set_time", description: "Log or change Kyle's own hours for one day on the My time tab (what goes on his time invoice). mode 'replace' = these lines are the whole day; 'add' = add to what's there. Each line: job (GVC job number/name like 1086WT, or 'shop' for shop time/cleanup/meetings), hours, note. confirm=true marks the day confirmed (ready to Send) - only when Kyle says it's right/final. It never sends to the time invoice app; Kyle presses Send.",
    input_schema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" }, mode: { type: "string", enum: ["replace", "add"] }, confirm: { type: "boolean" },
      lines: { type: "array", items: { type: "object", properties: { job: { type: "string" }, hours: { type: "number" }, note: { type: "string" } }, required: ["job", "hours"] } } }, required: ["date", "mode", "lines"] } },
  { name: "add_todo", description: "Add a to-do to Kyle's list right away.", input_schema: { type: "object", properties: { text: { type: "string" }, job_id: { type: ["string", "null"] } }, required: ["text"] } },
  { name: "complete_todo", description: "Mark one of Kyle's own to-dos done, by its id (only to-dos from the 'open to-dos' list - board reminders have no id, use clear_reminder for those).", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "clear_reminder", description: "Hide a [board reminder] from Kyle's To do tab (the auto ones like 'Give work to Aaron', 'Look over new job: ...', 'Log your time ...'). Pass the reminder text exactly as it appears in the To do tab list, without the [board reminder] prefix. It comes back on its own if the situation changes.", input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
  { name: "add_tasks", description: "Add tasks (work steps) to a job right away so Kyle can assign and check them off. Use short task names in shop language. who = crew names doing it (Kyle, Colton, Aaron, Cooper) or empty.",
    input_schema: { type: "object", properties: { job_id: { type: "string" }, tasks: { type: "array", items: { type: "object", properties: { name: { type: "string" }, who: { type: "array", items: { type: "string", enum: ["Kyle", "Colton", "Aaron", "Cooper"] } } }, required: ["name"] } }, last_waits_for_rest: { type: "boolean" } }, required: ["job_id", "tasks"] } },
  { name: "create_job", description: "Create a new job on the board right away, with its tasks, when Kyle asks for one. The tasks land in the Not scheduled pool of the week planner so Kyle can drag them onto people's days. Include every work step Kyle mentioned.",
    input_schema: { type: "object", properties: { number: { type: "string", description: "Job number like 2015G, 1099PT, 1048BQ - always ask Kyle if he didn't say it" }, name: { type: "string", description: "Job name WITHOUT the number" }, stage: { type: "string", enum: Object.keys(STAGES) }, summary: { type: "string", description: "One line for the job card" }, log: { type: "string", description: "Short note about where this came from" },
      tasks: { type: "array", items: { type: "object", properties: { name: { type: "string" }, who: { type: "array", items: { type: "string", enum: ["Kyle", "Colton", "Aaron", "Cooper"] } } }, required: ["name"] } } }, required: ["name", "stage"] } },
  { name: "propose_update", description: "Change an existing job: move its stage (any direction, e.g. to done), job summary, log entry, supplier status/quote/lead, add tasks, to-dos. It is applied right away (Kyle can Undo it in To do > Done automatically). Use for any board change Kyle asks for. Needs job_id.",
    input_schema: { type: "object", properties: Object.fromEntries(Object.entries(ITEM.properties).filter(([k]) => k !== "ref" && k !== "relevant")), required: ["summary"] } },
  { name: "set_consumable", description: "Add or update a shop consumable (weld wire, contact tips, nozzles/diffusers, gas, grinding/cutting discs, rod, safety gear...) in the Consumables list. Matches an existing item by name (case-insensitive) and only changes the fields you pass. Use it as Kyle walks through what's in the shop or gives a count.",
    input_schema: { type: "object", properties: { name: { type: "string", description: "Specific name, e.g. 'T91 flux core .045', 'ER70S-6 hard wire .035', 'Contact tips .035 (Miller)'" }, category: { type: "string", enum: ["Welding wire", "Contact tips", "Nozzles & diffusers", "Gas", "Grinding & cutting discs", "Rod", "Safety", "Other"] }, unit: { type: "string", description: "spools, boxes, each, bottles, packs..." }, qty: { type: "number", description: "How many there are right now (this records a count)" }, min_qty: { type: "number", description: "Order more when it gets down to this" }, notes: { type: "string" } }, required: ["name"] } },
  { name: "save_app_note", description: "Save a feature request, change, or bug report about THIS APP for Kyle to build with Claude Code at home. Use once you and Kyle have talked it through enough that someone could build it. Write details as a clear spec: the problem, how it should work step by step, any examples Kyle gave.",
    input_schema: { type: "object", properties: { kind: { type: "string", enum: ["idea", "change", "bug"], description: "idea = new feature, change = existing feature should work differently, bug = something broken" }, area: { type: "string", description: "Part of the app, e.g. To do, Week planner, My time, NCRs, Inventory, Chat, Recording, Texts, Email, Job card" }, title: { type: "string", description: "Short name, under 60 chars" }, details: { type: "string" } }, required: ["kind", "title", "details"] } },
  { name: "add_ncr", description: "Log an NCR (non-conformance) on a job right away: something designed, ordered or built wrong, a supplier/material problem, or a customer change that means rework. Rework steps become job tasks tagged to the NCR (they land in Not scheduled on the week planner). Set model_revision when the engineer's model/drawings need changing too - that adds a model revision for Jessie, linked to the NCR.",
    input_schema: { type: "object", properties: { job_id: { type: "string" }, what: { type: "string", description: "What went wrong, one short line, e.g. 'Bottom door flange hits the Rat Pack'" },
      type: { type: "string", enum: ["Design / drawing", "Ordered wrong", "Built wrong", "Supplier / material", "Customer change", "Other"] },
      fix: { type: "string", enum: ["Rework", "Scrap and remake", "Use as is", "Deciding"], description: "Deciding if Kyle hasn't decided yet" },
      decision: { type: "string", description: "What was decided, if Kyle said" },
      steps: { type: "array", items: { type: "object", properties: { name: { type: "string" }, h: { type: "number", description: "hours, if Kyle gave them" } }, required: ["name"] } },
      mat: { type: "number", description: "Extra material cost in dollars, if known" },
      model_revision: { type: "string", description: "If the model/drawings need changing: what Jessie should change (one line). Leave out otherwise." },
      part: { type: "string", description: "Part number or name the revision is about, if known" } }, required: ["job_id", "what", "type"] } },
  { name: "update_ncr", description: "Change an existing NCR on a job: set the fix or the decision, add rework steps, set material $, or close/reopen it. Use the NCR number (n) from the job's ncrs list.",
    input_schema: { type: "object", properties: { job_id: { type: "string" }, n: { type: "number" }, fix: { type: "string", enum: ["Rework", "Scrap and remake", "Use as is", "Deciding"] }, decision: { type: "string" },
      add_steps: { type: "array", items: { type: "object", properties: { name: { type: "string" }, h: { type: "number" } }, required: ["name"] } }, mat: { type: "number" }, closed: { type: "boolean" } }, required: ["job_id", "n"] } },
  { name: "add_revision", description: "Add a model revision for Jessie (the engineer): something to change in his model or drawings. kind fix = it didn't fit/work; improvement = works, but better next time. Link it to an NCR number if there is one.",
    input_schema: { type: "object", properties: { job_id: { type: ["string", "null"] }, what: { type: "string" }, part: { type: "string" }, kind: { type: "string", enum: ["fix", "improvement"] }, ncr: { type: "number" } }, required: ["what"] } },
  { name: "find_emails", description: "Search Kyle's work email (kyle.gvc Outlook) - by words, sender or subject. Returns the newest matches with ids for read_email / draft_email replies.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "Words to search, e.g. 'Grandview FAB-0121' or a person's name" }, from: { type: "string", description: "Sender email or name, optional" }, top: { type: "number" } } } },
  { name: "read_email", description: "Read one email in full (by id from find_emails).", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "draft_email", description: "Write an email as a DRAFT in Kyle's Outlook (kyle.gvc) - Kyle reviews and presses Send himself; there is no way to send. For a reply, pass reply_to_id (from find_emails) so it stays in the thread with the quoted email below. Plain text body, written as Kyle, short and plain.",
    input_schema: { type: "object", properties: { to: { type: "array", items: { type: "string" } }, cc: { type: "array", items: { type: "string" } }, subject: { type: "string" }, body: { type: "string" },
      reply_to_id: { type: "string", description: "id of the email being replied to" }, reply_all: { type: "boolean" }, job_id: { type: ["string", "null"], description: "job it's about - logged on the job" } }, required: ["body"] } },
  { name: "update_app_note", description: "Add to or rewrite an app note that's already saved (use the id from the saved notes list) instead of saving a duplicate.",
    input_schema: { type: "object", properties: { id: { type: "string" }, details: { type: "string", description: "The full updated spec" }, title: { type: "string" } }, required: ["id", "details"] } },
];
const APP_FEATURES = `What the app already does: To do tab (auto reminders from job stages, suppliers, idle crew, flat parts, schedule clashes, unlogged time, undecided NCRs; Kyle's own to-dos; review list of suggestions from texts/emails/recordings that Kyle accepts). Boards: Pipeline (released, check drawings, make DXFs), Orders (preparing, quote, production, pick up, arrived, received - with suppliers per job), Shop floor (bending, fab, paint, assembly, done). Job card: stage, folder, note, tasks with who/status and progress %, suppliers, NCRs, notes log. Crew tab: Week plan (drag-and-drop weekly schedule per person, 8h days, hour estimates, shared tasks split by crew-hours, days off, "send someone now" errands, task dependencies with clash alerts) and Lanes view. My time tab: Kyle's daily hours prefilled from the plan, confirm days, send to his separate time invoice app with a button. NCRs: log on a job (type, fix, rework steps with hours, material $), NCR log with cost. Inventory tab: mirror of Robin's spreadsheet (synced daily), part pictures, flat vs bent stock, bend list. Phone: record conversations (Whisper transcribes, suggestions come out), reads texts from picked contacts. Hourly email check (weekdays) turns Kyle's work emails into suggestions. This chat (with mic on PC). Kyle's undo button. PC web version and Android app.`;

async function timeCtx(sb: any) {
  try {
    const [{ data: pl }, { data: tj }] = await Promise.all([sb.from("gvc_plan").select("data").eq("id", "main").maybeSingle(), sb.from("jobs").select("id,name,description,closed")]);
    const t = (pl?.data?.time) || {}; const names: any = {}; (tj || []).forEach((j: any) => names[j.id] = j.name + (j.description ? " " + j.description : ""));
    const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
    return Object.keys(t).filter((d) => d >= since).sort().map((d) => `${d}${t[d].ok ? " (confirmed)" : ""}${t[d].sent ? " (sent" + (t[d].changed ? ", changed since" : "") + ")" : ""}: ` + (t[d].lines || []).map((l: any) => `${l.h}h ${names[l.ti] || "no invoice job"}${l.note ? " - " + l.note : ""}`).join("; ")).join("\n");
  } catch (_) { return ""; }
}
async function setTime(sb: any, inp: any) {
  const d = String(inp.date || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("date must be YYYY-MM-DD");
  const [{ data: tj }, { data: gj }] = await Promise.all([sb.from("jobs").select("id,name,description,closed"), sb.from("gvc_jobs").select("id,data")]);
  const open = (tj || []).filter((j: any) => !j.closed);
  const mo = new Date(d + "T12:00:00").toLocaleString("en-CA", { month: "long" }).toLowerCase();
  const norm = (x: string) => String(x || "").replace(/\s/g, "").toLowerCase();
  const miss: string[] = [];
  const lines = (inp.lines || []).map((l: any) => {
    const q = String(l.job || "").trim(); let ti = "", g: any = null;
    if (/^(shop|cleanup|shop time|meeting|office)/i.test(q)) { const hit = open.find((x: any) => { const t = (x.name + " " + (x.description || "")).toLowerCase(); return t.includes("shop") && (t.includes(mo) || t.includes(mo.slice(0, 3))); }); ti = hit?.id || ""; }
    else {
      const m = q.match(/(\d{4})\s*([a-z]{0,2})/i);
      if (m) { const n = m[1], suf = (m[2] || "").toLowerCase(); const c = open.filter((x: any) => norm(x.name).startsWith(n)); ti = (c.find((x: any) => norm(x.name) === n + suf) || c[0])?.id || "";
        g = (gj || []).find((r: any) => norm(r.data?.name).startsWith(n + suf.toLowerCase())) || (gj || []).find((r: any) => norm(r.data?.name).startsWith(n)); }
      else { const w = q.toLowerCase(); const hit = open.find((x: any) => (x.name + " " + (x.description || "")).toLowerCase().includes(w)); ti = hit?.id || "";
        g = (gj || []).find((r: any) => String(r.data?.name || "").toLowerCase().includes(w)); }
    }
    if (!ti) miss.push(q);
    return { id: Math.random().toString(36).slice(2, 9), ti, gj: g?.id || null, h: Math.round(Number(l.hours) * 4) / 4, note: l.note || (g ? "" : q) };
  });
  for (let tries = 0; tries < 4; tries++) {
    const { data: pl } = await sb.from("gvc_plan").select("data,updated_at").eq("id", "main").maybeSingle();
    if (!pl) throw new Error("no plan");
    const pd = pl.data || {}; pd.time = pd.time || {}; const prev = pd.time[d];
    const base = inp.mode === "add" && prev ? (prev.lines || []) : [];
    pd.time[d] = { lines: [...base, ...lines], ok: !!inp.confirm, sent: prev?.sent || null, sentIds: prev?.sentIds || [], changed: !!prev?.sent };
    const { data: up } = await sb.from("gvc_plan").update({ data: pd, updated_at: new Date().toISOString() }).eq("id", "main").eq("updated_at", pl.updated_at).select("updated_at");
    if (up && up.length) { const tot = pd.time[d].lines.reduce((a: number, x: any) => a + (Number(x.h) || 0), 0);
      return { tot, miss, sent: !!prev?.sent }; }
  }
  throw new Error("the plan kept changing - try again");
}

async function chat(sb: any, msgs: any[], ctx: any = {}) {
  const [{ data: rows }, { data: todos }, { data: notes }] = await Promise.all([
    sb.from("gvc_jobs").select("id,data"),
    sb.from("gvc_todos").select("id,text,job_id,from_name,created_at").is("done_at", null).neq("source", "auto"),
    sb.from("gvc_feedback").select("id,kind,area,title,status").in("status", ["new", "planned"]).order("created_at"),
  ]);
  const jobs = (rows || []).map(({ id, data: j }: any) => ({ ...compactJobs([{ id, data: j }])[0], recent_log: (j.log || []).slice(-6).map((l: any) => (l.at || "").slice(0, 10) + " " + l.text),
    tasks: (j.assemblies || []).map((a: any) => ({ name: a.name, status: a.status, who: a.who || "unassigned", ncr: a.ncr || undefined })),
    ncrs: (j.ncrs || []).map((x: any) => ({ n: x.n, what: x.what, type: x.type, fix: x.fix, decision: x.decision || undefined, closed: !!x.closed })) }));
  const system = `You are the assistant inside Kyle's GVC Shop app. Kyle is a Red Seal welder and shop lead at Gordeyville Customs in Grande Prairie, Alberta (custom truck decks, BBQ trailers, service bodies). Talk like a helpful coworker: short, plain, no fluff.
People: Randy releases jobs; Jesse Dirksen is the engineer (SolidWorks); Jesse Eherer is at Russel Metals (laser cutting); William Hofer is at Grandview Fabrication; Robin handles stock; Colton, Aaron, Cooper are crew Kyle assigns work to.
Today is ${new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Edmonton" })}.
You can answer questions about the board, help plan the day, and use tools: add_todo, complete_todo, clear_reminder, create_job, add_tasks, add_ncr, update_ncr and add_revision act right away; propose_update changes an existing job right away (stage moves in any direction, supplier status, log, summary) - only say it's done when the tool result says ok; Kyle can undo it in To do > Done automatically.
HARD RULES ABOUT DOING THINGS: nothing happens unless you call a tool and its result says ok. Never say "done", "doing it now" or "I'll take care of it" unless the tool result for that exact thing came back ok. If a tool result starts with "error", tell Kyle it failed and why. Kyle's hours: use set_time (it changes the My time tab; he still presses Send to the time invoice app - say that). Things you have NO tool for - say so plainly in one line and tell him where to do it himself: scheduling or moving tasks onto days or people (Jobs > Crew & week plan), sending email (you only write drafts - Kyle presses Send in Outlook), accepting suggestions in his review list. Don't pretend. When Kyle lists several things in one message, go through every one: call the tools you can, and for each thing you can't do, say that in the reply.
Every job name starts with its job number, like "2011G - Kirby Controls Enclosure" (G, PT, BQ, DT suffixes). When Kyle asks for a new job and hasn't given the number, ask for it once; if he doesn't know it yet, create it without one (the app flags it).
When Kyle asks for a new job, use create_job (not propose_update) and put all the work steps he mentioned in it as tasks, in one go - don't make him ask twice. Tasks automatically show up in the Not scheduled pool on the Crew tab's week planner, grouped by job, so he can drag them onto people's days. Who on a task is just a suggestion until he schedules it.
EMAIL (Outlook kyle.gvc, drafts only): use find_emails / read_email to look things up, draft_email to write. You can never send - say "it's in your Outlook drafts, check it and press Send". Rules from Kyle: always CC Randy at gordeyvillecustoms@hotmail.com on emails to suppliers (never randy.gvc@hotmail.com - old address). State materials exactly as Kyle gives them (e.g. 16 GA (0.0598") 304 2B stainless). Suppliers: Russel Metals - Jesse Eherer jeherer@russelmetals.com (laser cutting only); LSM - Dennis Shmyr counter@golsm.com (shears and bends); Grandview Fabrication - William Hofer; Alloy Industries - big bends. Jessie Dirksen (engineer) - jessie.gvc@hotmail.com. Randy - gordeyvillecustoms@hotmail.com. Write as Kyle: short, plain, no fluff, sign off "Kyle". For replies, find the email first and pass reply_to_id. Don't promise attachments - you can't attach files yet.
NCRs: when Kyle says something was designed, ordered or built wrong (or a supplier/material problem, or a customer change that means rework), log it with add_ncr on that job - type, fix (Deciding if he hasn't decided), any rework steps with hours, material $ if he says. If the model or drawings need changing too, fill model_revision so Jessie gets it. Use update_ncr to record a decision, add steps, or close one. NCR numbers are shown as NCR-001 etc.
Each job can have tasks (work steps) with who and status: bend=waiting on bending, ready=ready to start, prog=in progress, qc=inspection, done. Use add_tasks to add steps to an existing job.
Stages: ${JSON.stringify(STAGES)}
Supplier statuses: ${SUP_STATUS.join(", ")}
Jobs: ${JSON.stringify(jobs)}
Kyle's open to-dos (with ids, for complete_todo): ${JSON.stringify(todos || [])}
What Kyle's To do tab shows right now (board reminders are generated from job stages/suppliers/crew; to-dos are his own): ${JSON.stringify(ctx.todo_tab || [])}
Suggestions waiting for his review: ${JSON.stringify(ctx.waiting_review || [])}
Kyle's logged hours, last 2 weeks (My time tab):
${await timeCtx(sb) || "(nothing logged)"}
Where Kyle is in the app right now: ${ctx.looking_at || "unknown"}. When he says "this job", "this order", "it", "this one", he means what's open there - use that job id / supplier id and don't ask which job.
Parts sitting flat in inventory that could be bent: ${JSON.stringify(ctx.flat_to_bend || [])}

Consumables: the Inventory tab has a Consumables list (counted about weekly; low items alert on the To do tab). Its current items are in the To do list context as [consumable] lines. When Kyle tells you what consumables the shop has, how many, or what minimum to keep, call set_consumable once per item (it creates or updates). Ask for the minimum to keep if he didn't say, but don't hold up saving the count for it.

You also help Kyle improve this app. ${APP_FEATURES}
When Kyle wants something the app doesn't do, wants a feature to work differently, or says something isn't working: talk it through like a product partner. Ask at most one or two short questions if it's unclear (what problem it solves, how he pictures it working, an example), suggest a simpler way if there is one, then save it with save_app_note (or update_app_note if it's already in the list). You can't change the app yourself - say it's saved and you'll build it together with Claude at home. Don't save the same thing twice.
App notes already saved: ${JSON.stringify((notes || []).map((x: any) => ({ id: x.id, kind: x.kind, area: x.area, title: x.title, status: x.status })))}`;
  const messages: any[] = msgs.slice(-20).map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 8000) }));
  const actions: string[] = [];
  const failed: string[] = [];
  let n = 0;
  const wrapUp = (text: string) => {
    let reply = (text || "").trim();
    if (!reply) reply = actions.length ? "Done - see the list above." : failed.length ? "I couldn't do that." : "I didn't change anything.";
    if (failed.length && !/couldn't|failed|error/i.test(reply)) reply += "\n\nCouldn't do: " + failed.join("; ");
    return { reply, actions };
  };
  for (let turn = 0; turn < 6; turn++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, system, tools: CHAT_TOOLS, messages }),
    });
    if (!r.ok) throw new Error("Claude API " + r.status + ": " + (await r.text()).slice(0, 300));
    const out = await r.json();
    const uses = (out.content || []).filter((c: any) => c.type === "tool_use");
    if (!uses.length || out.stop_reason !== "tool_use") {
      const text = (out.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
      return wrapUp(text);
    }
    messages.push({ role: "assistant", content: out.content });
    const results: any[] = [];
    for (const u of uses) {
      let res = "ok";
      try {
        if (u.name === "add_todo") {
          const { error } = await sb.from("gvc_todos").insert({ text: u.input.text, job_id: u.input.job_id || null, source: "chat", from_name: "Chat" });
          if (error) throw error; actions.push("Added to-do: " + u.input.text);
        } else if (u.name === "complete_todo") {
          const td = (todos || []).find((t: any) => t.id === u.input.id);
          if (!td) throw new Error("no open to-do with that id - board reminders have no id, use clear_reminder with the reminder text");
          const { error } = await sb.from("gvc_todos").update({ done_at: new Date().toISOString() }).eq("id", u.input.id);
          if (error) throw error; actions.push("Marked done: " + td.text);
        } else if (u.name === "clear_reminder") {
          const want = String(u.input.text || "").replace(/^\[board reminder\]\s*/i, "").trim();
          const list = (ctx.todo_tab || []).filter((x: any) => typeof x === "string" && x.startsWith("[board reminder] ")).map((x: string) => x.slice("[board reminder] ".length));
          const hit = list.find((x: string) => x === want) || list.find((x: string) => x.toLowerCase() === want.toLowerCase()) || (list.filter((x: string) => x.toLowerCase().includes(want.toLowerCase())).length === 1 ? list.find((x: string) => x.toLowerCase().includes(want.toLowerCase())) : null);
          if (!hit) throw new Error("no board reminder matches '" + want + "' - reminders on the tab right now: " + list.join(" | "));
          const { error } = await sb.from("gvc_todos").insert({ text: hit, source: "auto", done_at: new Date().toISOString() });
          if (error) throw error; actions.push("Cleared reminder: " + hit);
        } else if (u.name === "add_tasks") {
          const { data: row, error: e1 } = await sb.from("gvc_jobs").select("id,data").eq("id", u.input.job_id).single();
          if (e1 || !row) throw new Error("job not found");
          const list = (u.input.tasks || []).filter((t: any) => t && t.name);
          const add = list.map((t: any, ix: number) => ({ id: crypto.randomUUID().slice(0, 8), name: t.name, meta: "", status: "ready", who: (t.who || []).join(", "), final: !!u.input.last_waits_for_rest && ix === list.length - 1 }));
          const d = row.data || {};
          d.assemblies = [...(d.assemblies || []), ...add];
          d.log = [...(d.log || []), { at: new Date().toISOString(), text: `Added ${add.length} tasks (Ask Claude)` }];
          const { error: e2 } = await sb.from("gvc_jobs").update({ data: d }).eq("id", row.id);
          if (e2) throw e2;
          actions.push(`Added ${add.length} task${add.length > 1 ? "s" : ""} to ${d.name} (in Not scheduled on the Crew tab)`);
        } else if (u.name === "create_job") {
          const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
          const now = new Date().toISOString();
          const tasks = (u.input.tasks || []).filter((t: any) => t && t.name).map((t: any) => ({ id: crypto.randomUUID().slice(0, 8), name: t.name, meta: "", status: "ready", who: (t.who || []).join(", "), final: false }));
          const num = String(u.input.number || "").trim().toUpperCase();
          const nm = String(u.input.name || "").replace(/^\s*\d{4}[A-Za-z0-9_]{0,4}\s*[-–:]?\s*/, "").trim() || u.input.name;
          const data = { name: num ? `${num} - ${nm}` : nm, folder: "", summary: u.input.summary || "", stage: (STAGES as any)[u.input.stage] ? u.input.stage : "released", suppliers: [], assemblies: tasks, order: Date.now(),
            log: [{ at: now, text: (u.input.log || "Job created") + " (Ask Claude)" }] };
          const { error } = await sb.from("gvc_jobs").insert({ id, data });
          if (error) throw error;
          res = "created job id " + id;
          actions.push(`Created job ${u.input.name}${tasks.length ? ` with ${tasks.length} task${tasks.length > 1 ? "s" : ""} (in Not scheduled on the Crew tab)` : ""}`);
        } else if (u.name === "set_time") {
          const r = await setTime(sb, u.input);
          res = `ok - ${u.input.date} now ${r.tot}h${r.miss.length ? `; no time-invoice job matched for: ${r.miss.join(", ")} (Kyle picks it on My time)` : ""}`;
          actions.push(`My time ${u.input.date}: ${r.tot}h${u.input.confirm ? " (confirmed)" : ""}${r.sent ? " - already sent, press Send again to update" : ""} - press Send on My time when ready`);
        } else if (u.name === "propose_update") {
          const { summary, job_id, ...changes } = u.input;
          const { data: ins, error } = await sb.from("gvc_suggestions").insert({ source: "chat", source_ref: "chat:" + Date.now() + "#" + (++n), from_name: "Ask Claude", source_at: new Date().toISOString(), source_text: String(messages.filter((m: any) => m.role === "user" && typeof m.content === "string").slice(-1)[0]?.content || ""), job_id: job_id || null, summary, changes, status: "new" }).select("id").single();
          if (error) throw error;
          const { data: ap, error: e2 } = await sb.rpc("gvc_apply_suggestion", { sid: ins.id, any_stage: true });
          if (e2) throw e2;
          const r = String(ap || "");
          if (r.startsWith("applied")) { res = "ok - " + r; actions.push("Done: " + summary + " (Undo in To do > Done automatically)"); }
          else { res = "not applied (" + r + ") - it's waiting in Kyle's review list"; actions.push("Suggested: " + summary + " (waiting for you in To do)"); }
        } else if (u.name === "set_consumable") {
          const nm = String(u.input.name || "").trim();
          const { data: ex } = await sb.from("gvc_consumables").select("id,name").ilike("name", nm.replace(/[%_]/g, "\\$&")).maybeSingle();
          const patch: any = {};
          ["category", "unit", "notes"].forEach((k) => { if (u.input[k] != null && u.input[k] !== "") patch[k] = u.input[k]; });
          if (u.input.qty != null) { patch.qty = Number(u.input.qty); patch.counted_at = new Date().toISOString(); }
          if (u.input.min_qty != null) patch.min_qty = Number(u.input.min_qty);
          if (ex) { const { error } = await sb.from("gvc_consumables").update(patch).eq("id", ex.id); if (error) throw error; }
          else { const { error } = await sb.from("gvc_consumables").insert({ name: nm, category: "Other", ...patch }); if (error) throw error; }
          actions.push(`${ex ? "Updated" : "Added"} consumable: ${nm}${u.input.qty != null ? ` (${u.input.qty}${u.input.unit ? " " + u.input.unit : ""})` : ""}${u.input.min_qty != null ? `, keep ${u.input.min_qty}` : ""}`);
        } else if (u.name === "add_ncr" || u.name === "update_ncr") {
          const { data: row, error: e1 } = await sb.from("gvc_jobs").select("id,data").eq("id", u.input.job_id).single();
          if (e1 || !row) throw new Error("job not found");
          const d = row.data || {}; d.ncrs = d.ncrs || []; const now = new Date().toISOString();
          let n: number, label: string;
          if (u.name === "add_ncr") {
            const { data: all } = await sb.from("gvc_jobs").select("data");
            n = (all || []).reduce((m: number, r: any) => Math.max(m, ...((r.data?.ncrs || []).map((x: any) => x.n || 0))), 0) + 1;
            d.ncrs.push({ n, what: u.input.what, type: u.input.type || "Other", fix: u.input.fix || "Deciding", mat: u.input.mat || 0, closed: false, at: now, ...(u.input.decision ? { decision: u.input.decision } : {}) });
            label = `NCR-${String(n).padStart(3, "0")} logged: ${u.input.what} (Ask Claude)`;
          } else {
            n = Number(u.input.n); const x = d.ncrs.find((y: any) => y.n === n); if (!x) throw new Error(`no NCR-${String(n).padStart(3, "0")} on this job`);
            if (u.input.fix) x.fix = u.input.fix; if (u.input.decision) x.decision = u.input.decision; if (u.input.mat != null) x.mat = u.input.mat; if (u.input.closed != null) x.closed = !!u.input.closed;
            label = `NCR-${String(n).padStart(3, "0")} updated${u.input.fix ? ": " + u.input.fix : ""}${u.input.decision ? " - " + u.input.decision : ""}${u.input.closed ? " (closed)" : ""} (Ask Claude)`;
          }
          const steps = (u.input.steps || u.input.add_steps || []).filter((t: any) => t && t.name);
          const add = steps.map((t: any) => ({ id: crypto.randomUUID().slice(0, 8), name: t.name, meta: "", status: "ready", who: "", final: false, ncr: n, _h: t.h }));
          d.assemblies = [...(d.assemblies || []), ...add.map(({ _h, ...a }: any) => a)];
          d.log = [...(d.log || []), { at: now, text: label }];
          const { error: e2 } = await sb.from("gvc_jobs").update({ data: d }).eq("id", row.id);
          if (e2) throw e2;
          // rework hours go in the week plan's hour estimates
          const hrs = add.filter((a: any) => a._h != null);
          if (hrs.length) {
            for (let tries = 0; tries < 3; tries++) {
              const { data: pl } = await sb.from("gvc_plan").select("data,updated_at").eq("id", "main").maybeSingle();
              if (!pl) break; const pd = pl.data || {}; pd.hours = pd.hours || {};
              hrs.forEach((a: any) => { pd.hours[`j:${row.id}:${a.id}`] = a._h; });
              const { data: up } = await sb.from("gvc_plan").update({ data: pd, updated_at: new Date().toISOString() }).eq("id", "main").eq("updated_at", pl.updated_at).select("updated_at");
              if (up && up.length) break;
            }
          }
          const tagN = `NCR-${String(n).padStart(3, "0")}`;
          let rev = "";
          if (u.name === "add_ncr" && u.input.model_revision) {
            const { data: r, error: e3 } = await sb.from("gvc_revisions").insert({ job_id: row.id, part: u.input.part || null, what: u.input.model_revision, kind: "fix", ncr: n }).select("n").single();
            if (e3) throw new Error("NCR saved, but the model revision failed: " + e3.message);
            rev = ` + model revision REV-${String(r.n).padStart(3, "0")} for Jessie`;
          }
          res = `ok ${tagN}`;
          actions.push(`${u.name === "add_ncr" ? "Logged" : "Updated"} ${tagN} on ${d.name}${add.length ? ` with ${add.length} rework step${add.length > 1 ? "s" : ""} (in Not scheduled)` : ""}${rev}`);
        } else if (u.name === "add_revision") {
          const { data: r, error } = await sb.from("gvc_revisions").insert({ job_id: u.input.job_id || null, part: u.input.part || null, what: u.input.what, kind: u.input.kind || "improvement", ncr: u.input.ncr || null }).select("n").single();
          if (error) throw error;
          actions.push(`Added model revision REV-${String(r.n).padStart(3, "0")} for Jessie: ${u.input.what}`);
        } else if (u.name === "find_emails") {
          const top = Math.min(15, Math.max(1, Number(u.input.top) || 8));
          const q = [u.input.query, u.input.from ? `from:${u.input.from}` : ""].filter(Boolean).join(" ").replace(/"/g, "");
          const path = q ? `/me/messages?$search="${encodeURIComponent(q)}"&$top=${top}&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,isDraft`
                         : `/me/mailFolders/inbox/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,isDraft`;
          const j = await graph(path);
          const list = (j.value || []).map((m: any) => ({ id: m.id, subject: m.subject, from: m.from?.emailAddress?.name + " <" + m.from?.emailAddress?.address + ">", to: (m.toRecipients || []).map((x: any) => x.emailAddress?.address).join(", "), at: m.receivedDateTime, preview: String(m.bodyPreview || "").slice(0, 300), draft: m.isDraft || undefined }));
          list.sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)));
          res = JSON.stringify(list);
        } else if (u.name === "read_email") {
          const m = await graph(`/me/messages/${encodeURIComponent(u.input.id)}?$select=subject,from,toRecipients,ccRecipients,receivedDateTime,body,hasAttachments`);
          res = JSON.stringify({ subject: m.subject, from: m.from?.emailAddress, to: (m.toRecipients || []).map((x: any) => x.emailAddress?.address), cc: (m.ccRecipients || []).map((x: any) => x.emailAddress?.address), at: m.receivedDateTime, attachments: m.hasAttachments, body: htmlToText(m.body?.content || "").slice(0, 12000) });
        } else if (u.name === "draft_email") {
          let d: any;
          if (u.input.reply_to_id) {
            d = await graph(`/me/messages/${encodeURIComponent(u.input.reply_to_id)}/${u.input.reply_all ? "createReplyAll" : "createReply"}`, { method: "POST", body: JSON.stringify({ comment: u.input.body }) });
            const patch: any = {};
            if ((u.input.cc || []).length) { const have = new Set((d.ccRecipients || []).map((x: any) => String(x.emailAddress?.address || "").toLowerCase())); patch.ccRecipients = [...(d.ccRecipients || []), ...u.input.cc.filter((a: string) => !have.has(a.toLowerCase())).map(addr)]; }
            if ((u.input.to || []).length) { const have = new Set((d.toRecipients || []).map((x: any) => String(x.emailAddress?.address || "").toLowerCase())); patch.toRecipients = [...(d.toRecipients || []), ...u.input.to.filter((a: string) => !have.has(a.toLowerCase())).map(addr)]; }
            if (u.input.subject) patch.subject = u.input.subject;
            if (Object.keys(patch).length) d = await graph(`/me/messages/${d.id}`, { method: "PATCH", body: JSON.stringify(patch) });
          } else {
            if (!(u.input.to || []).length) throw new Error("who is it to?");
            d = await graph(`/me/messages`, { method: "POST", body: JSON.stringify({ subject: u.input.subject || "", body: { contentType: "HTML", content: textToHtml(u.input.body) }, toRecipients: u.input.to.map(addr), ccRecipients: (u.input.cc || []).map(addr) }) });
          }
          const to = (d.toRecipients || []).map((x: any) => x.emailAddress?.address).join(", ");
          if (u.input.job_id) {
            const { data: row } = await sb.from("gvc_jobs").select("id,data").eq("id", u.input.job_id).maybeSingle();
            if (row) { const jd = row.data || {}; jd.log = [...(jd.log || []), { at: new Date().toISOString(), text: `Email drafted to ${to}: ${d.subject || ""} (Ask Claude - in Outlook drafts)` }]; await sb.from("gvc_jobs").update({ data: jd }).eq("id", row.id); }
          }
          res = "ok - draft saved in Outlook (not sent)";
          actions.push(`Draft in your Outlook: "${d.subject || "(no subject)"}" to ${to || "?"} - check it and press Send [[open:${d.webLink || "https://outlook.live.com/mail/0/drafts"}]]`);
        } else if (u.name === "save_app_note") {
          const said = messages.filter((m: any) => m.role === "user" && typeof m.content === "string").slice(-6).map((m: any) => "Kyle: " + m.content).join("\n");
          const { error } = await sb.from("gvc_feedback").insert({ kind: u.input.kind || "idea", area: u.input.area || null, title: String(u.input.title).slice(0, 120), details: u.input.details, conversation: said.slice(0, 6000) });
          if (error) throw error; actions.push("Saved app " + (u.input.kind === "bug" ? "bug" : "idea") + ": " + u.input.title);
        } else if (u.name === "update_app_note") {
          const upd: any = { details: u.input.details, updated_at: new Date().toISOString() }; if (u.input.title) upd.title = u.input.title;
          const { error } = await sb.from("gvc_feedback").update(upd).eq("id", u.input.id);
          if (error) throw error; actions.push("Updated app note: " + (u.input.title || ((notes || []).find((x: any) => x.id === u.input.id)?.title) || "note"));
        } else res = "unknown tool";
      } catch (e) { res = "error: " + ((e as any).message || e); failed.push(`${u.name}${u.input?.text ? " (" + String(u.input.text).slice(0, 60) + ")" : ""}: ${(e as any).message || e}`); }
      results.push({ type: "tool_result", tool_use_id: u.id, content: res });
    }
    messages.push({ role: "user", content: results });
  }
  return wrapUp("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: ok } = await sb.rpc("gvc_is_member");
    if (!ok) return json({ error: "Not on the shop list" }, 403);
    const body = await req.json();

    if (body.action === "suggest") return json(await suggest(sb, body.items || []));
    if (body.action === "stt") {
      const bytes = Uint8Array.from(atob(String(body.audio || "")), (c) => c.charCodeAt(0));
      if (bytes.length > 24_000_000) return json({ error: "Recording too long" }, 400);
      const mime = String(body.mime || "audio/webm");
      const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
      const fd = new FormData();
      fd.append("file", new File([bytes], "speech." + ext, { type: mime }));
      fd.append("model", "whisper-1");
      fd.append("prompt", "Gordeyville Customs shop talk: Randy, Jesse, Robin, Colton, Aaron, Cooper, Kyle, Russel Metals, Grandview, Kirby, Craig's trailer, picker truck, belly box, shovel rack, headache rack.");
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + (Deno.env.get("OPENAI_API_KEY") || "") }, body: fd });
      if (!r.ok) return json({ error: "Whisper " + r.status }, 500);
      return json({ text: (await r.json()).text || "" });
    }
    if (body.action === "chat") return json(await chat(sb, body.messages || [], body.context || {}));
    if (body.action === "ms_status") {
      const { data } = await msAdmin().from("gvc_ms").select("email,updated_at").eq("id", "main").maybeSingle();
      return json({ connected: !!data, email: data?.email || "", ready: !!Deno.env.get("MS_CLIENT_ID") });
    }
    if (body.action === "ms_start") {
      if (!Deno.env.get("MS_CLIENT_ID")) return json({ error: "Outlook isn't set up on the server yet (MS_CLIENT_ID missing)" }, 400);
      const state = crypto.randomUUID();
      const { error } = await msAdmin().from("gvc_ms_state").insert({ state });
      if (error) return json({ error: error.message }, 500);
      const q = new URLSearchParams({ client_id: Deno.env.get("MS_CLIENT_ID")!, response_type: "code", redirect_uri: MS_REDIRECT, response_mode: "query", scope: "offline_access Mail.ReadWrite User.Read", state, prompt: "select_account", login_hint: "kyle.gvc@hotmail.com" });
      return json({ url: "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?" + q.toString() });
    }

    if (body.action === "recording") {
      const { data: rows } = await sb.from("gvc_jobs").select("id,data");
      const hint = "Gordeyville Customs shop talk. Names: Randy, Jesse, Robin, Colton, Aaron, Cooper, Kyle, Russel Metals, Grandview. Jobs: " + (rows || []).map((r: any) => r.data?.name).join(", ");
      const text = await transcribe(sb, body.path, hint);
      const res = await suggest(sb, [{ ref: "rec:" + body.path, source: "recording", from: "Recording", at: body.at || new Date().toISOString(), text }]);
      return json({ ...res, transcript: text });
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
