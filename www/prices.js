/* ---------- Price history (Kyle, 2026-11-05) ----------
   More > Prices. Every priced line read off vendor quotes / order acks / invoices lives in gvc_prices (tiny rows).
   - Search by size, material or our part number ("2x2x1/8", "HSS", "CENTERLOC")
   - One card per size: latest price per vendor, a chart of price over time (one line per vendor), every line below
   - "Read prices from email": finds vendor PDFs in Outlook not read yet and reads them one at a time (progress shown)
   Long products are compared in $/ft so a 20' and a 24' stick line up. */
(()=>{
const st=document.createElement("style");
st.textContent=`
.pr h3{margin:0;font:600 20px Oswald,sans-serif;letter-spacing:.06em}
.pr .bar2{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.pr .bar2 input{flex:1;min-width:180px}
.pr .chips2{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.pr .chips2 button{border:1px solid #33373e;background:rgba(255,255,255,.04);color:#cfd3d8;border-radius:999px;padding:5px 11px;font:500 12.5px Inter,sans-serif;cursor:pointer}
.pr .chips2 button.on{border-color:#ff8a2a;color:#ffb36b;background:rgba(255,138,42,.12)}
.pr .grp{border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:12px;background:#15171a}
.pr .gh{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.pr .gh b{font:600 17px Oswald,sans-serif;letter-spacing:.04em}.pr .gh small{color:var(--muted);font-size:12px}
.pr .lat{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.pr .lv{border:1px solid #2a2e34;border-radius:10px;padding:6px 10px;min-width:130px}.pr .lv .k{display:flex;align-items:center;gap:6px;font-size:12px;color:#cfd3d8}
.pr .lv .k i{width:10px;height:10px;border-radius:3px;display:inline-block}.pr .lv .v{font:600 18px Oswald,sans-serif;color:#f0efec}.pr .lv small{display:block;color:var(--muted);font-size:11.5px}
.pr .lv.best{border-color:#3ad06b}
.pr .ch{position:relative;margin:6px 0 4px}.pr .ch svg{display:block;width:100%;max-width:720px;height:auto}
.pr .tip{position:absolute;pointer-events:none;background:#0c0d10;border:1px solid #3a3e45;border-radius:8px;padding:6px 8px;font-size:12px;color:#f0efec;white-space:nowrap;transform:translate(-50%,-110%);display:none}
.pr table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px}.pr th{font:600 10.5px Oswald,sans-serif;letter-spacing:.12em;color:var(--muted);text-align:left;padding:5px 6px;border-bottom:1px solid var(--line)}
.pr td{padding:5px 6px;border-bottom:1px solid #22252a;color:#cfd3d8}.pr td.n{text-align:right;font-variant-numeric:tabular-nums}
.pr details summary{cursor:pointer;color:var(--muted);font-size:12.5px;margin-top:4px}
.pr .prog{height:6px;border-radius:3px;background:#22252a;overflow:hidden;margin:8px 0}.pr .prog i{display:block;height:100%;background:#ff8a2a;width:0;transition:width .3s}
`;
document.head.appendChild(st);
// vendor colours: validated categorical palette (dark steps, checked against the app surface), fixed order by vendor name - colour follows the vendor
const PAL=["#3987e5","#d95926","#199e70","#c98500","#d55181","#9085e9"];
let rows=[], vendors=[], q="", kind="", loaded=false;
const money=n=>n==null?"-":"$"+Number(n).toLocaleString("en-CA",{minimumFractionDigits:2,maximumFractionDigits:2});
const vcol=v=>{ const i=vendors.indexOf(v); return i>=0&&i<PAL.length?PAL[i]:"#8e96a3"; };
const vshort=v=>String(v||"").replace(/\b(metals?|fabrication|inc\.?|ltd\.?|corp\.?|industries)\b/gi,"").trim()||v;
async function load(){ const r=await sb.from("gvc_prices").select("*").order("doc_date",{ascending:true}).limit(5000); rows=r.data||[]; vendors=[...new Set(rows.map(x=>x.vendor))].sort(); loaded=true; }
const keyOf=r=>(r.size||r.part_no||r.item||"").toUpperCase().replace(/\s+/g," ").trim();
const price=r=>r.per_ft!=null?r.per_ft:r.unit_price!=null?r.unit_price:(r.line_total&&r.qty?r.line_total/r.qty:null);
const unitLab=g=>g.some(r=>r.per_ft!=null)?"$/ft":"$/"+((g.find(r=>r.unit)||{}).unit||"ea");
function chart(g,lab){
  const pts=g.filter(r=>price(r)!=null&&r.doc_date).map(r=>({d:new Date(r.doc_date+"T12:00:00").getTime(),p:price(r),v:r.vendor,r}));
  if(pts.length<2) return "";
  const W=innerWidth<600?360:640,H=innerWidth<600?190:200,L=56,Rr=innerWidth<600?64:96,T=12,B=26;
  const d0=Math.min(...pts.map(p=>p.d)), d1=Math.max(...pts.map(p=>p.d))||d0+1, p1=Math.max(...pts.map(p=>p.p))*1.1;
  const x=d=>L+(d1===d0?0.5:(d-d0)/(d1-d0))*(W-L-Rr), y=p=>T+(1-p/p1)*(H-T-B);
  const ticks=[0,p1/2,p1].map(v=>`<line x1="${L}" x2="${W-Rr}" y1="${y(v)}" y2="${y(v)}" stroke="#2a2e34" stroke-width="1"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="#9aa0a8">${money(v)}</text>`).join("");
  const dl=t=>new Date(t).toLocaleDateString("en-CA",{month:"short",day:"numeric",year:d1-d0>300*864e5?"2-digit":undefined});
  const xt=`<text x="${L}" y="${H-6}" font-size="11" fill="#9aa0a8">${dl(d0)}</text>${d1!==d0?`<text x="${W-Rr}" y="${H-6}" text-anchor="end" font-size="11" fill="#9aa0a8">${dl(d1)}</text>`:""}`;
  const byV={}; pts.forEach(p=>(byV[p.v]=byV[p.v]||[]).push(p));
  const lines=Object.entries(byV).map(([v,ps])=>{ ps.sort((a,b)=>a.d-b.d); const c=vcol(v); const last=ps[ps.length-1];
    return `${ps.length>1?`<polyline fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" points="${ps.map(p=>x(p.d)+","+y(p.p)).join(" ")}"/>`:""}
      ${ps.map(p=>`<circle cx="${x(p.d)}" cy="${y(p.p)}" r="4.5" fill="${c}" stroke="#15171a" stroke-width="2" data-t="${esc(vshort(v))} · ${dl(p.d)} · ${money(p.p)} ${lab.replace("$","")}${p.r.doc_no?" · #"+esc(p.r.doc_no):""}"/><circle cx="${x(p.d)}" cy="${y(p.p)}" r="12" fill="transparent" data-t="${esc(vshort(v))} · ${dl(p.d)} · ${money(p.p)} ${lab.replace("$","")}${p.r.doc_no?" · #"+esc(p.r.doc_no):""}"/>`).join("")}
      <text x="${x(last.d)+8}" y="${y(last.p)+4}" font-size="11.5" fill="#e9e6e1">${esc(vshort(v))}</text>`; }).join("");
  return `<div class="ch"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Price over time, ${lab}">${ticks}${xt}${lines}</svg><div class="tip"></div></div>`;
}
function groups(){
  const qq=q.trim().toLowerCase().replace(/\s+/g," ");
  const f=rows.filter(r=>(!kind||r.kind===kind)&&(!qq||[r.size,r.item,r.part_no,r.material,r.vendor].join(" ").toLowerCase().replace(/\s+/g," ").includes(qq)));
  const by={}; f.forEach(r=>{ const k=keyOf(r)+"|"+(r.kind||""); (by[k]=by[k]||[]).push(r); });
  return Object.values(by).sort((a,b)=>b.length-a.length||String(b[b.length-1].doc_date).localeCompare(String(a[a.length-1].doc_date)));
}
function grpHtml(g){
  const lab=unitLab(g); const head=g[0];
  const latest={}; g.forEach(r=>{ if(price(r)!=null) latest[r.vendor]=r; });
  const lv=Object.values(latest); const best=lv.length>1?Math.min(...lv.map(price)):null;
  return `<div class="grp"><div class="gh"><b>${esc(head.size||head.part_no||head.item)}</b><small>${esc([head.kind,head.material].filter(Boolean).join(" · "))} · ${g.length} price${g.length>1?"s":""} · ${lab}</small></div>
    <div class="lat">${lv.map(r=>`<div class="lv ${best!=null&&price(r)===best?"best":""}"><div class="k"><i style="background:${vcol(r.vendor)}"></i>${esc(vshort(r.vendor))}${best!=null&&price(r)===best?" · lowest":""}</div><div class="v">${money(price(r))}</div><small>latest ${esc(r.doc_date||"")}${r.length_ft?` · ${r.length_ft}' length`:""}</small></div>`).join("")}</div>
    ${chart(g,lab)}
    <details><summary>All ${g.length} lines</summary><table><thead><tr><th>Date</th><th>Vendor</th><th>Doc</th><th>Item</th><th class="n">Qty</th><th class="n">Price</th><th class="n">${lab}</th></tr></thead><tbody>
      ${g.slice().reverse().map(r=>`<tr><td>${esc(r.doc_date||"")}</td><td>${esc(vshort(r.vendor))}</td><td>${esc(r.doc_type||"")} ${esc(r.doc_no||"")}</td><td>${esc(r.item)}${r.length_ft?` (${r.length_ft}')`:""}</td><td class="n">${r.qty??""}</td><td class="n">${money(r.line_total)}</td><td class="n">${money(price(r))}</td></tr>`).join("")}</tbody></table></details></div>`;
}
const KINDS=[["","All"],["tube","Tube"],["angle","Angle"],["channel","Channel"],["flat bar","Flat bar"],["plate","Plate"],["sheet","Sheet"],["round","Round"],["pipe","Pipe"],["beam","Beam"],["laser part","Laser parts"]];
function draw(){
  const G=groups();
  $("#dlg").innerHTML=`<div class="pr"><h3>PRICE HISTORY</h3><div class="tnote" style="margin-top:2px">${rows.length} priced lines from ${new Set(rows.map(r=>r.source)).size} documents · ${vendors.length} vendor${vendors.length===1?"":"s"}</div>
    <div class="bar2"><input id="prQ" placeholder="Search: 2x2x1/8, HSS 4x4, angle, 304, CENTERLOC…" value="${esc(q)}"><button class="btn" type="button" id="prScan">Read prices from email</button><button class="btn" type="button" onclick="closeDlg()">Close</button></div>
    <div class="chips2">${KINDS.map(([k,t])=>`<button type="button" data-k="${k}" class="${kind===k?"on":""}">${t}</button>`).join("")}</div>
    <div id="prScanBox"></div>
    ${G.length?G.slice(0,40).map(grpHtml).join(""):`<div class="tnote">${rows.length?"Nothing matches that.":"No prices yet. Tap “Read prices from email” - it reads your vendors' quotes, order acknowledgements and invoices into here."}</div>`}
    ${G.length>40?`<div class="tnote">Showing 40 of ${G.length} sizes - search to narrow it down.</div>`:""}</div>`;
  const qi=$("#prQ"); qi.oninput=()=>{ q=qi.value; clearTimeout(qi._t); qi._t=setTimeout(()=>{ const pos=qi.selectionStart; draw(); const n=$("#prQ"); n.focus(); n.setSelectionRange(pos,pos); },250); };
  document.querySelectorAll(".pr [data-k]").forEach(b=>b.onclick=()=>{ kind=b.dataset.k; draw(); });
  $("#prScan").onclick=scanUI;
  document.querySelectorAll(".pr .ch").forEach(ch=>{ const tip=ch.querySelector(".tip"); ch.querySelectorAll("[data-t]").forEach(c=>{
    c.onmouseenter=c.onclick=()=>{ const r=ch.getBoundingClientRect(), b=c.getBoundingClientRect(); tip.textContent=c.dataset.t; tip.style.left=(b.left+b.width/2-r.left)+"px"; tip.style.top=(b.top-r.top)+"px"; tip.style.display="block"; };
    c.onmouseleave=()=>{ tip.style.display="none"; }; }); });
}
async function call(body){ const r=await sb.functions.invoke("gvc-quotes",{body}); if(r.error){ let m=r.error.message; try{ m=(await r.error.context.json()).error||m; }catch(e){} throw new Error(m); } return r.data; }
async function scanUI(){
  const box=$("#prScanBox"); box.innerHTML=`<div class="tnote">Looking through the last 6 months of email for vendor quotes, order acks and invoices…</div>`;
  let docs; try{ docs=(await call({action:"scan",days:180})).docs||[]; }catch(e){ box.innerHTML=`<div class="err">${esc(e.message)}</div>`; return; }
  if(!docs.length){ box.innerHTML=`<div class="tnote">Everything with prices is already read in.</div>`; return; }
  let done=0, saved=0, stop=false;
  box.innerHTML=`<div class="tnote" id="prMsg">Reading ${docs.length} document${docs.length>1?"s":""}… (about 20 seconds each - you can keep using the app)</div><div class="prog"><i id="prBar"></i></div><button class="btn sm" type="button" id="prStop">Stop</button>`;
  $("#prStop").onclick=()=>{ stop=true; };
  for(const d of docs){
    if(stop) break;
    const m=$("#prMsg"); if(m) m.textContent=`Reading ${done+1} of ${docs.length}: ${d.name} (${d.from})`;
    try{ const r=await call({action:"extract",doc:d.id}); saved+=r.saved||0; }catch(e){}
    done++; const b=$("#prBar"); if(b) b.style.width=(done/docs.length*100)+"%";
  }
  await load(); if($(".pr")) draw();
  const b2=$("#prScanBox"); if(b2) b2.innerHTML=`<div class="tnote" style="color:#7ff0a8">Read ${done} document${done>1?"s":""} - ${saved} priced lines added.</div>`;
}
window.openPrices=async(search)=>{ if(search!=null) q=search; openId=null; $("#dlg").innerHTML=`<div class="tnote" style="padding:30px">Loading prices…</div>`; $("#scrim").classList.add("on"); await load(); draw(); };
// read prices off documents in the background (used after Compare quotes)
window.priceExtract=ids=>{ (async()=>{ for(const id of ids){ try{ await call({action:"extract",doc:id}); }catch(e){} } loaded=false; })(); };
})();
