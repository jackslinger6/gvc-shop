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

async function load(){ const r=await sb.from("gvc_pos").select("*").order("created_at",{ascending:false}); if(!r.error){ POS=r.data||[]; loaded=true; } await syncPos(); if(typeof cur!=="undefined"&&cur==="pos") render(); if(panel.on) drawPanel(); }
let started=false;
setInterval(()=>{ if(!started&&typeof sb!=="undefined"&&sb&&window.ME){ started=true; load(); try{ sb.channel("gvc_pos").on("postgres_changes",{event:"*",schema:"public",table:"gvc_pos"},()=>load()).subscribe(); }catch(e){} } },1500);
window.posByNo=no=>POS.find(r=>r.no===no);
window.posAll=()=>({list:POS,loaded,linesOf});   // Purchasing view (purchasing.js) - read only

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
let syncHold=false;
async function nextNo(kind){ const r=await sb.rpc("gvc_next_no",{p_kind:kind}); if(r.error) throw new Error(r.error.message); return r.data; }

const css=document.createElement("style");
css.textContent=`
.posv{max-width:1000px;margin-top:6px}
.posv h2{font-family:var(--font-display);letter-spacing:.05em;margin:0}
.posv .lbl{font-size:12.5px;color:var(--muted)}
.posv .tabs{display:flex;gap:6px;margin:10px 0;flex-wrap:wrap}
.posv .rc{display:grid;grid-template-columns:auto 1fr auto;gap:4px 12px;align-items:center;width:100%;text-align:left;font:inherit;color:inherit;background:var(--panel,#1d2025);border:1px solid var(--line);border-left:4px solid var(--c);border-radius:12px;padding:10px 12px;margin-bottom:8px;cursor:pointer}
.posv .no{font:600 18px var(--font-display);letter-spacing:.03em;white-space:nowrap}
.posv .rc .t{min-width:0}.posv .rc .t b{display:block;font-size:14.5px}.posv .rc .t span{font-size:12.5px;color:var(--muted)}
.posv .st{font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;background:var(--c);color:#fff;white-space:nowrap}
.posv .chip{display:inline-block;font-size:12px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,.08);margin:2px 4px 2px 0}
.posv .grp{font-size:12px;letter-spacing:.12em;color:var(--muted);margin:16px 0 6px}
.posv .psc{display:block;margin-top:18px}
.posv .psc>h3{font-family:var(--font-display);letter-spacing:.08em;font-size:14px;margin:0 0 8px;display:flex;gap:8px;align-items:center}
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
.posv .psc>h3{font-size:12px;font-weight:600;color:var(--muted);letter-spacing:.08em}
.posv .chip{border:0;cursor:pointer;font:inherit;font-size:12px;font-weight:600;color:var(--text);background:var(--panel3);border-radius:6px;padding:3px 8px}
.ojl{padding:10px 0;border-bottom:1px solid var(--line)}.ojl:last-child{border-bottom:0}
.ojlh{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ojls{font-size:13.5px;margin:6px 0 2px;line-height:1.4}
.omore{margin-top:10px;border-top:1px solid var(--line);padding-top:6px}.omore>summary{cursor:pointer;color:var(--muted);font-weight:600;font-size:13px;min-height:40px;display:flex;align-items:center}.omore>summary:hover{color:var(--text)}
.vrow{padding:12px 0;border-bottom:1px solid var(--line);display:grid;gap:10px}.vrow:first-of-type{padding-top:4px}
.vrh{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.vrh b{font-size:15px}
.vrf{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.vrf label{margin:0;min-width:0}.vrf input{width:100%}
/* ---- order panel: one order (PO / RFQ / a plain supplier line) on top of the board (redesign stage 2) ---- */
.opanel{position:fixed;inset:0;z-index:9;display:none}
.opanel.on{display:block}
.opscrim{position:absolute;inset:0;background:rgba(6,7,9,.62)}
.opbox.posv{position:absolute;top:0;right:0;bottom:0;width:min(640px,100%);max-width:none;margin:0;background:var(--panel);border-left:1px solid var(--line);box-shadow:var(--shadow-3);overflow:auto;overscroll-behavior:contain;padding:0 20px calc(96px + env(safe-area-inset-bottom));outline:none}
.ophd{position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 -20px 8px;padding:calc(12px + env(safe-area-inset-top)) 20px 10px;background:var(--panel);border-bottom:1px solid var(--line)}
.opjob{display:inline-flex;align-items:center;gap:8px;margin-top:6px;font:inherit;font-size:13.5px;color:var(--text);background:none;border:0;padding:0;cursor:pointer;text-align:left}
.opjob .jnum{font-weight:600;font-size:12.5px;color:#ffd0a8;background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:6px;padding:1px 6px}
.opjob:hover span:last-child{text-decoration:underline}
.ofacts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px 16px;margin:16px 0 0}
.ofacts div{min-width:0}.ofacts dt{font-size:11.5px;font-weight:600;color:var(--muted);letter-spacing:.06em;text-transform:uppercase}.ofacts dd{margin:3px 0 0;font-size:14px;overflow-wrap:anywhere}
.oacts{display:flex;gap:8px;flex-wrap:wrap}
.onote{white-space:pre-wrap;font-size:13.5px;line-height:1.45;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
body:has(.opanel.on){overflow:hidden}
@media (max-width:700px){ .opbox.posv{width:100%;border-left:0;padding:0 14px calc(96px + env(safe-area-inset-bottom))} .ophd{margin:0 -14px 8px;padding-left:14px;padding-right:14px} body:has(.opanel.on) .shnav{display:none} body:has(.opanel.on) .hereMic{bottom:calc(20px + env(safe-area-inset-bottom))} }
.supchips{margin-top:3px}.supchips button{font:600 11.5px var(--font-display);letter-spacing:.04em;border:1px solid var(--line);background:rgba(255,255,255,.06);color:var(--text);border-radius:6px;padding:2px 7px;margin-right:4px;cursor:pointer}
`;
document.head.appendChild(css);

