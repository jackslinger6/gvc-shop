// GVC Vault - Microsoft (Outlook) sign-in callback. Deployed with verify_jwt OFF: Microsoft redirects here with ?code&state.
// The state was created by gvc-ai (action ms_start) for a signed-in shop member, so only a member can start a connection.
// Stores the refresh token in gvc_ms (service role only - no RLS policies). Scopes: Mail.ReadWrite (drafts), no Mail.Send.
import { createClient } from "jsr:@supabase/supabase-js@2";

const REDIRECT = (Deno.env.get("SUPABASE_URL") || "") + "/functions/v1/gvc-ms-auth";
// Supabase serves function responses on its own domain as plain text (no web pages), so send the person
// back to the app with the result in the address; the app shows it.
const APP = "https://jackslinger6.github.io/gvc-shop/";
const page = (title: string, msg: string, ok = true) => new Response(null, { status: 302, headers: { Location: APP + "#outlook=" + (ok ? "ok" : "fail") + "&msg=" + encodeURIComponent(title + ": " + msg) } });

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const code = u.searchParams.get("code"), state = u.searchParams.get("state"), err = [u.searchParams.get("error"), u.searchParams.get("error_description")].filter(Boolean).join(" - ");
  if (err) return page("Not connected", "Microsoft said: " + err, false);
  if (!code || !state) return page("Not connected", "Missing code - start again from the app (Ask Claude → Outlook).", false);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: st } = await admin.from("gvc_ms_state").select("state,created_at").eq("state", state).maybeSingle();
  if (!st || Date.now() - new Date(st.created_at).getTime() > 15 * 60 * 1000) return page("Not connected", "That sign-in link expired - start again from the app.", false);
  await admin.from("gvc_ms_state").delete().eq("state", state);
  const body = new URLSearchParams({ client_id: Deno.env.get("MS_CLIENT_ID") || "", client_secret: Deno.env.get("MS_CLIENT_SECRET") || "", grant_type: "authorization_code", code, redirect_uri: REDIRECT, scope: "offline_access Mail.ReadWrite User.Read" });
  const r = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", { method: "POST", body });
  const t = await r.json();
  if (!r.ok || !t.refresh_token) return page("Not connected", "Token exchange failed: " + (t.error_description || t.error || r.status), false);
  let email = "";
  try { const me = await (await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: "Bearer " + t.access_token } })).json(); email = me.mail || me.userPrincipalName || ""; } catch (_) { /* ignore */ }
  const { error } = await admin.from("gvc_ms").upsert({ id: "main", email, refresh_token: t.refresh_token, updated_at: new Date().toISOString() });
  if (error) return page("Not connected", "Couldn't save: " + error.message, false);
  return page("Outlook connected", `Claude in GVC Vault can now read ${email || "your"} email and write drafts there. It can't send - you press Send in Outlook. You can close this tab.`);
});
