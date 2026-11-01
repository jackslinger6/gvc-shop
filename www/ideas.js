/* ---------- App ideas & bugs (table gvc_feedback) ----------
   The in-app Claude saves these with save_app_note; Kyle can add/edit here too.
   At home, Claude Code reads the table, builds them, and marks them done. */
(()=>{
let notes=[], loaded=false, adding=false, openIds=new Set(), showDone=false, ch=null;
const KIND={idea:["💡","New feature"],change:["🔧","Change how it works"],bug:["🐞","Something's broken"]};
const STATUS={new:"New",planned:"Planned",done:"Done",declined:"Not doing"};
const css=document.createElement("style");
css.textContent=`
.idv{margin-top:12px;max-width:980px}
.idv .lbl{font-size:12px;color:var(--muted)}
.idv .it{border:1px solid var(--line);border-radius:8px;padding:9px 12px;margin:7px 0;background:rgba(0,0,0,.28)}
.idv .it.done{opacity:.55}
.idv .ih{display:flex;gap:8px;align-items:center;flex-wrap:wrap;cursor:pointer}
.idv .ih b{font-weight:600}
.idv .ar{font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.idv .dt{white-space:pre-wrap;font-size:13px;margin-top:8px;line-height:1.45}
.idv .cv{white-space:pre-wrap;font-size:12px;color:var(--muted);margin-top:8px;border-left:2px solid var(--line);padding-left:8px}
.idv .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px}
.idv input,.idv select,.idv textarea{font:inherit;font-size:13px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:5px 8px}
.idv textarea{width:100%;min-height:90px}
.idv select{width:auto}
.idv .form{border:1px solid var(--orange);border-radius:8px;padding:10px 12px;margin:8px 0}
`;
document.head.appendChild(css);

async function load(){
  if(!db) return; const {data,error}=await sb.from("gvc_feedback").select("*").order("created_at",{ascending:false});
  if(!error){ notes=data||[]; loaded=true; }
  if(!ch){ ch=sb.channel("gvc_feedback").on("postgres_changes",{event:"*",schema:"public",table:"gvc_feedback"},()=>load()).subscribe(); }
  render();
}
setInterval(()=>{ if(db&&!loaded){ loaded=true; load(); } },1200);
const openCount=()=>notes.filter(n=>n.status==="new"||n.status==="planned").length;

window.renderIdeas=function(){
  const B=$("#board"); B.className="idv"; B.style.gridTemplateColumns="";
  const live=notes.filter(n=>showDone||n.status==="new"||n.status==="planned");
  let h=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h2 style="font-family:Oswald,sans-serif;letter-spacing:.05em;margin:0">App ideas &amp; fixes</h2><span style="flex:1"></span>
    <button class="btn sm primary" id="idTalk">Talk it through with Claude</button><button class="btn sm" id="idAdd">+ Write one</button><button class="btn sm ${showDone?"primary":""}" id="idDone">Show done</button></div>
    <div class="lbl" style="margin-top:6px">Tell the in-app Claude what you want changed or what's not working. It talks it through and saves it here. At home, ask Claude to "go through the app ideas" and it builds the next version.</div>`;
  if(adding) h+=`<div class="form"><div class="row" style="margin-top:0"><select id="nfK">${Object.entries(KIND).map(([k,v])=>`<option value="${k}">${v[0]} ${v[1]}</option>`).join("")}</select>
      <input id="nfA" placeholder="Where (e.g. Week planner)" style="width:180px"><input id="nfT" placeholder="Short name" style="flex:1;min-width:160px"></div>
      <div class="row"><textarea id="nfD" placeholder="How it should work"></textarea></div>
      <div class="row"><span style="flex:1"></span><button class="btn sm" id="nfX">Cancel</button><button class="btn sm primary" id="nfS">Save</button></div></div>`;
  h+=live.map(n=>{ const k=KIND[n.kind]||KIND.idea; const o=openIds.has(n.id);
    return `<div class="it ${n.status==="done"||n.status==="declined"?"done":""}"><div class="ih" data-io="${n.id}"><span>${k[0]}</span><b>${esc(n.title)}</b>${n.area?`<span class="ar">${esc(n.area)}</span>`:""}<span style="flex:1"></span><span class="lbl">${STATUS[n.status]||n.status} · ${fmt(n.created_at)}</span><span class="lbl">${o?"▲":"▼"}</span></div>
      ${o?`<textarea class="dt" data-id="${n.id}" style="margin-top:8px">${esc(n.details||"")}</textarea>
        ${n.conversation?`<div class="cv">${esc(n.conversation)}</div>`:""}${n.done_note?`<div class="cv" style="border-color:#3ad06b">Done: ${esc(n.done_note)}</div>`:""}
        <div class="row"><select data-is="${n.id}">${Object.entries(STATUS).map(([s,t])=>`<option value="${s}" ${n.status===s?"selected":""}>${t}</option>`).join("")}</select><span style="flex:1"></span>
        <button class="btn sm" data-ichat="${n.id}">Talk about this</button><button class="btn sm danger" data-idel="${n.id}">Delete</button></div>`:""}</div>`; }).join("")||`<div class="empty" style="text-align:left">${loaded?"Nothing yet.":"Loading…"}</div>`;
  B.innerHTML=h;
  $("#idAdd").onclick=()=>{ adding=true; render(); setTimeout(()=>{ const t=$("#nfT"); if(t) t.focus(); },30); };
  $("#idDone").onclick=()=>{ showDone=!showDone; render(); };
  $("#idTalk").onclick=()=>askChat("I want to change something in the app: ");
  if(adding){ $("#nfX").onclick=()=>{ adding=false; render(); };
    $("#nfS").onclick=async()=>{ const title=$("#nfT").value.trim(); if(!title) return; const row={kind:$("#nfK").value,area:$("#nfA").value.trim()||null,title,details:$("#nfD").value.trim()};
      const {error}=await sb.from("gvc_feedback").insert(row); if(error){ alertLine(error.message); return; } adding=false; load(); }; }
  B.querySelectorAll("[data-io]").forEach(el=>el.onclick=()=>{ const id=el.dataset.io; openIds.has(id)?openIds.delete(id):openIds.add(id); render(); });
  B.querySelectorAll("textarea[data-id]").forEach(el=>el.onchange=async()=>{ await sb.from("gvc_feedback").update({details:el.value,updated_at:new Date().toISOString()}).eq("id",el.dataset.id); });
  B.querySelectorAll("[data-is]").forEach(el=>el.onchange=async()=>{ await sb.from("gvc_feedback").update({status:el.value,updated_at:new Date().toISOString()}).eq("id",el.dataset.is); load(); });
  B.querySelectorAll("[data-idel]").forEach(el=>el.onclick=async()=>{ const n=notes.find(x=>x.id===el.dataset.idel); notes=notes.filter(x=>x.id!==el.dataset.idel); render();
    await sb.from("gvc_feedback").delete().eq("id",n.id); todoToast(`Deleted "${n.title}"`,async()=>{ const {id,...rest}=n; await sb.from("gvc_feedback").insert({id,...rest}); load(); }); });
  B.querySelectorAll("[data-ichat]").forEach(el=>el.onclick=()=>{ const n=notes.find(x=>x.id===el.dataset.ichat); askChat(`About the app note "${n.title}": `); });
};
function alertLine(m){ const el=document.querySelector(".idv .lbl"); if(el) el.textContent="Couldn't save: "+m; }
function askChat(prefill){ const fab=$("#chatFab"); if(!$("#chatP").classList.contains("on")&&fab) fab.click(); const t=$("#chatIn"); if(t){ t.value=prefill; t.focus(); t.setSelectionRange(prefill.length,prefill.length); } }

const b=document.createElement("button"); b.className="btn"; b.type="button"; b.id="ideasBtn"; b.textContent="💡 App ideas";
const anchor=document.getElementById("ncrBtn")||document.getElementById("addJob"); anchor.parentNode.insertBefore(b,anchor);
b.onclick=()=>{ cur="ideas"; try{history.replaceState(null,"","#ideas")}catch(e){} render(); };
const _render=render;
render=function(){ _render(); const n=openCount(); b.textContent=n?`💡 App ideas (${n})`:"💡 App ideas"; b.classList.toggle("primary",cur==="ideas"); };
})();
