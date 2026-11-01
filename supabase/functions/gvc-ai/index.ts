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
            new_job_name: { type: ["string", "null"], description: "Only if it clearly describes a new job not on the board" },
            summary: { type: "string", description: "One short plain sentence for Kyle: what happened and what you suggest" },
            stage: { type: ["string", "null"], enum: [...Object.keys(STAGES), null], description: "Move the job to this stage, only if the message clearly says so" },
            job_summary: { type: ["string", "null"], description: "New one-line status for the job card, if it should change" },
            log: { type: ["string", "null"], description: "Short log entry to add to the job" },
            todos: {
              type: ["array", "null"],
              description: "Tasks Kyle himself has to do that come out of this message, e.g. 'Meet with Jesse about the hitch', 'Draw the rear bracket', 'Email Russel the corrected BOM'. Only tasks for Kyle (in recordings he may be addressed as Kyle). Short imperative wording.",
              items: { type: "object", properties: { text: { type: "string" }, job_id: { type: ["string", "null"] } }, required: ["text"] },
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
  { name: "propose_update", description: "Propose a change to a job (stage, card status, log entry, supplier status, new job). It goes to Kyle's review list - he taps Accept to apply it. Use for any board change.",
    input_schema: { type: "object", properties: Object.fromEntries(Object.entries(ITEM.properties).filter(([k]) => k !== "ref" && k !== "relevant")), required: ["summary"] } },
];

async function chat(sb: any, msgs: any[]) {
  const [{ data: rows }, { data: todos }] = await Promise.all([
    sb.from("gvc_jobs").select("id,data"),
    sb.from("gvc_todos").select("id,text,job_id,from_name,created_at").is("done_at", null).neq("source", "auto"),
  ]);
  const jobs = (rows || []).map(({ id, data: j }: any) => ({ ...compactJobs([{ id, data: j }])[0], recent_log: (j.log || []).slice(-6).map((l: any) => (l.at || "").slice(0, 10) + " " + l.text),
    assemblies: (j.assemblies || []).map((a: any) => ({ name: a.name, status: a.status, who: a.who || "unassigned" })) }));
  const system = `You are the assistant inside Kyle's GVC Shop app. Kyle is a Red Seal welder and shop lead at Gordeyville Customs in Grande Prairie, Alberta (custom truck decks, BBQ trailers, service bodies). Talk like a helpful coworker: short, plain, no fluff.
People: Randy releases jobs; Jesse Dirksen is the engineer (SolidWorks); Jesse Eherer is at Russel Metals (laser cutting); William Hofer is at Grandview Fabrication; Robin handles stock; Colton, Aaron, Cooper are crew Kyle assigns work to.
Today is ${new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Edmonton" })}.
You can answer questions about the board, help plan the day, and use tools: add_todo and complete_todo act right away; propose_update sends a change to Kyle's review list (never claim a job was changed - say it's waiting for him to accept).
Assembly statuses: bend=waiting on bending, ready=ready for fab, prog=in progress, qc=inspection, done.
Stages: ${JSON.stringify(STAGES)}
Supplier statuses: ${SUP_STATUS.join(", ")}
Jobs: ${JSON.stringify(jobs)}
Kyle's open to-dos: ${JSON.stringify(todos || [])}`;
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
        } else if (u.name === "propose_update") {
          const { summary, job_id, ...changes } = u.input;
          const { error } = await sb.from("gvc_suggestions").insert({ source: "chat", source_ref: "chat:" + Date.now() + "#" + (++n), from_name: "Chat", source_at: new Date().toISOString(), source_text: String(messages.filter((m: any) => m.role === "user" && typeof m.content === "string").slice(-1)[0]?.content || ""), job_id: job_id || null, summary, changes, status: "new" });
          if (error) throw error; actions.push("Suggested: " + summary + " (waiting for you in To do)");
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
    if (body.action === "chat") return json(await chat(sb, body.messages || []));

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
