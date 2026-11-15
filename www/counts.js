/* ---------- Count an order (2026-11-02) ----------
   One count sheet per order (supplier line on a job): table gvc_counts (job_id, sup_id, items jsonb).
   items: [{k, part_no, name, mat, qty, got, skip, thumb, img, src}]
   Seeded from the job's parts list (gvc_job_parts by job number). Parts not on this order can be set aside;
   other items can be added by hand or picked from the Truck parts inventory (INV orders, hardware).
   Each piece gets its own box: 4 ordered = 4 boxes, tick them as you find them.
   Opened from the To do "Count & check" reminder (Count button), the Arrived cards on the Orders board, and a supplier on the job card.
   Partial deliveries (Nov 6): items can be marked later:true ("comes in a later delivery") - per item, or per material with the
   "Only part of the order came?" chips. Later items are left out of this count; finishing with later items saves the delivery,
   keeps the order open (status back to In production) and logs what came and what's still coming.
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
.cnt .th[data-fv]{cursor:zoom-in}
.cnt .mchip{display:inline-block;font:600 12.5px var(--font-display);letter-spacing:.03em;padding:1px 7px;border-radius:5px;background:#f5b041;color:#1a1204;text-transform:uppercase;margin:2px 0}
.cnt .mchip.al{background:#9fd3ff;color:#06223a}.cnt .mchip.ss{background:#d9dde3;color:#15181c}.cnt .th svg{width:100%;height:100%;display:block;padding:3px;box-sizing:border-box}
.cnt .nm{font-weight:600;font-size:14px;word-break:break-word;display:flex;justify-content:space-between;gap:8px}
.cnt .nm .q{font-family:var(--font-display);font-size:15px;white-space:nowrap}
.cnt .mt{font-size:12px;color:var(--muted);margin-top:1px}
.cnt .boxes{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
.cnt .bx{width:34px;height:34px;border-radius:7px;border:1.5px solid #5a5f68;background:transparent;color:transparent;font-size:18px;line-height:30px;padding:0;cursor:pointer}
.cnt .bx.on{background:#3ad06b;border-color:#3ad06b;color:#0d1a10}
.cnt .step{display:flex;align-items:center;gap:8px;margin-top:7px}
.cnt .step button{min-width:40px;height:34px;font-size:16px;white-space:nowrap}
.cnt .step b{font-family:var(--font-display);font-size:18px;min-width:70px;text-align:center}
.cnt .lnk{font:inherit;font-size:11.5px;color:var(--dim);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline}
.cnt .cnol{margin:10px 0 4px;padding:10px 12px;border:1px solid rgba(245,176,65,.5);background:rgba(245,176,65,.08);border-radius:10px;font-size:13px;color:#ffd28a}
.cnt .cnol b{color:#ffd28a}
.cnt .q.cf{color:#7ff0a8;font-weight:700}
.cnt .cnfb{margin:6px 0 2px}
.cnt .boxes .bx{pointer-events:auto}
#gFlat .cfp{position:absolute;inset:0;background:rgba(5,6,8,.6);display:flex;align-items:flex-end;justify-content:center;z-index:5}
#gFlat .cfpb{width:min(520px,100%);background:#17191d;border:1px solid #2a2e35;border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));color:#e9ebee;font-size:14px}
#gFlat .cfpb b{display:block;font-size:16px;margin-bottom:4px}
#gFlat .cfpa{display:flex;flex-direction:column;gap:8px;margin-top:12px}
#gFlat .cfpa button{min-height:48px;border-radius:12px;border:1px solid #3a3e45;background:rgba(255,255,255,.06);color:#e9ebee;font:600 15px var(--font-ui,inherit);cursor:pointer}
#gFlat .cfpa .go{background:#ff8a2a;border-color:#ff8a2a;color:#1b0f05}
.cnt .opick{border-style:solid;border-color:var(--accent-line)}
.cnt .pkh{font:600 11.5px var(--font-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin:12px 0 4px}
.cnt .pkr{display:flex;gap:10px;align-items:center;padding:6px 2px;font-size:14px;cursor:pointer}
.cnt .pkr input,.cnt .pkgh input{width:20px;height:20px;flex:none}
.cnt .pkr small{color:var(--muted)}
.cnt .pkg{border-top:1px solid var(--line);padding:6px 0}
.cnt .pkgh{display:flex;gap:8px;align-items:center;justify-content:space-between}
.cnt .pkgh label{display:flex;gap:8px;align-items:center;font-size:13px;cursor:pointer;min-width:0}
.cnt .pkgh label span{overflow:hidden;text-overflow:ellipsis}
.cnt .pkw{margin:8px 0;padding:8px 10px;border:1px solid rgba(245,176,65,.5);background:rgba(245,176,65,.1);border-radius:8px;font-size:12.5px;color:#ffd28a}
.cnt .pkq{width:100%;box-sizing:border-box;margin:2px 0 6px}
.cnt .addbox{border:1px dashed var(--line);border-radius:10px;padding:10px;margin-top:10px}
.cnt .addrow{display:flex;gap:6px;flex-wrap:wrap}
.cnt .pick{display:grid;gap:4px;margin-top:6px;max-height:260px;overflow:auto}
.cnt .pick button{display:flex;gap:8px;align-items:center;text-align:left;font:inherit;font-size:13px;color:var(--text);background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:7px;padding:5px 8px;cursor:pointer}
.cnt .pick img{width:40px;height:28px;object-fit:contain;background:#fff;border-radius:4px}
.cnt .foot{position:sticky;bottom:0;background:linear-gradient(180deg,rgba(20,22,25,0),#141619 30%);padding-top:14px;margin-top:10px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.cnt .saved{font-size:12px;color:var(--dim);align-self:center;margin-right:auto}
.cnt .cserr{color:#ff8a7a;font-weight:600}
.cnt .ccf{margin:10px 0 4px;padding:10px 12px;border:1px solid rgba(255,107,90,.55);background:rgba(255,107,90,.08);border-radius:10px;font-size:13px}
.cnt .ccr{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 0;border-top:1px solid var(--line);margin-top:8px}
.cnt .ccn{font-weight:700;flex:1 1 100%}
.cnt .ccr .btn{display:flex;flex-direction:column;align-items:flex-start;min-height:44px;text-align:left}
.cnt .ccr .btn span{font-size:12px;color:var(--muted);font-weight:400}
.cnt .grp{font-family:var(--font-display);letter-spacing:.04em;font-size:15px;margin:16px 0 2px;padding-bottom:4px;border-bottom:2px solid var(--c,#555);display:flex;justify-content:space-between;gap:8px}
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
const live=()=>st.items.filter(i=>!i.skip&&!i.later);
const later=()=>st.items.filter(i=>!i.skip&&i.later);
const totals=()=>{ const L=live(); return {pcs:L.reduce((a,i)=>a+(i.qty||0),0), got:L.reduce((a,i)=>a+got(i),0), lines:L.length, full:L.filter(i=>got(i)>=(i.qty||0)).length}; };

/* Stage 10 (Kyle's review, Nov 14): a count is built from THAT order, never the whole job by default.
   jobParts() = the job's parts list (gvc_job_parts) for the picker; suggest() = parts the order itself names
   (scope / note / title, e.g. "CENTERLOC.9 x2"), pre-ticked with that quantity. Nothing goes on the checklist
   until someone picks it. */
async function jobParts(j){
  const no=window.jobNum?window.jobNum(j.name):"";
  if(!no) return [];
  const r=await sb.from("gvc_job_parts").select("part_no,name,assembly,material,thickness,qty,thumb_path,source").eq("job_no",no).order("assembly").order("part_no");
  return (r.data||[]).map(p=>({k:"j:"+p.part_no, part_no:p.part_no, name:p.name&&p.name!==p.part_no?p.name:(p.assembly||""), mat:window.jpMatText?window.jpMatText(p):[p.thickness?n3(p.thickness)+'"':"",p.material].filter(Boolean).join(" "), qty:p.qty||1, got:0, thumb:p.thumb_path||"", src:"job", source:p.source||"No source"}));
}
function suggest(parts,sup,rec){
  const text=[sup.scope,sup.note,rec&&rec.title].filter(Boolean).join(" \n ");
  if(!text) return {};
  const out={};
  parts.forEach(p=>{ const pn=String(p.part_no||""); if(!pn) return;
    const cands=[pn,pn.replace(/^[^.]*_[^.]*\./,""),pn.split(".").slice(-2).join(".")].filter(x=>x&&x.length>=4&&/\D/.test(x));
    for(const c of new Set(cands)){ const re=new RegExp("(^|[^A-Za-z0-9_.])"+c.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"(?![A-Za-z0-9_]|\\.\\d)(?:\\s*[x×]\\s*(\\d+))?","i"); const m=text.match(re);
      if(m){ out[p.k]=m[2]?+m[2]:null; break; } } });
  return out;
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
    if(!its||!its.length){ its=[]; const jj=jobOf(S.jobId), ss=(jj.suppliers||[]).find(x=>x.id===S.supId)||{};
      const rec=window.posRec?window.posRec(ss.po||ss.rfq):null;
      const parts=await jobParts(jj); if(parts.length){ const sg=suggest(parts,ss,rec); S.pick={parts,sug:sg,sel:new Set(Object.keys(sg)),q:"",open:new Set()}; } }
    its.forEach(i=>{ i.g=g; items.push(i); });
  }
  st={jobId, supId:sup.id, sets, items, q:"", f:"all", seeded, dirty:new Set(), timer:null, addQ:"", addG:0, flat:{},
      base:{}, conflicts:[], saveErr:"", flushing:null, restore:[]};
  items.forEach(i=>{ if(st.sets[i.g].row) st.base[bk(i.g,i.k)]=snap(i); });
  sets.forEach((S,g)=>{ const b=bkRead(S); if(!(b&&b.items&&b.items.length)) return;
    const cur=Object.fromEntries(items.filter(i=>i.g===g).map(i=>[i.k,i]));
    const differs=b.items.some(i=>!cur[i.k]||!same(snap(i),snap(cur[i.k])));
    if(differs) st.restore.push({g,b}); else { try{ localStorage.removeItem(bkKey(S)); }catch(e){} } });
  await loadFlat(items);
  await sign(items.filter(i=>!st.flat[i.part_no]).map(i=>i.thumb||i.img));
  draw();
};