/* an open RFQ says what's actually happened: how many of the asked vendors have quoted (Kyle, Nov 10 - RFQ-1004 said "Waiting on quotes" with the quote in hand) */
const rfqIn=r=>{ const V=[...new Set([...(r.vendors||[]),...linesOf(r).map(o=>o.x.name)])]; const L=linesOf(r);
  const got=V.filter(v=>L.some(o=>o.x.name===v&&(["quote","ordered","received"].includes(o.x.status)||o.x.quoteNo||o.x.total))).length; return {got,n:V.length}; };
/* a vendor on an open RFQ that already confirmed the order (its job line went past "Quote in" without a PO being made
   here, e.g. RFQ-1004: Russel confirmed, cut, ready for pickup) - the RFQ shows that, not "Quote in" (Kyle's review, Nov 14) */
const PAST=["approved","production","ready","arrived","received"];
const rfqAhead=r=>{ if(r.kind!=="rfq"||r.status!=="open") return null; const L=linesOf(r).filter(o=>!o.x.po&&PAST.includes(o.x.status)); if(!L.length) return null;
  return L.reduce((a,o)=>PAST.indexOf(o.x.status)>PAST.indexOf(a.x.status)?o:a); };
const recColor=r=>{ const a=rfqAhead(r); if(a) return (PL[a.x.status]||{}).c||"#9b4dff";
  return r.kind==="rfq"?(r.status==="open"?(rfqIn(r).got&&rfqIn(r).got>=rfqIn(r).n?"#3ad06b":"#2f8ff0"):"#6c727a"):((PL[r.status]||{}).c||"#6c727a"); };
const recStatus=r=>{ if(r.kind!=="rfq") return (PL[r.status]||{}).t||r.status;
  const a=rfqAhead(r); if(a) return `${(PL[a.x.status]||{}).t||a.x.status} · no PO yet`;
  if(r.status==="open"){ const rv=window.quoteRev?linesOf(r).filter(o=>window.quoteRev(o.x)).length:0;   // stage 7: a quote is kept but a revision was asked for
    const {got,n}=rfqIn(r); if(rv) return n>1?`Revised quote requested (${rv} of ${n})`:"Revised quote requested";
    return !got?"Waiting on quote"+(n>1?"s":""):got>=n?(n>1?"Quotes in":"Quote in"):`${got} of ${n} quotes in`; }
  return ({ordered:"Ordered",closed:"Closed"})[r.status]||r.status; };
/* what the order comes to: the totals typed on its job lines, else what the read quote adds up to (Nov 10) */
const money=n=>"$"+n.toLocaleString("en-CA",{minimumFractionDigits:2,maximumFractionDigits:2});
const recTotal=r=>{ const L=linesOf(r).filter(o=>r.kind==="po"?o.x.po===r.no:o.x.status!=="declined"); let t=0,n=0;
  L.forEach(o=>{ const v=parseFloat(String(o.x.total||"").replace(/[^0-9.]/g,"")); const q=!isNaN(v)&&v>0?v:(window.quoteTotal?window.quoteTotal(o.x):null); if(q){ t+=q; n++; } });
  return n?(r.kind==="rfq"&&n>1?null:t):null; };
const recRev=r=>r.kind==="rfq"&&!!window.quoteRev&&linesOf(r).some(o=>window.quoteRev(o.x));
const totLbl=r=>recRev(r)?"Previous quote total":"Total";
const delivSum=r=>{ const D=r.deliveries||[]; return D.length?`${D.filter(d=>d.status==="received").length} of ${D.length} deliveries in`:""; };

