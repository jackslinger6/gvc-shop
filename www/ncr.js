/* ---------- NCRs (non-conformances) ----------
   Stored on the job: j.ncrs = [{n, what, type, fix, mat, closed, at}]; rework tasks are normal job tasks with a.ncr = n.
   Hours come from the week planner's hour estimates for those tasks. */
(()=>{
const TYPES=["Design / drawing","Ordered wrong","Built wrong","Supplier / material","Customer change","Other"];
const FIXES=["Rework","Scrap and remake","Use as is","Deciding"];
const tag=n=>"NCR-"+String(n).padStart(3,"0");
const css=document.createElement("style");
css.textContent=`
.ncrsec .ncard{border:1px solid var(--line);border-left:4px solid var(--c,#e5483b);border-radius:8px;padding:8px 10px;margin-top:6px;background:rgba(0,0,0,.25)}
.ncrsec .nh{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ncrsec .nm{font-size:12px;color:var(--muted);margin-top:3px}
.ncrsec .nrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px}
.ncrsec .nrow input,.ncrsec .nrow select,.ncrsec textarea{font:inherit;font-size:13px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:4px 7px;width:auto}
.ncrsec .chip{font:inherit;font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--muted);cursor:pointer}
.ncrsec .chip.on{border-color:var(--orange);color:#fff;background:rgba(255,138,42,.15)}
.ncrsec .nform{border:1px solid var(--orange);border-radius:8px;padding:10px;margin-top:6px}
.ncrsec .nform label{display:block;font-size:12px;color:var(--muted);margin-top:8px}
.nst{font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid}
.ntag{font-size:10.5px;padding:0 6px;border-radius:999px;background:rgba(229,72,59,.15);color:#ff9b91;border:1px solid rgba(229,72,59,.45);margin-left:6px;white-space:nowrap}
.ntagsel{font:inherit;font-size:11px;background:transparent;color:var(--muted);border:1px solid var(--line);border-radius:5px;padding:1px 4px;margin-top:3px;width:auto}
.ncrv{margin-top:12px;max-width:1100px}
.ncrv table{width:100%;border-collapse:collapse;font-size:13px}
.ncrv th{text-align:left;font-weight:600;color:var(--muted);font-size:12px;padding:6px;border-bottom:1px solid var(--line)}
.ncrv td{padding:7px 6px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top}
.ncrv tr.clk{cursor:pointer}.ncrv tr.clk:hover td{background:rgba(255,255,255,.03)}
.ncrv .sum{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}
.ncrv .sum div{border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:rgba(0,0,0,.25)}
.ncrv .sum b{display:block;font-size:20px}
.ncrv .lbl{font-size:12px;color:var(--muted)}
`;
document.head.appendChild(css);

const planHours=(jid,aid)=>{ const P=window.gvcPlan; if(!P||!P.loaded()) return null; const h=(P.get().hours||{})["j:"+jid+":"+aid]; return h==null?null:Number(h); };
function stats(j,x){
  const ts=(j.assemblies||[]).filter(a=>a.ncr===x.n); let h=0,unk=0; ts.forEach(a=>{ const v=planHours(j.id,a.id); if(v==null) unk++; else h+=v; });
  const done=ts.length&&ts.every(a=>a.status==="done");
  const st=x.closed?"Closed":x.fix==="Deciding"?"Deciding":done?"Fixed":ts.length?"Rework to do":x.fix==="Use as is"?"Fixed":"Open";
  return {ts,h,unk,st};
}
const stColor={Closed:"#6c727a",Deciding:"#e5483b",Open:"#e5483b","Rework to do":"#ff8a2a",Fixed:"#3ad06b"};
const nextN=()=>jobs.reduce((m,j)=>Math.max(m,...(j.ncrs||[]).map(x=>x.n||0)),0)+1;
const money=n=>"$"+(Number(n)||0).toLocaleString("en-CA",{maximumFractionDigits:0});
function parseSteps(txt){ return String(txt||"").split(/\n/).map(s=>s.replace(/^[-*•\d.)\s]+/,"").trim()).filter(Boolean).map(s=>{ const m=s.match(/^(.*?)[\s,:-]+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?)?$/i); return m&&m[1]?{name:m[1].trim(),h:+m[2]}:{name:s,h:null}; }); }
async function saveSteps(j,n,steps){
  const P=window.gvcPlan; const added=steps.map(s=>({id:uid(),name:s.name,meta:"",status:"ready",who:"",final:false,ncr:n,_h:s.h}));
  j.assemblies=[...(j.assemblies||[]),...added.map(({_h,...a})=>a)];
  if(P&&P.loaded()){ const hrs=P.get().hours=P.get().hours||{}; added.forEach(a=>{ if(a._h!=null) hrs["j:"+j.id+":"+a.id]=a._h; }); }
  return added.length;
}
let form=null; // {jid, what,type,fix,steps,mat}
function section(j){
  const list=(j.ncrs||[]).slice().sort((a,b)=>a.n-b.n);
  const untagged=(j.assemblies||[]).filter(a=>!a.ncr);
  let h=`<div class="sec"><span>NCRs${list.length?` · ${list.filter(x=>stats(j,x).st!=="Closed"&&stats(j,x).st!=="Fixed").length} open`:""}</span><button class="btn sm" type="button" id="ncrAdd">⚠ Add NCR</button></div><div class="ncrsec">`;
  if(form&&form.jid===j.id) h+=`<div class="nform">
    <label>What went wrong<input id="nfWhat" value="${esc(form.what)}" placeholder="e.g. Door flange hits the Rat Pack" style="width:100%"></label>
    <label>Type</label><div class="nrow">${TYPES.map(t=>`<button type="button" class="chip ${form.type===t?"on":""}" data-nft="${t}">${t}</button>`).join("")}</div>
    <label>Fix</label><div class="nrow">${FIXES.map(t=>`<button type="button" class="chip ${form.fix===t?"on":""}" data-nfx="${t}">${t}</button>`).join("")}</div>
    <label>Rework steps - one per line, hours at the end (optional)<textarea id="nfSteps" rows="3" style="width:100%" placeholder="Cut bottom flange off doors 2h&#10;Grind and touch up paint 1h">${esc(form.steps)}</textarea></label>
    <div class="nrow"><span class="lbl" style="font-size:12px;color:var(--muted)">Extra material $</span><input id="nfMat" type="number" min="0" step="1" value="${esc(form.mat)}" style="width:90px"><span style="flex:1"></span><button class="btn sm" type="button" id="nfCancel">Cancel</button><button class="btn sm primary" type="button" id="nfSave">Save NCR</button></div></div>`;
  h+=list.map(x=>{ const s=stats(j,x);
    return `<div class="ncard" style="--c:${stColor[s.st]}"><div class="nh"><b>${tag(x.n)}</b><span style="flex:1">${esc(x.what)}</span><span class="nst" style="color:${stColor[s.st]};border-color:${stColor[s.st]}">${s.st}</span></div>
      <div class="nm">${esc(x.type)} · ${esc(x.fix)} · ${s.h?s.h+"h":"0h"} rework${s.unk?` (+${s.unk} task${s.unk>1?"s":""} with no estimate)`:""}${x.mat?` · ${money(x.mat)} material`:""} · logged ${fmt(x.at)}</div>
      ${s.ts.length?`<div class="nm">Rework: ${s.ts.map(a=>`${a.status==="done"?"✓ ":""}${esc(a.name)}${planHours(j.id,a.id)!=null?" "+planHours(j.id,a.id)+"h":""}`).join(" · ")}</div>`:""}
      <div class="nrow"><select data-nfix="${x.n}" aria-label="Fix">${FIXES.map(f=>`<option ${x.fix===f?"selected":""}>${f}</option>`).join("")}</select>
        <input data-nstep="${x.n}" placeholder="Add rework step, e.g. Re-drill holes 1.5h" style="flex:1;min-width:180px"><button class="btn sm" type="button" data-nstepgo="${x.n}">Add</button>
        ${untagged.length?`<select data-ntag="${x.n}" aria-label="Tag an existing task"><option value="">Tag an existing task…</option>${untagged.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("")}</select>`:""}
        <span class="lbl" style="font-size:12px;color:var(--muted)">$</span><input data-nmat="${x.n}" type="number" min="0" value="${x.mat||""}" placeholder="material" style="width:84px">
        <button class="btn sm" type="button" data-nclose="${x.n}">${x.closed?"Reopen":"Close"}</button><button class="btn sm danger" type="button" data-ndel="${x.n}" aria-label="Delete ${tag(x.n)}">Delete</button></div></div>`; }).join("");
  if(!list.length&&!form) h+=`<div class="empty" style="text-align:left">No NCRs. If something was designed, ordered or built wrong, log it here so the rework and cost get tracked.</div>`;
  return h+`</div>`;
}
const mut=async(label,fn)=>{ const j=structuredClone(job()); j.ncrs=j.ncrs||[]; if(fn(j)===false) return; j.log=[...(j.log||[]),{at:new Date().toISOString(),text:label}]; await put(j,label); const P=window.gvcPlan; if(P&&P.loaded()) await P.save(); };
const _draw=drawDlg;
drawDlg=function(){
  _draw(); const j=job(); if(!j) return; const D=$("#dlg");
  const supSec=[...D.querySelectorAll(".sec")].find(s=>/Suppliers/.test(s.textContent));
  const wrap=document.createElement("div"); wrap.innerHTML=section(j);
  if(supSec) supSec.before(...wrap.childNodes); else D.querySelector(".foot").before(...wrap.childNodes);
  // tag rework tasks in the task table, and let any task be tagged
  const rows=D.querySelectorAll(".at tbody tr"); (j.assemblies||[]).forEach((a,k)=>{ const nm=rows[k]&&rows[k].querySelector(".an2"); if(!nm) return;
    if(a.ncr) nm.insertAdjacentHTML("beforeend",`<span class="ntag">${tag(a.ncr)}</span>`);
    else if((j.ncrs||[]).length) nm.insertAdjacentHTML("afterend",`<select class="ntagsel" data-ntask="${esc(a.id)}" aria-label="Rework for an NCR"><option value="">Not rework</option>${j.ncrs.map(x=>`<option value="${x.n}">Rework for ${tag(x.n)}</option>`).join("")}</select>`); });
  $("#ncrAdd").onclick=()=>{ form={jid:j.id,what:"",type:TYPES[0],fix:"Rework",steps:"",mat:""}; drawDlg(); setTimeout(()=>{ const w=$("#nfWhat"); if(w) w.focus(); },30); };
  if(form&&form.jid===j.id){
    $("#nfWhat").oninput=e=>form.what=e.target.value; $("#nfSteps").oninput=e=>form.steps=e.target.value; $("#nfMat").oninput=e=>form.mat=e.target.value;
    D.querySelectorAll("[data-nft]").forEach(b=>b.onclick=()=>{ form.type=b.dataset.nft; drawDlg(); });
    D.querySelectorAll("[data-nfx]").forEach(b=>b.onclick=()=>{ form.fix=b.dataset.nfx; drawDlg(); });
    $("#nfCancel").onclick=()=>{ form=null; drawDlg(); };
    $("#nfSave").onclick=async()=>{ if(!form.what.trim()){ $("#err").textContent="Say what went wrong first."; return; }
      const f=form, n=nextN(); form=null;
      await mut(`${tag(n)} logged: ${f.what.trim()}`,jj=>{ jj.ncrs.push({n,what:f.what.trim(),type:f.type,fix:f.fix,mat:Number(f.mat)||0,closed:false,at:new Date().toISOString()}); saveSteps(jj,n,parseSteps(f.steps)); }); };
  }
  D.querySelectorAll("[data-nfix]").forEach(el=>el.onchange=()=>mut(`${tag(+el.dataset.nfix)} fix: ${el.value}`,jj=>{ jj.ncrs.find(x=>x.n===+el.dataset.nfix).fix=el.value; }));
  D.querySelectorAll("[data-nmat]").forEach(el=>el.onchange=()=>mut(`${tag(+el.dataset.nmat)} material ${money(el.value)}`,jj=>{ jj.ncrs.find(x=>x.n===+el.dataset.nmat).mat=Number(el.value)||0; }));
  const addStep=n=>{ const el=D.querySelector(`[data-nstep="${n}"]`); const st=parseSteps(el.value); if(!st.length) return; mut(`${tag(n)}: added ${st.map(s=>s.name).join(", ")}`,jj=>{ saveSteps(jj,n,st); const x=jj.ncrs.find(y=>y.n===n); if(x.fix==="Deciding") x.fix="Rework"; }); };
  D.querySelectorAll("[data-nstepgo]").forEach(b=>b.onclick=()=>addStep(+b.dataset.nstepgo));
  D.querySelectorAll("[data-nstep]").forEach(el=>el.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); addStep(+el.dataset.nstep); } });
  D.querySelectorAll("[data-ntag]").forEach(el=>el.onchange=()=>{ if(!el.value) return; mut(`Tagged task as rework for ${tag(+el.dataset.ntag)}`,jj=>{ const a=jj.assemblies.find(x=>x.id===el.value); if(a) a.ncr=+el.dataset.ntag; }); });
  D.querySelectorAll("[data-ntask]").forEach(el=>el.onchange=()=>mut(el.value?`Tagged task as rework for ${tag(+el.value)}`:"Untagged rework task",jj=>{ const a=jj.assemblies.find(x=>x.id===el.dataset.ntask); if(!a) return false; if(el.value) a.ncr=+el.value; else delete a.ncr; }));
  D.querySelectorAll("[data-nclose]").forEach(b=>b.onclick=()=>mut(`${tag(+b.dataset.nclose)} ${b.textContent==="Close"?"closed":"reopened"}`,jj=>{ const x=jj.ncrs.find(y=>y.n===+b.dataset.nclose); x.closed=!x.closed; }));
  D.querySelectorAll("[data-ndel]").forEach(b=>b.onclick=()=>mut(`${tag(+b.dataset.ndel)} deleted`,jj=>{ const n=+b.dataset.ndel; jj.ncrs=jj.ncrs.filter(x=>x.n!==n); (jj.assemblies||[]).forEach(a=>{ if(a.ncr===n) delete a.ncr; }); }));
};