/* ---- flat patterns instead of bend drawings (Kyle, Nov 8): drawn from the laser DXF by flat.js, tap to enlarge ---- */
const FL={};   // part_no -> {x:{svg,thumb,W,H}, warn} once drawn
async function loadFlat(items){
  if(!window.gvcFlat) return;
  const jp=[...new Set(items.filter(i=>i.part_no&&i.src!=="inv").map(i=>i.part_no))], ip=[...new Set(items.filter(i=>i.part_no&&i.src==="inv").map(i=>i.part_no))];
  for(let i=0;i<jp.length;i+=150){ const r=await sb.from("gvc_job_parts").select("part_no,dxf_path,flat_w,flat_h").in("part_no",jp.slice(i,i+150));
    (r.data||[]).forEach(p=>{ if(p.dxf_path) st.flat[p.part_no]={dxf:p.dxf_path,w:p.flat_w,h:p.flat_h}; }); }
  for(let i=0;i<ip.length;i+=150){ const r=await sb.from("gvc_parts").select("part_no,dxf_path,dxf_damaged,flat_path,flat_w,flat_h").in("part_no",ip.slice(i,i+150));
    (r.data||[]).forEach(p=>{ if(p.dxf_path&&!p.dxf_damaged) st.flat[p.part_no]={dxf:p.dxf_path,w:p.flat_w,h:p.flat_h}; else if(p.flat_path) st.flat[p.part_no]={svgPath:p.flat_path,w:p.flat_w,h:p.flat_h}; }); }
  await sign(Object.values(st.flat).map(f=>f.dxf||f.svgPath));
}
const flatQ=new Set(); let flatBusy=0;
async function drawFlat(pn){
  if(FL[pn]||flatQ.has(pn)) return; const f=st&&st.flat[pn]; if(!f) return; flatQ.add(pn);
  while(flatBusy>=4) await new Promise(r=>setTimeout(r,60)); flatBusy++;
  try{ const u=url(f.dxf||f.svgPath); if(!u) throw 0; const t=await (await fetch(u)).text();
    if(f.dxf){ const x=window.gvcFlat.fromDxf(t); if(x) FL[pn]={x,warn:window.gvcFlat.check(x,f.w,f.h)}; }
    else { const sv=t.replace(/<\?xml[^>]*>/,""); FL[pn]={x:{svg:sv,thumb:sv,W:+f.w||0,H:+f.h||0},warn:""}; }
  }catch(e){} finally{ flatBusy--; flatQ.delete(pn); }
  document.querySelectorAll(`.cnt [data-fl="${CSS.escape(pn)}"]`).forEach(fillFlat);
}
function fillFlat(el){ const F=FL[el.dataset.fl]; if(!F) return; el.innerHTML=F.x.thumb; const d=el.closest(".it")&&el.closest(".it").querySelector("[data-dm]");
  if(d) d.innerHTML=flatDims(el.dataset.fl); }
function flatDims(pn){ const f=st.flat[pn]||{}, F=FL[pn]; const W=F?F.x.W:+f.w, H=F?F.x.H:+f.h; if(!(W>0&&H>0)) return "";
  return `<b style="color:var(--text)">${window.gvcFlat.inch(Math.max(W,H))} × ${window.gvcFlat.inch(Math.min(W,H))}</b>${F&&F.warn?` <span style="color:#f5b041" title="${esc(F.warn)}">⚠ DXF size doesn't match the drawing</span>`:""}`; }
let flatIO=null;
function hydrateFlat(){
  const els=[...document.querySelectorAll(".cnt [data-fl]")]; if(!els.length) return;
  if(!flatIO&&"IntersectionObserver" in window) flatIO=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ flatIO.unobserve(e.target); FL[e.target.dataset.fl]?fillFlat(e.target):drawFlat(e.target.dataset.fl); } }),{rootMargin:"300px"});
  els.forEach(el=>{ if(FL[el.dataset.fl]) fillFlat(el); else if(flatIO) flatIO.observe(el); else drawFlat(el.dataset.fl); });
}
/* Per-part confirm (stage 9, Kyle Nov 14): a part's count is only saved when you tap Confirm count on its screen.
   Ticking boxes on the part screen is a draft; leaving with unconfirmed changes asks Confirm / Discard / Keep counting
   (from the scanner: Confirm & scan next / Discard & scan next / Keep counting). A confirmed part shows "Confirmed n of q"
   on the list; changing it later needs another confirm. Finishing the whole order stays a separate step (Done counting). */
