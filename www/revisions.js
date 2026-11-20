/* ---------- Model revisions for Jessie (table gvc_revisions, photos in bucket gvc-photos) ----------
   review (logged by the crew / Robin - waits for Kyle) -> open (Kyle approved, not sent) -> sent (to Jessie)
   -> done or question (ONLY Jessie sets these, from his link page jessie.html - the database refuses it from the app)
   -> checked (Kyle inspected) ; or dropped. (Kyle, 2026-11-06)
   files: {model, drawing, dxf} = which files have been updated. */
(()=>{
const JESSIE="jessie.gvc@hotmail.com";
const JESSIE_PAGE="https://jackslinger6.github.io/gvc-shop/jessie.html";
const ST={review:["Waiting for Kyle","#9b7bff"],question:["Jessie has a question","#f5b041"],open:["Not sent yet","#e5483b"],sent:["Sent to Jessie","#ff8a2a"],done:["Jessie's done - check it","#2f8ff0"],checked:["Checked","#3ad06b"],dropped:["Not doing","#6c727a"]};
const FILES=[["model","Model"],["drawing","Drawings / PDF"],["dxf","DXFs"]];
let revs=[], loaded=false, ch=null, filt="active", jf="", form=null, sel=new Set(), photoUrls={}, edit=null, sentBar=null;
const tag=n=>"REV-"+String(n).padStart(3,"0");
/* two revisions ended up with the same number (REV-002 on 1086WT, Nov 11). The later one shows as REV-002-B so they
   can be told apart; the stored number and every link stay the same (Kyle's review, Nov 14) */
const tagOf=r=>{ if(!r||typeof r!=="object") return tag(r); const same=revs.filter(x=>x.n===r.n).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
  const i=same.findIndex(x=>x.id===r.id); return tag(r.n)+(i>0?"-"+String.fromCharCode(65+i):""); };
const css=document.createElement("style");
css.textContent=`
.rvv{margin-top:12px;max-width:1000px}
.rvv .lbl{font-size:12px;color:var(--muted)}
.rvv .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0}
.rvv select,.rvv input,.rvv textarea{font:inherit;font-size:13px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:6px 8px}
.rvv textarea{width:100%;min-height:70px}
.rvv .rc{border:1px solid var(--line);border-left:4px solid var(--c);border-radius:8px;padding:10px 12px;margin:8px 0;background:rgba(0,0,0,.28)}
.rvv .rh{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.rvv .pill{font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid var(--c);color:var(--c)}
.rvv .ph{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.rvv .ph img{width:92px;height:92px;object-fit:cover;border-radius:6px;cursor:pointer;background:#111;border:1px solid var(--line)}
.rvv .form{border:1px solid var(--orange);border-radius:8px;padding:12px;margin:8px 0}
.rvv .form label{display:block;font-size:12px;color:var(--muted);margin-top:8px}
.rvv .form label select,.rvv .form label input{width:100%}
.rvv .sentbar{border:1px solid var(--orange);border-radius:8px;padding:10px 12px;margin:8px 0;font-size:13px}
.rvv .chk{display:inline-flex;gap:4px;align-items:center;font-size:12.5px;margin-right:10px;cursor:pointer}
.rvv .chk input{width:auto;margin:0}
.rvv .rh input[type=checkbox]{width:auto;margin:0;flex:0 0 auto}
.rvv .row label.btn{width:auto !important;min-width:0 !important;display:inline-flex !important;flex:0 0 auto !important;margin:0}
.rvv #rvJob{width:auto;max-width:100%}
`;
document.head.appendChild(css);

async function load(){
  if(!db) return; const {data,error}=await sb.from("gvc_revisions").select("*").order("n",{ascending:false});
  if(!error){ revs=data||[]; loaded=true; await signPhotos(); }
  if(!ch) ch=sb.channel("gvc_revisions").on("postgres_changes",{event:"*",schema:"public",table:"gvc_revisions"},()=>load()).subscribe();
  render();
}
setInterval(()=>{ if(db&&!loaded){ loaded=true; load(); } },1200);
async function signPhotos(){
  const need=[...new Set(revs.flatMap(r=>r.photos||[]))].filter(p=>!photoUrls[p]); if(!need.length) return;
  const r=await sb.storage.from("gvc-photos").createSignedUrls(need,60*60*12); (r.data||[]).forEach(u=>{ if(u.signedUrl) photoUrls[u.path]=u.signedUrl; });
}
const jobName=id=>{ const j=[...jobs,...archivedJobs].find(x=>x.id===id); return j?j.name:"No job"; };
const upd=async(id,patch)=>{ const r=revs.find(x=>x.id===id); Object.assign(r,patch); render(); const {error}=await sb.from("gvc_revisions").update({...patch,updated_at:new Date().toISOString()}).eq("id",id); if(error) say("Couldn't save: "+error.message); };
function say(m){ const el=document.querySelector(".rvv .rmsg"); if(el) el.textContent=m; }
async function shrink(file){
  try{
    const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=URL.createObjectURL(file); });
    const s=Math.min(1,1600/Math.max(img.width,img.height)); const c=document.createElement("canvas"); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s);
    c.getContext("2d").drawImage(img,0,0,c.width,c.height); return await new Promise(res=>c.toBlob(b=>res(b||file),"image/jpeg",0.82));
  }catch(e){ return file; }
}
/* draft of the New revision form on this phone (Nov 19) - same rules as NCRs: saved as you type and before the camera */
const RDK="rev:new", RD=window.GVCDraft, RP=window.GVCPhotos;
const rHas=f=>!!(f&&((f.part||"").trim()||(f.what||"").trim()||(f.files||[]).length));
const rDraft=f=>({job:f.job||"",part:f.part||"",what:f.what||"",kind:f.kind,ncr:f.ncr||null,files:(f.files||[]).map(x=>({blob:x.blob}))});
const rSave=RD?RD.saver(RDK,()=>form&&rHas(form)?rDraft(form):null,()=>document.getElementById("rfDraft")):()=>{};
async function uploadPhotos(id,files){
  const paths=[]; for(const f of files){ const b=await shrink(f); const p=`rev/${id}/${Date.now()}-${Math.random().toString(36).slice(2,6)}.jpg`;
    const {error}=await sb.storage.from("gvc-photos").upload(p,b,{contentType:"image/jpeg"}); if(!error) paths.push(p); else say("Photo upload failed: "+error.message); }
  return paths;
}
const isAdm=()=>!window.ME||ME.role==="admin";
const inFilt=r=>(!jf||r.job_id===jf)&&(filt==="all"||(filt==="active"?["review","open","sent","done","question"].includes(r.status):filt==="closed"?["checked","dropped"].includes(r.status):r.status===filt));

