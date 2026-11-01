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

  const system = `You help Kyle, a welder and shop lead at Gordeyville Customs (custom truck decks, BBQ trailers), keep his job board current.
Messages come from his texts and recorded shop conversations. Randy releases jobs, Jesse Dirksen is the engineer, Jesse Eherer is at Russel Metals (laser cutting supplier), William Hofer is at Grandview Fabrication, Robin handles stock, Colton/Aaron/Cooper are crew.
Pull out any to-dos meant for Kyle (things he was asked to do or said he would do). Don't make to-dos the board already reminds him of from stages and supplier statuses (reviewing a quote that is marked 'quote', following up on a sent order, picking up, counting, bending) - set the status instead.
Only propose a change when the message clearly supports it. Never invent quote numbers, prices or dates. Keep summaries short and plain.
Always answer by calling the propose_updates tool exactly once, covering every message ref.
Stages: ${JSON.stringify(STAGES)}
Supplier statuses: ${SUP_STATUS.join(", ")}
Current jobs: ${JSON.stringify(jobs)}`;
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
    const { error: e2 } = await sb.from("gvc_suggestions").upsert(insert, { onConflict: "source_ref", ignoreDuplicates: true });
    if (e2) throw new Error("save: " + e2.message);
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


// ---------- chat ----------
const ITEM = (TOOL.input_schema.properties.suggestions as any).items;
const CHAT_TOOLS = [
  { name: "add_todo", description: "Add a to-do to Kyle's list right away.", input_schema: { type: "object", properties: { text: { type: "string" }, job_id: { type: ["string", "null"] } }, required: ["text"] } },
  { name: "complete_todo", description: "Mark one of Kyle's open to-dos done, by its id.", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "add_tasks", description: "Add tasks (work steps) to a job right away so Kyle can assign and check them off. Use short task names in shop language. who = crew names doing it (Kyle, Colton, Aaron, Cooper) or empty.",
    input_schema: { type: "object", properties: { job_id: { type: "string" }, tasks: { type: "array", items: { type: "object", properties: { name: { type: "string" }, who: { type: "array", items: { type: "string", enum: ["Kyle", "Colton", "Aaron", "Cooper"] } } }, required: ["name"] } }, last_waits_for_rest: { type: "boolean" } }, required: ["job_id", "tasks"] } },
  { name: "create_job", description: "Create a new job on the board right away, with its tasks, when Kyle asks for one. The tasks land in the Not scheduled pool of the week planner so Kyle can drag them onto people's days. Include every work step Kyle mentioned.",
    input_schema: { type: "object", properties: { number: { type: "string", description: "Job number like 2015G, 1099PT, 1048BQ - always ask Kyle if he didn't say it" }, name: { type: "string", description: "Job name WITHOUT the number" }, stage: { type: "string", enum: Object.keys(STAGES) }, summary: { type: "string", description: "One line for the job card" }, log: { type: "string", description: "Short note about where this came from" },
      tasks: { type: "array", items: { type: "object", properties: { name: { type: "string" }, who: { type: "array", items: { type: "string", enum: ["Kyle", "Colton", "Aaron", "Cooper"] } } }, required: ["name"] } } }, required: ["name", "stage"] } },
  { name: "propose_update", description: "Propose a change to a job (stage, card status, log entry, supplier status, new job). It goes to Kyle's review list - he taps Accept to apply it. Use for any board change.",
    input_schema: { type: "object", properties: Object.fromEntries(Object.entries(ITEM.properties).filter(([k]) => k !== "ref" && k !== "relevant")), required: ["summary"] } },
  { name: "save_app_note", description: "Save a feature request, change, or bug report about THIS APP for Kyle to build with Claude Code at home. Use once you and Kyle have talked it through enough that someone could build it. Write details as a clear spec: the problem, how it should work step by step, any examples Kyle gave.",
    input_schema: { type: "object", properties: { kind: { type: "string", enum: ["idea", "change", "bug"], description: "idea = new feature, change = existing feature should work differently, bug = something broken" }, area: { type: "string", description: "Part of the app, e.g. To do, Week planner, My time, NCRs, Inventory, Chat, Recording, Texts, Email, Job card" }, title: { type: "string", description: "Short name, under 60 chars" }, details: { type: "string" } }, required: ["kind", "title", "details"] } },
  { name: "update_app_note", description: "Add to or rewrite an app note that's already saved (use the id from the saved notes list) instead of saving a duplicate.",
    input_schema: { type: "object", properties: { id: { type: "string" }, details: { type: "string", description: "The full updated spec" }, title: { type: "string" } }, required: ["id", "details"] } },
];
const APP_FEATURES = `What the app already does: To do tab (auto reminders from job stages, suppliers, idle crew, flat parts, schedule clashes, unlogged time, undecided NCRs; Kyle's own to-dos; review list of suggestions from texts/emails/recordings that Kyle accepts). Boards: Pipeline (released, check drawings, make DXFs), Orders (preparing, quote, production, pick up, arrived, received - with suppliers per job), Shop floor (bending, fab, paint, assembly, done). Job card: stage, folder, note, tasks with who/status and progress %, suppliers, NCRs, notes log. Crew tab: Week plan (drag-and-drop weekly schedule per person, 8h days, hour estimates, shared tasks split by crew-hours, days off, "send someone now" errands, task dependencies with clash alerts) and Lanes view. My time tab: Kyle's daily hours prefilled from the plan, confirm days, send to his separate time invoice app with a button. NCRs: log on a job (type, fix, rework steps with hours, material $), NCR log with cost. Inventory tab: mirror of Robin's spreadsheet (synced daily), part pictures, flat vs bent stock, bend list. Phone: record conversations (Whisper transcribes, suggestions come out), reads texts from picked contacts. Hourly email check (weekdays) turns Kyle's work emails into suggestions. This chat (with mic on PC). Kyle's undo button. PC web version and Android app.`;

