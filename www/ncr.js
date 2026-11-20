/* ---------- NCRs (non-conformances) ----------
   Stored on the job: j.ncrs = [{n, what, part, details, prevent, type, fix, mat, closed, at}]; rework tasks are normal job tasks with a.ncr = n.
   Hours come from the week planner's hour estimates for those tasks. */
(()=>{
const TYPES=["Design / drawing","Ordered wrong","Built wrong","Supplier / material","Customer change","Other"];
const FIXES=["Rework","Scrap and remake","Use as is","Deciding"];
const tag=n=>"NCR-"+String(n).padStart(3,"0");
const css=document.createElement("style");
css.textContent=`
.ncrsec .ntrack{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px}
.ncrsec .ntwf{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.ncrsec .ntk{font-size:13px;line-height:1.45}.ncrsec .ntk.done{color:var(--muted)}
.nwarn{color:#ff9b91;font-weight:600}
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
.ncrsec details{margin-top:5px}.ncrsec summary{cursor:pointer;font-size:12px;color:var(--muted)}
.ncrsec .ndet{white-space:pre-wrap;font-size:13px;margin-top:4px}
.ncrsec .nedit label{display:block;font-size:12px;color:var(--muted);margin-top:6px}
.ncrsec .nedit textarea,.ncrsec .nedit input{width:100%;box-sizing:border-box}
.ncrv tr.det td{background:rgba(255,255,255,.025);padding:4px 10px 12px}
.ncrv .dbox{white-space:pre-wrap;font-size:13px;line-height:1.45;max-width:900px}
.ncrv .dh{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-top:8px}
.ncrv .car{display:inline-block;width:14px;color:var(--muted)}
.ncrv .fbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}
.ncrv .fbar select{font:inherit;font-size:13px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:4px 7px}
@media (max-width:700px){.ncrv .hide-sm{display:none}}
`;
document.head.appendChild(css);

const planHours=(jid,aid)=>{ const P=window.gvcPlan; if(!P||!P.loaded()) return null; const h=(P.get().hours||{})["j:"+jid+":"+aid]; return h==null?null:Number(h); };
/* Follow-through (stage 7, Kyle Nov 14): an NCR is tracked by rework tasks (a.ncr = n), replacement orders (a supplier
   line with s.ncr = n) and model revisions (revsFor). Tracked is not resolved: when everything tracking it is done
   (tasks done, orders received, revisions checked) it goes to "To check", and only Accept & close closes it.
   Statuses: Deciding · Not tracked (decided, nothing tracking it) · In progress · To check · Closed. Everything but Closed is open. */
function stats(j,x){
  const ts=(j.assemblies||[]).filter(a=>a.ncr===x.n); let h=0,unk=0; ts.forEach(a=>{ const v=planHours(j.id,a.id); if(v==null) unk++; else h+=v; });
  const os=(j.suppliers||[]).filter(s=>s.ncr===x.n&&s.status!=="declined");
  const rv=window.revsFor?window.revsFor(j.id,x.n):[]; const rvOpen=rv.filter(r=>!["checked","dropped"].includes(r.status));
  const tOpen=ts.filter(a=>a.status!=="done"), oOpen=os.filter(s=>s.status!=="received");
  const tracked=ts.length+os.length+rv.length>0;
  // stage 7 review: tracked isn't underway - only a started task (In progress / Inspection), an open order or a revision counts as In progress
  const underway=tOpen.some(a=>["prog","qc"].includes(a.status))||oOpen.length||rvOpen.length;
  const st=x.closed?"Closed":x.fix==="Deciding"?"Deciding":underway?"In progress":tOpen.length?(tOpen.some(a=>!String(a.who||"").trim())?"Tracked - unassigned":"Tracked - not started"):(tracked||x.fix==="Use as is")?"To check":"Not tracked";
  return {ts,os,rv,rvOpen,tOpen,oOpen,h,unk,st};
}
const stColor={Closed:"#6c727a",Deciding:"#e5483b","Not tracked":"#e5483b","Tracked - unassigned":"#e04fa0","Tracked - not started":"#2f8ff0","In progress":"#ff8a2a","To check":"#f5b041"};
const isOpenSt=st=>st!=="Closed";
const nextN=()=>jobs.reduce((m,j)=>Math.max(m,...(j.ncrs||[]).map(x=>x.n||0)),0)+1;
const money=n=>"$"+(Number(n)||0).toLocaleString("en-CA",{maximumFractionDigits:0});
function parseSteps(txt){ return String(txt||"").split(/\n/).map(s=>s.replace(/^[-*•\d.)\s]+/,"").trim()).filter(Boolean).map(s=>{ const m=s.match(/^(.*?)[\s,:-]+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?)?$/i); return m&&m[1]?{name:m[1].trim(),h:+m[2]}:{name:s,h:null}; }); }
async function saveSteps(j,n,steps){
  const P=window.gvcPlan; const added=steps.map(s=>({id:uid(),name:s.name,meta:"",status:"ready",who:"",final:false,ncr:n,_h:s.h}));
  j.assemblies=[...(j.assemblies||[]),...added.map(({_h,...a})=>a)];
  if(P&&P.loaded()){ const hrs=P.get().hours=P.get().hours||{}; added.forEach(a=>{ if(a._h!=null) hrs["j:"+j.id+":"+a.id]=a._h; }); }
  return added.length;
}
let form=null; // {jid, what,part,details,type,fix,steps,mat, photos:[{blob}|{path}], restored}
/* Drafts (Nov 19): the open NCR form is kept on this phone (GVCDraft "ncr:<job id>") as you type and right before the
   camera opens, so leaving the app, Android closing it, or a failed save never loses it. Cleared only after the NCR
   is saved, or on Discard. */
