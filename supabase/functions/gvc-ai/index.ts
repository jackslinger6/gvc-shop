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
Stages: ${JSON.stringify(STAGES)}
Supplier statuses: ${SUP_STATUS.join(", ")}
Current jobs: ${JSON.stringify(jobs)}`;
  const user = "New messages:\n" + JSON.stringify(fresh.map((i) => ({ ref: i.ref, source: i.source, from: i.from, at: i.at, text: String(i.text || "").slice(0, 20000) })));

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system, tools: [TOOL], tool_choice: { type: "tool", name: "propose_updates" }, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error("Claude API " + r.status + ": " + (await r.text()).slice(0, 300));
  const out = await r.json();
  const use = (out.content || []).find((c: any) => c.type === "tool_use");
  const sugg: any[] = use?.input?.suggestions || [];

  const byRef = new Map(fresh.map((i) => [i.ref, i]));
  const done = new Set<string>();
  const insert = sugg.filter((s) => byRef.has(s.ref)).map((s) => {
    done.add(s.ref);
    const src = byRef.get(s.ref);
    const { ref: _r, relevant, summary, job_id, ...changes } = s;
    return { source: src.source, source_ref: s.ref, from_name: src.from || null, source_at: src.at || null, source_text: String(src.text || "").slice(0, 50000), job_id: job_id || null, summary, changes, status: relevant ? "new" : "none" };
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
