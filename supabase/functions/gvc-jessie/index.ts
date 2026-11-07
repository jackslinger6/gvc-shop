// Jessie's revision list (Kyle, 2026-11-06). Jessie isn't an app user: Kyle's email to him carries a private link
// (jessie.html#k=<key>, key in gvc_secret 'jessie_key'). This function shows him the revisions sent to him and lets HIM
// mark each one Done or ask a question - nobody in the app can set those (gvc_revisions_guard). Kyle gets a message each time.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const tag = (n: number) => "REV-" + String(n).padStart(3, "0");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const { data: sec } = await db.from("gvc_secret").select("v").eq("k", "jessie_key").maybeSingle();
    if (!sec?.v || typeof body.k !== "string" || body.k.length < 20 || body.k !== sec.v) return json({ error: "This link isn't valid any more - ask Kyle for a new one." }, 403);

    if (body.action === "list") {
      const since = new Date(Date.now() - 21 * 864e5).toISOString();
      const { data: revs, error } = await db.from("gvc_revisions").select("id,n,job_id,part,what,kind,photos,status,sent_at,done_at,checked_at,jesse_note,files")
        .or(`status.in.(sent,question,done),and(status.eq.checked,checked_at.gte.${since})`).order("n");
      if (error) return json({ error: error.message }, 500);
      const ids = [...new Set((revs || []).map((r: any) => r.job_id).filter(Boolean))];
      const names: Record<string, string> = {};
      if (ids.length) { const { data: js } = await db.from("gvc_jobs").select("id,data").in("id", ids); (js || []).forEach((j: any) => names[j.id] = j.data?.name || ""); }
      const paths = [...new Set((revs || []).flatMap((r: any) => r.photos || []))] as string[];
      const urls: Record<string, string> = {};
      if (paths.length) { const { data: s } = await db.storage.from("gvc-photos").createSignedUrls(paths, 60 * 60 * 24); (s || []).forEach((u: any) => { if (u.signedUrl) urls[u.path] = u.signedUrl; }); }
      return json({ items: (revs || []).map((r: any) => ({ id: r.id, tag: tag(r.n), job: names[r.job_id] || "", part: r.part, what: r.what, kind: r.kind, status: r.status,
        sent_at: r.sent_at, done_at: r.done_at, checked_at: r.checked_at, note: r.jesse_note, photos: (r.photos || []).map((p: string) => urls[p]).filter(Boolean) })) });
    }

    if (body.action === "mark") {
      const st = String(body.status || "");
      if (!["done", "question", "sent"].includes(st)) return json({ error: "bad status" }, 400);
      const { data: r } = await db.from("gvc_revisions").select("id,n,status,what,jesse_note").eq("id", String(body.id || "")).maybeSingle();
      if (!r) return json({ error: "Not found" }, 404);
      if (!["sent", "question", "done"].includes(r.status)) return json({ error: "Kyle has already closed this one." }, 409);
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : null;
      if (st === "question" && !note) return json({ error: "Write the question first." }, 400);
      const patch: any = { status: st, updated_at: new Date().toISOString() };
      if (st === "done") patch.done_at = new Date().toISOString();
      if (st === "sent") patch.done_at = null;
      if (note) patch.jesse_note = note;
      const { error } = await db.from("gvc_revisions").update(patch).eq("id", r.id);
      if (error) return json({ error: error.message }, 500);
      const text = st === "done" ? `${tag(r.n)} is updated${note ? ": " + note : ""} - check it when you can. (${r.what.slice(0, 80)})`
        : st === "question" ? `Question on ${tag(r.n)} (${r.what.slice(0, 60)}): ${note}`
        : `${tag(r.n)} isn't done after all - back on my list.`;
      await db.from("gvc_messages").insert({ from_name: "Jessie", to_name: "Kyle", text });
      return json({ ok: true });
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