const DK=jid=>"ncr:"+jid;
const D_=window.GVCDraft, PH=window.GVCPhotos;
const draftOf=f=>({jid:f.jid,what:f.what||"",part:f.part||"",details:f.details||"",type:f.type,fix:f.fix,steps:f.steps||"",mat:f.mat||"",photos:(f.photos||[]).map(p=>p.path?{path:p.path,blob:p.blob}:{blob:p.blob})});
const hasContent=f=>!!(f&&((f.what||"").trim()||(f.part||"").trim()||(f.details||"").trim()||(f.steps||"").trim()||(f.photos||[]).length));
const saveDraft=D_?D_.saver(()=>DK(form?form.jid:""),()=>form&&hasContent(form)?draftOf(form):null,()=>document.getElementById("nfDraft")):()=>{};
async function startForm(jid,pre){ const nb0=document.getElementById("ncrDraftNote"); if(nb0) nb0.remove(); let d=null; try{ d=D_&&await D_.load(DK(jid)); }catch(e){}
  if(d){ form=Object.assign({jid,what:"",type:TYPES[0],fix:"Rework",steps:"",mat:"",photos:[]},d,{restored:d._at||Date.now()}); form.photos=(d.photos||[]).filter(p=>p.blob||p.path);
    if(pre&&pre.details&&!(form.details||"").includes(pre.details)) form.details=(form.details?form.details+"\n":"")+pre.details; }
  else form=Object.assign({jid,what:"",type:TYPES[0],fix:"Rework",steps:"",mat:"",photos:[]},pre||{});
  return form; }
/* photos already on saved NCRs: private bucket gvc-photos, shown with signed links (12 h) */
const phUrls={}, phAsk=new Set();
async function signPhotos(paths){ const need=paths.filter(p=>!phUrls[p]&&!phAsk.has(p)); if(!need.length||typeof sb==="undefined") return; need.forEach(p=>phAsk.add(p));
  try{ const r=await sb.storage.from("gvc-photos").createSignedUrls(need,60*60*12); (r.data||[]).forEach(u=>{ if(u.signedUrl) phUrls[u.path]=u.signedUrl; }); }catch(e){}
  // fill in just the waiting thumbnails - never redraw the screen (that would interrupt typing)
  document.querySelectorAll("[data-nphp]").forEach(el=>{ const u=phUrls[el.dataset.nphp]; if(!u) return; const a=document.createElement("a"); a.className="t"; a.href=u; a.target="_blank"; a.rel="noopener"; a.innerHTML=`<img src="${esc(u)}" alt="${esc(el.getAttribute("aria-label")||"Photo")}">`; el.replaceWith(a); }); }
async function uploadPh(jid,blob){ const p=`ncr/${jid}/${Date.now()}-${Math.random().toString(36).slice(2,6)}.jpg`;
  const {error}=await sb.storage.from("gvc-photos").upload(p,blob,{contentType:"image/jpeg"}); if(error) throw error; return p; }
