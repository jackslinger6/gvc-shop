/* ---------- Job numbers + Finished jobs archive ----------
   Every job name starts with its job number: "2011G - Kirby Controls Enclosure".
   Archived jobs (j.archived) are hidden from boards, crew and planner, and live in Finished jobs. */
(()=>{
const NUM_RE=/^\s*(\d{4}[A-Za-z0-9_]{0,4})\s*[-–:]?\s*/;
const jobNum=n=>{ const m=String(n||"").match(NUM_RE); return m?m[1].toUpperCase():""; };
const rest=n=>String(n||"").replace(NUM_RE,"").trim();
const withNum=(num,name)=>{ num=String(num||"").trim().toUpperCase(); const r=rest(name)||String(name||"").trim(); return num?`${num} - ${r}`:r; };
const jtype=n=>{ const m=jobNum(n).match(/^\d{4}([A-Z]+)/); return m?m[1]:""; };
window.jobNum=jobNum;
let aq="", atype="";
const css=document.createElement("style");
css.textContent=`
.flag.nonum{background:rgba(245,176,65,.12);color:#ffd28a;border-color:rgba(245,176,65,.45)}
.arv{margin-top:12px;max-width:1100px}
.arv .lbl{font-size:12px;color:var(--muted)}
.arv input{font:inherit;font-size:14px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 10px;width:100%;max-width:520px}
.arv .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0}
.arv .aj{display:grid;grid-template-columns:110px 1fr auto;gap:10px;align-items:start;border:1px solid var(--line);border-radius:8px;padding:9px 12px;margin:6px 0;background:rgba(0,0,0,.28);cursor:pointer}
.arv .aj:hover{border-color:#5a5f68}
.arv .num{font-family:Oswald,sans-serif;font-size:16px;letter-spacing:.04em}
.arv .meta{font-size:12px;color:var(--muted);margin-top:3px}
.numrow{display:flex;gap:10px}
`;
document.head.appendChild(css);

/* job dialog: Job # field + Archive/Restore */
const _draw=drawDlg;
drawDlg=function(){
  _draw(); const j=job(); if(!j) return; const D=$("#dlg");
  const nameIn=$("#fName"); if(nameIn){ const lab=nameIn.closest("label");
    const box=document.createElement("label"); box.style.maxWidth="130px"; box.innerHTML=`Job #<input id="fNum" value="${esc(jobNum(j.name))}" placeholder="e.g. 2015G" style="${jobNum(j.name)?"":"border-color:#f5b041"}">`;
    lab.before(box);
    const num=$("#fNum");
    num.oninput=()=>{ nameIn.value=withNum(num.value,nameIn.value); num.style.borderColor=num.value.trim()?"":"#f5b041"; };
    nameIn.addEventListener("input",()=>{ const n=jobNum(nameIn.value); if(n&&n!==num.value.toUpperCase()) num.value=n; });
  }
  const foot=D.querySelector(".foot");
  if(foot){ const b=document.createElement("button"); b.className="btn"; b.type="button"; b.id="archJob";
    b.textContent=j.archived?"Restore to the board":"Archive job (finished)"; foot.insertBefore(b,foot.querySelector("#save"));
    b.onclick=async()=>{ const jj=structuredClone(j); const now=new Date().toISOString();
      if(jj.archived){ delete jj.archived; jj.log=[...(jj.log||[]),{at:now,text:"Restored from Finished jobs"}]; }
      else { jj.archived=true; jj.archivedAt=now; jj.log=[...(jj.log||[]),{at:now,text:"Archived - job finished"}]; }
      const ok=await put(jj,(jj.archived?"Archived ":"Restored ")+jj.name); if(ok&&jj.archived) closeDlg(); };
  }
};

/* cards: flag missing job numbers */
const _render=render;
render=function(){
  _render();
  document.querySelectorAll("#board .card[data-id]").forEach(c=>{ const j=jobs.find(x=>x.id===c.dataset.id); if(j&&!jobNum(j.name)&&!c.querySelector(".nonum")) c.insertAdjacentHTML("beforeend",`<span class="flag nonum">No job #</span>`); });
  ab.textContent=archivedJobs.length?`Finished jobs (${archivedJobs.length})`:"Finished jobs"; ab.classList.toggle("primary",cur==="archive");
};
const _auto=autoTodos;
autoTodos=function(){ const out=_auto(); try{
  const hidden=new Set(todos.filter(t=>t.source==="auto").map(t=>t.text));
  const nn=jobs.filter(j=>!jobNum(j.name)&&!j.sample);
  if(nn.length){ const text=`Add job numbers: ${nn.map(j=>j.name).join(", ")}`; if(!hidden.has(text)) out.push({text,c:"#f5b041",low:true,job:nn[0].id}); }
  const dn=jobs.filter(j=>j.stage==="done");
  if(dn.length){ const text=`Archive finished job${dn.length>1?"s":""}: ${dn.map(j=>j.name).join(", ")}`; if(!hidden.has(text)) out.push({text,c:"#3ad06b",low:true,job:dn[0].id}); }
}catch(e){} return out; };

/* Finished jobs view */
function hay(j){ return [j.name,j.summary,j.folder,...(j.log||[]).map(l=>l.text),...(j.assemblies||[]).map(a=>a.name+" "+(a.who||"")),...(j.suppliers||[]).map(s=>s.name+" "+(s.quoteNo||"")),...(j.ncrs||[]).map(x=>x.what)].join(" ").toLowerCase(); }
window.renderArchive=function(){
  const B=$("#board"); B.className="arv"; B.style.gridTemplateColumns="";
  const types=[...new Set(archivedJobs.map(j=>jtype(j.name)).filter(Boolean))].sort();
  const words=aq.toLowerCase().split(/\s+/).filter(Boolean);
  const list=archivedJobs.filter(j=>(!atype||jtype(j.name)===atype)&&words.every(w=>hay(j).includes(w))).sort((a,b)=>String(b.archivedAt||"").localeCompare(String(a.archivedAt||"")));
  B.innerHTML=`<h2 style="font-family:Oswald,sans-serif;letter-spacing:.05em;margin:0">Finished jobs</h2>
   <div class="lbl" style="margin-top:4px">Archived jobs with everything that happened: tasks and who did them, suppliers and quotes, NCRs, notes. Tap one to open it (you can restore it to the board from there).</div>
   <div class="row"><input id="aQ" type="search" placeholder="Search number, name, person, supplier, quote #, note…" value="${esc(aq)}"></div>
   ${types.length?`<div class="row"><span class="lbl">Type</span><button class="btn sm ${atype?"":"primary"}" data-at="">All</button>${types.map(t=>`<button class="btn sm ${atype===t?"primary":""}" data-at="${t}">${t}</button>`).join("")}</div>`:""}
   ${list.map(j=>{ const who=[...new Set((j.assemblies||[]).flatMap(a=>whoList(a)))]; const done=(j.assemblies||[]).filter(a=>a.status==="done").length;
     return `<div class="aj" data-aj="${esc(j.id)}"><div class="num">${esc(jobNum(j.name)||"No #")}</div><div><b>${esc(rest(j.name)||j.name)}</b>
       <div class="meta">${(j.assemblies||[]).length?`${done}/${j.assemblies.length} tasks`:"No tasks"}${who.length?" · "+who.join(", "):""}${(j.suppliers||[]).length?" · "+j.suppliers.map(s=>s.name).join(", "):""}${(j.ncrs||[]).length?` · ${j.ncrs.length} NCR${j.ncrs.length>1?"s":""}`:""}</div>
       ${j.summary?`<div class="meta">${esc(j.summary)}</div>`:""}</div><div class="lbl">${j.archivedAt?fmt(j.archivedAt).split(" ").slice(0,2).join(" "):""}</div></div>`; }).join("")||`<div class="empty" style="text-align:left">${archivedJobs.length?"Nothing matches.":"No finished jobs yet. Open a job and tap \"Archive job (finished)\" when it's done."}</div>`}`;
  const q=$("#aQ"); q.oninput=()=>{ aq=q.value; const pos=q.selectionStart; render(); const n=$("#aQ"); if(n){ n.focus(); n.setSelectionRange(pos,pos); } };
  B.querySelectorAll("[data-at]").forEach(b=>b.onclick=()=>{ atype=b.dataset.at; render(); });
  B.querySelectorAll("[data-aj]").forEach(el=>el.onclick=()=>openJob(el.dataset.aj));
};
const ab=document.createElement("button"); ab.className="btn"; ab.type="button"; ab.id="archBtn"; ab.textContent="Finished jobs";
const anchor=document.getElementById("ideasBtn")||document.getElementById("addJob"); anchor.parentNode.insertBefore(ab,anchor);
ab.onclick=()=>{ cur="archive"; try{history.replaceState(null,"","#archive")}catch(e){} render(); };
})();