/* ================= list ================= */
function renderList(B){
  const open=POS.filter(r=>r.kind==="rfq"?r.status==="open":!["received","cancelled"].includes(r.status));
  const L=tab==="open"?open:POS;
  const card=r=>`<button type="button" class="rc" data-no="${E(r.no)}" style="--c:${recColor(r)}"><span class="no">${E(r.no)}</span>
    <span class="t"><b>${E(r.kind==="po"?r.vendor||"":r.title||"")}${r.kind==="po"&&r.title?` <span style="font-weight:400">· ${E(r.title)}</span>`:""}</b>
    <span>${(r.jobs||[]).map(id=>`<span class="chip">${E(jobTag(id))}</span>`).join("")}${r.kind==="rfq"?`asked ${E((r.vendors||[]).join(", ")||"-")}`:""}${r.rfq_no?` · from ${E(r.rfq_no)}`:""}${r.vendor_ref?` · ${E(r.vendor_ref)}`:""}${recTotal(r)!=null?` · <b>${recRev(r)?"previous quote ":""}${money(recTotal(r))}</b>`:""}${delivSum(r)?` · ${delivSum(r)}`:""}</span></span>
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
function head(r,B){
  const P=B&&B.dataset.panel; const J=r.jobs||[];
  return `${P?`<div class="ophd"><button class="btn sm" type="button" id="pBack" aria-label="Close and go back">‹ Back</button><span style="flex:1"></span>
      ${J.length===1?`<button class="btn sm" type="button" data-oj="${E(J[0])}">Open full job ›</button>`:""}
      <button class="btn sm ghost" type="button" id="pAll">All RFQs & POs</button></div>`:`<button class="btn sm" type="button" id="pBack">‹ All RFQs & POs</button>`}
    <div style="display:flex;gap:10px;align-items:baseline;margin-top:10px;flex-wrap:wrap"><span class="no" style="font-size:26px">${E(r.no)}</span>
      <span class="st" style="--c:${recColor(r)};background:${recColor(r)}">${E(recStatus(r))}</span></div>
    <div style="font-size:16px;font-weight:700;margin-top:2px">${E(r.kind==="po"?r.vendor:r.title||"")}${r.kind==="po"&&r.title?` <span style="font-weight:400;color:var(--muted)">· ${E(r.title)}</span>`:""}</div>
    <div class="lbl" style="margin-top:4px">${(r.jobs||[]).map(id=>`<button type="button" class="chip" data-oj="${E(id)}" title="Open the job">${E(jobOf(id)?jobOf(id).name:id)}</button>`).join("")}</div>
    <div class="lbl">${[r.rfq_no?"from "+r.rfq_no:"",r.vendor_ref?"vendor # "+r.vendor_ref:"","started "+day(r.created_at)].filter(Boolean).map(E).join(" · ")}${recTotal(r)!=null?` · <b style="color:var(--text)">${totLbl(r)} ${money(recTotal(r))}</b>`:""}</div>`;
}
function renderRfq(B,r){
  const L=linesOf(r); const byV={}; L.forEach(({j,x})=>{ (byV[x.name]=byV[x.name]||[]).push({j,x}); });
  (r.vendors||[]).forEach(v=>{ byV[v]=byV[v]||[]; });
  const sts=typeof ST!=="undefined"?ST:{};
  B.innerHTML=`<div class="pod">${head(r,B)}
    <div class="psc"><h3>VENDORS ASKED</h3>
      ${Object.entries(byV).map(([v,arr])=>{ const x=(arr[0]||{}).x||{}; const st0=sts[x.status]||{t:x.status||"-",c:"#888"}; const st={...st0,t:window.supT&&x.status?window.supT(x):st0.t}; const done=PAST.includes(x.status);
        const canRev=isKyle()&&r.status==="open"&&!x.po&&!done&&!!(x.quoteNo||x.total)&&["quote","sent","replied"].includes(x.status);
        const qt=!x.total&&window.quoteTotal?window.quoteTotal(x):null;
        const acts=[window.openCount&&arr[0]&&["approved","production","ready","arrived"].includes(x.status)?`<button class="btn${["ready","arrived"].includes(x.status)?" primary":""}" type="button" data-rcnt="${E(arr[0].j.id)}|${E(x.id)}">☑ Count it</button>`:"",
          isKyle()&&r.status==="open"&&!x.po?(done?`<button class="btn" type="button" data-ord="${E(v)}">Give it a PO number</button>`:window.quoteRev&&window.quoteRev(x)?`<button class="btn" type="button" data-ord="${E(v)}">Order on the previous quote…</button>`:`<button class="btn primary" type="button" data-ord="${E(v)}">Order from ${E(String(v).split(/\s/)[0])} →</button>`):"",
          x.po?`<button class="btn" type="button" data-opo="${E(x.po)}">Open ${E(x.po)} ›</button>`:"",
          canRev?(window.quoteRev&&window.quoteRev(x)?`<button class="btn" type="button" data-revin="${E(v)}">Revised quote is in</button>`:`<button class="btn ghost" type="button" data-rev="${E(v)}">Ask for a revised quote</button>`):""].filter(Boolean);
        return `<div class="vrow"><div class="vrh"><b>${E(v)}</b><span class="ostat" style="--c:${st.c}">${E(st.t)}</span>${arr.length>1?`<span class="lbl">${arr.length} jobs</span>`:""}</div>
          ${done&&!x.po?`<div class="lbl">${E(String(v).split(/\s/)[0])} already confirmed this order - give it a PO number to follow pickup and deliveries.</div>`:""}
          ${window.supExtraHTML?window.supExtraHTML(x):""}
          <div class="vrf"><label>${window.quoteRev&&window.quoteRev(x)?"Revised quote #":"Their quote #"}<input data-vq="${E(v)}" value="${window.quoteRev&&window.quoteRev(x)?"":E(x.quoteNo||"")}" placeholder="${window.quoteRev&&window.quoteRev(x)?"when it comes in":"quote #"}" ${isKyle()?"":"disabled"}></label>
            <label>Total${window.quoteRev&&window.quoteRev(x)?" (previous quote)":""}<input data-vt="${E(v)}" value="${E(x.total||"")}" placeholder="${qt?money(qt)+" on the quote":"$"}" ${isKyle()?"":"disabled"}></label></div>
          ${acts.length?`<div class="oacts">${acts.join("")}</div>`:""}</div>`; }).join("")}
      ${isKyle()&&r.status==="open"?(()=>{ const btns=`<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm ghost" type="button" id="pAddV">+ Ask another vendor</button><button class="btn sm ghost" type="button" id="pCmp">⚖ Compare their quotes</button><button class="btn sm ghost" type="button" id="pClose">Close without ordering</button></div>`;
        // a vendor already confirmed this order: shopping around is unusual now, so those actions fold away (Kyle's review, Nov 14)
        const a=rfqAhead(r); return a?`<details class="omore"><summary>More for this RFQ</summary><div class="lbl" style="margin-top:6px">${E(String(a.x.name).split(/\s/)[0])} already confirmed this order. These only matter if you still want other prices. Closing without ordering marks the vendors that haven't confirmed as Declined - ${E(String(a.x.name).split(/\s/)[0])}'s order stays as it is.</div>${btns}</details>`:btns; })():""}
    </div>
    ${notesLog(r)}</div>`;
  wireCommon(B,r);
  const saveV=async(v,f,val)=>{ await editLines(L.filter(o=>o.x.name===v).map(o=>o.j.id),S=>{ let c=false; S.forEach(x=>{ if(x.rfq===r.no&&x.name===v&&(x[f]||"")!==val){ if(f==="quoteNo"&&val&&window.quoteRev&&window.quoteRev(x)&&!x.prevQuote) x.prevQuote={no:x.quoteNo||"",total:x.total||"",at:x.updated||x.sent||""}; x[f]=val; x.updated=new Date().toISOString(); if(f==="quoteNo"&&val&&["sent","replied"].includes(x.status)){ x.status="quote"; delete x.reqAt; } c=true; } }); return c; },`${r.no}: ${v} ${f==="quoteNo"?"quote # "+val:"total "+val}`); };
  B.querySelectorAll("[data-vq]").forEach(i=>i.onchange=()=>saveV(i.dataset.vq,"quoteNo",i.value.trim()));
  B.querySelectorAll("[data-vt]").forEach(i=>i.onchange=()=>saveV(i.dataset.vt,"total",i.value.trim()));
  B.querySelectorAll("[data-ord]").forEach(b=>b.onclick=()=>orderFrom(r,b.dataset.ord));
  /* "Ask for a revised quote" (stage 7): keeps the quote they sent as the previous quote, puts the line back to waiting,
     and starts the reply clock today. Entering their new quote # later moves it back to Quote in. */
  B.querySelectorAll("[data-revin]").forEach(b=>b.onclick=async()=>{ if(b.disabled) return; b.disabled=true; const v=b.dataset.revin; const now=new Date().toISOString();
    await editLines(L.filter(o=>o.x.name===v).map(o=>o.j.id),S=>{ let c=false; S.forEach(y=>{ if(y.rfq===r.no&&y.name===v&&!y.po&&["sent","replied"].includes(y.status)){ y.status="quote"; delete y.reqAt; y.updated=now; c=true; } }); return c; },`${r.no}: ${v} revised quote in (update the quote # / total if they changed)`); });
  B.querySelectorAll("[data-rev]").forEach(b=>b.onclick=async()=>{ if(b.disabled) return; const v=b.dataset.rev; const x=(L.find(o=>o.x.name===v)||{x:{}}).x;
    if(!confirm(`Mark ${v} as asked for a revised quote on ${r.no}?\n\nQuote ${x.quoteNo?"#"+x.quoteNo:""}${x.total?" ("+x.total+")":""} is kept as the previous quote. The reply clock starts today.`)) return;
    b.disabled=true; const now=new Date().toISOString(); const d=new Date(now).toLocaleDateString("en-CA",{month:"short",day:"numeric"});
    await editLines(L.filter(o=>o.x.name===v).map(o=>o.j.id),S=>{ let c=false; S.forEach(y=>{ if(y.rfq===r.no&&y.name===v&&!y.po){
        y.prevQuote={no:y.quoteNo||"",total:y.total||"",at:y.updated||y.sent||""}; y.status="sent"; y.reqAt=now; y.updated=now;
        y.note=((y.note?y.note+" | ":"")+`${d}: asked for a revised quote (previous ${y.quoteNo?"#"+y.quoteNo:"quote"} kept)`).slice(0,1500); c=true; } }); return c; },`${r.no}: asked ${v} for a revised quote`); });
  B.querySelectorAll("[data-rcnt]").forEach(b=>b.onclick=()=>{ const [jid,sid]=b.dataset.rcnt.split("|"); window.openCount(jid,sid); });
  const av=B.querySelector("#pAddV"); if(av) av.onclick=()=>addVendor(r);
  const cm=B.querySelector("#pCmp"); if(cm) cm.onclick=()=>{ const jid=(r.jobs||[])[0]; if(jid&&window.compareQuotes) window.compareQuotes(jid); };
  const cl=B.querySelector("#pClose"); if(cl) cl.onclick=async()=>{ if(!confirm(`Close ${r.no} without ordering? The vendors' lines on the jobs are marked Declined${rfqAhead(r)?" (except a vendor that already confirmed - that order stays as it is)":""}.`)) return;
    await editLines(r.jobs,S=>{ let c=false; S.forEach(x=>{ if(x.rfq===r.no&&!x.po&&x.status!=="declined"&&!PAST.includes(x.status)){ x.status="declined"; x.updated=new Date().toISOString(); c=true; } }); return c; },`${r.no} closed - nothing ordered`);
    saveRec(r,{status:"closed"},"closed without ordering"); };
}
function renderPo(B,r){
  const L=linesOf(r); const si=PST.findIndex(x=>x[0]===r.status); const D=r.deliveries||[];
  const inN=D.filter(d=>d.status==="received").length;
  B.innerHTML=`<div class="pod">${head(r,B)}
    <div class="psc"><div class="steps">${PST.map(([k,t,c],i)=>`<button class="btn sm ${k===r.status?"on":i<si?"past":""}" type="button" data-ps="${k}" style="--c:${c}" ${isKyle()?"":"disabled"}>${t}</button>`).join("")}</div>
      <div class="lbl" style="margin-top:6px">Moving this moves ${L.length===1?`the ${E(r.vendor)} line on ${E(jobTag(L[0].j.id))}`:`the ${E(r.vendor)} lines on ${L.length} jobs`} too (Orders board, Count).</div>
      ${["arrived","ready","production","approved"].includes(r.status)&&L.length&&window.openCount?`<div style="margin-top:8px"><button class="btn primary" type="button" id="pCount">☑ Count it</button></div>`:""}</div>
    ${L.length?`<div class="psc"><h3>ON THE JOBS</h3>${L.map(({j,x})=>{ const st=(typeof ST!=="undefined"&&ST[x.status])||{t:x.status,c:"#888"};
        return `<div class="ojl"><div class="ojlh"><button class="chip" type="button" data-oj="${E(j.id)}" title="Open ${E(j.name)}">${E(jobTag(j.id))}</button><span class="ostat" style="--c:${st.c}">${E(window.supT?window.supT(x):st.t)}</span></div>
          ${x.scope?`<div class="ojls">${E(x.scope)}</div>`:""}${window.supExtraHTML?window.supExtraHTML(x):""}
          <div class="lbl">${[x.quoteNo?"Their # "+E(x.quoteNo):"",x.total?"Total "+E(x.total):"",x.sent?"Sent "+day(x.sent):"",x.receivedAt?"Received "+day(x.receivedAt):""].filter(Boolean).join(" · ")||"&nbsp;"}</div></div>`; }).join("")}</div>`:""}
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
  if(B.dataset.panel){ B.querySelector("#pBack").onclick=closePanel;
    const all=B.querySelector("#pAll"); if(all) all.onclick=()=>{ closePanel(false); selNo=null; if(typeof cur!=="undefined"&&cur!=="pos") shellGo("pos"); else render(); toTop(); };
    B.querySelectorAll("[data-oj]").forEach(c=>c.onclick=()=>{ if(panel.from&&panel.from.jid===c.dataset.oj) return closePanel(); closePanel(false); openJobAt(c.dataset.oj,{no:r.no}); }); }
  else { B.querySelector("#pBack").onclick=()=>{ selNo=null; render(); toTop(); };
    B.querySelectorAll("[data-oj]").forEach(c=>c.onclick=()=>{ if(typeof openJob==="function") openJob(c.dataset.oj); }); }
  const n=B.querySelector("#pNotes"); if(n) n.onchange=()=>saveRec(r,{notes:n.value.trim()||null},"");
}
async function setPoStage(r,k){
  if(!isKyle()||k===r.status) return;
  // hold the job→PO sync while this runs, or it logs the same move twice ("Ready for pickup (from the job)" + "Ready for pickup")
  syncHold=true; try{
  await editLines(r.jobs,S=>{ let c=false; S.forEach(x=>{ if(x.po===r.no&&x.status!==k){ x.status=k; x.updated=new Date().toISOString(); if(k==="received") x.receivedAt=x.updated; c=true; } }); return c; },`${r.no} ${r.vendor}: ${PL[k].t}`);
  await saveRec(r,{status:k},PL[k].t);
  }finally{ syncHold=false; }
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
        await editLines(js,(S,D)=>{ const forNcr=pre.ncr&&(D.ncrs||[]).some(x=>x.n===pre.ncr.n); vs.forEach(v=>{ const ex=!forNcr&&S.find(x=>x.name===v&&!x.rfq&&!x.po&&(rfq?["sent","replied","quote"]:["sent","replied","quote","approved"]).includes(x.status||"sent"));
            if(ex){ ex[rfq?"rfq":"po"]=no; if(!rfq){ ex.status="approved"; if(rec.vendor_ref) ex.quoteNo=ex.quoteNo||rec.vendor_ref; } ex.updated=now; }
            else S.push({id:uid(),name:v,scope:title||"",sent:now,status:rfq?"sent":"approved",[rfq?"rfq":"po"]:no,quoteNo:rfq?"":(rec.vendor_ref||""),updated:now,...(forNcr?{ncr:pre.ncr.n}:{})}); }); return true; },`${no}${title?" "+title:""}: ${rfq?"asked "+vs.join(", "):"ordered from "+vs[0]}`);
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
  const ahead=mine.map(o=>o.x.status).filter(k=>PAST.includes(k)).sort((a,b)=>PAST.indexOf(b)-PAST.indexOf(a))[0]||null;   // already ordered with the vendor
  // stage 7 review: ordering while a revised quote is still outstanding has to be a conscious choice
  const rv=!ahead&&window.quoteRev&&mine.find(o=>window.quoteRev(o.x));
  if(rv){ const x=rv.x, q=x.prevQuote||{no:x.quoteNo,total:x.total}; const at=window.askedAt?window.askedAt(x):null;
    if(!confirm(`${v}'s REVISED quote is still outstanding${at?" (asked "+day(at)+")":""}.\n\nOrder on the PREVIOUS quote${q.no?" #"+q.no:""}${q.total?" ("+q.total+")":""} anyway?\n\nCancel to wait for the revision.`)) return; }
  if(!confirm(ahead?`${v} already confirmed this order (${(PL[ahead]||{}).t||ahead}).\n\nGive it a PO number? It stays at ${(PL[ahead]||{}).t||ahead}${others.length?`, and ${others.join(", ")} ${others.length>1?"are":"is"} marked Declined on this RFQ`:""}.`
    :`Order from ${v}?\n\nThis makes a new PO number for ${v}${others.length?` and marks ${others.join(", ")} Declined on this RFQ`:""}.`)) return;
  try{ const no=await nextNo("po"); const now=new Date().toISOString(); const qn=(mine[0]&&mine[0].x.quoteNo)||null;
    const rec={no,kind:"po",title:r.title,vendor:v,vendors:[v],jobs:[...new Set(mine.map(o=>o.j.id))],status:ahead||"approved",rfq_no:r.no,vendor_ref:qn,created_by:(window.ME&&ME.name)||"Kyle",log:[{at:now,t:`ordered from ${v} (from ${r.no}${qn?", their quote "+qn:""})`}]};
    const q=await sb.from("gvc_pos").insert(rec).select().single(); if(q.error) throw new Error(q.error.message); POS.unshift(q.data);
    await editLines(r.jobs,S=>{ let c=false; S.forEach(x=>{ if(x.rfq!==r.no) return; if(x.name===v){ x.po=no; if(!PAST.includes(x.status)) x.status="approved"; x.updated=now; c=true; } else if(!x.po&&x.status!=="declined"){ x.status="declined"; x.updated=now; c=true; } }); return c; },`${r.no}: ordered from ${v} as ${no}`);
    await saveRec(r,{status:"ordered"},`ordered from ${v} → ${no}`);
    if(panel.no){ panel.no=no; drawPanel(); render(); } else { selNo=no; render(); toTop(); } say(`${no} made for ${v}`);
  }catch(e){ say("Couldn't make the PO: "+e.message); }
}

/* a PO follows its job lines: the hourly email check (or anyone on a job card) moving a line forward moves the PO too */
const ORD=PST.map(x=>x[0]); let syncing=false;
async function syncPos(){
  if(syncing||syncHold||!isKyle()) return; syncing=true;
  try{ for(const r of POS){ if(r.kind!=="po"||["received","cancelled"].includes(r.status)) continue;
    const L=linesOf(r).map(o=>o.x.status).filter(k=>ORD.includes(k)); if(!L.length) continue;
    const lo=L.reduce((a,k)=>ORD.indexOf(k)<ORD.indexOf(a)?k:a,L[0]);       // the PO is as far as its slowest line
    if(ORD.indexOf(lo)>ORD.indexOf(r.status)){ const q=await sb.from("gvc_pos").update({status:lo,log:[...(r.log||[]),{at:new Date().toISOString(),t:`${PL[lo].t} (from the job)`}].slice(-80),updated_at:new Date().toISOString()}).eq("id",r.id); if(!q.error){ r.status=lo; } } }
  }finally{ syncing=false; } }
/* ================= view + hooks ================= */
function renderPos(){
  syncPos().then(()=>{});
  const B=$("#board"); B.className="posv"; B.style.gridTemplateColumns="";
  const r=selNo&&POS.find(x=>x.no===selNo);
  if(r) (r.kind==="rfq"?renderRfq:renderPo)(B,r); else { selNo=null; renderList(B); }
}
window.extraViews=Object.assign(window.extraViews||{},{pos:renderPos});
window.openPo=no=>{ selNo=no; if(typeof closeDlg==="function") closeDlg(); if(typeof cur!=="undefined"&&cur!=="pos") shellGo("pos"); else render(); toTop(); };
// from a job card: close the card first so its copy of the job can't overwrite the new lines
window.newRfqFor=jid=>{ if(typeof closeDlg==="function") closeDlg(); newSheet("rfq",{jobs:[jid]}); };
window.newPoFor=jid=>{ if(typeof closeDlg==="function") closeDlg(); newSheet("po",{jobs:[jid]}); };
/* replacement order for an NCR (stage 7): a new RFQ / PO on that job whose line carries ncr = n, so the NCR shows it as tracking */
window.posRec=no=>no?(POS.find(r=>r.no===no)||null):null;
window.newOrderForNcr=(jid,n,kind,title)=>{ newSheet(kind==="po"?"po":"rfq",{jobs:[jid],title,ncr:{jid,n}}); };
window.posOpen=()=>POS.filter(r=>r.kind==="rfq"?r.status==="open":!["received","cancelled"].includes(r.status)).length;
document.addEventListener("click",e=>{ const b=e.target.closest&&e.target.closest("[data-opo]"); if(b){ e.preventDefault(); e.stopPropagation(); window.openOrder(b.dataset.opo); } },true);
// Back: the order panel closes first, then an open RFQ / PO page goes back to the RFQs & POs list ("back" hooks - see back.js)
GVC.on("back",()=>{ if(panel.on){ closePanel(); return true; } return false; },{order:60});
GVC.on("back",()=>{ try{ if(typeof cur!=="undefined"&&cur==="pos"&&selNo&&!document.querySelector(".shov.on")&&!document.querySelector("#scrim.on")){ selNo=null; render(); return true; } }catch(e){} return false; },{order:70});
/* ================= order panel (redesign stage 2, Nov 14) =================
   Tapping an order on the Orders board (or a PO / RFQ chip anywhere) opens THAT order on top of the screen - a side
   panel on a computer, the full screen on a phone - instead of the whole job card. PO / RFQ = the same page as
   More > RFQs & POs (stages, Count it, deliveries, notes). A supplier line with no number gets its own short view.
   Back / Esc / tapping outside closes it and you're exactly where you were on the board. */
const panel={on:false,no:null,line:null}; let PEL=null, lastFocus=null;
function panelEl(){ if(PEL) return PEL;
  PEL=document.createElement("div"); PEL.className="opanel"; PEL.innerHTML=`<div class="opscrim"></div><section class="opbox posv" data-panel="1" role="dialog" aria-modal="true" aria-label="Order" tabindex="-1"></section>`;
  document.body.appendChild(PEL); PEL.querySelector(".opscrim").onclick=closePanel; return PEL; }
function drawPanel(){
  if(!panel.on) return; const B=panelEl().querySelector(".opbox"); const top=B.scrollTop;
  const r=panel.no&&POS.find(x=>x.no===panel.no);
  if(r) (r.kind==="rfq"?renderRfq:renderPo)(B,r);
  else if(panel.line) drawLine(B);
  else B.innerHTML=`<div class="ophd"><button class="btn sm" type="button" id="pBack">‹ Back</button></div><div class="empty" style="text-align:left">${loaded?`${E(panel.no)} isn't in RFQs & POs.`:"Loading…"}</div>`, B.querySelector("#pBack").onclick=closePanel;
  B.setAttribute("aria-label",panel.no?`Order ${panel.no}`:"Order"); B.scrollTop=top;
}
function showPanel(){ const el=panelEl(); if(!panel.on) lastFocus=document.activeElement; panel.view=typeof cur!=="undefined"?cur:null; panel.on=true; el.classList.add("on"); drawPanel(); const B=el.querySelector(".opbox"); B.scrollTop=0; try{ B.focus({preventScroll:true}); }catch(e){} }
/* closing the panel goes back to where it was opened from: the board (focus back on the row) or - when it was opened from
   a job card's Orders - that job card, same section, same scroll (Kyle's review, Nov 14). closePanel(false) = going on
   somewhere else (another screen, the job card at a line, a new RFQ) so don't reopen anything. */
function closePanel(restore){ if(!panel.on) return; const from=panel.from; panel.on=false; panel.no=null; panel.line=null; panel.from=null; panelEl().classList.remove("on");
  if(restore!==false&&from&&typeof openJob==="function"&&(jobs.some(j=>j.id===from.jid)||archivedJobs.some(j=>j.id===from.jid))){
    lastFocus=null; openJob(from.jid,from.tab);
    requestAnimationFrame(()=>{ const sc=document.getElementById("scrim"); if(sc) sc.scrollTop=from.top||0; const t=document.querySelector(`#dlg [data-jtab="${from.tab}"]`); try{ if(t) t.focus({preventScroll:true}); }catch(e){} });
    return; }
  try{ if(lastFocus&&document.contains(lastFocus)) lastFocus.focus({preventScroll:true}); }catch(e){} lastFocus=null; }
window.closeOrderPanel=closePanel;
const leaveJobCard=()=>{ const sc=document.getElementById("scrim"); if(sc&&sc.classList.contains("on")){
    if(!panel.on&&typeof openId!=="undefined"&&openId) panel.from={jid:openId,tab:typeof dlgTab!=="undefined"?dlgTab:"orders",top:sc.scrollTop}; if(typeof window.closeJob==="function") window.closeJob(); else if(typeof closeDlg==="function") closeDlg(); } };
window.openOrder=no=>{ leaveJobCard(); panel.no=no; panel.line=null; showPanel(); };
// a supplier line from a job: its PO (or RFQ) if it has one, otherwise the line itself
window.openOrderLine=(jid,sid)=>{ const j=jobOf(jid); const x=j&&(j.suppliers||[]).find(s=>s.id===sid);
  const no=x&&(x.po||x.rfq); if(no&&(!loaded||POS.some(r=>r.no===no))) return window.openOrder(no);
  leaveJobCard(); panel.no=null; panel.line={jid,sid}; showPanel(); };
/* open a job card at its Suppliers block for one order (and optionally the line's edit fields) */
window.openJobAt=(jid,o={})=>{
  if(typeof openJob!=="function") return; openJob(jid,"orders"); const D=document.getElementById("dlg"); if(!D) return;
  const j=jobOf(jid); const S=(j&&j.suppliers)||[];
  const k=o.sid!=null?S.findIndex(x=>x.id===o.sid):S.findIndex(x=>o.no&&(x.po===o.no||x.rfq===o.no));
  const eb=k>=0?D.querySelector(`[data-sged="${k}"]`):null; let det=eb?eb.closest("details"):null;
  if(!det&&o.no) det=[...D.querySelectorAll("details[data-sgk]")].find(d=>d.dataset.sgk===o.no)||null;
  if(!det) return;
  det.open=true; try{ supOpen.add(det.dataset.sgk); }catch(e){}
  for(let p=det.parentElement&&det.parentElement.closest("details");p;p=p.parentElement&&p.parentElement.closest("details")) p.open=true;   // inside "Received & declined"
  if(o.edit&&k>=0){ const b=D.querySelector(`[data-sged="${k}"]`); if(b&&b.textContent.includes("Edit")) b.click(); }
  setTimeout(()=>{ try{ det.scrollIntoView({block:"start",behavior:"smooth"}); }catch(e){} },60);
};
function drawLine(B){
  const {jid,sid}=panel.line; const j=jobOf(jid); const x=j&&(j.suppliers||[]).find(s=>s.id===sid);
  const hd=`<div class="ophd"><button class="btn sm" type="button" id="pBack" aria-label="Close and go back">‹ Back</button><span style="flex:1"></span>${j?`<button class="btn sm" type="button" id="lJob">Open full job ›</button>`:""}</div>`;
  if(!x){ B.innerHTML=hd+`<div class="empty" style="text-align:left">This order isn't on the job any more.</div>`; B.querySelector("#pBack").onclick=closePanel; const lj=B.querySelector("#lJob"); if(lj) lj.onclick=()=>{ closePanel(false); openJob(jid); }; return; }
  const sts=typeof ST!=="undefined"?ST:{}; const st0=sts[x.status]||sts.sent||{t:x.status,c:"#888"}; const st={...st0,t:window.supT?window.supT(x):st0.t};
  const num=window.jobNum?window.jobNum(j.name):""; const rest=num?String(j.name).replace(/^\s*\S+\s*[-–:]?\s*/,"").trim():j.name;
  const qt=!x.total&&window.quoteTotal?window.quoteTotal(x):null;
  const f=(t,v)=>v?`<div><dt>${t}</dt><dd>${v}</dd></div>`:"";
  const canCount=window.openCount&&!["sent","replied","quote","declined"].includes(x.status);
  B.innerHTML=`<div class="pod">${hd}
    <button class="opjob" type="button" id="lJob2">${num?`<span class="jnum">${E(num)}</span>`:""}<span>${E(rest)}</span></button>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px"><span class="no" style="font-size:22px">${E(x.name)}</span><span class="ostat" style="--c:${st.c}">${E(st.t)}</span></div>
    <div class="lbl" style="margin-top:2px">No RFQ or PO number on this order${x.scope?` · ${E(x.scope)}`:""}</div>
    ${window.supExtraHTML?window.supExtraHTML(x):""}
    <dl class="ofacts">${f(x.po?"Their #":"Quote #",E(x.quoteNo))}${f("Total",x.total?E(x.total):qt?money(qt)+" on the quote":"")}${f("Lead time",E(x.lead))}${f("Contact",E(x.contact))}
      ${f("Sent",x.sent?E(fmt(x.sent)):"Not sent yet")}${f("Last update",x.updated&&E(fmt(x.updated)))}${f("Arrived",x.arrivedAt&&E(fmt(x.arrivedAt)))}${f("Received",x.receivedAt&&E(fmt(x.receivedAt)))}</dl>
    ${x.note?`<div class="psc"><h3>LATEST</h3><div class="onote">${E(x.note)}</div></div>`:""}
    <div class="psc"><h3>WHAT YOU CAN DO</h3><div class="oacts">
      ${canCount?`<button class="btn${x.status==="arrived"||x.status==="ready"?" primary":""}" type="button" id="lCount">☑ Count it</button>`:""}
      <button class="btn" type="button" id="lEdit">✎ Edit status, quote #, total…</button>
      ${isKyle()&&["sent","replied","quote"].includes(x.status||"sent")?`<button class="btn" type="button" id="lRfq">Give it an RFQ number</button>`:""}
    </div><div class="lbl" style="margin-top:8px">Editing opens the job card at this order.</div></div></div>`;
  B.querySelector("#pBack").onclick=closePanel;
  const toJob=o=>()=>{ if(!o.edit&&panel.from&&panel.from.jid===jid) return closePanel(); closePanel(false); window.openJobAt(jid,o); };
  B.querySelector("#lJob").onclick=toJob({sid}); B.querySelector("#lJob2").onclick=toJob({sid}); B.querySelector("#lEdit").onclick=toJob({sid,edit:true});
  const c=B.querySelector("#lCount"); if(c) c.onclick=()=>window.openCount(jid,sid);
  const rq=B.querySelector("#lRfq"); if(rq) rq.onclick=()=>{ closePanel(false); newSheet("rfq",{jobs:[jid],vendor:x.name,title:x.scope||""}); };
}
// keep an open panel up to date when the data changes (not while you're typing in it)
GVC.on("render:after",()=>{ try{ if(panel.on&&typeof cur!=="undefined"&&panel.view&&cur!==panel.view){ closePanel(false); } if(panel.on){ const a=document.activeElement; if(!(a&&PEL&&PEL.contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) drawPanel(); } }catch(e){} });
document.addEventListener("keydown",e=>{ if(e.key!=="Escape"||!panel.on) return; const sc=document.getElementById("scrim"); if((sc&&sc.classList.contains("on"))||document.querySelector(".shov")) return; e.stopImmediatePropagation(); closePanel(); },true);
// keep Tab inside the panel while it's open (keyboard users)
document.addEventListener("keydown",e=>{ if(e.key!=="Tab"||!panel.on||!PEL) return; const sc=document.getElementById("scrim"); if((sc&&sc.classList.contains("on"))||document.querySelector(".shov")) return;
  const F=[...PEL.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex='-1'])")].filter(x=>x.offsetParent!==null);
  if(!F.length) return; const i=F.indexOf(document.activeElement);
  if(e.shiftKey&&(i<=0)){ e.preventDefault(); F[F.length-1].focus(); } else if(!e.shiftKey&&(i===-1||i===F.length-1)){ e.preventDefault(); F[0].focus(); } },true);

})();