let tw=null;   // "jobid:n" - the NCR whose + Rework task form is open
const trk=new Set();   // NCR cards with the "Track corrective action" choices open
const openCards=new Set();
function section(j){
  const list=(j.ncrs||[]).slice().sort((a,b)=>a.n-b.n);
  const untagged=(j.assemblies||[]).filter(a=>!a.ncr);
  let h=`<div class="sec"><span>NCRs${list.length?` · ${list.filter(x=>isOpenSt(stats(j,x).st)).length} open`:""}</span><button class="btn sm${D_&&D_.has(DK(j.id))&&!(form&&form.jid===j.id)?" primary":""}" type="button" id="ncrAdd">${D_&&D_.has(DK(j.id))&&!(form&&form.jid===j.id)?"⚠ Resume unfinished NCR":"⚠ Add NCR"}</button></div><div class="ncrsec">`;
  if(form&&form.jid===j.id) h+=`<div class="nform">
    ${form.restored?`<div class="nm" style="color:#ffd28a">Unfinished NCR from ${D_.ago(form.restored)} - carried on where you left off.</div>`:""}
    <label>What went wrong<input id="nfWhat" value="${esc(form.what)}" placeholder="e.g. Door flange hits the Rat Pack" style="width:100%"></label>
    <label>Part number(s) (optional)<input id="nfPart" value="${esc(form.part||"")}" placeholder="e.g. HEADACHE.5" style="width:100%"></label>
    <label>Details - what happened, why, how it was found (optional)<textarea id="nfDet" rows="3" style="width:100%">${esc(form.details||"")}</textarea></label>
    <label>Photos (optional)</label>${PH?PH.strip(form.photos,"nf"):""}
    <div class="nrow"><button class="btn sm gph-add" type="button" id="nfPhAdd">📷 Add photo</button><span class="gph-draft" id="nfDraft" aria-live="polite"></span></div>
    <label>Type</label><div class="nrow">${TYPES.map(t=>`<button type="button" class="chip ${form.type===t?"on":""}" data-nft="${t}">${t}</button>`).join("")}</div>
    <label>Fix</label><div class="nrow">${FIXES.map(t=>`<button type="button" class="chip ${form.fix===t?"on":""}" data-nfx="${t}">${t}</button>`).join("")}</div>
    <label>Rework steps - one per line, hours at the end (optional)<textarea id="nfSteps" rows="3" style="width:100%" placeholder="Cut bottom flange off doors 2h&#10;Grind and touch up paint 1h">${esc(form.steps)}</textarea></label>
    <div class="nrow"><span class="lbl" style="font-size:12px;color:var(--muted)">Extra material $</span><input id="nfMat" type="number" min="0" step="1" value="${esc(form.mat)}" style="width:90px"><span style="flex:1"></span><button class="btn sm" type="button" id="nfCancel">${hasContent(form)?"Discard":"Cancel"}</button><button class="btn sm primary" type="button" id="nfSave">Save NCR</button></div><div class="nm" id="nfMsg" style="color:#ffd28a" aria-live="assertive"></div></div>`;
  // each NCR: the issue, the decision, what's next and who's on it; editing / rework / cost / history fold away (stage 4)
  const card=x=>{ const s=stats(j,x); const rv=s.rv;
    const tk=j.id+":"+x.n, admin=isAdminRole();
    const SUPT=o=>window.supT?window.supT(o):o.status;
    // what's tracking this NCR, open items first (stage 7)
    const items=[...s.ts.map(a=>({open:a.status!=="done",h:`Rework: ${esc(a.name)} · ${a.who?esc(a.who):"<span class='nwarn'>nobody assigned</span>"} · ${a.status==="done"?"done":esc((typeof AST!=="undefined"&&AST[a.status]||{}).t||a.status)}`})),
      ...s.os.map(o=>({open:o.status!=="received",h:`Replacement: ${esc(o.name)}${o.po||o.rfq?" "+esc(o.po||o.rfq):""} · ${esc(SUPT(o))}`})),
      ...rv.map(r=>({open:!["checked","dropped"].includes(r.status),h:`Model: ${window.revTag?window.revTag(r):"REV"} · ${window.revStatus?window.revStatus(r.status):r.status}`}))]
      .sort((p,q)=>q.open-p.open);
    const next=s.st==="Deciding"?"Decide the fix":s.st==="Not tracked"?"":s.st==="In progress"?"Finish the work tracked below":s.st==="Tracked - unassigned"?"Assign the rework to someone":s.st==="Tracked - not started"?"Rework is assigned - not started yet":s.st==="To check"?(items.length?"Check the rework / replacement, then accept and close":"Accept and close when you're happy with it"):"";
    const tOpenNow=trk.has(tk)||tw===tk;
    const trackRow=admin&&s.st!=="Closed"&&s.st!=="Deciding"?(!tOpenNow?`<div class="ntrack"><button class="btn sm${s.st==="Not tracked"?" primary":""}" type="button" data-ntrk="${x.n}">${items.length?"Track more corrective action":"Track corrective action"} ▾</button></div>`:`<div class="ntrack"><button class="btn sm ghost" type="button" data-ntrk="${x.n}" aria-label="Hide">▴</button>
        <button class="btn sm" type="button" data-ntw="${x.n}">+ Rework task</button>
        <button class="btn sm" type="button" data-nord="${x.n}|rfq">+ Replacement RFQ</button><button class="btn sm" type="button" data-nord="${x.n}|po">+ Replacement PO</button>
        ${(j.suppliers||[]).some(o=>o.status!=="declined"&&o.ncr!==x.n)?`<select class="ntagsel" data-nlink="${x.n}" aria-label="Link an existing order"><option value="">Link an existing order…</option>${(j.suppliers||[]).filter(o=>o.status!=="declined"&&o.ncr!==x.n).map(o=>`<option value="${esc(o.id)}">${esc(o.name)}${o.po||o.rfq?" "+esc(o.po||o.rfq):""} · ${esc(SUPT(o))}${o.ncr?" (on "+tag(o.ncr)+")":""}</option>`).join("")}</select>`:""}
        <button class="btn sm" type="button" data-nrev="${x.n}">Model change → Jessie</button></div>`)+`
      ${tw===tk?`<div class="ntwf"><input data-ntwn="${x.n}" placeholder="What needs doing, e.g. Re-drill 6 holes 1.5h" style="flex:2;min-width:180px"><select data-ntwo="${x.n}" aria-label="Who"><option value="">Who - nobody yet</option>${CREW.map(c=>`<option>${c}</option>`).join("")}</select><button class="btn sm ghost" type="button" data-ntwx="${x.n}">Cancel</button><button class="btn sm primary" type="button" data-ntwgo="${x.n}">Add task</button></div>`:""}`:"";
    return `<div class="ncard" style="--c:${stColor[s.st]}">
      <div class="nh"><b>${tag(x.n)}</b><span class="ostat" style="--c:${stColor[s.st]}">${s.st}</span><span style="flex:1"></span><span class="nm" style="margin:0">${esc(x.type)}</span></div>
      <div class="nwhat">${esc(x.what)}${x.part?(x.part.length>90?`<details class="nparts"><summary class="nm">${esc(x.part.slice(0,x.part.lastIndexOf(",",80)>20?x.part.lastIndexOf(",",80):80))}… <u>show all ${x.part.split(",").length} affected parts</u></summary><span class="nm">${esc(x.part)}</span></details>`:`<span class="nm"> · ${esc(x.part)}</span>`):""}</div>
      ${(x.photos||[]).length?`<div class="gph-strip">${x.photos.map((p,i)=>phUrls[p]?`<a class="t" href="${esc(phUrls[p])}" target="_blank" rel="noopener"><img src="${esc(phUrls[p])}" alt="${tag(x.n)} photo ${i+1}"></a>`:`<div class="t" data-nphp="${esc(p)}" aria-label="${tag(x.n)} photo ${i+1}"></div>`).join("")}</div>`:""}
      <div class="nrow" style="margin-top:4px"><button class="btn sm ghost" type="button" data-nph="${x.n}">📷 Add photo</button></div>
      <dl class="nkv"><dt>Decision</dt><dd>${x.decision?esc(x.decision):`<span style="color:var(--muted)">${x.fix==="Deciding"?"Not decided yet":esc(x.fix)}</span>`}</dd>
        ${next?`<dt>Next</dt><dd><b>${esc(next)}</b> <span class="nm" style="display:inline">· ${s.st==="In progress"||s.st==="Tracked - not started"?"see below":"Kyle"}</span></dd>`:""}
        ${s.st==="Not tracked"?`<dt>Next</dt><dd><span class="nwarn">Nothing tracks this yet.</span> <span class="nm" style="display:inline">A written decision isn't the fix - add the rework task, replacement order or model change that does it.</span></dd>`:""}
        ${items.length?`<dt>Tracking</dt><dd>${items.map(i=>`<div class="ntk${i.open?"":" done"}">${i.open?"○":"✓"} ${i.h}</div>`).join("")}</dd>`:""}
        ${x.closed&&x.acceptedBy?`<dt>Accepted</dt><dd>${esc(x.acceptedBy)} · ${fmt(x.acceptedAt)}</dd>`:""}</dl>
      ${trackRow}
      ${admin&&s.st==="To check"?`<div class="nrow"><button class="btn sm primary" type="button" data-naccept="${x.n}">✓ Checked - accept &amp; close</button></div>`:""}
      <details ${openCards.has(j.id+":"+x.n)?"open":""} data-ndetails="${x.n}"><summary>Edit, rework &amp; details</summary><div class="nedit">
        <div class="nm">${esc(x.type)} · ${esc(x.fix)} · ${s.h?s.h+"h":"0h"} rework${s.unk?` (+${s.unk} task${s.unk>1?"s":""} with no estimate)`:""}${x.mat?` · ${money(x.mat)} material`:""} · logged ${fmt(x.at)}</div>
        ${rv.map(r=>`<div class="nm">Model revision ${window.revTag(r)}: ${esc(r.what)} · <b>${window.revStatus(r.status)}</b></div>`).join("")}
        ${s.ts.length?`<div class="nrw"><span class="nm" style="margin:0">Rework tasks</span>${s.ts.map(a=>`<span class="nrt">${a.status==="done"?"✓ ":""}${esc(a.name)}${planHours(j.id,a.id)!=null?" "+planHours(j.id,a.id)+"h":""}${a.who?` · ${esc(a.who)}`:""}<button type="button" class="rmb" data-nuntag="${esc(a.id)}" aria-label="Not rework for ${tag(x.n)}: ${esc(a.name)}" title="Not rework for this NCR">×</button></span>`).join("")}</div>`:""}
        <div class="nrow"><label class="nlab">Fix<select data-nfix="${x.n}">${FIXES.map(f=>`<option ${x.fix===f?"selected":""}>${f}</option>`).join("")}</select></label>
          <label class="nlab" style="flex:2;min-width:200px">Add a rework step<span style="display:flex;gap:6px"><input data-nstep="${x.n}" placeholder="e.g. Re-drill holes 1.5h" style="flex:1"><button class="btn sm" type="button" data-nstepgo="${x.n}">Add</button></span></label></div>
        <div class="nrow">${untagged.length?`<label class="nlab" style="flex:2;min-width:200px">Or tag an existing task<select data-ntag="${x.n}"><option value="">Pick a task…</option>${untagged.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("")}</select></label>`:""}
          <label class="nlab" style="max-width:140px">Extra material $<input data-nmat="${x.n}" type="number" min="0" value="${x.mat||""}" placeholder="0"></label></div>
        <label>What happened, why, how it was found<textarea rows="3" data-ndet="${x.n}">${esc(x.details||"")}</textarea></label>
        <label>Part number(s)<input data-npart="${x.n}" value="${esc(x.part||"")}"></label>
        <label>What stops it happening again<textarea rows="2" data-nprev="${x.n}">${esc(x.prevent||"")}</textarea></label>
        <div class="nrow nacts"><button class="btn sm" type="button" data-nrev="${x.n}">Model change → Jessie</button><button class="btn sm" type="button" data-nclose="${x.n}">${x.closed?"Reopen":"Close"}</button><span style="flex:1"></span><button class="btn sm danger" type="button" data-ndel="${x.n}" aria-label="Delete ${tag(x.n)}">Delete NCR</button></div>
      </div></details></div>`; };
  const live=list.filter(x=>stats(j,x).st!=="Closed"), shut=list.filter(x=>stats(j,x).st==="Closed");
  h+=live.map(card).join("");
  if(shut.length) h+=`<details class="nclosed"><summary>Closed · ${shut.length}</summary>${shut.map(card).join("")}</details>`;
  if(!list.length&&!form) h+=`<div class="empty" style="text-align:left">No NCRs. If something was designed, ordered or built wrong, log it here so the rework and cost get tracked.</div>`;
  return h+`</div>`;
}
const mut=async(label,fn)=>{ const j=structuredClone(job()); j.ncrs=j.ncrs||[]; if(fn(j)===false) return; j.log=[...(j.log||[]),{at:new Date().toISOString(),text:label}]; const ok=await put(j,label); if(ok===false) return false; const P=window.gvcPlan; if(P&&P.loaded()) await P.save(); return true; };
GVC.on("drawDlg:after",()=>{
  const j=job(); if(!j) return; const D=$("#dlg");
  const wrap=document.createElement("div"); wrap.innerHTML=section(j);
  const home=D.querySelector("#secNcr");   // the job card's NCRs section (stage 4)
  if(home) home.append(...wrap.childNodes); else { const supSec=[...D.querySelectorAll(".sec")].find(s=>/Suppliers/.test(s.textContent)); if(supSec) supSec.before(...wrap.childNodes); else D.querySelector(".foot").before(...wrap.childNodes); }
  // tag rework tasks in the task table, and let any task be tagged
  (j.assemblies||[]).forEach((a,k)=>{ const row=D.querySelector(`[data-task-i="${k}"]`); const nm=row&&row.querySelector(".an2"); if(!nm) return;
    if(a.ncr) nm.insertAdjacentHTML("beforeend",`<span class="ntag">${tag(a.ncr)}</span>`);
  });
  $("#ncrAdd").onclick=async()=>{ if(form&&form.jid===j.id) return; await startForm(j.id); drawDlg(); setTimeout(()=>{ const w=$("#nfWhat"); if(w) w.focus(); },30); };
  { const need=[]; (j.ncrs||[]).forEach(x=>(x.photos||[]).forEach(p=>need.push(p))); if(need.length) signPhotos(need); }
  D.querySelectorAll("[data-nph]").forEach(b=>b.onclick=async()=>{ const n=+b.dataset.nph; if(window.ME&&ME.preview){ $("#err").textContent="Preview - nothing is saved."; return; }
    const got=PH?await PH.pick({title:`Photo for ${tag(n)}`}):[]; if(!got.length) return;
    b.disabled=true; b.textContent="Uploading…"; const paths=[];
    try{ for(const g of got) paths.push(await uploadPh(j.id,g)); }catch(e){ $("#err").textContent="Couldn't upload the photo"+(navigator.onLine===false?" - no connection. Try again when you have signal.":": "+(e.message||e)); b.disabled=false; b.textContent="📷 Add photo"; return; }
    await mut(`${tag(n)}: ${paths.length} photo${paths.length>1?"s":""} added`,jj=>{ const x=jj.ncrs.find(y=>y.n===n); if(!x) return false; x.photos=[...(x.photos||[]),...paths]; }); });
  if(form&&form.jid===j.id){
    const ch=k=>e=>{ form[k]=e.target.value; saveDraft(); const c=$("#nfCancel"); if(c) c.textContent=hasContent(form)?"Discard":"Cancel"; };
    $("#nfWhat").oninput=ch("what"); $("#nfPart").oninput=ch("part"); $("#nfDet").oninput=ch("details"); $("#nfSteps").oninput=ch("steps"); $("#nfMat").oninput=ch("mat");
    D.querySelectorAll("[data-nft]").forEach(b=>b.onclick=()=>{ form.type=b.dataset.nft; saveDraft(); drawDlg(); });
    D.querySelectorAll("[data-nfx]").forEach(b=>b.onclick=()=>{ form.fix=b.dataset.nfx; saveDraft(); drawDlg(); });
    const beforeCam=async()=>{ if(D_) await D_.save(DK(form.jid),draftOf(form)); };   // saved right before the camera / picker opens
    const changed=()=>{ if(D_) D_.save(DK(form.jid),draftOf(form)); drawDlg(); };
    $("#nfPhAdd").onclick=async()=>{ const f=form; const got=PH?await PH.pick({title:"Add photo to the NCR",before:beforeCam}):[]; if(!got.length||form!==f) return; got.forEach(b=>f.photos.push({blob:b})); changed(); };
    if(PH) PH.wire(D,"nf",form.photos,changed,beforeCam);
    if(D_&&D_.has(DK(form.jid))) D_.mark($("#nfDraft"),"saved");
    $("#nfCancel").onclick=async()=>{ if(hasContent(form)&&!confirm("Discard this NCR? What you've typed and its photos will be deleted.")) return; const jid=form.jid; form=null; if(D_) await D_.clear(DK(jid)); drawDlg(); };
    $("#nfSave").onclick=async()=>{ const msg=t=>{ const m=$("#nfMsg"); if(m) m.textContent=t; $("#err").textContent=t; };
      if(!form.what.trim()){ msg("Say what went wrong first."); return; }
      const f=form, sv=$("#nfSave"); if(sv.disabled) return; sv.disabled=true; sv.textContent="Saving…";
      if(D_) await D_.save(DK(f.jid),draftOf(f));   // nothing is lost if anything below fails
      const fail=t=>{ msg(t+" The NCR is kept on this phone as a draft - tap Save NCR again."); sv.disabled=false; sv.textContent="Save NCR"; };
      if(navigator.onLine===false) return fail("No connection.");
      try{ for(const p of f.photos) if(!p.path){ p.path=await uploadPh(f.jid,p.blob); if(D_) await D_.save(DK(f.jid),draftOf(f)); } }   // uploaded photos remembered, so a retry doesn't send them twice
      catch(e){ return fail("Couldn't upload the photos ("+(e.message||e)+")."); }
      const n=nextN();
      const ok=await mut(`${tag(n)} logged: ${f.what.trim()}`,jj=>{ jj.ncrs.push({n,what:f.what.trim(),part:(f.part||"").trim(),details:(f.details||"").trim(),type:f.type,fix:f.fix,mat:Number(f.mat)||0,photos:f.photos.map(p=>p.path),closed:false,at:new Date().toISOString()}); saveSteps(jj,n,parseSteps(f.steps)); });
      if(!ok){ if(form===f) return fail("Couldn't save."); return; }
      f.photos.forEach(p=>{ if(p.blob&&p.path) phUrls[p.path]=PH.url(p); });   // show them straight away
      if(D_) await D_.clear(DK(f.jid)); if(form===f) form=null; drawDlg(); };
  }
  D.querySelectorAll("[data-ndetails]").forEach(el=>el.ontoggle=()=>{ const k=j.id+":"+el.dataset.ndetails; if(el.open) openCards.add(k); else openCards.delete(k); });
  const txt=(sel,key,label)=>D.querySelectorAll(`[data-${sel}]`).forEach(el=>el.onchange=()=>{ const n=+el.dataset[sel]; mut(`${tag(n)} ${label} updated`,jj=>{ jj.ncrs.find(x=>x.n===n)[key]=el.value.trim(); }); });
  txt("ndet","details","details"); txt("npart","part","part numbers"); txt("nprev","prevent","prevention");
  D.querySelectorAll("[data-nfix]").forEach(el=>el.onchange=()=>mut(`${tag(+el.dataset.nfix)} fix: ${el.value}`,jj=>{ jj.ncrs.find(x=>x.n===+el.dataset.nfix).fix=el.value; }));
  D.querySelectorAll("[data-nmat]").forEach(el=>el.onchange=()=>mut(`${tag(+el.dataset.nmat)} material ${money(el.value)}`,jj=>{ jj.ncrs.find(x=>x.n===+el.dataset.nmat).mat=Number(el.value)||0; }));
  const addStep=n=>{ const el=D.querySelector(`[data-nstep="${n}"]`); const st=parseSteps(el.value); if(!st.length) return; mut(`${tag(n)}: added ${st.map(s=>s.name).join(", ")}`,jj=>{ saveSteps(jj,n,st); const x=jj.ncrs.find(y=>y.n===n); if(x.fix==="Deciding") x.fix="Rework"; }); };
  D.querySelectorAll("[data-nstepgo]").forEach(b=>b.onclick=()=>addStep(+b.dataset.nstepgo));
  D.querySelectorAll("[data-nstep]").forEach(el=>el.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); addStep(+el.dataset.nstep); } });
  D.querySelectorAll("[data-ntag]").forEach(el=>el.onchange=()=>{ if(!el.value) return; mut(`Tagged task as rework for ${tag(+el.dataset.ntag)}`,jj=>{ const a=jj.assemblies.find(x=>x.id===el.value); if(a) a.ncr=+el.dataset.ntag; }); });
  D.querySelectorAll("[data-nuntag]").forEach(b=>b.onclick=()=>mut("Untagged rework task",jj=>{ const t=jj.assemblies.find(x=>x.id===b.dataset.nuntag); if(!t) return false; delete t.ncr; }));
  D.querySelectorAll("[data-ntask]").forEach(el=>el.onchange=()=>mut(el.value?`Tagged task as rework for ${tag(+el.value)}`:"Untagged rework task",jj=>{ const a=jj.assemblies.find(x=>x.id===el.dataset.ntask); if(!a) return false; if(el.value) a.ncr=+el.value; else delete a.ncr; }));
  D.querySelectorAll("[data-nrev]").forEach(b=>b.onclick=()=>{ const x=j.ncrs.find(y=>y.n===+b.dataset.nrev); if(window.newRevision) window.newRevision({job:j.id,ncr:x.n,kind:"fix",part:x.what,what:x.decision||""}); });
  D.querySelectorAll("[data-nclose]").forEach(b=>b.onclick=()=>{ const n=+b.dataset.nclose, x0=j.ncrs.find(y=>y.n===n), s0=stats(j,x0), closing=!x0.closed;
    if(closing&&s0.st!=="To check"&&!confirm(`${tag(n)} isn't checked yet (${s0.st}).${s0.tOpen.length+s0.oOpen.length+s0.rvOpen.length?` ${s0.tOpen.length+s0.oOpen.length+s0.rvOpen.length} tracked item(s) still open.`:""}\n\nClose it anyway?`)) return;
    mut(`${tag(n)} ${closing?"closed":"reopened"}`,jj=>{ const x=jj.ncrs.find(y=>y.n===n); x.closed=closing; if(closing){ x.acceptedBy=(window.ME&&ME.name)||""; x.acceptedAt=new Date().toISOString(); } else { delete x.acceptedBy; delete x.acceptedAt; } }); });
  // stage 7: accept & close (only offered at "To check"), rework task with an owner, replacement orders, link an order
  D.querySelectorAll("[data-naccept]").forEach(b=>b.onclick=()=>{ if(b.disabled) return; b.disabled=true; const n=+b.dataset.naccept;
    mut(`${tag(n)} checked and accepted - closed`,jj=>{ const x=jj.ncrs.find(y=>y.n===n); if(!x||x.closed) return false; x.closed=true; x.acceptedBy=(window.ME&&ME.name)||""; x.acceptedAt=new Date().toISOString(); }); });
  D.querySelectorAll("[data-ntrk]").forEach(b=>b.onclick=()=>{ const k=j.id+":"+b.dataset.ntrk; if(trk.has(k)||tw===k){ trk.delete(k); if(tw===k) tw=null; } else trk.add(k); drawDlg(); });
  D.querySelectorAll("[data-ntw]").forEach(b=>b.onclick=()=>{ tw=j.id+":"+b.dataset.ntw; drawDlg(); setTimeout(()=>{ const i=$(`[data-ntwn="${b.dataset.ntw}"]`); if(i) i.focus(); },30); });
  D.querySelectorAll("[data-ntwx]").forEach(b=>b.onclick=()=>{ tw=null; drawDlg(); });
  const addTw=n=>{ const el=D.querySelector(`[data-ntwn="${n}"]`), who=(D.querySelector(`[data-ntwo="${n}"]`)||{}).value||""; const go=D.querySelector(`[data-ntwgo="${n}"]`);
    const st=parseSteps(el.value).slice(0,1); if(!st.length){ el.focus(); return; } if(go.disabled) return; go.disabled=true; tw=null;
    mut(`${tag(n)}: rework task "${st[0].name}"${who?" for "+who:""}`,jj=>{ const before=(jj.assemblies||[]).length; saveSteps(jj,n,st); const t=jj.assemblies[before]; if(t&&who) t.who=who; const x=jj.ncrs.find(y=>y.n===n); if(x&&x.fix==="Deciding") x.fix="Rework"; }); };
  D.querySelectorAll("[data-ntwgo]").forEach(b=>b.onclick=()=>addTw(+b.dataset.ntwgo));
  D.querySelectorAll("[data-ntwn]").forEach(el=>el.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); addTw(+el.dataset.ntwn); } });
  D.querySelectorAll("[data-nord]").forEach(b=>b.onclick=()=>{ const [n,k]=b.dataset.nord.split("|"); const x=j.ncrs.find(y=>y.n===+n); if(window.newOrderForNcr) window.newOrderForNcr(j.id,+n,k,`${tag(+n)} replacement - ${x?x.what:""}`.slice(0,120)); });
  D.querySelectorAll("[data-nlink]").forEach(el=>el.onchange=()=>{ if(!el.value) return; const n=+el.dataset.nlink, sid=el.value;
    mut(`${tag(n)}: tracking order ${((j.suppliers||[]).find(o=>o.id===sid)||{}).name||""}`,jj=>{ const o=(jj.suppliers||[]).find(y=>y.id===sid); if(!o) return false; o.ncr=n; }); });
  D.querySelectorAll("[data-ndel]").forEach(b=>b.onclick=()=>mut(`${tag(+b.dataset.ndel)} deleted`,jj=>{ const n=+b.dataset.ndel; jj.ncrs=jj.ncrs.filter(x=>x.n!==n); (jj.assemblies||[]).forEach(a=>{ if(a.ncr===n) delete a.ncr; }); }));
});

