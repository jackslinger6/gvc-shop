/* ---------- Purchasing - one entry point (step 1, usability pass Nov 15) ----------
   A combined, READ-ONLY view over the lists that already exist (claude/gvc-purchasing-proposal.md, Phase 1).
   Nothing is merged, renumbered or re-saved here; each row opens its own existing screen.
     Job order        = one RFQ/PO in gvc_pos + the supplier lines on the jobs that carry its number (ONE row, ONE purchase)
     Job order line   = a supplier line on a job with no RFQ/PO number yet
     Stock order      = Robin's order tracker (gvc_porders); practice orders are listed apart and never counted
     Supply request   = gvc_requests (crew "Need supplies"); a request is not a purchase until it's ordered
   Internal numbers (RFQ-/PO-) and supplier references (quote / order-ack numbers) are always shown separately.
   Views: Needs action · Requests · Quotes · On order · Receiving · All (each count says what it counts). */
(()=>{
const role=()=>window.ME&&ME.role;
const isAdmin=()=>!role()||role()==="admin";
let view="action", q="";
const css=document.createElement("style");
css.textContent=`
.pur{max-width:1100px;display:flex;flex-direction:column;gap:12px}
.pur .phd{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;flex-wrap:wrap}
.pur h2.pt{margin:0;font:700 22px var(--font-ui,Inter,sans-serif);text-transform:none;letter-spacing:0;background:none;border:0;padding:0}
.pur .psum{color:var(--muted);font-size:14px;margin-top:2px}
.pur .pvs{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.pur .pvs button{flex:none;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--panel2,#1a1d21);color:var(--text);font:600 14px var(--font-ui,Inter,sans-serif);cursor:pointer;display:flex;align-items:center;gap:6px}
.pur .pvs button[aria-pressed=true]{border-color:var(--accent,#ff8a2a);color:var(--accent,#ff8a2a);background:rgba(255,138,42,.08)}
.pur .pvs b{font-weight:700;font-variant-numeric:tabular-nums}
.pur input[type=search]{font:inherit;font-size:15px;background:var(--panel2,#1a1d21);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-height:44px;width:100%;box-sizing:border-box}
.pur .prow{display:grid;grid-template-columns:4px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;text-align:left;padding:12px 12px 12px 0;border:1px solid var(--line);border-radius:12px;background:var(--panel2,#1a1d21);color:var(--text);font:inherit;cursor:pointer;overflow:hidden}
.pur .prow,.pur .prow .pm,.pur .prow .pdsc,.pur .prow .pref{white-space:normal!important;line-height:1.35}
.pur .prow .pn b{color:var(--text)}
.pur .prow .pdsc{color:#cfd5dc}
.pur .prow:hover{background:var(--panel3,#22262b)}
.pur .prow .pc{align-self:stretch;background:var(--c,#8e96a3)}
.pur .prow .pm{min-width:0}
.pur .prow .pn{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.pur .prow .pn b{font-size:15.5px}
.pur .kind{font:700 11px var(--font-ui,Inter,sans-serif);letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:6px;border:1px solid var(--line);color:var(--muted)}
.pur .kind.job{color:#9cc8ff;border-color:rgba(47,143,240,.5)}.pur .kind.line{color:#cfd8e3}.pur .kind.stock{color:#ffb36b;border-color:rgba(255,138,42,.45)}.pur .kind.req{color:#c9b6ff;border-color:rgba(155,123,255,.5)}
.pur .pdsc{font-size:13.5px;color:var(--muted);margin-top:3px;word-break:break-word}
.pur .pref{font-size:12.5px;color:var(--muted);margin-top:3px}
.pur .pref span{margin-right:10px}
.pur .pst{display:inline-block;line-height:1.3;font:600 13px var(--font-ui,Inter,sans-serif);color:var(--c,#cfd8e3);border:1px solid currentColor;border-radius:999px;padding:4px 10px;white-space:nowrap}
.pur .pna{display:inline-block;line-height:1.3;font:700 12px var(--font-ui,Inter,sans-serif);color:#111;background:var(--accent,#ff8a2a);border-radius:999px;padding:3px 9px;margin-left:6px;white-space:nowrap}
.pur .pempty{color:var(--muted);font-size:14px;padding:12px 2px}
.pur details.pprac>summary{list-style:none;cursor:pointer;min-height:44px;display:flex;align-items:center;color:var(--muted);font:600 14px var(--font-ui,Inter,sans-serif)}
.pur details.pprac>summary::-webkit-details-marker{display:none}
.pur .pnote{font-size:13px;color:var(--muted)}
@media (max-width:600px){ .pur .prow{grid-template-columns:4px minmax(0,1fr)} .pur .prow .pr{grid-column:2;justify-self:start} }
`;
document.head.appendChild(css);

const jobsAll=()=>[...(typeof jobs!=="undefined"?jobs:[]),...(typeof archivedJobs!=="undefined"?archivedJobs:[])];
const jobOf=id=>jobsAll().find(j=>j.id===id);
const jnum=j=>j&&window.jobNum?window.jobNum(j.name):"";
const ACT=x=>x&&!["dropped","declined","hold"].includes(x.status);
// supplier-line status -> bucket + label + whether it needs someone now
const LINE={sent:["quotes","Waiting for quote",0],replied:["quotes","Supplier replied",1],quote:["quotes","Quote in - pick / order",1],
  approved:["order","Ordered",0],production:["order","Being made",0],ready:["recv","Ready to pick up",1],arrived:["recv","Arrived - count it",1],received:["done","Received",0]};
const PORD={rfq:["quotes","Asked for quotes",0],compare:["quotes","Comparing quotes",1],ordered:["order","On order",0],shipped:["order","On its way",0],
  ready:["recv","Ready to pick up",1],delivered:["recv","Delivered - count it",1],received:["done","Received",0],cancelled:["done","Cancelled",0]};
const REQS={review:["req","Waiting for Kyle",1],approved:["req","Approved - to order",1],ordered:["order","Ordered",0],received:["done","Received",0],rejected:["done","Not approved",0],cancelled:["done","Cancelled",0]};
const RANK={recv:0,quotes:1,order:2,req:3,done:4};
const COL={quotes:"#22c3e6",order:"#9b4dff",recv:"#f5b041",req:"#9b7bff",done:"#3ad06b"};

// supplier references, without repeats ("Quote 60542492" and "60542492" are the same reference)
function refs(list){ const out=[], seen=new Set(); list.filter(Boolean).forEach(t=>{ const k=String(t).replace(/^\s*(quote|order|ack|#)\s*/i,"").trim().toLowerCase();
  if([...seen].some(x=>x.includes(k)||k.includes(x))) return; seen.add(k); out.push(String(t)); }); return out; }
function build(){
  const rows=[], used=new Set();
  const P=window.posAll?window.posAll():{list:[],loaded:false,linesOf:()=>[]};
  // 1) RFQ/PO documents with their job lines = one purchase each. An RFQ that became a PO shows once, as the PO.
  const recs=P.list.filter(r=>!["closed","cancelled"].includes(r.status));
  const poOfRfq=new Set(P.list.filter(r=>r.kind==="po"&&r.rfq_no).map(r=>r.rfq_no));
  recs.forEach(r=>{
    if(r.kind==="rfq"&&poOfRfq.has(r.no)) return;
    const L=P.linesOf(r).filter(({x})=>ACT(x));
    L.forEach(({j,x})=>used.add(j.id+"|"+x.id));
    const st=L.length?L.map(({x})=>LINE[x.status]||LINE.sent).sort((a,b)=>RANK[a[0]]-RANK[b[0]])[0]
      :r.status==="received"?LINE.received:r.status==="ready"?LINE.ready:r.status==="ordered"?LINE.approved:["quotes","Open",0];
    // confirmed by the supplier but no PO number made yet (e.g. RFQ-1004): that's on Kyle
    const needPo=r.kind==="rfq"&&L.some(({x})=>["approved","production","ready"].includes(x.status)&&!x.po);
    if(st[0]==="done") return;   // received - nothing left to buy or receive
    const js=(r.jobs||[]).map(jobOf).filter(Boolean);
    rows.push({kind:"job",kl:"Job order",no:r.no,title:r.title||"",vendor:r.vendor||(r.vendors||[]).join(", ")||(L[0]&&L[0].x.name)||"",
      jobs:js, refs:refs([r.vendor_ref,...L.map(({x})=>x.quoteNo)]), b:st[0], lab:needPo&&isAdmin()?"Needs a PO number":st[1], need:!!st[2]||(needPo&&isAdmin()),
      open:()=>window.openOrder?openOrder(r.no):window.openPo&&openPo(r.no), lines:L.length});
  });
  // 2) job supplier lines with no RFQ/PO document
  jobsAll().filter(j=>!j.archived).forEach(j=>(j.suppliers||[]).forEach(x=>{
    if(!ACT(x)||used.has(j.id+"|"+x.id)) return; const no=x.po||x.rfq; if(no&&P.list.some(r=>r.no===no)) return;
    const st=LINE[x.status]||LINE.sent; if(st[0]==="done") return;
    rows.push({kind:"line",kl:"Job order line",no:no||"",title:x.scope||"",vendor:x.name||"",jobs:[j],refs:x.quoteNo?[x.quoteNo]:[],b:st[0],lab:st[1],need:!!st[2],
      open:()=>window.openOrderLine?openOrderLine(j.id,x.id):openJob(j.id,"orders")});
  }));
  // 3) Robin's stock orders (practice ones kept apart)
  const O=window.pordersAll?window.pordersAll():{list:[],isPractice:()=>false};
  const prac=[];
  O.list.forEach(o=>{ const st=PORD[o.status]||PORD.rfq; const m=String(o.title||"").match(/^\s*(RFQ-\d+)\s*[·\-:]\s*(.*)$/i);
    const row={kind:"stock",kl:"Stock order",no:o.po||(m?m[1]:""),title:m?m[2]:(o.title||""),vendor:o.vendor||"",jobs:[],refs:[],b:st[0],lab:st[1],need:!!st[2],open:()=>window.pordersOpenId&&pordersOpenId(o.id),practice:O.isPractice(o)};
    if(row.practice) prac.push(row); else if(st[0]!=="done") rows.push(row); });
  // 4) supply requests (not purchases until ordered)
  (window.reqList?reqList():[]).forEach(r=>{ const st=REQS[r.status]||REQS.review; if(st[0]==="done") return;
    const j=r.job_id&&jobOf(r.job_id);
    rows.push({kind:"req",kl:"Supply request",no:"",title:`${r.what}${r.qty?" × "+r.qty:""}`,vendor:r.vendor||"",jobs:j?[j]:[],refs:[],b:st[0],lab:st[1],need:!!st[2]&&(r.status!=="review"||isAdmin()),
      sub:`Asked by ${r.who||"?"}${j?"":" · general supplies"}`,open:()=>window.reqGo&&reqGo(r.status==="review"?"review":r.status)}); });
  return {rows,prac,loaded:P.loaded};
}
const VIEWS=[["action","Needs action",r=>r.need],["req","Requests",r=>r.kind==="req"],["quotes","Quotes",r=>r.b==="quotes"],["order","On order",r=>r.b==="order"&&r.kind!=="req"],["recv","Receiving",r=>r.b==="recv"],["all","All open",()=>true]];
const hay=r=>[r.no,r.title,r.vendor,r.kl,r.lab,...r.refs,...r.jobs.map(j=>j.name)].join(" ").toLowerCase();
function rowHtml(r,i){
  const c=COL[r.b]||"#8e96a3";
  return `<button type="button" class="prow" data-pr="${i}" style="--c:${c}"><span class="pc"></span>
    <span class="pm"><span class="pn"><span class="kind ${r.kind}">${r.kl}</span>${r.no?`<b>${esc(r.no)}</b>`:""}<b style="font-weight:600">${esc(r.vendor||"")}</b></span>
      ${r.title?`<div class="pdsc">${esc(r.title)}</div>`:""}
      <div class="pref">${r.jobs.length?`<span>Job: ${r.jobs.map(j=>esc(jnum(j)||j.name)).join(", ")}</span>`:""}${r.refs.length?`<span>Supplier ref: ${r.refs.map(esc).join(", ")}</span>`:""}${r.sub?`<span>${esc(r.sub)}</span>`:""}${r.lines>1?`<span>${r.lines} job lines</span>`:""}</div></span>
    <span class="pr"><span class="pst">${esc(r.lab)}</span>${r.need?`<span class="pna">Needs action</span>`:""}</span></button>`;
}
let ROWS=[];
function render(){
  const B=$("#board"); B.className="home"; B.style.gridTemplateColumns="";
  const {rows,prac,loaded}=build();
  rows.sort((a,b)=>(b.need-a.need)||(RANK[a.b]-RANK[b.b])||String(a.no||a.title).localeCompare(String(b.no||b.title),undefined,{numeric:true}));
  const words=q.toLowerCase().split(/\s+/).filter(Boolean);
  const V=VIEWS.find(v=>v[0]===view)||VIEWS[0];
  ROWS=rows.filter(V[2]).filter(r=>words.every(w=>hay(r).includes(w)));
  const purchases=rows.filter(r=>r.kind!=="req");
  const nJob=purchases.filter(r=>r.kind==="job"||r.kind==="line").length, nStock=purchases.filter(r=>r.kind==="stock").length, nReq=rows.length-purchases.length;
  B.innerHTML=`<div class="pur shanim">
    <div class="phd"><div><h2 class="pt">Purchasing</h2>
      <div class="psum">${loaded?`${nJob} open job order${nJob===1?"":"s"} · ${nStock} stock order${nStock===1?"":"s"} · ${nReq} request${nReq===1?"":"s"}`:"Loading orders…"}</div></div>
      ${isAdmin()?`<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-pgo="pos">RFQs &amp; POs</button><button class="btn" type="button" data-pgo="ordering">Orders board</button></div>`:
        `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-pgo="porders">My order tracker</button></div>`}</div>
    <div class="pvs" role="group" aria-label="Show">${VIEWS.map(([k,t,f])=>`<button type="button" data-pv="${k}" aria-pressed="${view===k}">${t} <b>${rows.filter(f).length}</b></button>`).join("")}</div>
    <input type="search" id="purQ" placeholder="Find an order - number, supplier, job, supplier ref…" value="${esc(q)}" aria-label="Find an order">
    <details class="pnote"><summary style="cursor:pointer;min-height:32px">How these are counted</summary>Each row is one purchase: an RFQ/PO and the job lines that carry its number count once. Counts are open items only; requests aren't purchases until they're ordered; practice orders are never counted. RFQ-/PO- are our numbers - supplier quote and order-ack numbers show as "Supplier ref".</details>
    <div class="plist" style="display:flex;flex-direction:column;gap:8px">${ROWS.map(rowHtml).join("")||`<div class="pempty">${words.length?"Nothing matches.":view==="action"?"Nothing needs action right now.":"Nothing here."}</div>`}</div>
    ${prac.length?`<details class="pprac"><summary>Practice orders · ${prac.length} · not real, not counted ▸</summary><div style="display:flex;flex-direction:column;gap:8px">${prac.map(r=>`<div class="prow" style="--c:#6c727a;cursor:default;opacity:.75"><span class="pc"></span><span class="pm"><span class="pn"><span class="kind">Practice</span><b>${esc(r.no)}</b> ${esc(r.vendor)}</span><div class="pdsc">${esc(r.title)}</div></span></div>`).join("")}</div></details>`:""}
  </div>`;
  B.querySelectorAll("[data-pv]").forEach(b=>b.onclick=()=>{ view=b.dataset.pv; render(); const n=B.querySelector(`[data-pv="${view}"]`); if(n) n.focus(); });
  B.querySelectorAll("[data-pr]").forEach(b=>b.onclick=()=>{ const r=ROWS[+b.dataset.pr]; if(r&&r.open) r.open(); });
  B.querySelectorAll("[data-pgo]").forEach(b=>b.onclick=()=>{ const g=b.dataset.pgo; if(g==="porders"&&window.pordersGo) pordersGo("active"); else shellGo(g); });
  const qi=B.querySelector("#purQ"); qi.oninput=()=>{ q=qi.value; const p=qi.selectionStart; render(); const n=$("#purQ"); n.focus(); n.setSelectionRange(p,p); };
}
window.purchasingCounts=()=>{ try{ const {rows}=build(); return {action:rows.filter(r=>r.need).length}; }catch(e){ return {action:0}; } };
window.extraViews=Object.assign(window.extraViews||{},{purchasing:render});
// nav badge: open items that need someone
GVC.on("render:after",()=>{ const bd=document.getElementById("shPurN"); if(!bd) return; const n=window.purchasingCounts().action; bd.hidden=!n; bd.textContent=n; });
// lists load on their own timers - refresh the view when they arrive
let tries=0; const iv=setInterval(()=>{ tries++; if(typeof cur!=="undefined"&&cur==="purchasing"&&!(document.activeElement&&document.activeElement.id==="purQ")&&!document.querySelector("#scrim.on,.opanel.on,.shov.on")) render(); if(tries>6) clearInterval(iv); },1500);
})();