window.renderRevs=function(){
  const B=$("#board"); B.className="rvv"; B.style.gridTemplateColumns="";
  const list=revs.filter(inFilt);
  const cnt=k=>revs.filter(r=>(!jf||r.job_id===jf)&&r.status===k).length;
  const jobOpts=(v,blank)=>`${blank?`<option value="">${blank}</option>`:""}${jobs.map(j=>`<option value="${esc(j.id)}" ${v===j.id?"selected":""}>${esc(j.name)}</option>`).join("")}`;
  const openSel=list.filter(r=>r.status==="open");
  let h=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h2 style="font-family:var(--font-display);letter-spacing:.05em;margin:0">Model revisions</h2><span style="flex:1"></span>
     <button class="btn primary" type="button" id="rvAdd">+ Revision</button></div>
   <div class="lbl" style="margin-top:4px">${isAdm()?"Things found in the shop that need changing in the model. The crew's go to you first (For Kyle). Send the approved ones to Jessie as one list - he marks them done himself from his link, then you check his update.":"Something in the shop that should change in the model? Log it with a photo. Kyle looks it over and sends it to Jessie."}</div>
   <div class="row"><select id="rvJob">${jobOpts(jf,"All jobs")}</select>
     ${[["active","Active"],...(cnt("review")||isAdm()?[["review",`For Kyle (${cnt("review")})`]]:[]),["open",`Not sent (${cnt("open")})`],["question",`Questions (${cnt("question")})`],["sent",`With Jessie (${cnt("sent")})`],["done",`To check (${cnt("done")})`],["closed","Closed"],["all","All"]].map(([k,t])=>`<button class="btn sm ${filt===k?"primary":""}" type="button" data-rf="${k}">${t}</button>`).join("")}</div>
   <div class="rmsg lbl" style="color:#ffd28a;min-height:16px"></div>`;
  if(sentBar) h+=`<div class="sentbar">Did the email to Jessie go out? <button class="btn sm primary" type="button" id="rvSentYes">Yes - mark ${sentBar.length} as sent</button> <button class="btn sm" type="button" id="rvSentNo">Not yet</button></div>`;
  const fj=form&&[...jobs,...archivedJobs].find(x=>x.id===form.job), fncrs=fj?(fj.ncrs||[]):[];
  if(form) h+=`<div class="form"><b>New revision</b>
     <div class="row" style="margin-top:8px"><button type="button" class="btn sm ${form.kind==="fix"?"primary":""}" data-rk="fix">Fix - something didn't fit / work</button><button type="button" class="btn sm ${form.kind==="improvement"?"primary":""}" data-rk="improvement">Improvement - works, but better next time</button></div>
     <label>Job<select id="rfJob">${jobOpts(form.job,"No job")}</select></label>
     ${fncrs.length?`<label>Comes from an NCR? (optional)<select id="rfNcr"><option value="">No NCR</option>${fncrs.map(x=>`<option value="${x.n}" ${form.ncr==x.n?"selected":""}>NCR-${String(x.n).padStart(3,"0")} - ${esc(x.what)}</option>`).join("")}</select></label>`:""}
     <label>Part / area<input id="rfPart" value="${esc(form.part)}" placeholder="e.g. Apron - tab and slot at the front corner"></label>
     <label>What needs to change<textarea id="rfWhat" placeholder="e.g. Slot needs more clearance - the tab doesn't fit. Open it up 1/16&quot; each side.">${esc(form.what)}</textarea></label>
     ${form.restored?`<div class="lbl" style="color:#ffd28a">Unfinished revision from ${RD.ago(form.restored)} - carried on where you left off.</div>`:""}
     <label>Photos (optional)</label>${RP?RP.strip(form.files,"rf"):""}
     <div class="row"><button class="btn sm" type="button" id="rfPh">📷 Add photo</button><span class="gph-draft" id="rfDraft" aria-live="polite"></span></div>
     <div class="row" style="justify-content:flex-end"><button class="btn sm" type="button" id="rfX">${rHas(form)?"Discard":"Cancel"}</button><button class="btn sm primary" type="button" id="rfSave">Save revision</button></div></div>`;
  if(openSel.length&&isAdm()) h+=`<div class="row"><button class="btn sm" type="button" id="rvMail">✉ Email Jessie the ${sel.size?sel.size+" selected":openSel.length+" not sent"}</button><button class="btn sm" type="button" id="rvShow">Show list</button><span class="lbl">Tick revisions to send only some.</span></div>`;
  h+=list.map(r=>{ const s=ST[r.status]||ST.open; const f=r.files||{};
    return `<div class="rc" style="--c:${s[1]}"><div class="rh">${r.status==="open"&&isAdm()?`<input type="checkbox" data-rsel="${r.id}" ${sel.has(r.id)?"checked":""} aria-label="Select ${tagOf(r)}">`:""}<b>${tagOf(r)}</b><span>${esc(jobName(r.job_id))}</span><span class="lbl">${r.kind==="fix"?"Fix":"Improvement"}${r.ncr?` · from NCR-${String(r.ncr).padStart(3,"0")}`:""}</span>${r.part?`<span class="lbl">· ${esc(r.part)}</span>`:""}<span style="flex:1"></span><span class="pill">${s[0]}</span></div>
      ${edit===r.id?`<textarea data-rwhat="${r.id}">${esc(r.what)}</textarea><div class="row"><input data-rpart="${r.id}" value="${esc(r.part||"")}" placeholder="Part / area" style="flex:1"><button class="btn sm primary" type="button" data-rsave="${r.id}">Save</button></div>`
        :`<div style="margin-top:6px;white-space:pre-wrap">${esc(r.what)}</div>`}
      ${(r.photos||[]).length?`<div class="ph">${r.photos.map(p=>photoUrls[p]?`<img src="${photoUrls[p]}" alt="Photo for ${tagOf(r)}" data-rzoom="${esc(p)}">`:"").join("")}</div>`:""}
      ${r.jesse_note?`<div class="lbl" style="margin-top:6px;color:var(--text)">${r.status==="question"?"<b>Jessie asks:</b> ":"Jessie: "}${esc(r.jesse_note)}</div>`:""}
      <div class="lbl" style="margin-top:6px">Logged ${fmt(r.created_at)}${r.sent_at?" · sent "+fmt(r.sent_at):""}${r.done_at?" · Jessie done "+fmt(r.done_at):""}${r.checked_at?" · checked "+fmt(r.checked_at):""}</div>
      ${["done","checked"].includes(r.status)||Object.values(f).some(Boolean)?`<div class="row"><span class="lbl">Updated:</span>${FILES.map(([k,t])=>`<label class="chk"><input type="checkbox" data-rfile="${r.id}|${k}" ${f[k]?"checked":""}>${t}</label>`).join("")}</div>`:""}
      <div class="row">
        ${!isAdm()?`<span class="lbl">${r.status==="review"?"Kyle will look at it before it goes to Jessie.":esc(s[0])}</span>`:`
        ${r.status==="review"?`<button class="btn sm primary" type="button" data-rst="${r.id}|open">✓ Approve - send with the next list</button>`:""}
        ${r.status==="open"?`<button class="btn sm" type="button" data-rst="${r.id}|sent">Mark sent</button>`:""}
        ${r.status==="sent"?`<span class="lbl">Jessie marks it done from his link.</span>`:""}
        ${r.status==="question"?`<button class="btn sm primary" type="button" data-rst="${r.id}|sent">Answered - back to Jessie</button>`:""}
        ${r.status==="done"?`<button class="btn sm primary" type="button" data-rst="${r.id}|checked">✓ Checked it</button><button class="btn sm" type="button" data-rst="${r.id}|sent">Not right - back to Jessie</button>`:""}
        ${["checked","dropped"].includes(r.status)?`<button class="btn sm" type="button" data-rst="${r.id}|open">Reopen</button>`:`<button class="btn sm ghost" type="button" data-rst="${r.id}|dropped">Not doing</button>`}`}
        <span style="flex:1"></span>
        <button class="btn sm ghost" type="button" data-rph="${r.id}">📷 + Photo</button>
        ${isAdm()?`<button class="btn sm ghost" type="button" data-rnote="${r.id}">Note</button>`:""}
        <button class="btn sm ghost" type="button" data-redit="${r.id}">Edit</button>
      </div></div>`; }).join("")||`<div class="empty" style="text-align:left">${loaded?"Nothing here. Tap + Revision when something in the shop needs a model change.":"Loading…"}</div>`;
  B.innerHTML=h;
  $("#rvAdd").onclick=async()=>{ if(form) return; const d=RD&&await RD.load(RDK);
    form=d?{job:d.job||"",part:d.part||"",what:d.what||"",kind:d.kind||"improvement",ncr:d.ncr||null,files:(d.files||[]).filter(x=>x.blob),restored:d._at}:{job:jf||"",part:"",what:"",files:[],kind:"improvement",ncr:null}; render(); };
  if(!form&&RD&&RD.has(RDK)){ const a=$("#rvAdd"); if(a&&!/Resume/.test(a.textContent)){ a.textContent="Resume unfinished revision"; a.classList.add("primary"); } }
  $("#rvJob").onchange=e=>{ jf=e.target.value; sel.clear(); render(); };
  B.querySelectorAll("[data-rf]").forEach(b=>b.onclick=()=>{ filt=b.dataset.rf; render(); });
  if(form){
    $("#rfJob").onchange=e=>{ form.job=e.target.value; form.ncr=null; rSave(); render(); };
    const rn=$("#rfNcr"); if(rn) rn.onchange=e=>{ form.ncr=e.target.value?+e.target.value:null; if(form.ncr) form.kind="fix"; rSave(); render(); };
    B.querySelectorAll("[data-rk]").forEach(x=>x.onclick=()=>{ form.kind=x.dataset.rk; rSave(); render(); });
    const rch=k=>e=>{ form[k]=e.target.value; rSave(); const c=$("#rfX"); if(c) c.textContent=rHas(form)?"Discard":"Cancel"; };
    $("#rfPart").oninput=rch("part"); $("#rfWhat").oninput=rch("what");
    const before=async()=>{ if(RD) await RD.save(RDK,rDraft(form)); };
    const changed=()=>{ if(RD) RD.save(RDK,rDraft(form)); render(); };
    $("#rfPh").onclick=async()=>{ const f=form; const got=RP?await RP.pick({title:"Add photo to the revision",before}):[]; if(!got.length||form!==f) return; got.forEach(b=>f.files.push({blob:b})); changed(); };
    if(RP) RP.wire(B,"rf",form.files,changed,before);
    if(RD&&RD.has(RDK)) RD.mark($("#rfDraft"),"saved");
    $("#rfX").onclick=async()=>{ if(rHas(form)&&!confirm("Discard this revision? What you've typed and its photos will be deleted.")) return; form=null; if(RD) await RD.clear(RDK); render(); };
    $("#rfSave").onclick=async()=>{ if(!form.what.trim()){ say("Say what needs to change first."); return; } if(window.ME&&ME.preview){ say("Preview - nothing is saved."); return; } const f=form; if(RD) await RD.save(RDK,rDraft(f));
      if(navigator.onLine===false){ say("No connection - the revision is kept on this phone as a draft. Tap Save revision again when you have signal."); return; } $("#rfSave").disabled=true; say("Saving…");
      const {data,error}=await sb.from("gvc_revisions").insert({job_id:f.job||null,part:f.part.trim()||null,what:f.what.trim(),kind:f.kind||"improvement",ncr:f.ncr||null}).select().single();
      if(error){ say("Couldn't save: "+error.message+" - it's kept on this phone as a draft."); $("#rfSave").disabled=false; return; }
      if(f.files.length){ const ps=await uploadPhotos(data.id,f.files.map(x=>x.blob)); if(ps.length) await sb.from("gvc_revisions").update({photos:ps}).eq("id",data.id); if(ps.length<f.files.length) say("Saved, but "+(f.files.length-ps.length)+" photo(s) didn't upload - add them again with + Photo."); }
      if(RD) await RD.clear(RDK); form=null; if(f.job) jf=f.job; await load(); say(isAdm()?`${tagOf(data)} saved.`:`${tagOf(data)} saved - Kyle will look at it before it goes to Jessie.`); };
  }
  B.querySelectorAll("[data-rsel]").forEach(c=>c.onchange=()=>{ c.checked?sel.add(c.dataset.rsel):sel.delete(c.dataset.rsel); render(); });
  B.querySelectorAll("[data-rst]").forEach(b=>b.onclick=()=>{ const [id,st]=b.dataset.rst.split("|"); const now=new Date().toISOString(); const r=revs.find(x=>x.id===id);
    if(window.ME&&ME.preview){ say("Preview - nothing is saved."); return; }
    const p={status:st}; if(st==="sent") p.sent_at=now; if(st==="checked"){ p.checked_at=now; const f=r.files||{}; if(!FILES.every(([k])=>f[k])) say(`${tagOf(r)} checked. Not every file is ticked as updated yet - tick Model / Drawings / DXFs when they are.`); }
    upd(id,p); });
  B.querySelectorAll("[data-rfile]").forEach(c=>c.onchange=()=>{ const [id,k]=c.dataset.rfile.split("|"); const r=revs.find(x=>x.id===id); upd(id,{files:{...(r.files||{}),[k]:c.checked}}); });
  B.querySelectorAll("[data-rph]").forEach(i=>i.onclick=async()=>{ const id=i.dataset.rph; const r=revs.find(x=>x.id===id); const got=RP?await RP.pick({title:"Add photo to "+tagOf(r)}):[]; if(!got.length) return; say("Uploading photo…"); const ps=await uploadPhotos(id,got); if(ps.length){ await upd(id,{photos:[...(r.photos||[]),...ps]}); await signPhotos(); render(); say("Photo added."); } });
  B.querySelectorAll("[data-rnote]").forEach(b=>b.onclick=()=>{ const r=revs.find(x=>x.id===b.dataset.rnote); const t=prompt("Note on this revision (Jessie's answer, what changed...)",r.jesse_note||""); if(t!==null) upd(r.id,{jesse_note:t.trim()||null}); });
  B.querySelectorAll("[data-redit]").forEach(b=>b.onclick=()=>{ edit=edit===b.dataset.redit?null:b.dataset.redit; render(); });
  B.querySelectorAll("[data-rsave]").forEach(b=>b.onclick=()=>{ const id=b.dataset.rsave; edit=null; upd(id,{what:B.querySelector(`[data-rwhat="${id}"]`).value.trim(),part:B.querySelector(`[data-rpart="${id}"]`).value.trim()||null}); });
  B.querySelectorAll("[data-rzoom]").forEach(img=>img.onclick=()=>zoomImg(img.src,img.alt));
  const pick=()=>{ const o=list.filter(r=>r.status==="open"); return sel.size?o.filter(r=>sel.has(r.id)):o; };
  const m=$("#rvMail"); if(m) m.onclick=()=>mailJessie(pick());
  const s=$("#rvShow"); if(s) s.onclick=()=>showSheet(pick());
  const y=$("#rvSentYes"); if(y) y.onclick=async()=>{ const ids=sentBar; sentBar=null; const now=new Date().toISOString(); for(const id of ids) await upd(id,{status:"sent",sent_at:now}); sel.clear(); say(`Marked ${ids.length} as sent to Jessie.`); };
  const n=$("#rvSentNo"); if(n) n.onclick=()=>{ sentBar=null; render(); };
};
async function photoLinks(r){ const out=[]; for(const p of r.photos||[]){ const x=await sb.storage.from("gvc-photos").createSignedUrl(p,60*60*24*30); if(x.data) out.push(x.data.signedUrl); } return out; }
async function mailJessie(list){
  if(!list.length) return; say("Getting photo links…");
  const byJob={}; list.forEach(r=>(byJob[jobName(r.job_id)]=byJob[jobName(r.job_id)]||[]).push(r));
  let link=""; try{ const k=await sb.rpc("gvc_jessie_key"); if(k.data) link=`${JESSIE_PAGE}#k=${k.data}`; }catch(e){}
  let body=`Hi Jessie,\n\nA few model changes from the shop:\n`;
  for(const [jn,rs] of Object.entries(byJob)){ body+=`\n${jn}\n`; for(const r of rs){ const ls=await photoLinks(r); body+=`- ${tagOf(r)}${r.part?" - "+r.part:""}: ${r.what}${ls.length?"\n  Photos: "+ls.join("\n  "):""}\n`; } }
  body+=link?`\nWhen one is updated (model, drawings and DXFs), tick it off on your list - or ask me a question there:\n${link}\n(Keep this link - it always shows your current list.)\n\nThanks,\nKyle`:`\nCan you let me know when they're updated (model, drawings and DXFs)?\n\nThanks,\nKyle`;
  const subj=`Model revisions - ${Object.keys(byJob).join(", ")}`;
  sentBar=list.map(r=>r.id); render();
  location.href=`mailto:${JESSIE}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
}
function showSheet(list){
  openId=null; const D=$("#dlg");
  D.innerHTML=`<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Revisions for Jessie</h3><button class="btn" type="button" onclick="closeDlg()">Close</button></div>
   ${list.map(r=>`<div style="border-top:1px solid var(--line);padding:10px 0"><b>${tagOf(r)}</b> · ${esc(jobName(r.job_id))}${r.part?" · "+esc(r.part):""}<div style="margin-top:4px;white-space:pre-wrap">${esc(r.what)}</div>
     ${(r.photos||[]).map(p=>photoUrls[p]?`<img src="${photoUrls[p]}" alt="" style="width:100%;max-width:520px;border-radius:8px;margin-top:6px;display:block">`:"").join("")}</div>`).join("")}`;
  $("#scrim").classList.add("on");
}

/* hooks */
const b=document.createElement("button"); b.className="btn"; b.type="button"; b.id="revBtn"; b.textContent="Revisions";
const anchor=document.getElementById("ncrBtn")||document.getElementById("addJob"); anchor.parentNode.insertBefore(b,anchor);
b.onclick=()=>{ cur="revs"; try{history.replaceState(null,"","#revs")}catch(e){} render(); };
GVC.on("render:after",()=>{ const n=revs.filter(r=>["review","open","done","question"].includes(r.status)).length; b.textContent=n?`Revisions (${n})`:"Revisions"; b.classList.toggle("primary",cur==="revs"); },{core:true});
GVC.on("autoTodos",out=>{ try{ const hidden=new Set(todos.filter(t=>t.source==="auto").map(t=>t.text));
  const rv=revs.filter(r=>r.status==="review");
  if(rv.length){ const text=`Look over ${rv.length} model revision${rv.length>1?"s":""} from the crew before they go to Jessie`; if(!hidden.has(text)) out.push({text,c:"#9b7bff",view:"revs"}); }
  revs.filter(r=>r.status==="question").forEach(r=>{ const text=`Jessie has a question on ${tagOf(r)}: ${(r.jesse_note||"").slice(0,80)}`; if(!hidden.has(text)) out.push({text,c:"#f5b041",view:"revs"}); });
  const un=revs.filter(r=>r.status==="open"&&Date.now()-new Date(r.created_at).getTime()>12*3600e3);
  if(un.length){ const text=`Send ${un.length} model revision${un.length>1?"s":""} to Jessie (${[...new Set(un.map(r=>jobName(r.job_id)))].join(", ")})`; if(!hidden.has(text)) out.push({text,c:"#ff8a2a",view:"revs"}); }
  revs.filter(r=>r.status==="done").forEach(r=>{ const text=`Check Jessie's revision ${tagOf(r)} (${jobName(r.job_id)}): ${r.what.slice(0,80)}`; if(!hidden.has(text)) out.push({text,c:"#2f8ff0",view:"revs"}); });
}catch(e){} return out; });
window.newRevision=pre=>{ form={job:pre.job||"",part:pre.part||"",what:pre.what||"",files:[],kind:pre.kind||(pre.ncr?"fix":"improvement"),ncr:pre.ncr||null}; jf=pre.job||jf; filt="active"; cur="revs"; try{history.replaceState(null,"","#revs")}catch(e){} closeDlg(); render(); };
window.addRevisionQuick=async row=>{ const {data,error}=await sb.from("gvc_revisions").insert(row).select().single(); if(!error){ await load(); return data; } };
window.revsFor=(jid,n)=>revs.filter(r=>r.job_id===jid&&r.ncr===n);
window.revTag=x=>tagOf(x); window.revStatus=s=>(ST[s]||ST.open)[0];
window.revLines=()=>revs.filter(r=>!["checked","dropped"].includes(r.status)).map(r=>`[model revision] ${tagOf(r)} ${jobName(r.job_id)}${r.part?" - "+r.part:""}: ${r.what} (${(ST[r.status]||ST.open)[0]})`);
})();