/* used by the To do "what was decided?" box: set the fix, keep the decision, add rework steps */
window.ncrDecide=async(jid,n,{fix,note,steps})=>{
  const j0=jobs.find(x=>x.id===jid); if(!j0) return; const j=structuredClone(j0); const x=(j.ncrs||[]).find(y=>y.n===n); if(!x) return;
  if(fix) x.fix=fix; if(note) x.decision=note; const st=parseSteps(steps); if(st.length){ await saveSteps(j,n,st); if(x.fix==="Deciding") x.fix="Rework"; }
  j.log=[...(j.log||[]),{at:new Date().toISOString(),text:`${tag(n)} decided: ${x.fix}${note?" - "+note:""}${st.length?` (${st.length} rework step${st.length>1?"s":""} added)`:""}`}];
  const {id,...data}=j; await saveJob(id,data); const P=window.gvcPlan; if(P&&P.loaded()) await P.save();
};
window.ncrFixes=FIXES;
/* "Report a problem" from a task (stage 7): the job's NCRs section with a new NCR started, the task named in the details */
window.ncrNewFor=async(jid,pre={})=>{ await startForm(jid,{type:TYPES[2],fix:"Deciding",details:pre.details||""});
  if(typeof setJobTab==="function"&&typeof openId!=="undefined"&&openId===jid){ setJobTab("ncr"); drawDlg(); } else openJob(jid,"ncr");
  setTimeout(()=>{ const w=$("#nfWhat"); if(w) w.focus(); },60); };