async function chat(sb: any, msgs: any[], ctx: any = {}) {
  const [{ data: rows }, { data: todos }, { data: notes }] = await Promise.all([
    sb.from("gvc_jobs").select("id,data"),
    sb.from("gvc_todos").select("id,text,job_id,from_name,created_at").is("done_at", null).neq("source", "auto"),
    sb.from("gvc_feedback").select("id,kind,area,title,status").in("status", ["new", "planned"]).order("created_at"),
  ]);
  const jobs = (rows || []).map(({ id, data: j }: any) => ({ ...compactJobs([{ id, data: j }])[0], recent_log: (j.log || []).slice(-6).map((l: any) => (l.at || "").slice(0, 10) + " " + l.text),
    tasks: (j.assemblies || []).map((a: any) => ({ name: a.name, status: a.status, who: a.who || "unassigned" })) }));
  const system = `You are the assistant inside Kyle's GVC Shop app. Kyle is a Red Seal welder and shop lead at Gordeyville Customs in Grande Prairie, Alberta (custom truck decks, BBQ trailers, service bodies). Talk like a helpful coworker: short, plain, no fluff.
People: Randy releases jobs; Jesse Dirksen is the engineer (SolidWorks); Jesse Eherer is at Russel Metals (laser cutting); William Hofer is at Grandview Fabrication; Robin handles stock; Colton, Aaron, Cooper are crew Kyle assigns work to.
Today is ${new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Edmonton" })}.
You can answer questions about the board, help plan the day, and use tools: add_todo, complete_todo, create_job and add_tasks act right away; propose_update sends a change to an existing job to Kyle's review list (never claim that change was made - say it's waiting for him to accept).
Every job name starts with its job number, like "2011G - Kirby Controls Enclosure" (G, PT, BQ, DT suffixes). When Kyle asks for a new job and hasn't given the number, ask for it once; if he doesn't know it yet, create it without one (the app flags it).
When Kyle asks for a new job, use create_job (not propose_update) and put all the work steps he mentioned in it as tasks, in one go - don't make him ask twice. Tasks automatically show up in the Not scheduled pool on the Crew tab's week planner, grouped by job, so he can drag them onto people's days. Who on a task is just a suggestion until he schedules it.
Each job can have tasks (work steps) with who and status: bend=waiting on bending, ready=ready to start, prog=in progress, qc=inspection, done. Use add_tasks to add steps to an existing job.
Stages: ${JSON.stringify(STAGES)}
Supplier statuses: ${SUP_STATUS.join(", ")}
Jobs: ${JSON.stringify(jobs)}
Kyle's open to-dos (with ids, for complete_todo): ${JSON.stringify(todos || [])}
What Kyle's To do tab shows right now (board reminders are generated from job stages/suppliers/crew; to-dos are his own): ${JSON.stringify(ctx.todo_tab || [])}
Suggestions waiting for his review: ${JSON.stringify(ctx.waiting_review || [])}
Parts sitting flat in inventory that could be bent: ${JSON.stringify(ctx.flat_to_bend || [])}

You also help Kyle improve this app. ${APP_FEATURES}
When Kyle wants something the app doesn't do, wants a feature to work differently, or says something isn't working: talk it through like a product partner. Ask at most one or two short questions if it's unclear (what problem it solves, how he pictures it working, an example), suggest a simpler way if there is one, then save it with save_app_note (or update_app_note if it's already in the list). You can't change the app yourself - say it's saved and you'll build it together with Claude at home. Don't save the same thing twice.
App notes already saved: ${JSON.stringify((notes || []).map((x: any) => ({ id: x.id, kind: x.kind, area: x.area, title: x.title, status: x.status })))}`;
  const messages: any[] = msgs.slice(-20).map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 8000) }));
  const actions: string[] = [];
  let n = 0;
  for (let turn = 0; turn < 4; turn++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system, tools: CHAT_TOOLS, messages }),
    });
    if (!r.ok) throw new Error("Claude API " + r.status + ": " + (await r.text()).slice(0, 300));
    const out = await r.json();
    const uses = (out.content || []).filter((c: any) => c.type === "tool_use");
    if (!uses.length || out.stop_reason !== "tool_use") {
      const text = (out.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
      return { reply: text, actions };
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
          const { error } = await sb.from("gvc_todos").update({ done_at: new Date().toISOString() }).eq("id", u.input.id);
          if (error) throw error; actions.push("Marked done: " + ((todos || []).find((t: any) => t.id === u.input.id)?.text || "to-do"));
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
        } else if (u.name === "propose_update") {
          const { summary, job_id, ...changes } = u.input;
          const { error } = await sb.from("gvc_suggestions").insert({ source: "chat", source_ref: "chat:" + Date.now() + "#" + (++n), from_name: "Chat", source_at: new Date().toISOString(), source_text: String(messages.filter((m: any) => m.role === "user" && typeof m.content === "string").slice(-1)[0]?.content || ""), job_id: job_id || null, summary, changes, status: "new" });
          if (error) throw error; actions.push("Suggested: " + summary + " (waiting for you in To do)");
        } else if (u.name === "save_app_note") {
          const said = messages.filter((m: any) => m.role === "user" && typeof m.content === "string").slice(-6).map((m: any) => "Kyle: " + m.content).join("\n");
          const { error } = await sb.from("gvc_feedback").insert({ kind: u.input.kind || "idea", area: u.input.area || null, title: String(u.input.title).slice(0, 120), details: u.input.details, conversation: said.slice(0, 6000) });
          if (error) throw error; actions.push("Saved app " + (u.input.kind === "bug" ? "bug" : "idea") + ": " + u.input.title);
        } else if (u.name === "update_app_note") {
          const upd: any = { details: u.input.details, updated_at: new Date().toISOString() }; if (u.input.title) upd.title = u.input.title;
          const { error } = await sb.from("gvc_feedback").update(upd).eq("id", u.input.id);
          if (error) throw error; actions.push("Updated app note: " + (u.input.title || ((notes || []).find((x: any) => x.id === u.input.id)?.title) || "note"));
        } else res = "unknown tool";
      } catch (e) { res = "error: " + ((e as any).message || e); }
      results.push({ type: "tool_result", tool_use_id: u.id, content: res });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: "Done.", actions };
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
