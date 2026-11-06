/* ---------- Compare quotes, part by part (Kyle, 2026-11-05 v2) ----------
   Every quote / order ack is read ONCE into per-part prices (gvc_quote_parts) against the job's own part numbers
   (the DXFs we sent = gvc_job_parts):
     - a vendor that prices parts (Grandview) -> that part's price
     - a vendor that prices sheets / nests (Russel) -> the sheet cost shared over the parts of that metal+thickness by flat size (marked ~)
   Job card > Suppliers > Compare quotes opens the part table straight away (no email reading). "Read new quotes"
   finds quote PDFs for the job in Outlook and reads the ticked ones. Package totals and coverage sit above the table,
   so a vendor who only quoted PKG 2 and 3 isn't compared on totals against one who quoted everything. */
(()=>{
const st=document.createElement("style");
st.textContent=`
.cq h3{margin:0;font:600 20px Oswald,sans-serif;letter-spacing:.06em}
.cq .cqsub{color:var(--muted);font-size:12.5px;margin:2px 0 12px}
.cq .doc{display:flex;gap:10px;align-items:flex-start;padding:9px 10px;border:1px solid var(--line);border-radius:10px;margin-bottom:6px;background:rgba(0,0,0,.2);cursor:pointer}
.cq .doc input{margin-top:3px;width:18px;height:18px;accent-color:#ff8a2a}
.cq .doc b{font-size:14px;word-break:break-word}.cq .doc small{display:block;color:var(--muted);font-size:12px;margin-top:2px}
.cq .tg{font:600 10.5px Oswald,sans-serif;letter-spacing:.1em;padding:1px 6px;border-radius:5px;margin-left:4px;background:#2a2e34;color:#cfd3d8}.cq .tg.q{background:#ff8a2a;color:#111}.cq .tg.r{background:#3ad06b;color:#0b1a10}
.cq .vend{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-bottom:12px}
.cq .vc{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:#17191d}
.cq .vc .vn{font:600 15px Oswald,sans-serif;letter-spacing:.06em}.cq .vc .vt{font:600 20px Oswald,sans-serif;margin:2px 0}
.cq .vc small{display:block;color:var(--muted);font-size:12px;line-height:1.45}
.cq .cov{height:6px;border-radius:3px;background:#22252a;overflow:hidden;margin:6px 0 4px}.cq .cov i{display:block;height:100%;background:#22c3e6}
.cq .sumb{border-left:4px solid #ff8a2a;background:rgba(255,138,42,.08);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:14.5px;line-height:1.55}
.cq .sumb b{color:#fff}
.cq .bar3{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.cq .bar3 input[type=search]{flex:1;min-width:160px}
.cq .tw{overflow:auto;border:1px solid var(--line);border-radius:10px;max-height:62vh}
.cq table{width:100%;border-collapse:collapse;font-size:13px}
.cq th{position:sticky;top:0;background:#1b1d22;font:600 11px Oswald,sans-serif;letter-spacing:.1em;color:var(--muted);text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);z-index:1}
.cq td{padding:6px 8px;border-bottom:1px solid #22252a;vertical-align:top;white-space:nowrap}
.cq td.n{text-align:right;font-variant-numeric:tabular-nums}.cq td.low{color:#3ad06b;font-weight:600}.cq td.nq{color:#5c626a}
.cq td small{display:block;color:var(--muted);font-size:11px}
.cq tr.mh td{background:#15171a;font:600 12px Oswald,sans-serif;letter-spacing:.12em;color:#ffb36b;padding-top:10px}
.cq .wait{padding:30px 10px;text-align:center;color:var(--muted)}
.cq .prog{height:6px;border-radius:3px;background:#22252a;overflow:hidden;margin:12px auto 0;max-width:360px}.cq .prog i{display:block;height:100%;background:#ff8a2a}
`;
document.head.appendChild(st);
const toast=m=>{ if(typeof todoToast==="function"){ todoToast(m,null); const u=document.getElementById("toastUndo"); if(u) u.style.display="none"; } };
const fmtD=x=>{ try{ return new Date(String(x).length===10?x+"T12:00:00":x).toLocaleDateString("en-CA",{month:"short",day:"numeric"}); }catch(e){ return ""; } };
const kb=n=>n>1e6?(n/1e6).toFixed(1)+" MB":Math.max(1,Math.round((n||0)/1e3))+" KB";
const $$=n=>"$"+Number(n||0).toLocaleString("en-CA",{minimumFractionDigits:2,maximumFractionDigits:2});
const vkey=v=>String(v||"?").toLowerCase().split(/\s+/)[0];
function show(html){ openId=null; $("#dlg").innerHTML=`<div class="cq">${html}</div>`; $("#scrim").classList.add("on"); }
async function call(body){
  const r=await sb.functions.invoke("gvc-quotes",{body});
  if(r.error){ let m=r.error.message; try{ const t=await r.error.context.text(); try{ m=JSON.parse(t).error||t||m; }catch(e2){ m=t||m; } }catch(e){} if(/credit balance/i.test(m)) m="The Claude account the app uses is out of credit - top it up at console.anthropic.com (Plans & Billing), then try again."; throw new Error(m); }
  return r.data;
}
const close=`<button class="btn" type="button" onclick="closeDlg()">Close</button>`;
let state={jobId:null,data:null,q:"",multi:false};

window.compareQuotes=async jobId=>{
  state={jobId,data:null,q:"",multi:false};
  show(`<h3>COMPARE QUOTES</h3><div class="wait">Loading the prices on file…</div>`);
  try{ state.data=await call({action:"parts_table",job_id:jobId}); }catch(e){ return err(e); }
  if(!state.data.prices.length&&!state.data.docs.length) return readNew();
  table();
};
function err(e){ show(`<h3>COMPARE QUOTES</h3><div class="err" style="margin:12px 0">${esc(e.message)}</div><div class="row"><button class="btn ghost" type="button" id="cqBack">← Job</button><span style="flex:1"></span>${close}</div>`); $("#cqBack").onclick=()=>openJob(state.jobId); }

/* find quote PDFs for the job and read the ticked ones into per-part prices */
async function readNew(){
  const jobId=state.jobId;
  show(`<h3>READ QUOTES</h3><div class="wait">Looking through Outlook for quotes on this job…</div>`);
  let f; try{ f=await call({action:"find",job_id:jobId}); }catch(e){ return err(e); }
  const read=new Set((state.data?state.data.docs:[]).map(d=>d.source));
  const docs=(f.docs||[]).filter(d=>d.type!=="document"||d.likely);
  show(`<h3>READ QUOTES</h3><div class="cqsub">${esc(f.job)} · tick the quotes and order acks to break down into part prices. Each one is read once and kept.</div>
    ${docs.map((d,i)=>{ const done=read.has(d.id); return `<label class="doc"><input type="checkbox" data-q="${i}" ${!done&&(d.type==="quote"||d.type==="order ack")?"checked":""}><span><b>${esc(d.name)}</b><span class="tg ${d.type==="quote"?"q":""}">${esc((d.type||"").toUpperCase())}</span>${done?`<span class="tg r">READ</span>`:""}<small>${esc(d.from)} · ${fmtD(d.at)} · ${kb(d.size)}${d.subject?` · ${esc(d.subject)}`:""}</small></span></label>`; }).join("")||`<div class="tnote">No quote documents found in Outlook for this job's number, quote numbers or name.</div>`}
    <div class="row" style="margin-top:12px;gap:8px"><button class="btn ghost" type="button" id="cqBack">← ${state.data&&state.data.prices.length?"Part table":"Job"}</button><span style="flex:1"></span>${docs.length?`<button class="btn primary" type="button" id="cqGo">Read ticked</button>`:""}${close}</div>`);
  $("#cqBack").onclick=()=>state.data&&state.data.prices.length?table():openJob(jobId);
  const go=$("#cqGo"); if(!go) return;
  go.onclick=async()=>{
    const pick=[...document.querySelectorAll("[data-q]:checked")].map(x=>docs[+x.dataset.q]);
    if(!pick.length){ toast("Tick at least one"); return; }
    const failed=[];
    for(let i=0;i<pick.length;i++){
      show(`<h3>READ QUOTES</h3><div class="wait">Reading ${i+1} of ${pick.length}: ${esc(pick[i].name)}<br><small>matching every line to your part numbers - about 30 seconds each</small><div class="prog"><i style="width:${Math.round(i/pick.length*100)}%"></i></div></div>`);
      try{ await call({action:"extract",doc:pick[i].id,job_id:jobId}); }catch(e){ if(/out of credit/.test(e.message)) return err(e); failed.push(pick[i].name+" ("+e.message.slice(0,80)+")"); }
    }
    try{ state.data=await call({action:"parts_table",job_id:jobId}); }catch(e){ return err(e); }
    state.failed=failed; table();
  };
}

function build(){
  const D=state.data; const parts=D.parts||[]; const P=D.prices||[];
  // vendor -> part -> latest price (a vendor's several packages merge)
  const V={}, names={};
  P.slice().sort((a,b)=>String(a.doc_date||"").localeCompare(String(b.doc_date||""))).forEach(r=>{ const v=vkey(r.vendor); names[v]=names[v]||r.vendor; (V[v]=V[v]||{})[String(r.part_no).toUpperCase()]=r; });
  const vs=Object.keys(V).sort((a,b)=>Object.keys(V[b]).length-Object.keys(V[a]).length);
  return {parts,V,vs,names};
}
function table(){
  const {parts,V,vs,names}=build(); const D=state.data; const N=parts.length;
  const docsBy={}; (D.docs||[]).forEach(d=>(docsBy[vkey(d.vendor)]=docsBy[vkey(d.vendor)]||[]).push(d));
  // coverage + like-for-like + best mix
  const priced=p=>vs.filter(v=>V[v][String(p.part_no).toUpperCase()]);
  const common=parts.filter(p=>vs.length>1&&priced(p).length===vs.length);
  const tot=(v,list)=>list.reduce((s,p)=>s+(Number((V[v][String(p.part_no).toUpperCase()]||{}).line_total)||0),0);
  let mix=0, mixN=0; const wins={}; parts.forEach(p=>{ const c=priced(p).map(v=>[v,Number(V[v][String(p.part_no).toUpperCase()].line_total)||0]).filter(x=>x[1]>0); if(!c.length) return; c.sort((a,b)=>a[1]-b[1]); mix+=c[0][1]; mixN++; if(c.length>1) wins[c[0][0]]=(wins[c[0][0]]||0)+1; });
  const missing=v=>{ const by={}; parts.forEach(p=>{ if(!V[v][String(p.part_no).toUpperCase()]) by[p.material||"?"]=(by[p.material||"?"]||0)+1; }); return by; };
  const cards=vs.map(v=>{ const n=Object.keys(V[v]).filter(k=>parts.some(p=>String(p.part_no).toUpperCase()===k)).length; const split=Object.values(V[v]).filter(r=>r.how==="split").length;
    const m=missing(v); const mk=Object.keys(m);
    return `<div class="vc"><div class="vn">${esc(names[v])}</div><div class="vt">${$$(tot(v,parts))}</div>
      <div class="cov"><i style="width:${N?Math.round(n/N*100):0}%"></i></div><small><b style="color:#e9e6e1">${n} of ${N} parts priced</b>${split?` · ${split} from sheet prices (~)`:""}${wins[v]?` · cheapest on ${wins[v]}`:""}</small>
      ${(docsBy[v]||[]).map(d=>`<small>${esc(d.doc_type||"")} ${esc(d.doc_no||d.doc_name||"")} · ${fmtD(d.doc_date)} · document total ${$$(d.total)}</small>`).join("")}
      ${mk.length?`<small style="color:#ff9b91">Not priced: ${mk.slice(0,4).map(k=>`${m[k]} × ${esc(k)}`).join(", ")}${mk.length>4?"…":""}</small>`:""}</div>`; }).join("");
  const sum=vs.length>1?`<div class="sumb">${common.length?`On the <b>${common.length} parts everyone priced</b>: ${vs.map(v=>`${esc(names[v])} <b>${$$(tot(v,common))}</b>`).join(" vs ")}.`:`<b>No part was priced by every vendor</b> - their quotes cover different parts, so only part-by-part prices compare.`}
      ${mixN?` Buying each part from whoever is cheapest: <b>${$$(mix)}</b> for ${mixN} parts.`:""}</div>`:"";
  // rows grouped by material
  const q=state.q.trim().toLowerCase();
  const rows=parts.filter(p=>(!q||String(p.part_no).toLowerCase().includes(q)||String(p.material||"").toLowerCase().includes(q))&&(!state.multi||priced(p).length>1))
    .sort((a,b)=>String(a.material).localeCompare(String(b.material),undefined,{numeric:true})||String(a.part_no).localeCompare(String(b.part_no),undefined,{numeric:true}));
  let last=null;
  const body=rows.map(p=>{ const k=String(p.part_no).toUpperCase(); const ps=vs.map(v=>V[v][k]); const vals=ps.map(r=>r?Number(r.line_total)||0:null).filter(x=>x!=null&&x>0);
    const lo=vals.length>1?Math.min(...vals):null, hi=vals.length>1?Math.max(...vals):null;
    const head=p.material!==last?`<tr class="mh"><td colspan="${3+vs.length}">${esc(p.material||"?")}</td></tr>`:""; last=p.material;
    return head+`<tr><td>${esc(p.part_no)}</td><td class="n">${p.qty??""}</td>${ps.map(r=>!r?`<td class="n nq">-</td>`:`<td class="n ${lo!=null&&Number(r.line_total)===lo?"low":""}" title="${esc(r.note||"")}">${r.how==="split"?"~":""}${$$(r.line_total)}${(Number(r.qty)||1)>1?`<small>${r.how==="split"?"~":""}${$$(r.unit_price)} ea</small>`:""}</td>`).join("")}
      <td class="n">${lo!=null?`${$$(hi-lo)}<small>${Math.round((hi-lo)/lo*100)}%</small>`:""}</td></tr>`; }).join("");
  show(`<h3>COMPARE QUOTES · BY PART</h3><div class="cqsub">${esc(D.job_no||"")} · ${N} parts on the job · ${vs.length} vendor${vs.length===1?"":"s"} · ~ = shared from a sheet price by part size</div>
    ${state.failed&&state.failed.length?`<div class="err" style="margin-bottom:10px">Couldn't read: ${state.failed.map(esc).join("; ")}</div>`:""}
    ${!N?`<div class="tnote" style="margin-bottom:10px">This job has no parts list yet, so prices can't be matched to parts. Hardware and stock prices are in More → Prices.</div>`:""}
    <div class="vend">${cards||`<div class="tnote">No quotes read for this job yet.</div>`}</div>${sum}
    ${N&&vs.length?`<div class="bar3"><input type="search" id="cqQ" placeholder="Find a part or material" value="${esc(state.q)}"><label style="display:flex;flex-direction:row;gap:6px;align-items:center;font-size:13px;margin:0"><input type="checkbox" id="cqM" ${state.multi?"checked":""} style="width:18px;height:18px"> Only parts with 2+ prices</label></div>
    <div class="tw"><table><thead><tr><th>Part</th><th style="text-align:right">Qty</th>${vs.map(v=>`<th style="text-align:right">${esc(names[v])}</th>`).join("")}<th style="text-align:right">Spread</th></tr></thead><tbody>${body}</tbody></table></div>`:""}
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap"><button class="btn ghost" type="button" id="cqBack">← Job</button><button class="btn primary" type="button" id="cqRead">Read new quotes</button><button class="btn" type="button" id="cqPrint">Print / PDF</button><span style="flex:1"></span>${close}</div>`);
  $("#cqBack").onclick=()=>openJob(state.jobId); $("#cqRead").onclick=readNew;
  const qi=$("#cqQ"); if(qi) qi.oninput=()=>{ state.q=qi.value; clearTimeout(qi._t); qi._t=setTimeout(()=>{ const pos=qi.selectionStart; table(); const n=$("#cqQ"); if(n){ n.focus(); n.setSelectionRange(pos,pos); } },250); };
  const mc=$("#cqM"); if(mc) mc.onchange=()=>{ state.multi=mc.checked; table(); };
  $("#cqPrint").onclick=()=>{ const w=window.open("","_blank"); if(!w){ toast("Allow pop-ups to print"); return; }
    const h=document.querySelector(".cq").cloneNode(true); h.querySelectorAll(".row,.bar3").forEach(x=>x.remove());
    w.document.write(`<!doctype html><html><head><title>Quotes by part - ${esc(D.job_no||"")}</title><style>body{font:12px Arial,sans-serif;margin:20px;color:#111}h3{font-size:18px;margin:0}.cqsub{color:#555;margin:4px 0 10px}.vend{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}.vc{border:1px solid #ccc;border-radius:8px;padding:8px 10px;min-width:200px}.vn{font-weight:bold}.vt{font-size:16px;font-weight:bold}small{display:block;color:#555}.cov{display:none}.sumb{border-left:4px solid #e8711a;padding:6px 10px;background:#fff4ea;margin-bottom:10px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:3px 6px;text-align:left}td.n{text-align:right}td.low{color:#1a7d3a;font-weight:bold}tr.mh td{background:#eee;font-weight:bold}.tw{max-height:none;overflow:visible}</style></head><body>${h.innerHTML}<script>setTimeout(()=>print(),300)<\/script></body></html>`); w.document.close(); };
}
})();