const confirmedOk=it=>!!it.conf&&it.conf.n===got(it);
function holdPrompt(ov,why,{confirm,discard,keep}){
  const nx=why==="next";
  const box=document.createElement("div"); box.className="cfp";
  box.innerHTML=`<div class="cfpb" role="alertdialog" aria-label="Unconfirmed count"><b>This count isn't confirmed yet.</b><div>Save it before you ${nx?"scan the next part":"leave this part"}?</div>
    <div class="cfpa"><button type="button" class="go" data-c="1">${nx?"Confirm & scan next":"Confirm count"}</button><button type="button" data-d="1">${nx?"Discard & scan next":"Discard changes"}</button><button type="button" data-k="1">Keep counting</button></div></div>`;
  ov.appendChild(box);
  box.querySelector("[data-c]").onclick=()=>{ box.remove(); confirm(); };
  box.querySelector("[data-d]").onclick=()=>{ box.remove(); discard(); };
  box.querySelector("[data-k]").onclick=()=>{ box.remove(); keep&&keep(); };
}
async function openPart(ix,scan){
  const it=st.items[ix], pn=it.part_no; if(pn&&!FL[pn]) await drawFlat(pn); const F=pn&&FL[pn];
  const orig=got(it); let pend=orig;
  const commit=()=>{ it.got=pend; it.conf={n:pend,by:(window.ME&&ME.name)||"",at:new Date().toISOString()}; changed(it.g); };
  const svg=F?F.x.svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220"><rect width="400" height="220" fill="#fff"/><text x="200" y="104" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#666">No drawing for this part</text><text x="200" y="132" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#999">${esc(pn||it.name||"")}</text></svg>`;
  window.gvcFlat.view({title:pn||it.name,mat:matLabel(it.mat),sub:it.part_no&&it.name&&it.name!==it.part_no&&it.name!==matLabel(it.mat)&&!String(it.mat||"").includes(it.name)?it.name:"",
    svg,W:F?F.x.W:0,H:F?F.x.H:0,vw:F?F.x.vw:400,vh:F?F.x.vh:220,warn:F?F.warn:"",
    count:{qty:it.qty||0,got:()=>pend,set:n=>{ pend=n; }},
    actions:scan?[{label:"↺ Rescan",cls:"re",why:"rescan"},{label:"Confirm count",cls:"go",why:"confirm"},{label:"Scan next part ›",cls:"re",why:"next"}]
      :[{label:"Confirm count",cls:"go",why:"confirm"}],
    ...(scan?{z:9500}:{}),
    beforeClose:(why,go,ov)=>{
      if(why==="replace") return go();
      if(why==="confirm"){ commit(); return go(); }
      const dirty=pend!==orig||(!it.conf&&pend>0&&why!=="rescan"&&false);
      if(!dirty) return go();
      holdPrompt(ov,why,{confirm:()=>{ commit(); go(); },discard:()=>{ pend=orig; go(); }});
    },
    onClose:why=>{ if(scan){ scan(why==="confirm"?"next":why==="close"?"next":why); return; } const D=$("#dlg"), sc=D.scrollTop; draw(); D.scrollTop=sc; }});
  return true;
}
async function openFlat(ix,scan){ return openPart(ix,scan); }
// '0.125" 0.125 ALUMINUM' -> '0.125" ALUMINUM' (the material name repeats the thickness)
function matLabel(m){ m=String(m||"").trim(); if(!m) return ""; if(window.jpMatText){ const t=window.jpMatText({thickness:null,material:m}); if(t) return t; }
  const x=m.match(/^([\d.]+)"\s+([\d.]+)\s+(.*)$/); return x&&Math.abs(+x[1]-+x[2])<1e-6?`${x[1]}" ${x[3]}`:m; }
const MK=i=>matLabel(i.mat)||"Other";
window.gvcCountFlatThumb=pn=>FL[pn]?"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(FL[pn].x.thumb):"";

function head(){
  const j=jobOf(st.jobId), sup=(j.suppliers||[]).find(x=>x.id===st.supId)||{}; const t=totals();
  const multi=st.sets.length>1;
  return `<div class="hd"><div><h3 style="margin:0">Count - ${multi?"combined order":esc(j.name)}</h3>${multi?`<div class="csub">One order for ${st.sets.map(S=>esc(jobOf(S.jobId).name)).join(" + ")}</div>`:""}
    <div class="csub">${esc(sup.name||"")}${sup.quoteNo?" · #"+esc(sup.quoteNo):""}${sup.scope?" · "+esc(sup.scope):""} · ${(ST[sup.status]||ST.sent).t}</div></div>
    <span style="display:flex;gap:6px"><button class="btn" type="button" id="cPrint" title="Print a paper checklist (or save it as a PDF)">🖨 Print</button><button class="btn ghost" type="button" id="cBack">Back to job</button></span></div>
    ${!st.items.some(i=>!i.skip)?`<div class="cnol"><b>No checklist - nothing counted yet.</b> There's no parts list for this order. Add what was ordered below to count it, or receive it without a checklist.</div>`:`<div class="bar"><div style="width:${t.pcs?Math.round(t.got/t.pcs*100):0}%"></div></div>
    <div class="csub"><b style="color:var(--text)">Confirmed: ${live().filter(confirmedOk).length} of ${live().length} parts</b> · ${t.got} of ${t.pcs} pcs · ${t.full} of ${t.lines} parts complete${st.items.some(i=>i.skip)?` · ${st.items.filter(i=>i.skip).length} set aside (not on this order)`:""}${later().length?` · <b style="color:#f5b041">${later().length} part${later().length>1?"s":""} (${later().reduce((a,i)=>a+(i.qty||0),0)} pcs) still to come</b>`:""}</div>`}`;
}
function itemRow(it,ix){
  const g=got(it), q=it.qty||0, cls=confirmedOk(it)&&g>=q&&q>0?"full":g>0?"part":"";
  const im=url(it.thumb||it.img); const fl=st.flat&&it.part_no&&st.flat[it.part_no];
  const boxes=`<button type="button" class="btn sm${confirmedOk(it)?"":" primary"} cnfb" data-cnf="${ix}">${confirmedOk(it)?"Change count":g?"Check & confirm":"Count this part"}</button>`+(q<=24?`<div class="boxes">${Array.from({length:q},(_,b)=>`<button class="bx ${b<g?"on":""}" type="button" data-bx="${ix}" data-b="${b}" aria-label="piece ${b+1}">✓</button>`).join("")}</div>`
    :`<div class="step"><button class="btn" type="button" data-dn="${ix}">−</button><b>${g} / ${q}</b><button class="btn" type="button" data-up="${ix}">+</button><button class="btn sm" type="button" data-all="${ix}">All here</button></div>`);
  const th=fl?`<div class="th fl" data-fl="${esc(it.part_no)}" data-fv="${ix}" role="button" aria-label="Enlarge the flat pattern">${FL[it.part_no]?FL[it.part_no].x.thumb:`<span>…</span>`}</div>`
    :`<div class="th" ${im?`data-fv="${ix}" role="button"`:""}>${im?`<img src="${esc(im)}" alt="" loading="lazy">`:esc(it.part_no||"")}</div>`;
  return `<div class="it ${cls}">${th}
    <div><div class="nm"><span>${esc(it.part_no||it.name)}</span><span class="q ${confirmedOk(it)?"cf":""}">${confirmedOk(it)?`✓ Confirmed ${g} of ${q}`:g?`${g} / ${q} · not confirmed`:`0 / ${q}`}</span></div>
    <div class="mt">${it.mat?`<span class="mchip ${/alum|\bal\b/i.test(it.mat)?"al":/stainless|\bss\b/i.test(it.mat)?"ss":""}">${esc(matLabel(it.mat))}</span>`:""}${it.part_no&&it.name&&it.name!==it.part_no&&it.name!==matLabel(it.mat)&&!String(it.mat||"").includes(it.name)?" "+esc(it.name):""}</div>
    ${fl?`<div class="mt" data-dm>${flatDims(it.part_no)}</div>`:""}
    ${boxes}
    <div style="margin-top:6px;display:flex;gap:14px"><button class="lnk" type="button" data-later="${ix}">Comes later</button><button class="lnk" type="button" data-skip="${ix}">Not on this order</button></div></div></div>`;
}
/* paper checklist for someone without the app - one row per part, a box per piece (Kyle, 2026-11-04) */
function printSheet(){
  const j=jobOf(st.jobId), sup=(j.suppliers||[]).find(x=>x.id===st.supId)||{};
  const items=live().slice().sort((a,b)=>String(a.mat||"").localeCompare(String(b.mat||""))||String(a.part_no||a.name).localeCompare(String(b.part_no||b.name),undefined,{numeric:true}));
  const pcs=items.reduce((a,i)=>a+(i.qty||0),0);
  const byMat={}; items.forEach(i=>(byMat[MK(i)]=byMat[MK(i)]||[]).push(i));
  const row=i=>{ const q=i.qty||0, im=url(i.thumb||i.img);
    const boxes=q<=30?Array.from({length:q},()=>'<span class="b"></span>').join(""):`<span class="ln"></span> of ${q}`;
    return `<tr><td class="th">${im?`<img src="${esc(im)}" alt="">`:""}</td><td><b>${esc(i.part_no||i.name)}</b>${i.part_no&&i.name&&i.name!==i.part_no?`<div class="s">${esc(i.name)}</div>`:""}</td><td class="q">${q}</td><td>${boxes}</td><td class="nt"></td></tr>`; };
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Count sheet - ${esc(j.name)}</title><style>
    body{font:12px/1.35 Arial,sans-serif;color:#000;margin:18px}
    h1{font-size:18px;margin:0}.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:8px}
    .meta{font-size:12px}table{width:100%;border-collapse:collapse;margin-bottom:10px}
    th{text-align:left;font-size:11px;border-bottom:1px solid #000;padding:4px}td{border-bottom:1px solid #ccc;padding:4px;vertical-align:middle}
    tr{page-break-inside:avoid}.th{width:64px}.th img{width:60px;height:40px;object-fit:contain}
    .q{width:36px;text-align:center;font-weight:bold;font-size:14px}.nt{width:120px}.s{color:#555;font-size:11px}
    .b{display:inline-block;width:16px;height:16px;border:1.5px solid #000;margin:1px 3px 1px 0;vertical-align:middle}
    .ln{display:inline-block;width:50px;border-bottom:1.5px solid #000}
    h2{font-size:13px;background:#eee;padding:4px 6px;margin:12px 0 0}
    .sign{display:flex;gap:30px;margin-top:16px;font-size:13px}.sign span{flex:1;border-top:1px solid #000;padding-top:4px}
    @media print{ body{margin:8mm} }
  </style></head><body>
  <div class="top"><div><h1>Count sheet - ${esc(j.name)}</h1><div class="meta">${esc(sup.name||"")}${sup.quoteNo?" · #"+esc(sup.quoteNo):""} · ${items.length} parts · ${pcs} pcs</div></div><div class="meta">Printed ${new Date().toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"})}<br>Tick one box per piece. Write anything short or damaged in Notes.</div></div>
  ${Object.entries(byMat).map(([m,l])=>`<h2>${esc(m)} · ${l.reduce((a,i)=>a+(i.qty||0),0)} pcs</h2><table><tr><th></th><th>Part</th><th>Qty</th><th>Pieces</th><th>Notes</th></tr>${l.map(row).join("")}</table>`).join("")}
  <div class="sign"><span>Counted by</span><span>Date</span><span>All here?  YES  /  NO</span></div>
  <script>window.onload=()=>setTimeout(()=>print(),400)<\/script></body></html>`;
  const w=window.open("","_blank");
  if(w){ w.document.open(); w.document.write(html); w.document.close(); return; }
  const f=document.createElement("iframe"); f.style.cssText="position:fixed;width:0;height:0;border:0"; document.body.appendChild(f);
  f.contentDocument.open(); f.contentDocument.write(html.replace(/<script>[\s\S]*?<\/script>/,"")); f.contentDocument.close(); setTimeout(()=>{ try{ f.contentWindow.print(); }catch(e){ alert("Printing isn't available here - open the app on the PC to print the count sheet."); } setTimeout(()=>f.remove(),60000); },600);
}
function draw(){
  const D=$("#dlg"); const words=st.q.toLowerCase().split(/\s+/).filter(Boolean);
  const vis=st.items.map((it,ix)=>({it,ix})).filter(({it})=>!it.skip&&!it.later&&words.every(w=>[it.part_no,it.name,it.mat,matLabel(it.mat)].join(" ").toLowerCase().includes(w))
    &&(st.f==="all"||(st.f==="missing"?got(it)<(it.qty||0):got(it)>=(it.qty||0))));
  const skipped=st.items.map((it,ix)=>({it,ix})).filter(({it})=>it.skip);
  const mats=[...new Set(live().map(i=>matLabel(i.mat)).filter(Boolean))];
  const allMats=[...new Set(st.items.filter(i=>!i.skip).map(MK))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const lat=st.items.map((it,ix)=>({it,ix})).filter(({it})=>!it.skip&&it.later);
  D.innerHTML=`<div class="cnt">${head()}<div id="cAlerts">${alertsHtml()}</div>
    ${st.items.length?`<div class="tools">${window.gvcScan?`<button class="btn primary" type="button" id="cScan" style="min-height:40px">📷 Scan</button>`:""}<input type="search" id="cQ" placeholder="Find a part (number, name, material)" value="${esc(st.q)}">
      ${[["all","All"],["missing","Missing"],["done","Counted"]].map(([k,t])=>`<button class="chip ${st.f===k?"on":""}" type="button" data-cf="${k}" style="${st.f===k?"border-color:#3ad06b;color:#3ad06b":""}">${t}</button>`).join("")}</div>
      ${mats.length>1?`<div class="tools">${mats.map(m=>`<button class="chip" type="button" data-cq="${esc(m)}">${esc(matLabel(m))}</button>`).join("")}</div>`:""}`:""}
    ${st.seeded&&st.items.length?`<div class="tnote">Started from the job's parts list (${st.items.length} parts). If this order is only part of the job, tap "Not on this order" on the rest.</div>`:""}
    ${allMats.length>1?`<details class="addbox" style="margin-top:8px" ${lat.length?"open":""}><summary style="cursor:pointer;font-size:13px;font-weight:600">Only part of the order came?</summary>
      <div class="tnote" style="margin-top:4px">Tap the materials that came in this delivery. The rest stays on the order as "still to come" and isn't counted short.</div>
      <div class="tools">${allMats.map(m=>{ const on=st.items.some(i=>!i.skip&&!i.later&&MK(i)===m); const n=st.items.filter(i=>!i.skip&&MK(i)===m).reduce((a,i)=>a+(i.qty||0),0);
        return `<button class="chip ${on?"on":""}" type="button" data-pm="${esc(m)}" style="${on?"border-color:#3ad06b;color:#3ad06b":"opacity:.6"}">${on?"✓ ":""}${esc(matLabel(m))} · ${n}</button>`; }).join("")}
        <button class="lnk" type="button" id="cPmAll">All came</button></div></details>`:""}
    <div id="cList">${listHtml(vis)}</div>
    ${lat.length?`<details style="margin-top:10px"><summary class="tnote" style="cursor:pointer;color:#f5b041">Still to come - later delivery (${lat.length} parts, ${lat.reduce((a,{it})=>a+(it.qty||0),0)} pcs)</summary>${lat.map(({it,ix})=>`<div class="tnote" style="display:flex;justify-content:space-between;gap:8px;margin:4px 0"><span>${esc(it.part_no||it.name)} · ${esc(it.mat||"")} · ${it.qty} pcs</span><button class="lnk" type="button" data-unlater="${ix}">It's here</button></div>`).join("")}</details>`:""}
    ${skipped.length?`<details style="margin-top:10px"><summary class="tnote" style="cursor:pointer">Not on this order (${skipped.length})</summary>${skipped.map(({it,ix})=>`<div class="tnote" style="display:flex;justify-content:space-between;gap:8px;margin:4px 0"><span>${esc(it.part_no||it.name)} · ${it.qty} pcs</span><button class="lnk" type="button" data-unskip="${ix}">Put back</button></div>`).join("")}</details>`:""}
    ${pickHtml()}
    <div class="addbox"><b style="font-size:13px">Add an item to this order</b>
      <div class="addrow" style="margin-top:6px"><input id="cAddQ" placeholder="Search inventory or type a name" value="${esc(st.addQ)}" style="flex:1;min-width:160px"><input id="cAddN" type="number" min="1" value="1" style="width:70px" aria-label="Quantity">${st.sets.length>1?`<select id="cAddG" aria-label="Which job">${st.sets.map((S,g)=>`<option value="${g}" ${st.addG===g?"selected":""}>${esc(jobOf(S.jobId).name)}</option>`).join("")}</select>`:""}<button class="btn" type="button" id="cAdd">Add</button></div>
      <div class="pick" id="cPick"></div></div>
    <div class="foot"><span class="saved" id="cSaved">${saveHtml()}</span><button class="btn ${st.items.some(i=>!i.skip)?"primary":""}" type="button" id="cDone">${st.items.some(i=>!i.skip)?"Done counting":"Receive without a checklist…"}</button></div></div>`;
  wire(); drawPick();
}
function listHtml(vis){
  if(st.sets.length<2) return vis.map(({it,ix})=>itemRow(it,ix)).join("")||(st.items.length?`<div class="tnote">Nothing here with that filter.</div>`:"");
  return st.sets.map((S,g)=>{ const jj=jobOf(S.jobId); const mine=st.items.filter(i=>i.g===g&&!i.skip&&!i.later);
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
/* "Which parts are on this order?" - suggested parts pre-ticked; the rest of the job's parts grouped by where they came from */
function pickHtml(){
  return st.sets.map((S,g)=>{ const P=S.pick; if(!P) return "";
    const has=k=>P.sel.has(k), q=P.q.toLowerCase();
    const row=p=>`<label class="pkr"><input type="checkbox" data-pk="${g}|${esc(p.k)}" ${has(p.k)?"checked":""}><span><b>${esc(p.part_no)}</b> <small>${esc(p.mat||"")}${P.sug[p.k]!=null?` · ×${P.sug[p.k]} on the order`:` · job qty ${p.qty}`}</small></span></label>`;
    const sug=P.parts.filter(p=>p.k in P.sug);
    const by={}; P.parts.filter(p=>!q||[p.part_no,p.name,p.mat,p.source].join(" ").toLowerCase().includes(q)).forEach(p=>{ (by[p.source]=by[p.source]||[]).push(p); });
    const n=P.sel.size;
    return `<div class="addbox opick"><b style="font-size:14px">Which parts are on this order?${st.sets.length>1?" - "+esc(jobOf(S.jobId).name):""}</b>
      <div class="tnote">The checklist only has what you pick here. ${sug.length?"Parts the order's wording mentions are ticked as a suggestion.":"The order doesn't name any parts from the job's list - pick them, or add items by hand below."} Email packages can include revised or superseded drawings - don't tick both versions of a part.</div>
      ${sug.length?`<div class="pkh">Suggested from the order's wording</div><div class="tnote" style="margin-top:-2px">Found in the order description - not a verified order list. Check them against the order or packing slip.</div>${sug.map(row).join("")}`:""}
      ${dupWarn(P)}
      <div class="pkh">From the job's parts list (${P.parts.length})</div>
      <input type="search" class="pkq" data-pkq="${g}" placeholder="Find a part" value="${esc(P.q)}">
      ${Object.entries(by).map(([src,L])=>{ const all=L.every(p=>has(p.k)), some=L.some(p=>has(p.k)), op=P.open.has(src)||!!q;
        return `<div class="pkg"><div class="pkgh"><label><input type="checkbox" data-pkall="${g}|${esc(src)}" ${all?"checked":""} ${!all&&some?"data-mixed":""}> <span>${esc(src.length>80?src.slice(0,78)+"…":src)}</span></label><button type="button" class="lnk" data-pko="${g}|${esc(src)}">${op?"Hide":"Show"} ${L.length}</button></div>
          ${op?L.map(row).join(""):""}</div>`; }).join("")}
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn primary" type="button" data-pkgo="${g}" ${n?"":"disabled"}>Add ${n} part${n===1?"":"s"} to the checklist</button></div></div>`; }).join("");
}
/* two versions of the same part ticked (e.g. HEADACHE.5 and HEADACHE.5-R2, or "Body2" and "_1_ Body2") - warn, don't guess which is current */
const partBase=pn=>String(pn||"").toUpperCase().replace(/\s*\(\d+\)$/,"").replace(/[-_ ]*(R|REV)\s*\d+$/,"").replace(/_\d+_\s*/g,"").replace(/\s+/g," ").trim();
function dupWarn(P){ const by={}; P.parts.filter(p=>P.sel.has(p.k)).forEach(p=>{ const b=partBase(p.part_no); (by[b]=by[b]||[]).push(p); });
  const d=Object.values(by).filter(L=>L.length>1); if(!d.length) return "";
  return `<div class="pkw">⚠ ${d.length} part${d.length>1?"s look":" looks"} ticked twice in different versions: ${d.slice(0,4).map(L=>L.map(p=>esc(p.part_no)+" ("+esc(String(p.source).replace(/^Order email /,"").slice(0,24))+")").join(" / ")).join("; ")}${d.length>4?"…":""}. Untick the version that isn't on this order.</div>`; }
function wirePick(D){
  const S=g=>st.sets[+g].pick;
  D.querySelectorAll("[data-pk]").forEach(b=>b.onchange=()=>{ const [g,k]=b.dataset.pk.split(/\|(.*)/s); const P=S(g); b.checked?P.sel.add(k):P.sel.delete(k); draw(); });
  D.querySelectorAll("[data-pkall]").forEach(b=>{ if(b.hasAttribute("data-mixed")) b.indeterminate=true; b.onchange=()=>{ const [g,src]=b.dataset.pkall.split(/\|(.*)/s); const P=S(g); P.parts.filter(p=>p.source===src).forEach(p=>b.checked?P.sel.add(p.k):P.sel.delete(p.k)); draw(); }; });
  D.querySelectorAll("[data-pko]").forEach(b=>b.onclick=()=>{ const [g,src]=b.dataset.pko.split(/\|(.*)/s); const P=S(g); P.open.has(src)?P.open.delete(src):P.open.add(src); draw(); });
  D.querySelectorAll("[data-pkq]").forEach(i=>i.oninput=()=>{ const P=S(i.dataset.pkq); P.q=i.value; const pos=i.selectionStart; draw(); const n=D.querySelector(`[data-pkq="${i.dataset.pkq}"]`); if(n){ n.focus(); n.setSelectionRange(pos,pos); } });
  D.querySelectorAll("[data-pkgo]").forEach(b=>b.onclick=async()=>{ if(b.disabled) return; b.disabled=true; const g=+b.dataset.pkgo, P=S(g);
    P.parts.filter(p=>P.sel.has(p.k)).forEach(p=>{ const {source,...it}=p; st.items.push({...it,qty:P.sug[p.k]!=null?P.sug[p.k]:it.qty,got:0,g}); });
    st.sets[g].pick=null; changed(g); await loadFlat(st.items); await sign(st.items.filter(i=>!st.flat[i.part_no]).map(i=>i.thumb||i.img)); draw(); });
}
function addItem(base){
  const n=Math.max(1,parseInt($("#cAddN").value)||1);
  const gs=$("#cAddG"); const g=gs?+gs.value:0; st.addG=g;
  const ex=st.items.find(i=>i.k===base.k&&i.g===g); if(ex){ ex.qty=(ex.qty||0)+n; ex.skip=false; } else st.items.push({...base,qty:n,got:0,g});
  st.addQ=""; changed(g); draw();
}
function wire(){
  const D=$("#dlg");
  $("#cBack").onclick=async()=>{ const b=$("#cBack"); if(b.disabled) return; b.disabled=true;
    const ok=await flush(); b.disabled=false;
    if(ok&&!st.conflicts.length){ openJob(st.jobId); return; }
    blockBox(ok?"conflict":"unsaved","leave"); };
  wireSaved(); wireAlerts();
  $("#cPrint").onclick=printSheet;
  D.querySelectorAll("[data-fv]").forEach(b=>b.onclick=()=>openFlat(+b.dataset.fv));
  hydrateFlat();
  const sc=$("#cScan"); if(sc) sc.onclick=()=>{   // live camera: read the engraved part number (scan.js)
    const L=st.items.map((it,ix)=>({it,ix})).filter(({it})=>!it.skip&&!it.later);
    window.gvcScan({title:"Scan a part number",
      items:L.map(({it,ix})=>({id:String(ix),keys:[it.part_no,it.part_no?"":it.name],label:it.part_no||it.name})),
      info:id=>{ const it=st.items[+id]; return {label:it.part_no||it.name,sub:[it.part_no&&it.name&&it.name!==it.part_no?it.name:"",matLabel(it.mat)].filter(Boolean).join(" · "),got:got(it),qty:it.qty||0,img:window.gvcCountFlatThumb(it.part_no)||url(it.thumb||it.img)}; },
      open:(id,done)=>{ openPart(+id,done); return true; },
      act:()=>{},
      onClose:()=>draw()});
  };
  const q=$("#cQ"); if(q) q.oninput=()=>{ st.q=q.value; const pos=q.selectionStart; draw(); const n=$("#cQ"); n.focus(); n.setSelectionRange(pos,pos); };
  D.querySelectorAll("[data-cf]").forEach(b=>b.onclick=()=>{ st.f=b.dataset.cf; draw(); });
  D.querySelectorAll("[data-cq]").forEach(b=>b.onclick=()=>{ st.q=st.q===b.dataset.cq?"":b.dataset.cq; draw(); });
  // stage 9: nothing on the list changes a count - every box / button opens the part, where the count is confirmed
  D.querySelectorAll("[data-bx],[data-up],[data-dn],[data-all],[data-cnf]").forEach(b=>b.onclick=()=>openPart(+(b.dataset.bx??b.dataset.up??b.dataset.dn??b.dataset.all??b.dataset.cnf)));
  D.querySelectorAll("[data-skip]").forEach(b=>b.onclick=()=>{ const it=st.items[+b.dataset.skip]; it.skip=true; changed(it.g); draw(); });
  D.querySelectorAll("[data-later]").forEach(b=>b.onclick=()=>{ const it=st.items[+b.dataset.later]; it.later=true; changed(it.g); draw(); });
  D.querySelectorAll("[data-unlater]").forEach(b=>b.onclick=()=>{ const it=st.items[+b.dataset.unlater]; it.later=false; changed(it.g); draw(); });
  D.querySelectorAll("[data-pm]").forEach(b=>b.onclick=()=>{ const m=b.dataset.pm; const its=st.items.filter(i=>!i.skip&&MK(i)===m);
    const on=its.some(i=>!i.later); its.forEach(i=>{ i.later=on; changed(i.g); }); draw(); });
  const pa=$("#cPmAll"); if(pa) pa.onclick=()=>{ st.items.forEach(i=>{ if(i.later){ i.later=false; changed(i.g); } }); draw(); };
  D.querySelectorAll("[data-unskip]").forEach(b=>b.onclick=()=>{ const it=st.items[+b.dataset.unskip]; it.skip=false; changed(it.g); draw(); });
  const aq=$("#cAddQ"); aq.oninput=()=>{ st.addQ=aq.value; drawPick(); };
  aq.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); $("#cAdd").click(); } };
  $("#cAdd").onclick=()=>{ const t=st.addQ.trim(); if(!t) return; const p=(typeof parts!=="undefined"?parts:[]).find(x=>x.part_no.toLowerCase()===t.toLowerCase());
    if(p) addItem({k:"p:"+p.part_no, part_no:p.part_no, name:p.name||"", mat:"", img:p.img_path||"", src:"inv"}); else addItem({k:"m:"+t.toLowerCase(), part_no:"", name:t, mat:"", src:"manual"}); };
  $("#cDone").onclick=finish;
  wirePick(D);
}
/* redraw one row + the header without losing scroll position */
function refresh(ix){
  const D=$("#dlg"); const sc=D.scrollTop;
  const rows=[...D.querySelectorAll("#cList .it")]; const btn=D.querySelector(`[data-bx="${ix}"],[data-up="${ix}"],[data-all="${ix}"]`);
  const row=btn&&btn.closest(".it");
  if(row&&!(st.f!=="all")){ const tmp=document.createElement("div"); tmp.innerHTML=itemRow(st.items[ix],ix); row.replaceWith(tmp.firstElementChild); }
  else { draw(); D.scrollTop=sc; return; }
  const hd=D.querySelector(".cnt"); const tmp=document.createElement("div"); tmp.innerHTML=head(); const old=[...hd.children].slice(0,tmp.children.length);
  old.forEach(e=>e.remove()); hd.prepend(...tmp.children); wire(); D.scrollTop=sc;
}
/* ---------- Saving (UX audit 06/07, Nov 15) ----------
   Every save is conditional on the row's updated_at we last saw (optimistic lock). If another phone saved in between,
   the row is re-read and merged per part against what both sides started from (st.base):
   only they changed it -> take theirs; only we changed it -> keep ours; both changed it to different numbers -> a
   CONFLICT shown with both counts, who and when - nothing is picked silently (no more "keep the higher count", which
   lost corrections downward). Conflicted parts keep the saved value until someone picks.
   A failed save stays pending: "Not saved" + Retry, a copy is kept on this phone (localStorage) and offered again
   when the count is reopened, and Done counting / Back to job are blocked until everything is saved. */
const ME_=()=>(window.ME&&ME.name)||"";
function bk(g,k){ return g+"|"+k; }
function snap(i){ return {got:i.got||0, skip:!!i.skip, later:!!i.later}; }
const same=(a,b)=>a.got===b.got&&a.skip===b.skip&&a.later===b.later;
function bkKey(S){ return "gvc_cnt_bk:"+S.jobId+":"+S.supId; }
function bkRead(S){ try{ return JSON.parse(localStorage.getItem(bkKey(S))||"null"); }catch(e){ return null; } }
function bkWrite(g){ try{ const S=st.sets[g]; const base={}; st.items.filter(i=>i.g===g).forEach(i=>{ const b=st.base[bk(g,i.k)]; if(b) base[i.k]=b; });
  localStorage.setItem(bkKey(S),JSON.stringify({at:new Date().toISOString(),by:ME_(),baseAt:S.row?S.row.updated_at:null,base,items:st.items.filter(i=>i.g===g).map(({g,...i})=>i)})); }catch(e){} }
function bkDrop(g){ try{ localStorage.removeItem(bkKey(st.sets[g])); }catch(e){} }
const hm=t=>{ try{ return new Date(t).toLocaleString([], {weekday:"short",hour:"numeric",minute:"2-digit"}); }catch(e){ return ""; } };
function who(c,fallbackAt){ const by=c&&c.by||"", at=c&&c.at||fallbackAt; return (by||"another phone")+(at?" · "+hm(at):""); }
function saveHtml(){
  if(st.saveErr) return `<span class="cserr" role="alert">Not saved - ${esc(st.saveErr)}. Kept on this phone.</span> <button class="btn sm" type="button" id="cRetry">Retry</button>`;
  if(st.dirty.size||st.flushing) return "Saving…";
  return st.sets.some(S=>S.row)?"Saved":"";
}
function setSaved(){ const s=$("#cSaved"); if(s){ s.innerHTML=saveHtml(); wireSaved(); } }
function wireSaved(){ const r=$("#cRetry"); if(r) r.onclick=async()=>{ r.disabled=true; r.textContent="Retrying…"; await flush(); }; }
function alertsHtml(){
  let h="";
  if(st.restore.length){ const b=st.restore[0].b;
    h+=`<div class="ccf"><b>Unsaved counts on this phone</b><div class="tnote">From ${esc(who(b,b.at))} - they never reached the server. Restore them to finish saving, or discard them.</div>
      <div class="row" style="gap:6px;margin-top:6px"><button class="btn primary sm" type="button" data-rst="1">Restore and save</button><button class="btn ghost sm" type="button" data-rst="0">Discard</button></div></div>`; }
  if(st.conflicts.length){
    h+=`<div class="ccf" role="alert"><b>${st.conflicts.length} part${st.conflicts.length>1?"s were":" was"} counted differently on another phone</b><div class="tnote">Nothing was overwritten. Pick the right count for each, or recount it. Done counting waits until these are settled.</div>
      ${st.conflicts.map((c,n)=>{ const i=st.items.find(x=>x.g===c.g&&x.k===c.k)||{}; const d=x=>x.skip?"not on this order":x.later?"still to come":`${x.got} of ${i.qty||0}`;
        return `<div class="ccr"><div class="ccn">${esc(i.part_no||i.name||c.k)}</div>
        <button class="btn sm" type="button" data-ccu="${n}" data-w="m">Yours: ${esc(d(c.mine))}<span>${esc(who(c.mine.conf&&c.mine.conf.by?c.mine.conf:{by:"You"}))}</span></button>
        <button class="btn sm" type="button" data-ccu="${n}" data-w="t">Saved: ${esc(d(c.theirs))}<span>${esc(who(c.theirs.conf,c.at))}</span></button>
        <button class="lnk" type="button" data-ccr="${n}">Recount</button></div>`; }).join("")}</div>`;
  }
  return h;
}
function updAlerts(){ const a=$("#cAlerts"); if(a){ a.innerHTML=alertsHtml(); wireAlerts(); } }
function wireAlerts(){
  const D=$("#dlg");
  D.querySelectorAll("[data-rst]").forEach(b=>b.onclick=async()=>{ const {g,b:bk_}=st.restore.shift();
    if(b.dataset.rst==="1") await restoreBk(g,bk_); else bkDrop(g);
    draw(); });
  D.querySelectorAll("[data-ccu]").forEach(b=>b.onclick=()=>{ const c=st.conflicts[+b.dataset.ccu]; if(!c) return;
    const i=st.items.find(x=>x.g===c.g&&x.k===c.k); const v=b.dataset.w==="m"?c.mine:c.theirs;
    if(i){ i.got=v.got; i.skip=v.skip; i.later=v.later; i.conf={n:v.got,by:ME_(),at:new Date().toISOString(),picked:b.dataset.w==="m"?"own":"saved"}; }
    st.conflicts.splice(st.conflicts.indexOf(c),1); changed(c.g); draw(); });
  D.querySelectorAll("[data-ccr]").forEach(b=>b.onclick=()=>{ const c=st.conflicts[+b.dataset.ccr]; if(!c) return;
    const ix=st.items.findIndex(x=>x.g===c.g&&x.k===c.k); st.conflicts.splice(st.conflicts.indexOf(c),1); updAlerts(); if(ix>=0) openPart(ix); });
}
async function restoreBk(g,b){
  const cur={}; st.items.filter(i=>i.g===g).forEach(i=>cur[i.k]=i);
  // what the server had when the copy was made; if it moved on since, merge like any other concurrent save
  const server=st.sets[g].row?(st.sets[g].row.items||[]):[];
  st.items=st.items.filter(i=>i.g!==g); Object.keys(st.base).forEach(k=>{ if(k.startsWith(g+"|")) delete st.base[k]; });
  (b.items||[]).forEach(i=>{ i.g=g; st.items.push(i); }); Object.entries(b.base||{}).forEach(([k,v])=>st.base[bk(g,k)]=v);
  const S=st.sets[g]; if(S.row&&b.baseAt!==S.row.updated_at) merge(g,server,S.row.updated_at);
  st.dirty.add(g); bkDrop(g); await flush();
}
function merge(g,theirsList,at){
  const theirs=Object.fromEntries((theirsList||[]).map(t=>[t.k,t]));
  for(const t of theirsList||[]){
    const i=st.items.find(x=>x.g===g&&x.k===t.k), K=bk(g,t.k), b=st.base[K], ts=snap(t);
    if(!i){ st.items.push({...t,g}); st.base[K]=ts; st.remote=true; continue; }
    const ms=snap(i), mc=!b||!same(ms,b), tc=!b||!same(ts,b);
    if(same(ms,ts)){ st.base[K]=ts; continue; }
    st.remote=true;
    if(tc&&!mc){ i.got=t.got; i.skip=t.skip; i.later=t.later; i.conf=t.conf; }
    else if(mc&&tc){ const old=st.conflicts.find(c=>c.g===g&&c.k===t.k); if(old) st.conflicts.splice(st.conflicts.indexOf(old),1);
      st.conflicts.push({g,k:t.k,at,mine:{...ms,conf:i.conf},theirs:{...ts,conf:t.conf}});
      i.got=t.got; i.skip=t.skip; i.later=t.later; i.conf=t.conf; }  // keep the saved value until someone picks
    st.base[K]=ts;
  }
  return theirs;
}
function changed(g){ if(g==null) return; st.dirty.add(g); bkWrite(g); setSaved(); clearTimeout(st.timer); st.timer=setTimeout(flush,700); }
/* returns true only when every change is on the server */
async function flush(){
  if(!st) return true;
  if(st.flushing){ await st.flushing; if(!st.dirty.size) return !st.saveErr; }
  if(!st.dirty.size) return !st.saveErr;
  clearTimeout(st.timer);
  const run=(async()=>{
    const todo=[...st.dirty]; st.dirty.clear(); let ok=true;
    for(const g of todo){ if(!(await saveSet(g))){ st.dirty.add(g); bkWrite(g); ok=false; } else if(!st.dirty.has(g)) bkDrop(g); }
    if(ok){ st.saveErr=""; st.seeded=false; }
    return ok;
  })();
  st.flushing=run; setSaved();
  let ok=false; try{ ok=await run; }catch(e){ st.saveErr=String(e&&e.message||e); ok=false; todoFail(); }
  st.flushing=null;
  // another phone's counts were merged in: redraw the list (unless a part is open on top), keeping the scroll position
  if(st.remote){ st.remote=false; const ae=document.activeElement; if(ae&&/INPUT|TEXTAREA|SELECT/.test(ae.tagName)) st.remote=true; else if(!document.getElementById("gFlat")){ const D=$("#dlg"), sc=D.scrollTop; draw(); D.scrollTop=sc; } }
  setSaved(); updAlerts();
  return ok&&!st.dirty.size;
}
function todoFail(){ st.sets.forEach((S,g)=>st.dirty.add(g)); }
async function saveSet(g){
  const S=st.sets[g];
  for(let attempt=0;attempt<4;attempt++){
    const now=new Date().toISOString(); const items=st.items.filter(i=>i.g===g).map(({g,...i})=>i);
    let r;
    if(S.row&&S.row.updated_at) r=await sb.from("gvc_counts").update({items,updated_at:now}).eq("job_id",S.jobId).eq("sup_id",S.supId).eq("updated_at",S.row.updated_at).select().maybeSingle();
    else r=await sb.from("gvc_counts").insert({job_id:S.jobId,sup_id:S.supId,items,updated_at:now}).select().maybeSingle();
    const dup=r.error&&(r.error.code==="23505"||/duplicate key/i.test(r.error.message||""));
    if(r.error&&!dup){ st.saveErr=r.error.message||"save failed"; return false; }
    if(!r.error&&r.data){ S.row=r.data; st.items.filter(i=>i.g===g).forEach(i=>st.base[bk(g,i.k)]=snap(i)); return true; }
    // nothing updated (someone saved after we loaded) or the row was created meanwhile: re-read, merge, try again
    const cur=await sb.from("gvc_counts").select("*").eq("job_id",S.jobId).eq("sup_id",S.supId).maybeSingle();
    if(cur.error){ st.saveErr=cur.error.message||"couldn't re-read the count"; return false; }
    if(!cur.data){ S.row=null; continue; }
    merge(g,cur.data.items||[],cur.data.updated_at); S.row=cur.data;
  }
  st.saveErr="another phone keeps saving this count - try again"; return false;
}
/* Done counting / Back to job while something isn't saved or a conflict is open */
function blockBox(kind,what){
  const D=$("#dlg"); D.querySelectorAll(".cfin").forEach(e=>e.remove());
  const box=document.createElement("div"); box.className="addbox cfin"; box.style.borderColor="#ff6b5a"; box.setAttribute("role","alert");
  const n=st.dirty.size;
  box.innerHTML=kind==="conflict"
    ?`<b>Settle the ${st.conflicts.length} count conflict${st.conflicts.length>1?"s":""} first.</b><div class="tnote">They're at the top of this count. ${what==="leave"?"You can leave - nothing is lost, the saved counts stay as they are.":"Done counting stays off until each one has a count."}</div>
      <div class="row" style="gap:6px;margin-top:8px"><button class="btn primary" type="button" data-bx="top">Show them</button>${what==="leave"?`<button class="btn ghost" type="button" data-bx="go">Leave anyway</button>`:""}</div>`
    :`<b>Not saved yet${st.saveErr?" - "+esc(st.saveErr):""}.</b><div class="tnote">${n>1?n+" sections":"This count"} didn't reach the server. Your counts are kept on this phone and will be offered again when you reopen this count. ${what==="leave"?"":"Done counting waits until everything is saved."}</div>
      <div class="row" style="gap:6px;margin-top:8px"><button class="btn primary" type="button" data-bx="retry">Retry saving</button>${what==="leave"?`<button class="btn ghost" type="button" data-bx="go">Leave anyway</button>`:""}</div>`;
  D.querySelector(".cnt .foot").before(box); box.scrollIntoView({block:"center"});
  box.querySelectorAll("[data-bx]").forEach(b=>b.onclick=async()=>{ const a=b.dataset.bx;
    if(a==="top"){ box.remove(); const al=$("#cAlerts"); if(al) al.scrollIntoView({behavior:"smooth",block:"start"}); return; }
    if(a==="go"){ openJob(st.jobId); return; }
    b.disabled=true; b.textContent="Retrying…"; const ok=await flush();
    if(ok&&!st.conflicts.length){ box.remove(); if(what==="leave") openJob(st.jobId); else finish(); } else blockBox(ok?"conflict":"unsaved",what); });
}
async function finish(){
  const db=$("#cDone"); if(db&&db.dataset.busy) return; if(db){ db.dataset.busy="1"; db.disabled=true; }
  const saved=await flush(); if(db){ delete db.dataset.busy; db.disabled=false; }
  if(!saved||st.conflicts.length){ blockBox(saved?"conflict":"unsaved","finish"); return; }
  const t=totals();
  const miss=live().filter(i=>got(i)<(i.qty||0));
  const nm=i=>(st.sets.length>1?(window.jobNum?window.jobNum(jobOf(st.sets[i.g].jobId).name)+" ":""):"")+(i.part_no||i.name);
  const missTx=miss.slice(0,12).map(i=>`${nm(i)} (${got(i)} of ${i.qty})`).join(", ")+(miss.length>12?` and ${miss.length-12} more`:"");
  const sup0=(jobOf(st.jobId).suppliers||[]).find(x=>x.id===st.supId);
  const D=$("#dlg"); D.querySelectorAll(".cfin").forEach(e=>e.remove()); const box=document.createElement("div"); box.className="addbox cfin"; box.style.borderColor=miss.length?"#f5b041":"#3ad06b";
  const L=later();
  /* no checklist (stage 7, Kyle Nov 14): nothing to count against (e.g. PO-1002 Grandview - the 151 pcs are only in the
     order's description). Never "All 0 pcs here". Either add the parts, or receive it explicitly WITHOUT a checklist:
     who, when and what arrived are saved, and the order shows "Received - not counted" (quantities not verified). */
  if(!st.items.some(i=>!i.skip)){
    const me=(window.ME&&ME.name)||"";
    box.style.borderColor="#f5b041";
    box.innerHTML=`<b>No checklist for this order - nothing has been counted.</b>
      <div class="tnote">There's no parts list to check against${sup0&&sup0.scope?` (the order says: ${esc(sup0.scope.slice(0,160))}${sup0.scope.length>160?"…":""})`:""}. Add the parts above to count them, or receive it without a checklist.</div>
      <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="cAddFirst">Add the parts first</button><button class="btn" type="button" id="cNoList">Received without a checklist…</button></div>
      <div id="cNoListF" hidden style="margin-top:10px">
        <label class="tnote" style="display:block">What arrived (required)<textarea id="cNoWhat" rows="3" style="width:100%;margin-top:4px;font:inherit;font-size:14px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px" placeholder="e.g. 4 sheets of parts on 2 skids, looked complete, not counted piece by piece"></textarea></label>
        <div class="tnote">Received by <b>${esc(me||"you")}</b>, ${new Date().toLocaleString("en-CA",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}. The order will show <b>Received - not counted</b>: quantities are not verified.</div>
        <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap"><button class="btn ghost" type="button" id="cNoCancel">Cancel</button><button class="btn primary" type="button" id="cNoSave">Save as received - not counted</button></div></div>`;
    D.querySelector(".foot").before(box); box.scrollIntoView({behavior:"smooth",block:"center"});
    $("#cAddFirst").onclick=()=>{ box.remove(); const q=$("#cAddQ"); if(q){ q.scrollIntoView({behavior:"smooth",block:"center"}); q.focus(); } };
    $("#cNoList").onclick=()=>{ $("#cNoListF").hidden=false; $("#cNoWhat").focus(); };
    $("#cNoList").click();   // the footer button already said "Receive without a checklist…"
    $("#cNoCancel").onclick=()=>box.remove();
    $("#cNoSave").onclick=async()=>{
      const b=$("#cNoSave"); if(b.disabled) return;
      const what=$("#cNoWhat").value.trim(); if(!what){ $("#cNoWhat").focus(); $("#cNoWhat").style.borderColor="#e5483b"; return; }
      if(window.ME&&ME.preview){ if(typeof todoToast==="function") todoToast("Preview - nothing is saved.",null); return; }
      b.disabled=true; b.textContent="Saving…";
      const now=new Date().toISOString(); let ok=true;
      for(let g=0;g<st.sets.length;g++){
        const S=st.sets[g]; const j=structuredClone(jobOf(S.jobId)); const sup=(j.suppliers||[]).find(x=>x.id===S.supId);
        if(sup){ if(sup.status==="received"){ continue; }   // already received (another device / double tap) - change nothing
          sup.status="received"; sup.updated=now; sup.receivedAt=now; sup.recvNoList={by:me,at:now,what:what.slice(0,500)};
          sup.note=((sup.note?sup.note+" | ":"")+`Received without a checklist by ${me||"?"}: ${what}`).slice(0,1500); }
        j.log=[...(j.log||[]),{at:now,text:`Received ${sup?sup.name:"order"}${sup&&sup.quoteNo?" #"+sup.quoteNo:""} WITHOUT a checklist (not counted) - by ${me||"?"}: ${what}`}];
        if(window.autoToShop) window.autoToShop(j);
        if(!await put(j,`Received without a checklist - ${j.name}`)) ok=false;
      }
      if(ok){ closeDlg(); if(typeof todoToast==="function") todoToast(`Received - not counted (no checklist)`,null); } else { b.disabled=false; b.textContent="Save as received - not counted"; }
    };
    return;
  }
  if(L.length){
    // partial delivery: save what came, keep the order open for the rest
    const lp=L.reduce((a,i)=>a+(i.qty||0),0); const lm=[...new Set(L.map(MK))].join(", ");
    const cm=[...new Set(live().map(MK))].join(", ");
    box.innerHTML=`<b>This delivery: ${t.got} of ${t.pcs} pcs here${miss.length?` - ${miss.length} part${miss.length>1?"s":""} short`:" - all here"}.</b>
      ${miss.length?`<div class="tnote">${esc(missTx)}</div>`:""}
      <div class="tnote">Still to come: ${L.length} part${L.length>1?"s":""}, ${lp} pcs (${esc(lm)}). The order stays open for those.</div>
      <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="cKeep">Keep counting later</button><button class="btn primary" type="button" id="cPart">Save this delivery - rest still coming</button></div>`;
    D.querySelector(".foot").before(box); box.scrollIntoView({behavior:"smooth",block:"center"});
    $("#cKeep").onclick=()=>closeDlg();
    $("#cPart").onclick=async()=>{
      const pb=$("#cPart"); if(pb.disabled) return; pb.disabled=true;
      const now=new Date().toISOString(); let ok=true;
      for(let g=0;g<st.sets.length;g++){
        const S=st.sets[g]; const j=structuredClone(jobOf(S.jobId)); const sup=(j.suppliers||[]).find(x=>x.id===S.supId);
        const mine=st.items.filter(i=>i.g===g&&!i.skip&&!i.later), lat=st.items.filter(i=>i.g===g&&!i.skip&&i.later);
        const pcs=mine.reduce((a,i)=>a+(i.qty||0),0), gt=mine.reduce((a,i)=>a+got(i),0), lpc=lat.reduce((a,i)=>a+(i.qty||0),0);
        const myMiss=mine.filter(i=>got(i)<(i.qty||0)).map(i=>`${i.part_no||i.name} (${got(i)} of ${i.qty})`).join(", ");
        const d=new Date(now).toLocaleDateString("en-CA",{month:"short",day:"numeric"});
        const txt=`${d}: partial delivery counted - ${gt} of ${pcs} pcs (${cm})${myMiss?", short: "+myMiss:""}. Still to come: ${lat.length} part${lat.length>1?"s":""} / ${lpc} pcs (${lm}).`;
        if(sup){ sup.status="production"; sup.updated=now; sup.lead=`Rest still to come: ${lm}`.slice(0,200); sup.note=((sup.note?sup.note+" | ":"")+txt).slice(0,1500); }
        j.log=[...(j.log||[]),{at:now,text:`Counted ${sup?sup.name:"order"}${sup&&sup.quoteNo?" #"+sup.quoteNo:""} - ${txt}`}];
        // nothing else waiting to be counted on this job -> back to In production until the rest comes
        if(j.stage==="arrived"&&!(j.suppliers||[]).some(x=>(typeof ACTIVE!=="function"||ACTIVE(x))&&x.status==="arrived")) j.stage="prod";
        if(!await put(j,`Partial delivery counted - ${j.name}`)) ok=false;
      }
      if(ok){ closeDlg(); if(typeof todoToast==="function") todoToast(`Delivery counted: ${t.got} of ${t.pcs} pcs - ${lp} pcs still to come`,null); } else pb.disabled=false;
    };
    return;
  }
  box.innerHTML=miss.length?`<b>${t.got} of ${t.pcs} pcs here - ${miss.length} part${miss.length>1?"s":""} short.</b><div class="tnote">${esc(missTx)}</div>
      <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="cKeep">Keep counting later</button><button class="btn primary" type="button" id="cRecvShort">Mark received - note what's missing</button></div>`
    :`<b>All ${t.pcs} pcs here.</b><div class="row" style="margin-top:8px;gap:8px"><button class="btn primary" type="button" id="cRecv">Mark ${esc(sup0?sup0.name:"order")} received${st.sets.length>1?` (all ${st.sets.length} jobs)`:""}</button></div>`;
  D.querySelector(".foot").before(box); box.scrollIntoView({behavior:"smooth",block:"center"});
  let busy=false;
  const recv=async(short)=>{
    if(busy) return; busy=true; D.querySelectorAll("#cRecv,#cRecvShort").forEach(b=>b.disabled=true);
    const now=new Date().toISOString(); let ok=true;
    for(let g=0;g<st.sets.length;g++){
      const S=st.sets[g]; const j=structuredClone(jobOf(S.jobId)); const sup=(j.suppliers||[]).find(x=>x.id===S.supId);
      const mine=st.items.filter(i=>i.g===g&&!i.skip); const pcs=mine.reduce((a,i)=>a+(i.qty||0),0), gt=mine.reduce((a,i)=>a+got(i),0);
      const myMiss=mine.filter(i=>got(i)<(i.qty||0)).map(i=>`${i.part_no||i.name} (${got(i)} of ${i.qty})`).join(", ");
      if(sup){ sup.status="received"; sup.updated=now; sup.receivedAt=now; if(sup.recvNoList){ sup.recvNoListWas=sup.recvNoList; delete sup.recvNoList; }   // now counted against a list
        if(myMiss) sup.note=((sup.note?sup.note+" | ":"")+"Short: "+myMiss).slice(0,1000); }
      j.log=[...(j.log||[]),{at:now,text:`Counted ${sup?sup.name:"order"}${sup&&sup.quoteNo?" #"+sup.quoteNo:""}: ${gt} of ${pcs} pcs${myMiss?" - short: "+myMiss:" - all here"}${st.sets.length>1?" (combined order with "+st.sets.filter((_,x)=>x!==g).map(o=>jobOf(o.jobId).name).join(", ")+")":""}`}];
      if(window.autoToShop) window.autoToShop(j);
      await sb.from("gvc_counts").update({done_at:now}).eq("job_id",S.jobId).eq("sup_id",S.supId);
      if(!await put(j,`Counted ${sup?sup.name:"order"} - ${j.name}`)) ok=false;
    }
    if(ok){ closeDlg(); if(typeof todoToast==="function") todoToast(`Counted: ${t.got} of ${t.pcs} pcs`,null); }
    else { busy=false; D.querySelectorAll("#cRecv,#cRecvShort").forEach(b=>b.disabled=false); }
  };
  const k=$("#cKeep"); if(k) k.onclick=()=>closeDlg();
  const rs=$("#cRecvShort"); if(rs) rs.onclick=()=>recv(true);
  const rc=$("#cRecv"); if(rc) rc.onclick=()=>recv(false);
}
/* ---- pick which order to count (Colton, Nov 6) ----
   The Count button on the wheel only ever opened the first waiting order, and the crew can't see the Orders board or a
   job's supplier list - so Colton had no way to get to the others. Now Count lists every order that has arrived (or is
   ready for pickup) and you tap the one in front of you. Orders on the same quote (one physical delivery) show once. */
window.countPicker=function(){
  const act=s=>s.status!=="hold"&&s.status!=="declined";
  const seen=new Set(), list=[];
  jobs.filter(j=>!j.archived).forEach(j=>(j.suppliers||[]).forEach(s=>{
    if(!act(s)||!(s.status==="arrived"||s.status==="ready")) return;
    const k=s.quoteNo?fname(s.name)+"|"+s.quoteNo:j.id+"|"+s.id; if(seen.has(k)) return; seen.add(k);
    list.push({j,s});
  }));
  list.sort((a,b)=>(a.s.status==="arrived"?0:1)-(b.s.status==="arrived"?0:1));
  if(list.length===1) return window.openCount(list[0].j.id,list[0].s.id);
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet" role="dialog" aria-modal="true" style="max-height:80vh;overflow:auto"><h3>Count which order?</h3>
    ${list.length?`<div class="tnote" style="margin:-4px 0 10px">Tap the delivery that's in front of you.</div>`+list.map((x,i)=>`<button class="add" type="button" data-cp="${i}" style="text-align:left;border-style:solid;border-left:4px solid ${x.s.status==="arrived"?"#f5b041":"#22c3e6"};margin-bottom:6px;display:block">
      <b style="display:block">${esc(x.s.name||"Order")}${x.s.quoteNo?` · ${esc(x.s.quoteNo)}`:""}</b><small style="color:var(--muted)">${esc(x.j.name)} · ${x.s.status==="arrived"?"in the shop - not counted yet":"ready for pickup"}</small></button>`).join("")
      :`<div class="tnote">Nothing is waiting to be counted. When an order comes in and gets set to Arrived, it shows up here.</div>`}
    <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn" type="button" data-cx="1">Close</button></div></div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); };
  ov.onclick=e=>{ if(e.target===ov) close(); }; ov.querySelector("[data-cx]").onclick=close;
  ov.querySelectorAll("[data-cp]").forEach(b=>b.onclick=()=>{ const x=list[+b.dataset.cp]; close(); window.openCount(x.j.id,x.s.id); });
};
})();

