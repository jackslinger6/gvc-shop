/* ---------- Count an order (2026-11-02) ----------
   One count sheet per order (supplier line on a job): table gvc_counts (job_id, sup_id, items jsonb).
   items: [{k, part_no, name, mat, qty, got, skip, thumb, img, src}]
   Seeded from the job's parts list (gvc_job_parts by job number). Parts not on this order can be set aside;
   other items can be added by hand or picked from the Truck parts inventory (INV orders, hardware).
   Each piece gets its own box: 4 ordered = 4 boxes, tick them as you find them.
   Opened from the To do "Count & check" reminder (Count button), the Arrived cards on the Orders board, and a supplier on the job card.
   Combined orders: supplier lines on different jobs with the same supplier and quote # (e.g. 2006PT + INV on Russel 60541360)
   are one physical order - they open as one sheet, split into a section per job, and are marked received together. */
(()=>{
const css=document.createElement("style");
css.textContent=`
.cnt .hd{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.cnt .csub{font-size:12.5px;color:var(--muted);margin-top:2px}
.cnt .bar{height:8px;background:rgba(255,255,255,.08);border-radius:5px;overflow:hidden;margin:10px 0 4px}
.cnt .bar div{height:100%;background:#3ad06b;transition:width .2s}
.cnt .tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0}
.cnt input[type=search],.cnt .addrow input{font:inherit;font-size:14px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.cnt input[type=search]{flex:1;min-width:160px}
.cnt .it{display:grid;grid-template-columns:84px 1fr;gap:10px;border:1px solid var(--line);border-left:4px solid var(--c,#555);border-radius:10px;padding:8px;margin-top:6px;background:rgba(0,0,0,.25)}
.cnt .it.full{--c:#3ad06b}.cnt .it.part{--c:#f5b041}
.cnt .th{width:84px;height:60px;background:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#888;font-size:10.5px;text-align:center}
.cnt .th img{max-width:100%;max-height:100%;object-fit:contain}
.cnt .nm{font-weight:600;font-size:14px;word-break:break-word;display:flex;justify-content:space-between;gap:8px}
.cnt .nm .q{font-family:Oswald,sans-serif;font-size:15px;white-space:nowrap}
.cnt .mt{font-size:12px;color:var(--muted);margin-top:1px}
.cnt .boxes{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
.cnt .bx{width:34px;height:34px;border-radius:7px;border:1.5px solid #5a5f68;background:transparent;color:transparent;font-size:18px;line-height:30px;padding:0;cursor:pointer}
.cnt .bx.on{background:#3ad06b;border-color:#3ad06b;color:#0d1a10}
.cnt .step{display:flex;align-items:center;gap:8px;margin-top:7px}
.cnt .step button{min-width:40px;height:34px;font-size:16px;white-space:nowrap}
.cnt .step b{font-family:Oswald,sans-serif;font-size:18px;min-width:70px;text-align:center}
.cnt .lnk{font:inherit;font-size:11.5px;color:var(--dim);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline}
.cnt .addbox{border:1px dashed var(--line);border-radius:10px;padding:10px;margin-top:10px}
.cnt .addrow{display:flex;gap:6px;flex-wrap:wrap}
.cnt .pick{display:grid;gap:4px;margin-top:6px;max-height:260px;overflow:auto}
.cnt .pick button{display:flex;gap:8px;align-items:center;text-align:left;font:inherit;font-size:13px;color:var(--text);background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:7px;padding:5px 8px;cursor:pointer}
.cnt .pick img{width:40px;height:28px;object-fit:contain;background:#fff;border-radius:4px}
.cnt .foot{position:sticky;bottom:0;background:linear-gradient(180deg,rgba(20,22,25,0),#141619 30%);padding-top:14px;margin-top:10px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.cnt .saved{font-size:12px;color:var(--dim);align-self:center;margin-right:auto}
.cnt .grp{font-family:Oswald,sans-serif;letter-spacing:.04em;font-size:15px;margin:16px 0 2px;padding-bottom:4px;border-bottom:2px solid var(--c,#555);display:flex;justify-content:space-between;gap:8px}
.cnt .grp span{font-family:Inter,sans-serif;font-size:12px;color:var(--muted);letter-spacing:0}
.cnt .addrow select{font:inherit;font-size:13px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px}
@media (max-width:600px){ .cnt .it{grid-template-columns:64px 1fr} .cnt .th{width:64px;height:48px} }
`;
document.head.appendChild(css);

const urls={};
let st=null;              // {jobId, supId, row, items, q, f, saving, dirty, timer}
const jobOf=id=>jobs.find(j=>j.id===id)||archivedJobs.find(j=>j.id===id);
const n3=x=>x==null||x===""?"":(+x).toFixed(3).replace(/\.?0+$/,"");
async function sign(paths){
  const need=[...new Set(paths.filter(p=>p&&!urls[p]&&!(typeof imgUrls!=="undefined"&&imgUrls[p])))]; if(!need.length) return;
  for(let i=0;i<need.length;i+=100){
    const r=await sb.storage.from("gvc-parts").createSignedUrls(need.slice(i,i+100),60*60*12);
    (r.data||[]).forEach(u=>{ if(u.signedUrl) urls[u.path]=u.signedUrl; });
  }
}
const url=p=>p&&(urls[p]||(typeof imgUrls!=="undefined"&&imgUrls[p]))||"";
const got=it=>Math.min(it.got||0,it.qty||0);
const live=()=>st.items.filter(i=>!i.skip);
const totals=()=>{ const L=live(); return {pcs:L.reduce((a,i)=>a+(i.qty||0),0), got:L.reduce((a,i)=>a+got(i),0), lines:L.length, full:L.filter(i=>got(i)>=(i.qty||0)).length}; };

async function seed(j){
  const no=window.jobNum?window.jobNum(j.name):"";
  if(!no) return [];
  const r=await sb.from("gvc_job_parts").select("part_no,name,assembly,material,thickness,qty,thumb_path").eq("job_no",no).order("assembly").order("part_no");
  return (r.data||[]).map(p=>({k:"j:"+p.part_no, part_no:p.part_no, name:p.name&&p.name!==p.part_no?p.name:(p.assembly||""), mat:[p.thickness?n3(p.thickness)+'"':"",p.material].filter(Boolean).join(" "), qty:p.qty||1, got:0, thumb:p.thumb_path||"", src:"job"}));
}

const fname=n=>String(n||"").trim().split(/\s+/)[0].toLowerCase();
function siblings(j,sup){
  if(!sup.quoteNo) return [{jobId:j.id,supId:sup.id}];
  const out=[];
  [...jobs,...archivedJobs].forEach(jj=>(jj.suppliers||[]).forEach(x=>{ if(x.quoteNo&&x.quoteNo===sup.quoteNo&&fname(x.name)===fname(sup.name)) out.push({jobId:jj.id,supId:x.id}); }));
  out.sort((a,b)=>(a.jobId===j.id?-1:0)-(b.jobId===j.id?-1:0));
  return out.length?out:[{jobId:j.id,supId:sup.id}];
}
window.openCount=async function(jobId,supId){
  const j=jobOf(jobId); if(!j) return; const sup=(j.suppliers||[]).find(x=>x.id===supId)||(j.suppliers||[])[0];
  if(!sup){ alert("This job has no order to count."); return; }
  openId=null; $("#scrim").classList.add("on");
  $("#dlg").innerHTML=`<div class="cnt"><h3 style="margin:0">Count - ${esc(j.name)}</h3><div class="tnote">Loading the order…</div></div>`;
  const sets=siblings(j,sup); const items=[]; let seeded=false;
  for(let g=0;g<sets.length;g++){
    const S=sets[g];
    const r=await sb.from("gvc_counts").select("*").eq("job_id",S.jobId).eq("sup_id",S.supId).maybeSingle();
    S.row=r.data||null;
    let its=S.row?S.row.items||[]:null;
    if(!its){ its=await seed(jobOf(S.jobId)); if(its.length) seeded=true; }
    its.forEach(i=>{ i.g=g; items.push(i); });
  }
  st={jobId, supId:sup.id, sets, items, q:"", f:"all", seeded, dirty:new Set(), timer:null, addQ:"", addG:0};
  await sign(items.map(i=>i.thumb||i.img));
  draw();
};

function head(){
  const j=jobOf(st.jobId), sup=(j.suppliers||[]).find(x=>x.id===st.supId)||{}; const t=totals();
  const multi=st.sets.length>1;
  return `<div class="hd"><div><h3 style="margin:0">Count - ${multi?"combined order":esc(j.name)}</h3>${multi?`<div class="csub">One order for ${st.sets.map(S=>esc(jobOf(S.jobId).name)).join(" + ")}</div>`:""}
    <div class="csub">${esc(sup.name||"")}${sup.quoteNo?" · #"+esc(sup.quoteNo):""}${sup.scope?" · "+esc(sup.scope):""} · ${(ST[sup.status]||ST.sent).t}</div></div>
    <button class="btn ghost" type="button" id="cBack">Back to job</button></div>
    <div class="bar"><div style="width:${t.pcs?Math.round(t.got/t.pcs*100):0}%"></div></div>
    <div class="csub"><b style="color:var(--text)">${t.got} of ${t.pcs} pcs</b> · ${t.full} of ${t.lines} parts complete${st.items.some(i=>i.skip)?` · ${st.items.filter(i=>i.skip).length} set aside (not on this order)`:""}</div>`;
}
function itemRow(it,ix){
  const g=got(it), q=it.qty||0, cls=g>=q&&q>0?"full":g>0?"part":"";
  const im=url(it.thumb||it.img);
  const boxes=q<=24?`<div class="boxes">${Array.from({length:q},(_,b)=>`<button class="bx ${b<g?"on":""}" type="button" data-bx="${ix}" data-b="${b}" aria-label="piece ${b+1}">✓</button>`).join("")}</div>`
    :`<div class="step"><button class="btn" type="button" data-dn="${ix}">−</button><b>${g} / ${q}</b><button class="btn" type="button" data-up="${ix}">+</button><button class="btn sm" type="button" data-all="${ix}">All here</button></div>`;
  return `<div class="it ${cls}"><div class="th">${im?`<img src="${esc(im)}" alt="" loading="lazy">`:esc(it.part_no||"")}</div>
    <div><div class="nm"><span>${esc(it.part_no||it.name)}</span><span class="q">${g} / ${q}</span></div>
    <div class="mt">${[it.part_no&&it.name&&it.name!==it.part_no?esc(it.name):"",esc(it.mat||"")].filter(Boolean).join(" · ")}</div>
    ${boxes}
    <div style="margin-top:6px"><button class="lnk" type="button" data-skip="${ix}">Not on this order</button></div></div></div>`;
}
function draw(){
  const D=$("#dlg"); const words=st.q.toLowerCase().split(/\s+/).filter(Boolean);
  const vis=st.items.map((it,ix)=>({it,ix})).filter(({it})=>!it.skip&&words.every(w=>[it.part_no,it.name,it.mat].join(" ").toLowerCase().includes(w))
    &&(st.f==="all"||(st.f==="missing"?got(it)<(it.qty||0):got(it)>=(it.qty||0))));
  const skipped=st.items.map((it,ix)=>({it,ix})).filter(({it})=>it.skip);
  const mats=[...new Set(live().map(i=>i.mat).filter(Boolean))];
  D.innerHTML=`<div class="cnt">${head()}
    ${st.items.length?`<div class="tools"><input type="search" id="cQ" placeholder="Find a part (number, name, material)" value="${esc(st.q)}">
      ${[["all","All"],["missing","Missing"],["done","Counted"]].map(([k,t])=>`<button class="chip ${st.f===k?"on":""}" type="button" data-cf="${k}" style="${st.f===k?"border-color:#3ad06b;color:#3ad06b":""}">${t}</button>`).join("")}</div>
      ${mats.length>1?`<div class="tools">${mats.map(m=>`<button class="chip" type="button" data-cq="${esc(m)}">${esc(m)}</button>`).join("")}</div>`:""}`:""}
    ${st.seeded&&st.items.length?`<div class="tnote">Started from the job's parts list (${st.items.length} parts). If this order is only part of the job, tap "Not on this order" on the rest.</div>`:""}
    ${!st.items.length?`<div class="tnote">No parts list for this order yet. Add what was ordered below - pick from the inventory list or type it in.</div>`:""}
    <div id="cList">${listHtml(vis)}</div>
    ${skipped.length?`<details style="margin-top:10px"><summary class="tnote" style="cursor:pointer">Not on this order (${skipped.length})</summary>${skipped.map(({it,ix})=>`<div class="tnote" style="display:flex;justify-content:space-between;gap:8px;margin:4px 0"><span>${esc(it.part_no||it.name)} · ${it.qty} pcs</span><button class="lnk" type="button" data-unskip="${ix}">Put back</button></div>`).join("")}</details>`:""}
    <div class="addbox"><b style="font-size:13px">Add an item to this order</b>
      <div class="addrow" style="margin-top:6px"><input id="cAddQ" placeholder="Search inventory or type a name" value="${esc(st.addQ)}" style="flex:1;min-width:160px"><input id="cAddN" type="number" min="1" value="1" style="width:70px" aria-label="Quantity">${st.sets.length>1?`<select id="cAddG" aria-label="Which job">${st.sets.map((S,g)=>`<option value="${g}" ${st.addG===g?"selected":""}>${esc(jobOf(S.jobId).name)}</option>`).join("")}</select>`:""}<button class="btn" type="button" id="cAdd">Add</button></div>
      <div class="pick" id="cPick"></div></div>
    <div class="foot"><span class="saved" id="cSaved">${st.sets.some(S=>S.row)?"Saved":""}</span><button class="btn primary" type="button" id="cDone">Done counting</button></div></div>`;
  wire(); drawPick();
}
function listHtml(vis){
  if(st.sets.length<2) return vis.map(({it,ix})=>itemRow(it,ix)).join("")||(st.items.length?`<div class="tnote">Nothing here with that filter.</div>`:"");
  return st.sets.map((S,g)=>{ const jj=jobOf(S.jobId); const mine=st.items.filter(i=>i.g===g&&!i.skip);
    const pcs=mine.reduce((a,i)=>a+(i.qty||0),0), gt=mine.reduce((a,i)=>a+got(i),0);
    const col=window.jobColor?window.jobColor(S.jobId):"#888"; const rows=vis.filter(v=>v.it.g===g);
    return `<div class="grp" style="--c:${col}">${esc(jj.name)}<span>${gt} of ${pcs} pcs</span></div>`+(rows.map(({it,ix})=>itemRow(it,ix)).join("")||`<div class="tnote">${mine.length?"Nothing here with that filter.":"Nothing listed for this job yet - add what was on the order below."}</div>`);
  }).join("");
}
function drawPick(){
  const P=$("#cPick"); if(!P) return; const w=st.addQ.toLowerCase().split(/\s+/).filter(Boolean);
  if(!w.length){ P.innerHTML=""; return; }
  const inv=(typeof parts!=="undefined"?parts:[]).filter(p=>w.every(x=>[p.part_no,p.name,p.description].join(" ").toLowerCase().includes(x))).slice(0,30);
  P.innerHTML=inv.map(p=>`<button type="button" data-pk="${esc(p.part_no)}">${url(p.img_path)?`<img src="${esc(url(p.img_path))}" alt="">`:""}<span><b>${esc(p.part_no)}</b> ${esc(p.name||"")}</span></button>`).join("")||`<div class="tnote">Not in the inventory list - tap Add to add "${esc(st.addQ)}" as typed.</div>`;
  P.querySelectorAll("[data-pk]").forEach(b=>b.onclick=()=>{ const p=parts.find(x=>x.part_no===b.dataset.pk); addItem({k:"p:"+p.part_no, part_no:p.part_no, name:p.name||"", mat:[p.material,p.thickness].filter(Boolean).join(" "), img:p.img_path||"", src:"inv"}); });
}
function addItem(base){
  const n=Math.max(1,parseInt($("#cAddN").value)||1);
  const gs=$("#cAddG"); const g=gs?+gs.value:0; st.addG=g;
  const ex=st.items.find(i=>i.k===base.k&&i.g===g); if(ex){ ex.qty=(ex.qty||0)+n; ex.skip=false; } else st.items.push({...base,qty:n,got:0,g});
  st.addQ=""; changed(g); draw();
}
function wire(){
  const D=$("#dlg");
  $("#cBack").onclick=async()=>{ await flush(); openJob(st.jobId); };
  const q=$("#cQ"); if(q) q.oninput=()=>{ st.q=q.value; const pos=q.selectionStart; draw(); const n=$("#cQ"); n.focus(); n.setSelectionRange(pos,pos); };
  D.querySelectorAll("[data-cf]").forEach(b=>b.onclick=()=>{ st.f=b.dataset.cf; draw(); });
  D.querySelectorAll("[data-cq]").forEach(b=>b.onclick=()=>{ st.q=st.q===b.dataset.cq?"":b.dataset.cq; draw(); });
  D.querySelectorAll("[data-bx]").forEach(b=>b.onclick=()=>{ const it=st.items[+b.dataset.bx], k=+b.dataset.b; it.got=got(it)>=k+1?k:k+1; changed(it.g); refresh(+b.dataset.bx); });
  D.querySelectorAll("[data-up]").forEach(b=>b.onclick=()=>{ const it=st.items[+b.dataset.up]; it.got=Math.min(it.qty,got(it)+1); changed(it.g); refresh(+b.dataset.up); });
  D.querySelectorAll("[data-dn]").forEach(b=>b.onclick=()=>{ const it=st.items[+b.dataset.dn]; it.got=Math.max(0,got(it)-1); changed(it.g); refresh(+b.dataset.dn); });
  D.querySelectorAll("[data-all]").forEach(b=>b.onclick=()=>{ const it=st.items[+b.dataset.all]; it.got=it.qty; changed(it.g); refresh(+b.dataset.all); });
  D.querySelectorAll("[data-skip]").forEach(b=>b.onclick=()=>{ const it=st.items[+b.dataset.skip]; it.skip=true; changed(it.g); draw(); });
  D.querySelectorAll("[data-unskip]").forEach(b=>b.onclick=()=>{ const it=st.items[+b.dataset.unskip]; it.skip=false; changed(it.g); draw(); });
  const aq=$("#cAddQ"); aq.oninput=()=>{ st.addQ=aq.value; drawPick(); };
  aq.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); $("#cAdd").click(); } };
  $("#cAdd").onclick=()=>{ const t=st.addQ.trim(); if(!t) return; const p=(typeof parts!=="undefined"?parts:[]).find(x=>x.part_no.toLowerCase()===t.toLowerCase());
    if(p) addItem({k:"p:"+p.part_no, part_no:p.part_no, name:p.name||"", mat:"", img:p.img_path||"", src:"inv"}); else addItem({k:"m:"+t.toLowerCase(), part_no:"", name:t, mat:"", src:"manual"}); };
  $("#cDone").onclick=finish;
}
/* redraw one row + the header without losing scroll position */
function refresh(ix){
  const D=$("#dlg"); const sc=D.scrollTop;
  const rows=[...D.querySelectorAll("#cList .it")]; const btn=D.querySelector(`[data-bx="${ix}"],[data-up="${ix}"],[data-all="${ix}"]`);
  const row=btn&&btn.closest(".it");
  if(row&&!(st.f!=="all")){ const tmp=document.createElement("div"); tmp.innerHTML=itemRow(st.items[ix],ix); row.replaceWith(tmp.firstElementChild); }
  else { draw(); D.scrollTop=sc; return; }
  const hd=D.querySelector(".cnt"); const old=[...hd.children].slice(0,3); const tmp=document.createElement("div"); tmp.innerHTML=head();
  old.forEach(e=>e.remove()); hd.prepend(...tmp.children); wire(); D.scrollTop=sc;
}
function changed(g){ if(g==null) return; st.dirty.add(g); const s=$("#cSaved"); if(s) s.textContent="Saving…"; clearTimeout(st.timer); st.timer=setTimeout(flush,700); }
async function flush(){
  if(!st||!st.dirty.size) return; clearTimeout(st.timer); const todo=[...st.dirty]; st.dirty.clear();
  const now=new Date().toISOString(); const s=$("#cSaved");
  for(const g of todo){
    const S=st.sets[g]; let mine=st.items.filter(i=>i.g===g);
    // someone else counting the same order on another phone: keep the higher count per item
    const cur=await sb.from("gvc_counts").select("items,updated_at").eq("job_id",S.jobId).eq("sup_id",S.supId).maybeSingle();
    if(cur.data&&S.row&&cur.data.updated_at>S.row.updated_at){
      const theirs=Object.fromEntries((cur.data.items||[]).map(i=>[i.k,i]));
      mine.forEach(i=>{ const t=theirs[i.k]; if(t) i.got=Math.max(got(i),t.got||0); });
      (cur.data.items||[]).forEach(t=>{ if(!mine.some(i=>i.k===t.k)){ t.g=g; st.items.push(t); } });
      mine=st.items.filter(i=>i.g===g);
    }
    const r=await sb.from("gvc_counts").upsert({job_id:S.jobId, sup_id:S.supId, items:mine.map(({g,...i})=>i), updated_at:now},{onConflict:"job_id,sup_id"}).select().maybeSingle();
    if(r.error){ st.dirty.add(g); if(s) s.textContent="Couldn't save: "+r.error.message; return; }
    S.row=r.data||{updated_at:now};
  }
  st.seeded=false; if(s) s.textContent="Saved";
}
async function finish(){
  await flush();
  const t=totals();
  const miss=live().filter(i=>got(i)<(i.qty||0));
  const nm=i=>(st.sets.length>1?(window.jobNum?window.jobNum(jobOf(st.sets[i.g].jobId).name)+" ":""):"")+(i.part_no||i.name);
  const missTx=miss.slice(0,12).map(i=>`${nm(i)} (${got(i)} of ${i.qty})`).join(", ")+(miss.length>12?` and ${miss.length-12} more`:"");
  const sup0=(jobOf(st.jobId).suppliers||[]).find(x=>x.id===st.supId);
  const D=$("#dlg"); D.querySelectorAll(".cfin").forEach(e=>e.remove()); const box=document.createElement("div"); box.className="addbox cfin"; box.style.borderColor=miss.length?"#f5b041":"#3ad06b";
  box.innerHTML=miss.length?`<b>${t.got} of ${t.pcs} pcs here - ${miss.length} part${miss.length>1?"s":""} short.</b><div class="tnote">${esc(missTx)}</div>
      <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="cKeep">Keep counting later</button><button class="btn primary" type="button" id="cRecvShort">Mark received - note what's missing</button></div>`
    :`<b>All ${t.pcs} pcs here.</b><div class="row" style="margin-top:8px;gap:8px"><button class="btn primary" type="button" id="cRecv">Mark ${esc(sup0?sup0.name:"order")} received${st.sets.length>1?` (all ${st.sets.length} jobs)`:""}</button></div>`;
  D.querySelector(".foot").before(box); box.scrollIntoView({behavior:"smooth",block:"center"});
  const recv=async(short)=>{
    const now=new Date().toISOString(); let ok=true;
    for(let g=0;g<st.sets.length;g++){
      const S=st.sets[g]; const j=structuredClone(jobOf(S.jobId)); const sup=(j.suppliers||[]).find(x=>x.id===S.supId);
      const mine=st.items.filter(i=>i.g===g&&!i.skip); const pcs=mine.reduce((a,i)=>a+(i.qty||0),0), gt=mine.reduce((a,i)=>a+got(i),0);
      const myMiss=mine.filter(i=>got(i)<(i.qty||0)).map(i=>`${i.part_no||i.name} (${got(i)} of ${i.qty})`).join(", ");
      if(sup){ sup.status="received"; sup.updated=now; sup.receivedAt=now; if(myMiss) sup.note=((sup.note?sup.note+" | ":"")+"Short: "+myMiss).slice(0,1000); }
      j.log=[...(j.log||[]),{at:now,text:`Counted ${sup?sup.name:"order"}${sup&&sup.quoteNo?" #"+sup.quoteNo:""}: ${gt} of ${pcs} pcs${myMiss?" - short: "+myMiss:" - all here"}${st.sets.length>1?" (combined order with "+st.sets.filter((_,x)=>x!==g).map(o=>jobOf(o.jobId).name).join(", ")+")":""}`}];
      if(window.autoToShop) window.autoToShop(j);
      await sb.from("gvc_counts").update({done_at:now}).eq("job_id",S.jobId).eq("sup_id",S.supId);
      if(!await put(j,`Counted ${sup?sup.name:"order"} - ${j.name}`)) ok=false;
    }
    if(ok){ closeDlg(); if(typeof todoToast==="function") todoToast(`Counted: ${t.got} of ${t.pcs} pcs`,null); }
  };
  const k=$("#cKeep"); if(k) k.onclick=()=>closeDlg();
  const rs=$("#cRecvShort"); if(rs) rs.onclick=()=>recv(true);
  const rc=$("#cRecv"); if(rc) rc.onclick=()=>recv(false);
}
})();
