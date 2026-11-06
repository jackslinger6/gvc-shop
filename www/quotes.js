/* ---------- Compare quotes (Kyle, 2026-11-05) ----------
   Job card > Suppliers > "Compare quotes". Finds the quote PDFs for the job in Outlook (job #, quote #s, job name)
   plus quote files already saved on the job, lets Kyle tick which ones, then Claude reads them and reports:
   totals per vendor, every item lined up with who's cheaper and by how much, extras/lead/terms, gaps.
   Report only - nothing is saved to the database. Print button for paper/PDF. */
(()=>{
const st=document.createElement("style");
st.textContent=`
.cq h3{margin:0;font:600 20px Oswald,sans-serif;letter-spacing:.06em}
.cq .sub{color:var(--muted);font-size:12.5px;margin:2px 0 12px}
.cq .doc{display:flex;gap:10px;align-items:flex-start;padding:9px 10px;border:1px solid var(--line);border-radius:10px;margin-bottom:6px;background:rgba(0,0,0,.2);cursor:pointer}
.cq .doc input{margin-top:3px;width:18px;height:18px;accent-color:#ff8a2a}
.cq .doc b{font-size:14px;word-break:break-word}.cq .doc small{display:block;color:var(--muted);font-size:12px;margin-top:2px}
.cq .sum{white-space:pre-wrap;font-size:15px;line-height:1.5;border-left:4px solid #ff8a2a;background:rgba(255,138,42,.08);border-radius:8px;padding:10px 12px;margin-bottom:12px}
.cq .vend{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:14px}
.cq .vc{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:#17191d}
.cq .vc.best{border-color:#3ad06b;box-shadow:0 0 0 1px #3ad06b inset}
.cq .vc .vn{font:600 15px Oswald,sans-serif;letter-spacing:.06em}.cq .vc .vt{font:600 22px Oswald,sans-serif;margin:2px 0}
.cq .vc small{display:block;color:var(--muted);font-size:12px;line-height:1.4}
.cq .tag{display:inline-block;font:600 10.5px Oswald,sans-serif;letter-spacing:.12em;padding:1px 6px;border-radius:5px;background:#3ad06b;color:#111;margin-left:6px;vertical-align:2px}
.cq table{width:100%;border-collapse:collapse;font-size:13.5px}
.cq th{font:600 11px Oswald,sans-serif;letter-spacing:.12em;color:var(--muted);text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
.cq td{padding:7px 8px;border-bottom:1px solid #22252a;vertical-align:top}
.cq td.low{color:#3ad06b;font-weight:600}.cq td.nq{color:var(--dim)}
.cq td small{display:block;color:var(--muted);font-size:11.5px}
.cq .tw{overflow-x:auto;border:1px solid var(--line);border-radius:10px}
.cq ul{margin:6px 0 0 18px;padding:0;font-size:14px;line-height:1.5}
.cq .h{font:600 13px Oswald,sans-serif;letter-spacing:.14em;color:#ffb36b;margin:14px 0 6px}
.cq .wait{padding:30px 10px;text-align:center;color:var(--muted)}
`;
document.head.appendChild(st);
const fmtD=x=>{ try{ return new Date(x).toLocaleDateString("en-CA",{month:"short",day:"numeric"}); }catch(e){ return ""; } };
const kb=n=>n>1e6?(n/1e6).toFixed(1)+" MB":Math.max(1,Math.round((n||0)/1e3))+" KB";
function show(html){ openId=null; $("#dlg").innerHTML=`<div class="cq">${html}</div>`; $("#scrim").classList.add("on"); }
async function call(body){
  const r=await sb.functions.invoke("gvc-quotes",{body});
  if(r.error){ let m=r.error.message; try{ const j=await r.error.context.json(); m=j.error||m; }catch(e){} throw new Error(m); }
  return r.data;
}
const close=`<button class="btn" type="button" onclick="closeDlg()">Close</button>`;
window.compareQuotes=async jobId=>{
  const back=()=>openJob(jobId);
  show(`<h3>COMPARE QUOTES</h3><div class="wait">Looking through Outlook for quotes on this job…</div>`);
  let f;
  try{ f=await call({action:"find",job_id:jobId}); }
  catch(e){ show(`<h3>COMPARE QUOTES</h3><div class="err" style="margin:12px 0">${esc(e.message)}</div><div class="row"><button class="btn ghost" type="button" id="cqBack">← Job</button><span style="flex:1"></span>${close}</div>`); $("#cqBack").onclick=back; return; }
  const docs=f.docs||[];
  show(`<h3>COMPARE QUOTES</h3><div class="sub">${esc(f.job)} · ${docs.length?`found ${docs.length} document${docs.length>1?"s":""} - tick the quotes to compare`:"no quote documents found"}</div>
    ${docs.map((d,i)=>`<label class="doc"><input type="checkbox" data-q="${i}" ${d.likely?"checked":""}><span><b>${esc(d.name)}</b><small>${esc(d.from)} · ${fmtD(d.at)} · ${kb(d.size)}${d.subject?` · ${esc(d.subject)}`:""}</small></span></label>`).join("")||
      `<div class="tnote">Nothing in Outlook mentions this job's number, its quote numbers or its name with a PDF attached. If a quote came under another subject, forward it to yourself with the job number in the subject and try again.</div>`}
    <div class="row" style="margin-top:12px;gap:8px"><button class="btn ghost" type="button" id="cqBack">← Job</button><span style="flex:1"></span>${docs.length?`<button class="btn primary" type="button" id="cqGo">Compare</button>`:""}${close}</div>`);
  $("#cqBack").onclick=back;
  const go=$("#cqGo"); if(!go) return;
  go.onclick=async()=>{
    const ids=[...document.querySelectorAll("[data-q]:checked")].map(x=>docs[+x.dataset.q].id);
    if(!ids.length){ toast("Tick at least one quote"); return; }
    show(`<h3>COMPARE QUOTES</h3><div class="wait">Reading ${ids.length} quote${ids.length>1?"s":""} and lining up the prices… (about a minute)</div>`);
    let c;
    try{ c=await call({action:"compare",job_id:jobId,docs:ids}); }
    catch(e){ show(`<h3>COMPARE QUOTES</h3><div class="err" style="margin:12px 0">${esc(e.message)}</div><div class="row"><button class="btn ghost" type="button" id="cqBack">← Job</button><span style="flex:1"></span>${close}</div>`); $("#cqBack").onclick=back; return; }
    report(c,jobId);
  };
};
function report(c,jobId){
  const R=c.report||{}, V=R.vendors||[], L=R.lines||[], G=R.gaps||[];
  const nums=V.map(v=>typeof v.total_num==="number"&&v.total_num>0?v.total_num:null);
  const best=nums.filter(x=>x!=null).length>1?Math.min(...nums.filter(x=>x!=null)):null;
  const vnames=V.map(v=>v.name);
  const body=`<h3>QUOTE COMPARISON</h3><div class="sub">${esc(c.job)} · ${fmtD(new Date())} · from ${c.used.map(esc).join(", ")}</div>
    <div class="sum">${esc(R.summary||"")}</div>
    <div class="vend">${V.map((v,i)=>`<div class="vc ${best!=null&&nums[i]===best?"best":""}"><div class="vn">${esc(v.name)}${best!=null&&nums[i]===best?`<span class="tag">LOWEST</span>`:""}</div>
      <div class="vt">${esc(v.total||"-")}</div>${best!=null&&nums[i]!=null&&nums[i]!==best?`<small style="color:#ff9b91">+$${(nums[i]-best).toLocaleString("en-CA",{maximumFractionDigits:2})} (${Math.round((nums[i]-best)/best*100)}%)</small>`:""}
      <small>${[v.quote_no?"Quote #"+esc(v.quote_no):"",v.date?esc(v.date):"",v.lead?"Lead: "+esc(v.lead):""].filter(Boolean).join(" · ")}</small>${v.terms?`<small>${esc(v.terms)}</small>`:""}</div>`).join("")}</div>
    ${L.length?`<div class="h">LINE BY LINE</div><div class="tw"><table><thead><tr><th>Item</th><th>Qty</th>${vnames.map(n=>`<th>${esc(n)}</th>`).join("")}<th>Difference</th></tr></thead><tbody>
      ${L.map(l=>{ const p={}; (l.prices||[]).forEach(x=>p[x.vendor]=x); return `<tr><td>${esc(l.item)}${l.note?`<small>${esc(l.note)}</small>`:""}</td><td>${esc(l.qty||"")}</td>
        ${vnames.map(n=>{ const x=p[n]||Object.values(p).find(y=>String(y.vendor).toLowerCase().split(/\s/)[0]===String(n).toLowerCase().split(/\s/)[0]); const nq=!x||/not quoted|^-?$/i.test(x.price||"");
          return `<td class="${nq?"nq":l.low&&String(l.low).toLowerCase().split(/\s/)[0]===String(n).toLowerCase().split(/\s/)[0]?"low":""}">${nq?"not quoted":esc(x.price)}${x&&x.unit&&!nq?`<small>${esc(x.unit)}</small>`:""}</td>`; }).join("")}
        <td>${esc(l.diff||"")}</td></tr>`; }).join("")}</tbody></table></div>`:""}
    ${G.length?`<div class="h">CHECK BEFORE YOU PICK</div><ul>${G.map(g=>`<li>${esc(g)}</li>`).join("")}</ul>`:""}`;
  show(body+`<div class="row" style="margin-top:14px;gap:8px"><button class="btn ghost" type="button" id="cqBack">← Job</button><button class="btn" type="button" id="cqPrint">Print / PDF</button><span style="flex:1"></span>${close}</div>`);
  $("#cqBack").onclick=()=>openJob(jobId);
  $("#cqPrint").onclick=()=>{ const w=window.open("","_blank"); if(!w){ toast("Allow pop-ups to print"); return; }
    w.document.write(`<!doctype html><html><head><title>Quote comparison - ${esc(c.job)}</title><style>body{font:13px Arial,sans-serif;margin:24px;color:#111}h3{font-size:20px;margin:0}.sub{color:#555;margin:4px 0 12px}.sum{white-space:pre-wrap;border-left:4px solid #e8711a;padding:8px 12px;background:#fff4ea;margin-bottom:12px}.vend{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}.vc{border:1px solid #ccc;border-radius:8px;padding:8px 10px;min-width:180px}.vc.best{border:2px solid #1a9d4a}.vn{font-weight:bold}.vt{font-size:18px;font-weight:bold}.tag{background:#1a9d4a;color:#fff;font-size:10px;padding:1px 5px;border-radius:4px;margin-left:6px}small{display:block;color:#555}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}th{background:#eee}td.low{color:#1a7d3a;font-weight:bold}td.nq{color:#999}.h{font-weight:bold;margin:14px 0 6px;letter-spacing:.1em}.row{display:none}</style></head><body>${body}<script>setTimeout(()=>print(),300)<\/script></body></html>`); w.document.close(); };
}
})();