window.ncrOpenN=j=>(j.ncrs||[]).filter(x=>isOpenSt(stats(j,x).st)).length;
window.ncrDecidingN=j=>(j.ncrs||[]).filter(x=>stats(j,x).st==="Deciding").length;   // job overview: decisions waiting
/* ---------- NCR log (all jobs) - filter by job, tap a row to open/close its details ---------- */
let showClosed=false;
const LS=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } }, LSset=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
let jobF=LS("gvcNcrJob")||"";            // "" = all jobs
const openRows=new Set();                // "jobid:n" rows showing details
function all(){ const out=[]; [...jobs,...archivedJobs].forEach(j=>(j.ncrs||[]).forEach(x=>out.push({j,x,s:stats(j,x)}))); return out.sort((a,b)=>b.x.n-a.x.n); }
function detailHtml(r){
  const {j,x,s}=r, revs=window.revsFor?window.revsFor(j.id,x.n):[];
  const blk=(h,b)=>b?`<div class="dh">${h}</div><div class="dbox">${b}</div>`:"";
  if((x.photos||[]).length) signPhotos(x.photos);
  return ((x.photos||[]).length?`<div class="dh">Photos</div><div class="gph-strip">${x.photos.map(p=>phUrls[p]?`<a class="t" href="${esc(phUrls[p])}" target="_blank" rel="noopener"><img src="${esc(phUrls[p])}" alt=""></a>`:`<div class="t" data-nphp="${esc(p)}"></div>`).join("")}</div>`:"")
    +blk("Part number(s)",esc(x.part||""))
    +blk("What happened",esc(x.details||""))+(x.details?"":`<div class="lbl" style="margin-top:6px">No details written yet - open the job to add them.</div>`)
    +blk("Decided",esc(x.decision||""))
    +blk("Rework",s.ts.map(a=>`${a.status==="done"?"✓ ":"• "}${esc(a.name)}${planHours(j.id,a.id)!=null?" - "+planHours(j.id,a.id)+"h":""}`).join("\n"))
    +blk("Model revisions",revs.map(v=>`${window.revTag(v)} ${esc(v.what)} - ${window.revStatus(v.status)}`).join("\n"))
    +blk("What stops it happening again",esc(x.prevent||""))
    +`<div style="margin-top:10px"><button class="btn sm" type="button" data-nj="${esc(j.id)}">Open job</button></div>`;
}
window.renderNcr=function(){
  const B=$("#board"); B.className="ncrv"; B.style.gridTemplateColumns="";
  const P=window.gvcPlan; const rate=P&&P.loaded()?Number(P.get().ncrRate)||0:0;
  const ALL=all();
  const jobList=[]; ALL.forEach(r=>{ let e=jobList.find(t=>t.j.id===r.j.id); if(!e) jobList.push(e={j:r.j,n:0,open:0}); e.n++; if(isOpenSt(r.s.st)) e.open++; });
  jobList.sort((a,b)=>String(a.j.name).localeCompare(String(b.j.name)));
  if(jobF&&!jobList.some(t=>t.j.id===jobF)) jobF="";
  const A=jobF?ALL.filter(r=>r.j.id===jobF):ALL;
  const live=A.filter(r=>showClosed||r.s.st!=="Closed");
  const H=A.reduce((a,r)=>a+r.s.h,0), M=A.reduce((a,r)=>a+(Number(r.x.mat)||0),0), open=A.filter(r=>isOpenSt(r.s.st)).length;
  const byType={}; A.forEach(r=>{ const t=byType[r.x.type]=byType[r.x.type]||{n:0,h:0,m:0}; t.n++; t.h+=r.s.h; t.m+=Number(r.x.mat)||0; });
  const allOpen=live.length&&live.every(r=>openRows.has(r.j.id+":"+r.x.n));
  const cols=rate?8:7;
  B.innerHTML=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h2 style="font-family:var(--font-display);letter-spacing:.05em;margin:0">NCR log</h2><span style="flex:1"></span>
     <span class="lbl">Shop rate for cost</span><input id="nRate" type="number" min="0" value="${rate||""}" placeholder="$/h" style="width:80px;font:inherit;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:4px 7px">
     <button class="btn sm ${showClosed?"primary":""}" id="nClosed">Show closed</button></div>
   <div class="fbar"><span class="lbl">Job</span><select id="nJob"><option value="">All jobs (${ALL.length})</option>${jobList.map(t=>`<option value="${esc(t.j.id)}" ${t.j.id===jobF?"selected":""}>${esc(t.j.name)} (${t.n}${t.open?`, ${t.open} open`:""})</option>`).join("")}</select>
     <span style="flex:1"></span>${live.length?`<button class="btn sm" id="nAll">${allOpen?"Collapse all":"Expand all"}</button>`:""}</div>
   <div class="sum"><div><span class="lbl">Open</span><b>${open}</b></div><div><span class="lbl">Rework hours</span><b>${+H.toFixed(1)}h</b></div><div><span class="lbl">Material</span><b>${money(M)}</b></div>${rate?`<div><span class="lbl">Total cost</span><b>${money(H*rate+M)}</b></div>`:""}
     ${Object.entries(byType).map(([t,v])=>`<div><span class="lbl">${esc(t)}</span><b>${v.n}</b><span class="lbl">${+v.h.toFixed(1)}h${v.m?" · "+money(v.m):""}</span></div>`).join("")}</div>
   ${live.length?`<table><thead><tr><th>NCR</th>${jobF?"":`<th class="hide-sm">Job</th>`}<th>What went wrong</th><th class="hide-sm">Type</th><th>Status</th><th class="hide-sm">Hours</th><th class="hide-sm">Material</th>${rate?`<th class="hide-sm">Cost</th>`:""}</tr></thead><tbody>
   ${live.map(r=>{ const k=r.j.id+":"+r.x.n, on=openRows.has(k);
     return `<tr class="clk" data-nrow="${esc(k)}"><td><span class="car">${on?"▾":"▸"}</span><b>${tag(r.x.n)}</b><div class="lbl">${fmt(r.x.at).split(" ").slice(0,2).join(" ")}</div></td>${jobF?"":`<td class="hide-sm">${esc(r.j.name)}</td>`}<td>${esc(r.x.what)}<div class="lbl">${r.x.part?esc(r.x.part)+" · ":""}${esc(r.x.fix)}</div></td><td class="hide-sm">${esc(r.x.type)}</td>
     <td><span class="nst" style="color:${stColor[r.s.st]};border-color:${stColor[r.s.st]}">${r.s.st}</span></td><td class="hide-sm">${+r.s.h.toFixed(1)}h${r.s.unk?` <span class="lbl">+${r.s.unk}?</span>`:""}</td><td class="hide-sm">${r.x.mat?money(r.x.mat):""}</td>${rate?`<td class="hide-sm">${money(r.s.h*rate+(Number(r.x.mat)||0))}</td>`:""}</tr>`
     +(on?`<tr class="det"><td colspan="${cols}">${detailHtml(r)}</td></tr>`:""); }).join("")}</tbody></table>`
   :`<div class="empty" style="text-align:left">${ALL.length?"No open NCRs for this job. Tap Show closed to see closed ones.":`No NCRs yet. Open a job and tap "Add NCR".`}</div>`}
   <div class="lbl" style="margin-top:8px">Tap an NCR to open or close its details. Hours come from the hour estimates on each NCR's rework tasks (set them in the week planner or when adding steps).</div>`;
  B.querySelectorAll("[data-nrow]").forEach(tr=>tr.onclick=()=>{ const k=tr.dataset.nrow; if(openRows.has(k)) openRows.delete(k); else openRows.add(k); render(); });
  B.querySelectorAll("[data-nj]").forEach(b=>b.onclick=e=>{ e.stopPropagation(); openJob(b.dataset.nj,"ncr"); });
  $("#nJob").onchange=e=>{ jobF=e.target.value; LSset("gvcNcrJob",jobF); render(); };
  const na=$("#nAll"); if(na) na.onclick=()=>{ live.forEach(r=>{ const k=r.j.id+":"+r.x.n; if(allOpen) openRows.delete(k); else openRows.add(k); }); render(); };
  $("#nClosed").onclick=()=>{ showClosed=!showClosed; render(); };
  $("#nRate").onchange=e=>{ if(P&&P.loaded()){ P.get().ncrRate=Number(e.target.value)||0; P.save(); render(); } };
};
const nb=document.createElement("button"); nb.className="btn"; nb.type="button"; nb.id="ncrBtn"; nb.textContent="NCRs";
const addJ=document.getElementById("addJob"); addJ.parentNode.insertBefore(nb,addJ);
nb.onclick=()=>{ cur="ncr"; try{history.replaceState(null,"","#ncr")}catch(e){} render(); };
GVC.on("render:after",()=>{ const n=all().filter(r=>isOpenSt(r.s.st)).length; nb.textContent=n?`NCRs (${n} open)`:"NCRs"; nb.classList.toggle("primary",cur==="ncr"); },{core:true});
GVC.on("autoTodos",out=>{ try{ const hidden=new Set(todos.filter(t=>t.source==="auto").map(t=>t.text));
  all().filter(r=>r.s.st==="Deciding").forEach(r=>{ const text=`Decide the fix for ${tag(r.x.n)} (${r.j.name}): ${r.x.what}`; if(!hidden.has(text)) out.push({text,c:"#e5483b",job:r.j.id,ncr:r.x.n}); }); }catch(e){} return out; });
