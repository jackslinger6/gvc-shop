/* ---------- RFQ and PO numbers (Kyle, 2026-11-08) ----------
   Internal numbers to keep orders straight (not required on emails):
     RFQ-1001…  what you send out for quotes - one RFQ can go to several vendors and cover several jobs.
     PO-1001…   what you actually order from ONE vendor - from an RFQ ("Order from Russel") or straight (no quote).
   A vendor that splits an order (Russel's 7 order acks) = deliveries on the PO, each with its own status.
   Table gvc_pos (Kyle writes, everyone reads), numbers from gvc_next_no('rfq'|'po').
   The jobs keep their supplier lines like before (Orders board, Count, the hourly email check all still use them);
   a line just carries rfq / po. Changing a PO's stage moves those lines with it. */
(()=>{
const isKyle=()=>!window.ME||ME.role==="admin";
const E=s=>esc(s==null?"":String(s));
const say=m=>{ if(typeof todoToast==="function"){ todoToast(m,null); const u=document.getElementById("toastUndo"); if(u) u.style.display="none"; } };
const day=t=>t?new Date(t).toLocaleDateString([], {month:"short",day:"numeric"}):"";
let POS=[], loaded=false, selNo=null, tab="open";
const PST=[["approved","Ordered","#9b4dff"],["production","In production","#9b4dff"],["ready","Ready for pickup","#22c3e6"],["arrived","Arrived","#f5b041"],["received","Received","#3ad06b"]];
const PL=Object.fromEntries(PST.map(([k,t,c])=>[k,{t,c}]));
const DST=[["production","In production"],["ready","Ready"],["arrived","Arrived"],["received","Received ✓"]];
const allJobs=()=>[...(typeof jobs!=="undefined"?jobs:[]),...(typeof archivedJobs!=="undefined"?archivedJobs:[])];
const jobOf=id=>allJobs().find(j=>j.id===id);
const jobTag=id=>{ const j=jobOf(id); if(!j) return id; const m=String(j.name).match(/^\s*([A-Z0-9]+)\b/i); return m?m[1]:j.name; };
const linesOf=r=>{ const out=[]; (r.jobs||[]).forEach(jid=>{ const j=jobOf(jid); (j&&j.suppliers||[]).forEach(x=>{ if(x.po===r.no||x.rfq===r.no) out.push({j,x}); }); }); return out; };

async function load(){ const r=await sb.from("gvc_pos").select("*").order("created_at",{ascending:false}); if(!r.error){ POS=r.data||[]; loaded=true; } if(typeof cur!=="undefined"&&cur==="pos") render(); }
let started=false;
setInterval(()=>{ if(!started&&typeof sb!=="undefined"&&sb&&window.ME){ started=true; load(); try{ sb.channel("gvc_pos").on("postgres_changes",{event:"*",schema:"public",table:"gvc_pos"},()=>load()).subscribe(); }catch(e){} } },1500);
window.posByNo=no=>POS.find(r=>r.no===no);

async function saveRec(r,patch,note){
  const log=[...(r.log||[]),...(note?[{at:new Date().toISOString(),t:note}]:[])].slice(-80);
  const q=await sb.from("gvc_pos").update({...patch,log,updated_at:new Date().toISOString()}).eq("id",r.id);
  if(q.error){ say("Couldn't save: "+q.error.message); return false; } Object.assign(r,patch,{log}); render(); return true; }
// change supplier lines on the jobs (each job saved once)
async function editLines(jobIds,fn,why){
  for(const jid of [...new Set(jobIds)]){ const j=jobOf(jid); if(!j) continue;
    const data=JSON.parse(JSON.stringify(j)); delete data.id; data.suppliers=data.suppliers||[];
    const changed=fn(data.suppliers,data); if(!changed) continue;
    data.log=[...(data.log||[]),{at:new Date().toISOString(),text:why}];
    try{ await saveJob(jid,data); Object.keys(j).forEach(k=>{ if(k!=="id") delete j[k]; }); Object.assign(j,data); }
    catch(e){ say(`Couldn't update ${jobTag(jid)}: ${e.message||e}`); } }
  if(typeof render==="function") render();
}
async function nextNo(kind){ const r=await sb.rpc("gvc_next_no",{p_kind:kind}); if(r.error) throw new Error(r.error.message); return r.data; }

const css=document.createElement("style");
css.textContent=`
.posv{max-width:1000px;margin-top:6px}
.posv h2{font-family:Oswald,sans-serif;letter-spacing:.05em;margin:0}
.posv .lbl{font-size:12.5px;color:var(--muted)}
.posv .tabs{display:flex;gap:6px;margin:10px 0;flex-wrap:wrap}
.posv .rc{display:grid;grid-template-columns:auto 1fr auto;gap:4px 12px;align-items:center;width:100%;text-align:left;font:inherit;color:inherit;background:var(--panel,#1d2025);border:1px solid var(--line);border-left:4px solid var(--c);border-radius:12px;padding:10px 12px;margin-bottom:8px;cursor:pointer}
.posv .no{font:600 18px Oswald,sans-serif;letter-spacing:.03em;white-space:nowrap}
.posv .rc .t{min-width:0}.posv .rc .t b{display:block;font-size:14.5px}.posv .rc .t span{font-size:12.5px;color:var(--muted)}
.posv .st{font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;background:var(--c);color:#fff;white-space:nowrap}
.posv .chip{display:inline-block;font-size:12px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,.08);margin:2px 4px 2px 0}
.posv .grp{font-size:12px;letter-spacing:.12em;color:var(--muted);margin:16px 0 6px}
.posv .psc{display:block;margin-top:18px}
.posv .psc>h3{font-family:Oswald,sans-serif;letter-spacing:.08em;font-size:14px;margin:0 0 8px;display:flex;gap:8px;align-items:center}
.posv .steps{display:flex;gap:5px;flex-wrap:wrap}.posv .steps button{border-radius:999px}
.posv .steps button.on{background:var(--c);border-color:var(--c);color:#fff}.posv .steps button.past{opacity:.55}
.posv table{width:100%;border-collapse:collapse;font-size:13.5px}
.posv td,.posv th{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
.posv th{font-size:11.5px;letter-spacing:.06em;color:var(--muted);text-transform:uppercase}
.posv td input,.posv td select{font:inherit;font-size:13.5px;width:100%;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:7px;padding:6px 8px}
.posv .dl{display:grid;grid-template-columns:1fr 1.6fr 1.1fr auto;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)}
.posv .dl input,.posv .dl select{font:inherit;font-size:13.5px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:7px;padding:7px 8px;min-width:0}
.posv .lg{font-size:12px;color:var(--muted);margin:2px 0}
.posv .bar{height:8px;background:rgba(255,255,255,.08);border-radius:5px;overflow:hidden;margin:6px 0}.posv .bar div{height:100%;background:#3ad06b}
.posv .dl .dx{min-width:0;padding:0 10px}
@media (max-width:600px){ .posv .dl{grid-template-columns:1fr 1fr 44px} .posv .dl [data-dr]{grid-column:1/2} .posv .dl [data-dw]{grid-column:2/4} .posv .dl select{grid-column:1/3} .posv .dl .dx{grid-column:3/4} .posv .rc{grid-template-columns:1fr auto} .posv .rc .no{grid-column:1/-1} }
.supchips{margin-top:3px}.supchips button{font:600 11.5px Oswald,sans-serif;letter-spacing:.04em;border:1px solid var(--line);background:rgba(255,255,255,.06);color:var(--text);border-radius:6px;padding:2px 7px;margin-right:4px;cursor:pointer}
`;
document.head.appendChild(css);

const recColor=r=>r.kind==="rfq"?(r.status==="open"?"#2f8ff0":"#6c727a"):((PL[r.status]||{}).c||"#6c727a");
const recStatus=r=>r.kind==="rfq"?({open:"Waiting on quotes",ordered:"Ordered",closed:"Closed"})[r.status]||r.status:((PL[r.status]||{}).t||r.status);
const delivSum=r=>{ const D=r.deliveries||[]; return D.length?`${D.filter(d=>d.status==="received").length} of ${D.length} deliveries in`:""; };

/* ================= list ================= */
function renderList(B){
  const open=POS.filter(r=>r.kind==="rfq"?r.status==="open":!["received","cancelled"].includes(r.status));
  const L=tab==="open"?open:POS;
  const card=r=>`<button type="button" class="rc" data-no="${E(r.no)}" style="--c:${recColor(r)}"><span class="no">${E(r.no)}</span>
    <span class="t"><b>${E(r.kind==="po"?r.vendor||"":r.title||"")}${r.kind==="po"&&r.title?` <span style="font-weight:400">· ${E(r.title)}</span>`:""}</b>
    <span>${(r.jobs||[]).map(id=>`<span class="chip">${E(jobTag(id))}</span>`).join("")}${r.kind==="rfq"?`asked ${E((r.vendors||[]).join(", ")||"-")}`:""}${r.rfq_no?` · from ${E(r.rfq_no)}`:""}${r.vendor_ref?` · ${E(r.vendor_ref)}`:""}${delivSum(r)?` · ${delivSum(r)}`:""}</span></span>
    <span class="st">${E(recStatus(r))}</span></button>`;
  const rf=L.filter(r=>r.kind==="rfq"), po=L.filter(r=>r.kind==="po");
  B.innerHTML=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h2>RFQs & POs</h2><span style="flex:1"></span>
      ${isKyle()?`<button class="btn" type="button" id="pNR">+ New RFQ</button><button class="btn primary" type="button" id="pNP">+ New PO</button>`:""}</div>
    <div class="lbl" style="margin-top:4px">Our own numbers to keep orders straight. <b>RFQ</b> = sent out for quotes (one or more vendors). <b>PO</b> = ordered from one vendor. A vendor that splits an order = deliveries on the PO.</div>
    <div class="tabs"><button class="btn sm ${tab==="open"?"primary":""}" type="button" data-pt="open">Open ${open.length}</button><button class="btn sm ${tab==="all"?"primary":""}" type="button" data-pt="all">All ${POS.length}</button></div>
    ${po.length?`<div class="grp">PURCHASE ORDERS · ${po.length}</div>${po.map(card).join("")}`:""}
    ${rf.length?`<div class="grp">OUT FOR QUOTES · ${rf.length}</div>${rf.map(card).join("")}`:""}
    ${!L.length?`<div class="empty" style="text-align:left">${loaded?"Nothing open. Start with + New RFQ (asking for prices) or + New PO (ordering straight).":"Loading…"}</div>`:""}`;
  const nr=B.querySelector("#pNR"); if(nr) nr.onclick=()=>newSheet("rfq");
  const np=B.querySelector("#pNP"); if(np) np.onclick=()=>newSheet("po");
  B.querySelectorAll("[data-pt]").forEach(b=>b.onclick=()=>{ tab=b.dataset.pt; render(); });
  B.querySelectorAll("[data-no]").forEach(b=>b.onclick=()=>{ selNo=b.dataset.no; render(); toTop(); });
}
const toTop=()=>{ try{ window.scrollTo(0,0); let e=$("#board"); while(e){ if(e.scrollTop) e.scrollTop=0; e=e.parentElement; } $("#board").scrollIntoView({block:"start"}); }catch(x){} };

/* ================= one record ================= */
function head(r){
  return `<button class="btn sm" type="button" id="pBack">‹ All RFQs & POs</button>
    <div style="display:flex;gap:10px;align-items:baseline;margin-top:10px;flex-wrap:wrap"><span class="no" style="font-size:26px">${E(r.no)}</span>
      <span class="st" style="--c:${recColor(r)};background:${recColor(r)}">${E(recStatus(r))}</span></div>
    <div style="font-size:16px;font-weight:700;margin-top:2px">${E(r.kind==="po"?r.vendor:r.title||"")}${r.kind==="po"&&r.title?` <span style="font-weight:400;color:var(--muted)">· ${E(r.title)}</span>`:""}</div>
    <div class="lbl" style="margin-top:4px">${(r.jobs||[]).map(id=>`<span class="chip" style="cursor:pointer" data-oj="${E(id)}">${E(jobOf(id)?jobOf(id).name:id)}</span>`).join("")}</div>
    <div class="lbl">${[r.rfq_no?"from "+r.rfq_no:"",r.vendor_ref?"vendor # "+r.vendor_ref:"","started "+day(r.created_at)].filter(Boolean).map(E).join(" · ")}</div>`;
}
function renderRfq(B,r){
  const L=linesOf(r); const byV={}; L.forEach(({j,x})=>{ (byV[x.name]=byV[x.name]||[]).push({j,x}); });
  (r.vendors||[]).forEach(v=>{ byV[v]=byV[v]||[]; });
  const sts=typeof ST!=="undefined"?ST:{};
  B.innerHTML=`<div class="pod">${head(r)}
    <div class="psc"><h3>VENDORS ASKED</h3>
      <div style="overflow-x:auto"><table><thead><tr><th>Vendor</th><th>Status</th><th>Their quote #</th><th>Total</th><th></th></tr></thead><tbody>
      ${Object.entries(byV).map(([v,arr])=>{ const x=(arr[0]||{}).x||{}; const st=sts[x.status]||{t:x.status||"-",c:"#888"};
        return `<tr><td><b>${E(v)}</b>${arr.length>1?`<div class="lg">${arr.length} jobs</div>`:""}</td>
          <td><span style="color:${st.c};font-weight:700">${E(st.t)}</span>${x.po?`<div class="lg">${E(x.po)}</div>`:""}</td>
          <td><input data-vq="${E(v)}" value="${E(x.quoteNo||"")}" placeholder="quote #" ${isKyle()?"":"disabled"}></td>
          <td><input data-vt="${E(v)}" value="${E(x.total||"")}" placeholder="$" ${isKyle()?"":"disabled"}></td>
          <td style="text-align:right">${isKyle()&&r.status==="open"&&!x.po?`<button class="btn sm primary" type="button" data-ord="${E(v)}">Order from ${E(String(v).split(/\s/)[0])} →</button>`:""}</td></tr>`; }).join("")}
      </tbody></table></div>
      ${isKyle()&&r.status==="open"?`<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm" type="button" id="pAddV">+ Ask another vendor</button><button class="btn sm" type="button" id="pCmp">⚖ Compare their quotes</button><button class="btn sm" type="button" id="pClose">Close without ordering</button></div>`:""}
    </div>
    ${notesLog(r)}</div>`;
  wireCommon(B,r);
  const saveV=async(v,f,val)=>{ await editLines(L.filter(o=>o.x.name===v).map(o=>o.j.id),S=>{ let c=false; S.forEach(x=>{ if(x.rfq===r.no&&x.name===v&&(x[f]||"")!==val){ x[f]=val; x.updated=new Date().toISOString(); if(f==="quoteNo"&&val&&["sent","replied"].includes(x.status)) x.status="quote"; c=true; } }); return c; },`${r.no}: ${v} ${f==="quoteNo"?"quote # "+val:"total "+val}`); };
  B.querySelectorAll("[data-vq]").forEach(i=>i.onchange=()=>saveV(i.dataset.vq,"quoteNo",i.value.trim()));
  B.querySelectorAll("[data-vt]").forEach(i=>i.onchange=()=>saveV(i.dataset.vt,"total",i.value.trim()));
  B.querySelectorAll("[data-ord]").forEach(b=>b.onclick=()=>orderFrom(r,b.dataset.ord));
  const av=B.querySelector("#pAddV"); if(av) av.onclick=()=>addVendor(r);
  const cm=B.querySelector("#pCmp"); if(cm) cm.onclick=()=>{ const jid=(r.jobs||[])[0]; if(jid&&window.compareQuotes) window.compareQuotes(jid); };
  const cl=B.querySelector("#pClose"); if(cl) cl.onclick=async()=>{ if(!confirm(`Close ${r.no} without ordering? The vendors' lines on the jobs are marked Declined.`)) return;
    await editLines(r.jobs,S=>{ let c=false; S.forEach(x=>{ if(x.rfq===r.no&&!x.po&&x.status!=="declined"){ x.status="declined"; x.updated=new Date().toISOString(); c=true; } }); return c; },`${r.no} closed - nothing ordered`);
    saveRec(r,{status:"closed"},"closed without ordering"); };
}
function renderPo(B,r){
  const L=linesOf(r); const si=PST.findIndex(x=>x[0]===r.status); const D=r.deliveries||[];
  const inN=D.filter(d=>d.status==="received").length;
  B.innerHTML=`<div class="pod">${head(r)}
    <div class="psc"><div class="steps">${PST.map(([k,t,c],i)=>`<button class="btn sm ${k===r.status?"on":i<si?"past":""}" type="button" data-ps="${k}" style="--c:${c}" ${isKyle()?"":"disabled"}>${t}</button>`).join("")}</div>
      <div class="lbl" style="margin-top:6px">Moving this moves ${L.length===1?`the ${E(r.vendor)} line on ${E(jobTag(L[0].j.id))}`:`the ${E(r.vendor)} lines on ${L.length} jobs`} too (Orders board, Count).</div>
      ${["arrived","ready","production","approved"].includes(r.status)&&L.length&&window.openCount?`<div style="margin-top:8px"><button class="btn primary" type="button" id="pCount">☑ Count it</button></div>`:""}</div>
    <div class="psc"><h3>DELIVERIES <span class="lbl" style="font-family:inherit;letter-spacing:0">${D.length?`${inN} of ${D.length} in`:"one delivery"}</span></h3>
      ${D.length?`<div class="bar"><div style="width:${Math.round(inN/D.length*100)}%"></div></div>`:`<div class="lbl">If ${E(r.vendor||"the vendor")} splits this order (separate order acks, part pickups), add each piece here so you can follow them one by one.</div>`}
      ${D.map((d,i)=>`<div class="dl"><input data-dr="${i}" value="${E(d.ref||"")}" placeholder="Their # (ack, packing slip)" ${isKyle()?"":"disabled"}>
        <input data-dw="${i}" value="${E(d.what||"")}" placeholder="What's in it" ${isKyle()?"":"disabled"}>
        <select data-ds="${i}" ${isKyle()?"":"disabled"}>${DST.map(([k,t])=>`<option value="${k}" ${d.status===k?"selected":""}>${t}</option>`).join("")}</select>
        ${isKyle()?`<button class="btn sm dx" type="button" data-dx="${i}" aria-label="Remove delivery">×</button>`:""}</div>`).join("")}
      ${isKyle()?`<div style="margin-top:8px"><button class="btn sm" type="button" id="pAddD">+ ${D.length?"Another delivery":"Vendor split it - add deliveries"}</button></div>`:""}</div>
    ${notesLog(r)}</div>`;
  wireCommon(B,r);
  B.querySelectorAll("[data-ps]").forEach(b=>b.onclick=()=>setPoStage(r,b.dataset.ps));
  const pc=B.querySelector("#pCount"); if(pc) pc.onclick=()=>{ const o=L.find(o=>!["received","declined"].includes(o.x.status))||L[0]; window.openCount(o.j.id,o.x.id); };
  const saveD=async(D2,note)=>{ const all=D2.length&&D2.every(d=>d.status==="received"), any=D2.some(d=>["arrived","received"].includes(d.status));
    const patch={deliveries:D2};
    if(all&&r.status!=="received"&&confirm(`Every delivery is in. Mark ${r.no} Received?`)){ await saveRec(r,patch,note); return setPoStage(r,"received"); }
    if(any&&PST.findIndex(x=>x[0]===r.status)<3){ await saveRec(r,patch,note); return setPoStage(r,"arrived"); }
    await saveRec(r,patch,note); };
  B.querySelectorAll("[data-dr],[data-dw]").forEach(i=>i.onchange=()=>{ const D2=JSON.parse(JSON.stringify(D)); const k=i.dataset.dr!=null?"ref":"what"; D2[+(i.dataset.dr??i.dataset.dw)][k]=i.value.trim(); saveD(D2,""); });
  B.querySelectorAll("[data-ds]").forEach(s=>s.onchange=()=>{ const D2=JSON.parse(JSON.stringify(D)); const d=D2[+s.dataset.ds]; d.status=s.value; d.at=new Date().toISOString(); saveD(D2,`delivery ${d.ref||+s.dataset.ds+1}: ${DST.find(x=>x[0]===s.value)[1]}`); });
  B.querySelectorAll("[data-dx]").forEach(b=>b.onclick=()=>{ const d=D[+b.dataset.dx]; if(!confirm(`Remove delivery ${d.ref||""}?`)) return; saveRec(r,{deliveries:D.filter((_,i)=>i!==+b.dataset.dx)},`removed delivery ${d.ref||""}`); });
  const ad=B.querySelector("#pAddD"); if(ad) ad.onclick=()=>saveRec(r,{deliveries:[...D,{id:Math.random().toString(36).slice(2,9),ref:"",what:"",status:"production"}]},"");
}
function notesLog(r){
  return `<div class="psc"><h3>NOTES</h3><textarea id="pNotes" rows="3" style="width:100%;font:inherit;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px" ${isKyle()?"":"disabled"} placeholder="Anything to remember about this ${r.kind==="po"?"order":"RFQ"}">${E(r.notes||"")}</textarea>
    <div style="margin-top:10px">${(r.log||[]).slice().reverse().slice(0,15).map(l=>`<div class="lg">${day(l.at)} · ${E(l.t)}</div>`).join("")}</div></div>`;
}
function wireCommon(B,r){
  B.querySelector("#pBack").onclick=()=>{ selNo=null; render(); toTop(); };
  B.querySelectorAll("[data-oj]").forEach(c=>c.onclick=()=>{ if(typeof openJob==="function") openJob(c.dataset.oj); });
  const n=B.querySelector("#pNotes"); if(n) n.onchange=()=>saveRec(r,{notes:n.value.trim()||null},"");
}
async function setPoStage(r,k){
  if(!isKyle()||k===r.status) return;
  await editLines(r.jobs,S=>{ let c=false; S.forEach(x=>{ if(x.po===r.no&&x.status!==k){ x.status=k; x.updated=new Date().toISOString(); if(k==="received") x.receivedAt=x.updated; c=true; } }); return c; },`${r.no} ${r.vendor}: ${PL[k].t}`);
  await saveRec(r,{status:k},PL[k].t);
}

/* ================= make RFQs / POs ================= */
function sheet(html,ready){
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet" role="dialog" aria-modal="true" style="max-height:88vh;overflow:auto">${html}</div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); }; ov.onclick=e=>{ if(e.target===ov) close(); };
  ready(ov.querySelector(".shsheet"),close); }
const VENDORS=()=>[...new Set(["Russel Metals","Grandview Fabrication","LSM","Alloy Industries","Starfab","Wave Automation",...allJobs().flatMap(j=>(j.suppliers||[]).map(x=>x.name))].filter(Boolean))];
function jobPicker(pre){
  const L=(typeof jobs!=="undefined"?jobs:[]).filter(j=>j.stage!=="done");
  return `<div style="display:grid;gap:4px;max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px">${L.map(j=>`<label style="display:flex;gap:8px;align-items:center;font-size:14px;margin:0"><input type="checkbox" data-pj="${E(j.id)}" style="width:auto" ${(pre||[]).includes(j.id)?"checked":""}>${E(j.name)}</label>`).join("")}</div>`;
}
function newSheet(kind,pre={}){
  if(!isKyle()) return;
  const rfq=kind==="rfq";
  sheet(`<h3>${rfq?"NEW RFQ - ask for quotes":"NEW PO - order straight (no quote)"}</h3>
    <div class="tnote" style="margin:-4px 0 8px">${rfq?"Gets the next RFQ number. Each vendor you ask is added to the jobs you tick, marked Sent.":"Gets the next PO number. The vendor is added to the jobs you tick, marked Ordered."}</div>
    <label>What it is<input id="nT" value="${E(pre.title||"")}" placeholder="${rfq?"e.g. 1087WT laser parts - Rev 2":"e.g. Picker truck structural steel"}"></label>
    <label>${rfq?"Vendors to ask (comma between)":"Vendor"}<input id="nV" list="nVL" value="${E(pre.vendor||"")}" placeholder="${rfq?"Russel Metals, Wave Automation":"Russel Metals"}"><datalist id="nVL">${VENDORS().map(v=>`<option value="${E(v)}">`).join("")}</datalist></label>
    ${rfq?"":`<label>Their quote / order # (optional)<input id="nR"></label>`}
    <div style="font-size:13px;font-weight:600;margin:8px 0 4px">Jobs it's for</div>${jobPicker(pre.jobs)}
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn" type="button" id="nX">Cancel</button><button class="btn primary" type="button" id="nGo" style="min-height:44px">Create ${rfq?"RFQ":"PO"}</button></div>`,(el,close)=>{
    el.querySelector("#nX").onclick=close;
    el.querySelector("#nGo").onclick=async()=>{
      const title=el.querySelector("#nT").value.trim(); const vs=el.querySelector("#nV").value.split(rfq?/[,;]/:/$^/).map(s=>s.trim()).filter(Boolean);
      const js=[...el.querySelectorAll("[data-pj]:checked")].map(c=>c.dataset.pj);
      if(!vs.length){ el.querySelector("#nV").focus(); return; } if(!js.length){ say("Tick at least one job."); return; }
      const go=el.querySelector("#nGo"); go.disabled=true;
      try{ const no=await nextNo(kind); const now=new Date().toISOString();
        const rec={no,kind,title:title||null,vendor:rfq?null:vs[0],vendors:rfq?vs:[vs[0]],jobs:js,status:rfq?"open":"approved",vendor_ref:rfq?null:(el.querySelector("#nR").value.trim()||null),created_by:(window.ME&&ME.name)||"Kyle",log:[{at:now,t:`${rfq?"RFQ":"PO"} made${title?" - "+title:""}`}]};
        const q=await sb.from("gvc_pos").insert(rec).select().single(); if(q.error) throw new Error(q.error.message); POS.unshift(q.data);
        // reuse a line only if it's still at the asking stage - never an order that's already placed / arriving
        await editLines(js,S=>{ vs.forEach(v=>{ const ex=S.find(x=>x.name===v&&!x.rfq&&!x.po&&(rfq?["sent","replied","quote"]:["sent","replied","quote","approved"]).includes(x.status||"sent"));
            if(ex){ ex[rfq?"rfq":"po"]=no; if(!rfq){ ex.status="approved"; if(rec.vendor_ref) ex.quoteNo=ex.quoteNo||rec.vendor_ref; } ex.updated=now; }
            else S.push({id:uid(),name:v,scope:title||"",sent:now,status:rfq?"sent":"approved",[rfq?"rfq":"po"]:no,quoteNo:rfq?"":(rec.vendor_ref||""),updated:now}); }); return true; },`${no}${title?" "+title:""}: ${rfq?"asked "+vs.join(", "):"ordered from "+vs[0]}`);
        close(); selNo=no; if(typeof cur!=="undefined"&&cur!=="pos") shellGo("pos"); else render(); toTop(); say(`${no} made`);
      }catch(e){ go.disabled=false; say("Couldn't make it: "+e.message); }
    };
  });
}
function addVendor(r){
  sheet(`<h3>ASK ANOTHER VENDOR · ${E(r.no)}</h3><label>Vendor<input id="aV" list="aVL"><datalist id="aVL">${VENDORS().map(v=>`<option value="${E(v)}">`).join("")}</datalist></label>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn" type="button" id="aX">Cancel</button><button class="btn primary" type="button" id="aGo">Add</button></div>`,(el,close)=>{
    el.querySelector("#aX").onclick=close;
    el.querySelector("#aGo").onclick=async()=>{ const v=el.querySelector("#aV").value.trim(); if(!v) return; const now=new Date().toISOString();
      await editLines(r.jobs,S=>{ S.push({id:uid(),name:v,scope:r.title||"",sent:now,status:"sent",rfq:r.no,updated:now}); return true; },`${r.no}: asked ${v}`);
      await saveRec(r,{vendors:[...new Set([...(r.vendors||[]),v])]},`asked ${v}`); close(); };
  });
}
async function orderFrom(r,v){
  const L=linesOf(r), mine=L.filter(o=>o.x.name===v), others=[...new Set(L.filter(o=>o.x.name!==v&&!o.x.po).map(o=>o.x.name))];
  if(!confirm(`Order from ${v}?\n\nThis makes a new PO number for ${v}${others.length?` and marks ${others.join(", ")} Declined on this RFQ`:""}.`)) return;
  try{ const no=await nextNo("po"); const now=new Date().toISOString(); const qn=(mine[0]&&mine[0].x.quoteNo)||null;
    const rec={no,kind:"po",title:r.title,vendor:v,vendors:[v],jobs:[...new Set(mine.map(o=>o.j.id))],status:"approved",rfq_no:r.no,vendor_ref:qn,created_by:(window.ME&&ME.name)||"Kyle",log:[{at:now,t:`ordered from ${v} (from ${r.no}${qn?", their quote "+qn:""})`}]};
    const q=await sb.from("gvc_pos").insert(rec).select().single(); if(q.error) throw new Error(q.error.message); POS.unshift(q.data);
    await editLines(r.jobs,S=>{ let c=false; S.forEach(x=>{ if(x.rfq!==r.no) return; if(x.name===v){ x.po=no; x.status="approved"; x.updated=now; c=true; } else if(!x.po&&x.status!=="declined"){ x.status="declined"; x.updated=now; c=true; } }); return c; },`${r.no}: ordered from ${v} as ${no}`);
    await saveRec(r,{status:"ordered"},`ordered from ${v} → ${no}`);
    selNo=no; render(); toTop(); say(`${no} made for ${v}`);
  }catch(e){ say("Couldn't make the PO: "+e.message); }
}