/* ---------- NCR log (all jobs) ---------- */
let showClosed=false;
function all(){ const out=[]; jobs.forEach(j=>(j.ncrs||[]).forEach(x=>out.push({j,x,s:stats(j,x)}))); return out.sort((a,b)=>b.x.n-a.x.n); }
window.renderNcr=function(){
  const B=$("#board"); B.className="ncrv"; B.style.gridTemplateColumns="";
  const P=window.gvcPlan; const rate=P&&P.loaded()?Number(P.get().ncrRate)||0:0;
  const A=all(); const live=A.filter(r=>showClosed||r.s.st!=="Closed");
  const H=A.reduce((a,r)=>a+r.s.h,0), M=A.reduce((a,r)=>a+(Number(r.x.mat)||0),0), open=A.filter(r=>!["Closed","Fixed"].includes(r.s.st)).length;
  const byType={}; A.forEach(r=>{ const t=byType[r.x.type]=byType[r.x.type]||{n:0,h:0,m:0}; t.n++; t.h+=r.s.h; t.m+=Number(r.x.mat)||0; });
  B.innerHTML=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h2 style="font-family:Oswald,sans-serif;letter-spacing:.05em;margin:0">NCR log</h2><span style="flex:1"></span>
     <span class="lbl">Shop rate for cost</span><input id="nRate" type="number" min="0" value="${rate||""}" placeholder="$/h" style="width:80px;font:inherit;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:4px 7px">
     <button class="btn sm ${showClosed?"primary":""}" id="nClosed">Show closed</button></div>
   <div class="sum"><div><span class="lbl">Open</span><b>${open}</b></div><div><span class="lbl">Rework hours</span><b>${+H.toFixed(1)}h</b></div><div><span class="lbl">Material</span><b>${money(M)}</b></div>${rate?`<div><span class="lbl">Total cost</span><b>${money(H*rate+M)}</b></div>`:""}
     ${Object.entries(byType).map(([t,v])=>`<div><span class="lbl">${esc(t)}</span><b>${v.n}</b><span class="lbl">${+v.h.toFixed(1)}h${v.m?" · "+money(v.m):""}</span></div>`).join("")}</div>
   ${live.length?`<table><thead><tr><th>NCR</th><th>Job</th><th>What went wrong</th><th>Type</th><th>Status</th><th>Hours</th><th>Material</th>${rate?"<th>Cost</th>":""}</tr></thead><tbody>
   ${live.map(r=>`<tr class="clk" data-nj="${esc(r.j.id)}"><td><b>${tag(r.x.n)}</b><div class="lbl">${fmt(r.x.at).split(" ").slice(0,2).join(" ")}</div></td><td>${esc(r.j.name)}</td><td>${esc(r.x.what)}<div class="lbl">${esc(r.x.fix)}</div></td><td>${esc(r.x.type)}</td>
     <td><span class="nst" style="color:${stColor[r.s.st]};border-color:${stColor[r.s.st]}">${r.s.st}</span></td><td>${+r.s.h.toFixed(1)}h${r.s.unk?` <span class="lbl">+${r.s.unk}?</span>`:""}</td><td>${r.x.mat?money(r.x.mat):""}</td>${rate?`<td>${money(r.s.h*rate+(Number(r.x.mat)||0))}</td>`:""}</tr>`).join("")}</tbody></table>`
   :`<div class="empty" style="text-align:left">No NCRs yet. Open a job and tap "Add NCR".</div>`}
   <div class="lbl" style="margin-top:8px">Hours come from the hour estimates on each NCR's rework tasks (set them in the week planner or when adding steps).</div>`;
  B.querySelectorAll("[data-nj]").forEach(tr=>tr.onclick=()=>openJob(tr.dataset.nj));
  $("#nClosed").onclick=()=>{ showClosed=!showClosed; render(); };
  $("#nRate").onchange=e=>{ if(P&&P.loaded()){ P.get().ncrRate=Number(e.target.value)||0; P.save(); render(); } };
};
const nb=document.createElement("button"); nb.className="btn"; nb.type="button"; nb.id="ncrBtn"; nb.textContent="NCRs";
const addJ=document.getElementById("addJob"); addJ.parentNode.insertBefore(nb,addJ);
nb.onclick=()=>{ cur="ncr"; try{history.replaceState(null,"","#ncr")}catch(e){} render(); };
const _render=render;
render=function(){ _render(); const n=all().filter(r=>!["Closed","Fixed"].includes(r.s.st)).length; nb.textContent=n?`NCRs (${n} open)`:"NCRs"; nb.classList.toggle("primary",cur==="ncr"); };
const _auto=autoTodos;
autoTodos=function(){ const out=_auto(); try{ const hidden=new Set(todos.filter(t=>t.source==="auto").map(t=>t.text));
  all().filter(r=>r.s.st==="Deciding").forEach(r=>{ const text=`Decide the fix for ${tag(r.x.n)} (${r.j.name}): ${r.x.what}`; if(!hidden.has(text)) out.push({text,c:"#e5483b",job:r.j.id}); }); }catch(e){} return out; };
window.ncrLines=()=>{ try{ return all().filter(r=>r.s.st!=="Closed").map(r=>`[NCR] ${tag(r.x.n)} ${r.j.name}: ${r.x.what} (${r.x.type}, fix: ${r.x.fix}, ${r.s.st}, ${+r.s.h.toFixed(1)}h rework${r.x.mat?", $"+r.x.mat+" material":""})`); }catch(e){ return []; } };
})();
