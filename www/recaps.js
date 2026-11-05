/* ---------- Conversation recaps (Kyle, 2026-11-04) ----------
   Every recording (Record button, widget Rec, uploaded call) gets a recap of where the talk ENDED UP:
   what I'm doing, crew, decided, what changed during the talk, not settled. Stored in gvc_recaps with the transcript.
   - pops up as soon as a recording is processed
   - Home shows the latest one; More > Talks lists them all
   - Ask Claude sees the last few, so "what did Randy and I decide?" works */
(()=>{
const css=document.createElement("style");
css.textContent=`
.rcp h3{margin:0 0 2px;font:600 20px Oswald,sans-serif;letter-spacing:.06em}
.rcp .when{font-size:12px;color:var(--muted);margin-bottom:10px}
.rcp .body{white-space:pre-wrap;font-size:15px;line-height:1.55;background:rgba(0,0,0,.25);border:1px solid var(--line);border-left:4px solid #ff8a2a;border-radius:10px;padding:12px 14px}
.rcp .body b{display:block;font:600 12px Oswald,sans-serif;letter-spacing:.14em;color:#ffb36b;margin:10px 0 2px}
.rcp .body b:first-child{margin-top:0}
.rcp details{margin-top:10px}.rcp summary{cursor:pointer;color:var(--muted);font-size:13px}
.rcp .tx{white-space:pre-wrap;font-size:13px;color:#b9bec6;max-height:50vh;overflow:auto;margin-top:6px;padding:8px;border:1px solid var(--line);border-radius:8px}
.rcl button.it{display:block;width:100%;text-align:left;background:linear-gradient(90deg,rgba(255,138,42,.1),transparent 60%);border:1px solid #2a2e34;border-left:4px solid #ff8a2a;border-radius:12px;padding:10px 12px;margin-bottom:6px;color:var(--text);font:inherit;cursor:pointer}
.rcl .it b{font-size:14.5px}.rcl .it small{display:block;color:var(--muted);font-size:12px;margin-top:2px}
.rlast{display:flex;align-items:center;gap:8px;width:100%;margin-top:8px;background:rgba(255,138,42,.08);border:1px solid rgba(255,138,42,.35);border-radius:10px;padding:8px 10px;color:#ffd2a8;font:500 13px Inter,sans-serif;cursor:pointer;text-align:left}
`;
document.head.appendChild(css);
let recaps=[], loaded=false;
const fmt=at=>{ try{ return new Date(at).toLocaleString("en-CA",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}); }catch(e){ return ""; } };
const pretty=t=>esc(t||"").replace(/^(WHAT I'M DOING|WHAT I&#39;M DOING|CREW|DECIDED|CHANGED DURING THE TALK|NOT SETTLED)\s*[:\-]?\s*$/gm,"<b>$1</b>").replace(/^(WHAT I'M DOING|WHAT I&#39;M DOING|CREW|DECIDED|CHANGED DURING THE TALK|NOT SETTLED)\s*[:\-]\s*/gm,"<b>$1</b>");
async function load(){ if(typeof db==="undefined"||!db) return; const r=await sb.from("gvc_recaps").select("id,at,created_at,title,recap,transcript").order("created_at",{ascending:false}).limit(40); if(!r.error){ recaps=r.data||[]; loaded=true; } }
window.loadRecaps=load;
window.latestRecap=()=>recaps[0]||null;
function dlg(html){ openId=null; $("#dlg").innerHTML=html; $("#scrim").classList.add("on"); }
function show(r){
  dlg(`<div class="rcp"><h3>${esc(r.title||"Conversation")}</h3><div class="when">${fmt(r.at||r.created_at)} · where the conversation ended up</div>
    <div class="body">${r.recap?pretty(r.recap):"No recap - see the transcript."}</div>
    ${r.transcript?`<details><summary>Full transcript</summary><div class="tx">${esc(r.transcript)}</div></details>`:""}
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="rcAsk">Ask Claude about it</button><button class="btn ghost" type="button" id="rcAll">All talks</button><span style="flex:1"></span><button class="btn" type="button" onclick="closeDlg()">Close</button></div></div>`);
  $("#rcAll").onclick=()=>window.openRecaps();
  $("#rcAsk").onclick=()=>{ closeDlg(); const f=$("#chatFab"); if(f&&f.onclick) f.onclick(); setTimeout(()=>{ const b=$("#chatIn"); if(b){ b.value=`About the talk "${r.title}" (${fmt(r.at||r.created_at)}): `; b.focus(); } },300); };
}
window.showRecap=async d=>{ await load(); const r=recaps.find(x=>x.id===d.recap_id)||{title:d.title,recap:d.recap,transcript:d.transcript,at:new Date().toISOString()}; show(r); if(typeof render==="function") render(); };
window.openRecaps=async()=>{ await load();
  dlg(`<div class="rcl"><h3 style="margin:0 0 10px;font:600 20px Oswald,sans-serif;letter-spacing:.06em">TALKS</h3>
    ${recaps.length?recaps.map((r,i)=>`<button class="it" type="button" data-rc="${i}"><b>${esc(r.title||"Conversation")}</b><small>${fmt(r.at||r.created_at)}</small></button>`).join(""):`<div class="tnote">No recorded conversations yet. Tap Record (or Rec on the widget) before you talk to Randy.</div>`}
    <div class="row" style="margin-top:10px"><span style="flex:1"></span><button class="btn" type="button" onclick="closeDlg()">Close</button></div></div>`);
  document.querySelectorAll("[data-rc]").forEach(b=>b.onclick=()=>show(recaps[+b.dataset.rc]));
};
// home: a line for the latest talk (last 3 days)
window.recapLine=()=>{ const r=recaps[0]; if(!r) return ""; if(Date.now()-new Date(r.created_at).getTime()>3*864e5) return "";
  return `<button class="rlast" type="button" onclick="window.showRecap({recap_id:'${r.id}'})">🎙 <span><b>Latest talk:</b> ${esc(r.title||"Conversation")} · ${fmt(r.at||r.created_at)} - tap to read</span></button>`; };
setInterval(()=>{ if(!loaded&&typeof db!=="undefined"&&db){ loaded=true; load().then(()=>{ if(typeof cur!=="undefined"&&cur==="home"&&typeof render==="function") render(); }); } },1500);
})();