/* ================= view + hooks ================= */
function renderPos(){
  const B=$("#board"); B.className="posv"; B.style.gridTemplateColumns="";
  const r=selNo&&POS.find(x=>x.no===selNo);
  if(r) (r.kind==="rfq"?renderRfq:renderPo)(B,r); else { selNo=null; renderList(B); }
}
window.extraViews=Object.assign(window.extraViews||{},{pos:renderPos});
window.openPo=no=>{ selNo=no; if(typeof closeDlg==="function") closeDlg(); if(typeof cur!=="undefined"&&cur!=="pos") shellGo("pos"); else render(); toTop(); };
// from a job card: close the card first so its copy of the job can't overwrite the new lines
window.newRfqFor=jid=>{ if(typeof closeDlg==="function") closeDlg(); newSheet("rfq",{jobs:[jid]}); };
window.newPoFor=jid=>{ if(typeof closeDlg==="function") closeDlg(); newSheet("po",{jobs:[jid]}); };
window.posOpen=()=>POS.filter(r=>r.kind==="rfq"?r.status==="open":!["received","cancelled"].includes(r.status)).length;
document.addEventListener("click",e=>{ const b=e.target.closest&&e.target.closest("[data-opo]"); if(b){ e.preventDefault(); e.stopPropagation(); window.openPo(b.dataset.opo); } },true);
const _back=window.gvcBack;
window.gvcBack=()=>{ try{ if(typeof cur!=="undefined"&&cur==="pos"&&selNo&&!document.querySelector(".shov.on")&&!document.querySelector("#scrim.on")){ selNo=null; render(); return true; } }catch(e){} return _back?_back():false; };
})();