/* unfinished NCRs on this phone: a quiet note once the jobs are loaded, with Resume */
(async()=>{ if(!D_) return; await D_.ready; let tries=0; const t=setInterval(()=>{ tries++; if(typeof jobs==="undefined"||(!jobs.length&&tries<40)) return; clearInterval(t);
  const ks=D_.keys("ncr:").filter(k=>[...jobs,...archivedJobs].some(j=>"ncr:"+j.id===k)); if(!ks.length) return;
  const j=[...jobs,...archivedJobs].find(x=>"ncr:"+x.id===ks[0]);
  const b=document.createElement("div"); b.setAttribute("role","status"); b.style.cssText="position:fixed;left:50%;transform:translateX(-50%);bottom:calc(76px + env(safe-area-inset-bottom));z-index:9000;background:#1f2328;border:1px solid var(--orange,#ff8a2a);border-radius:12px;padding:8px 8px 8px 14px;display:flex;gap:8px;align-items:center;width:min(94vw,440px);box-sizing:border-box;box-shadow:0 8px 24px rgba(0,0,0,.5);font-size:14px";
  b.id="ncrDraftNote"; b.innerHTML=`<span style="flex:1;min-width:0">Unfinished NCR${ks.length>1?"s":""} on <b>${esc(j.name)}</b>${ks.length>1?` +${ks.length-1} more`:""}</span><button class="btn sm primary" type="button">Resume</button><button class="btn sm ghost" type="button" aria-label="Dismiss">✕</button>`;
  document.body.appendChild(b); const [go,x]=b.querySelectorAll("button"); x.onclick=()=>b.remove();
  go.onclick=async()=>{ b.remove(); await startForm(j.id); if(typeof setJobTab==="function"&&typeof openId!=="undefined"&&openId===j.id){ setJobTab("ncr"); drawDlg(); } else openJob(j.id,"ncr"); };
  const gone=()=>{ if(!ks.some(k=>D_.has(k))||(form&&ks.includes(DK(form.jid)))){ b.remove(); document.removeEventListener("gvc:draft",gone); } };   // saved, discarded or already being worked on
  document.addEventListener("gvc:draft",gone); setTimeout(()=>b.remove(),20000); },500); })();
window.ncrLines=()=>{ try{ return all().filter(r=>r.s.st!=="Closed").map(r=>`[NCR] ${tag(r.x.n)} ${r.j.name}: ${r.x.what}${r.x.part?" ["+r.x.part+"]":""} (${r.x.type}, fix: ${r.x.fix}, ${r.s.st}, ${+r.s.h.toFixed(1)}h rework${r.x.mat?", $"+r.x.mat+" material":""})`); }catch(e){ return []; } };
})();
