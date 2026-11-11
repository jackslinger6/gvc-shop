/* ---------- Parts & drawings per job ----------
   Table gvc_job_parts (one row per laser/bent part on a job), files in storage bucket gvc-parts
   under jobs/<job_no>/dxf|pdf|thumb/. Opened from the job dialog ("Parts & drawings").
   Import: a zip made by the bend-drawing generator (manifest.json + dxf/ + pdf/ + thumb/). */
(()=>{
const css=document.createElement("style");
css.textContent=`
.jp .top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.jp input[type=search]{font:inherit;font-size:14px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 10px;flex:1;min-width:180px}
.jp .chips{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.jp .list{display:grid;gap:6px;margin-top:8px}
.jp .pt{display:grid;grid-template-columns:96px 1fr;gap:10px;border:1px solid var(--line);border-radius:10px;padding:8px;background:rgba(0,0,0,.25);align-items:center}
.jp .pt .th{width:96px;height:64px;background:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#888;font-size:11px;cursor:pointer}
.jp .pt .th img{max-width:100%;max-height:100%;object-fit:contain}
.jp .pt .nm{font-weight:600;font-size:14px;word-break:break-word}
.jp .pt .mt{font-size:12px;color:var(--muted);margin-top:2px}
.jp .pt .bt{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.jp .sum{font-size:12px;color:var(--muted);margin-top:6px}
.jp .imp{border:1px dashed var(--line);border-radius:10px;padding:10px;margin-top:10px;font-size:13px}
.jp .prog{height:6px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden;margin-top:8px}
.jp .prog div{height:100%;background:var(--blue,#4ea1ff)}
.jp .grp{border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.02);overflow:hidden}
.jp .gh{display:grid;grid-template-columns:22px 56px 1fr auto;gap:10px;align-items:center;width:100%;text-align:left;background:none;border:0;color:var(--text);font:inherit;padding:8px 10px;cursor:pointer}
.jp .gh .ar{font-size:14px;color:var(--muted);transition:transform .15s}
.jp .grp.open .gh .ar{transform:rotate(90deg)}
.jp .gh .gt{width:56px;height:38px;background:#fff;border-radius:5px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.jp .gh .gt img{max-width:100%;max-height:100%;object-fit:contain}
.jp .gh .gn{font-weight:700;font-size:14.5px;letter-spacing:.02em;word-break:break-word}
.jp .gh .gs{font-size:12px;color:var(--muted);margin-top:2px}
.jp .gh .gc{font:600 13px Oswald,sans-serif;background:rgba(0,0,0,.35);border:1px solid var(--line);border-radius:8px;padding:3px 8px}
.jp .gb{display:grid;gap:6px;padding:0 8px 8px}
.jp .grp:not(.open) .gb{display:none}

@media (max-width:600px){ .jp .pt{grid-template-columns:72px 1fr} .jp .pt .th{width:72px;height:52px} }
`;
document.head.appendChild(css);

const cache={};          // job_no -> rows
const urls={};           // storage path -> signed url
let q="", flt="all", mat="", grouped="name", openG=new Set(), origin=null, scrollTo=null;

async function load(jobNo,force){
  if(!force&&cache[jobNo]) return cache[jobNo];
  if(typeof sb==="undefined") return [];
  const r=await sb.from("gvc_job_parts").select("*").eq("job_no",jobNo).order("assembly").order("part_no");
  cache[jobNo]=r.data||[]; return cache[jobNo];
}
async function sign(paths){
  const need=[...new Set(paths.filter(p=>p&&!urls[p]))]; if(!need.length) return;
  for(let i=0;i<need.length;i+=100){
    const r=await sb.storage.from("gvc-parts").createSignedUrls(need.slice(i,i+100),60*60*12);
    (r.data||[]).forEach(u=>{ if(u.signedUrl) urls[u.path]=u.signedUrl; });
  }
}
const n3=x=>x==null?"":(+x).toFixed(3).replace(/\.?0+$/,"");
/* one name per material, however the generator wrote it ("0.125 ALUMINUM" and '1/8" (0.125") Aluminum' are the same sheet) - Kyle, Nov 9 */
const FR={1:"1/16",2:"1/8",3:"3/16",4:"1/4",5:"5/16",6:"3/8",7:"7/16",8:"1/2",9:"9/16",10:"5/8",11:"11/16",12:"3/4",13:"13/16",14:"7/8",15:"15/16"};
function thick(t,m){
  const ga=String(m||"").match(/(\d+)\s*ga\b/i); if(ga) return ga[1]+" ga";
  if(!(t>0)){ const x=String(m||"").match(/(\d*\.\d+|\d+\/\d+)/); if(!x) return ""; t=x[1].includes("/")?x[1].split("/")[0]/x[1].split("/")[1]:+x[1]; }
  const s16=Math.round(t*16); if(s16>0&&Math.abs(t-s16/16)<=0.004){ const w=Math.floor(s16/16), r=s16%16; return (w?w+(r?"-":""):"")+(r?FR[r]:"")+'"'; }
  return n3(t)+'"';
}
function matKind(m){ m=String(m||"");
  if(/qt\s*100/i.test(m)) return "QT100";
  if(/alum/i.test(m)) return "Aluminum";
  if(/\bss\b|stainless|\b30[34]\b|\b316\b/i.test(m)) return /316/.test(m)?"316 SS":"304 SS";
  if(/steel|\bms\b|p&o|\bhr\b|\bcr\b/i.test(m)) return "Mild steel";
  return m.replace(/^[\s\d.\/"()ga-]+/i,"").trim(); }
function matText(p){ return [thick(+p.thickness,p.material),matKind(p.material)].filter(Boolean).join(" "); }
function matSort(a,b){ const ka=a.split(" ").slice(-1)[0], kb=b.split(" ").slice(-1)[0]; return ka.localeCompare(kb)||thVal(a)-thVal(b); }
function thVal(l){ const g=l.match(/^(\d+) ga/); if(g) return [0,0,0,0,0,0,0,0,.1644,.1495,.1345,.1196,.1046,.0897,.0747,.0673,.0598,.0538,.0478][+g[1]]||0;
  const f=l.match(/^(?:(\d+)-)?(\d+)\/(\d+)"/); if(f) return (+f[1]||0)+f[2]/f[3]; return parseFloat(l)||0; }
/* assembly = the part number's prefix: 1086_7.CHAINBASKET.5 -> CHAINBASKET, RA.KENWORTH.3 -> RA.KENWORTH,
   "Upper box Driver side body Body2" -> UPPER BOX DRIVER SIDE BODY. Groups of one go under Other parts. */
const GNAME={BB:"BELLY BOX (BB)"};
function grpKey(p){
  let s=String(p.part_no||"").trim().replace(/^\d{3,5}(?:_\d+)?[A-Z]{0,2}\s*[.\-]\s*/i,"");
  if(/\s/.test(s)||!s.includes(".")) return s.replace(/\s*(?:_\d+_\s*)?Body\s*\d+$/i,"").replace(/\.\d+$/,"").replace(/\s+/g," ").trim().toUpperCase()||"?";
  const t=s.split("."); return (t[0].length<=2&&t[1]&&/^[A-Z]+$/i.test(t[1])?t[0]+"."+t[1]:t[0]).toUpperCase();
}
const natural=(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true});

window.openJobParts=async function(jobNo, jobName, from){
  origin=from||null; openId=null; const D=$("#dlg"); $("#scrim").classList.add("on");
  D.innerHTML=`<div class="jp"><div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">${esc(jobNo)} · Parts & drawings</h3><button class="btn ghost" type="button" id="jpBack">${origin?"Close":"Back to job"}</button></div><div class="tnote">Loading…</div></div>`;
  $("#jpBack").onclick=()=>backOut(jobNo);
  const rows=await load(jobNo);
  await sign(rows.map(r=>r.thumb_path));
  draw(jobNo,jobName,rows);
  if(scrollTo!=null){ const D=$("#dlg"), y=scrollTo; scrollTo=null; requestAnimationFrame(()=>{ D.scrollTop=y; }); }
};
function backOut(jobNo){
  if(origin){ closeDlg(); return; }
  const j=jobs.find(x=>jobNum(x.name)===jobNo)||archivedJobs.find(x=>jobNum(x.name)===jobNo); if(j) openJob(j.id); else closeDlg();
}

function partRow(p){
  return `<div class="pt" data-id="${p.id}">
      <div class="th" data-jv="${p.id}">${p.thumb_path&&urls[p.thumb_path]?`<img src="${urls[p.thumb_path]}" alt="" loading="lazy">`:(p.bends>0?"drawing":"flat part")}</div>
      <div><div class="nm">${esc(p.part_no)}${p.name&&p.name!==p.part_no?` <span style="font-weight:400;color:var(--muted)">· ${esc(p.name)}</span>`:""}</div>
        <div class="mt">${[grouped==="none"&&realAsm(p.assembly)?p.assembly:"",matText(p),p.flat_w?`flat ${n3(p.flat_w)} × ${n3(p.flat_h)}`:"",p.bends>0?`${p.bends} bend${p.bends>1?"s":""}`:"flat",p.qty?`qty ${p.qty}`:""].filter(Boolean).join(" · ")}${p.notes?`<div>${esc(p.notes)}</div>`:""}</div>
        <div class="bt">${p.pdf_path?`<button class="btn sm" type="button" data-jv="${p.id}">Bend drawing</button><button class="btn sm" type="button" data-jo="${esc(p.pdf_path)}" data-jn="${esc(p.part_no)}.pdf">PDF</button>`:""}${p.dxf_path?`<button class="btn sm" type="button" data-jo="${esc(p.dxf_path)}" data-jn="${esc(p.part_no)}.dxf" data-dl="1">DXF</button>`:""}${p.model_path?`<button class="btn sm" type="button" data-j3="${p.id}">3D</button>`:""}</div></div>
    </div>`;
}
const realAsm=a=>!!a&&!/^\s*[\d.\/]+\s*"?\s*(?:\(|ga\b|alum|steel|ss\b|qt|stain)/i.test(a);   // flat parts come in with the material as their "assembly"
const asmName=a=>String(a).replace(/^\d{3,5}(?:_\d+)?[A-Z]{0,2}\s*-\s*/i,"").replace(/\s*\(\d+\)$/,"").replace(/\s*_\d+_*\s*Body\s*\d+$/i,"").replace(/\s+/g," ").trim().toUpperCase();
function groups(list,all){
  let key;
  if(grouped==="asm"){
    // assembly from the model; a part without one goes where its same-named parts are (CHAINBASKET.4 flat -> with CHAINBASKET.1's assembly)
    const vote={}; all.forEach(p=>{ if(!realAsm(p.assembly)) return; const k=grpKey(p), a=asmName(p.assembly); (vote[k]=vote[k]||{})[a]=(vote[k][a]||0)+1; });
    const best=k=>{ const v=vote[k]; if(!v) return null; return Object.keys(v).sort((x,y)=>v[y]-v[x]||natural(x,y))[0]; };
    key=p=>realAsm(p.assembly)?asmName(p.assembly):(best(grpKey(p))||"￿NONE");
  } else {
    const s1={}; all.forEach(p=>{ const k=grpKey(p); s1[k]=(s1[k]||0)+1; });
    // a part with no siblings by name falls back to its assembly from the model
    key=p=>{ const k=grpKey(p); return s1[k]<2&&realAsm(p.assembly)?asmName(p.assembly):k; };
  }
  const size={}; all.forEach(p=>{ const k=key(p); size[k]=(size[k]||0)+1; });
  const by={}; list.forEach(p=>{ let k=key(p); if(grouped!=="asm"&&size[k]<2) k="￿OTHER"; (by[k]=by[k]||[]).push(p); });
  return Object.keys(by).sort(natural).map(k=>({k,name:k==="￿OTHER"?"OTHER PARTS":k==="￿NONE"?"NOT IN AN ASSEMBLY":(GNAME[k]||k),parts:by[k].sort((x,y)=>natural(x.part_no,y.part_no))}));
}
function draw(jobNo,jobName,rows){
  const D=$("#dlg"); const words=q.toLowerCase().split(/\s+/).filter(Boolean);
  const mats=[...new Set(rows.map(matText).filter(Boolean))].sort(matSort);
  if(mat&&!mats.includes(mat)) mat="";
  const list=rows.filter(p=>{
    if(flt==="bent"&&!(p.bends>0)) return false; if(flt==="flat"&&p.bends>0) return false;
    if(mat&&matText(p)!==mat) return false;
    const hay=[p.part_no,p.name,p.assembly,grpKey(p),matText(p),p.material,p.notes].join(" ").toLowerCase();
    return words.every(w=>hay.includes(w));
  });
  const bent=rows.filter(p=>p.bends>0).length;
  const narrowed=!!(words.length||flt!=="all"||mat);   // searching or filtering opens every group that still has a match
  let body="";
  if(!list.length) body=`<div class="empty" style="text-align:left">${rows.length?"Nothing matches.":"No parts loaded for this job yet. Use Import zip with a package from the bend-drawing generator."}</div>`;
  else if(grouped==="none") body=list.slice().sort((x,y)=>natural(x.part_no,y.part_no)).map(partRow).join("");
  else body=groups(list,rows).map(g=>{ const open=narrowed||openG.has(g.k); const pcs=g.parts.reduce((a,p)=>a+(p.qty||0),0), gb=g.parts.filter(p=>p.bends>0).length;
    const th=g.parts.find(p=>p.thumb_path&&urls[p.thumb_path]);
    return `<div class="grp ${open?"open":""}"><button class="gh" type="button" data-g="${esc(g.k)}" aria-expanded="${open}"><span class="ar">▶</span><span class="gt">${th?`<img src="${urls[th.thumb_path]}" alt="" loading="lazy">`:""}</span>
      <span><div class="gn">${esc(g.name)}</div><div class="gs">${g.parts.length} part${g.parts.length>1?"s":""}${pcs?` · ${pcs} pcs`:""} · ${gb?`${gb} bent`:"all flat"}</div></span><span class="gc">${g.parts.length}</span></button>
      <div class="gb">${open?g.parts.map(partRow).join(""):""}</div></div>`; }).join("");
  D.innerHTML=`<div class="jp">
    <div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">${esc(jobNo)} · Parts & drawings</h3><button class="btn ghost" type="button" id="jpBack">${origin?"Close":"Back to job"}</button></div>
    <div class="sum">${rows.length} parts · ${bent} bent · ${rows.length-bent} flat${rows.length?` · ${rows.reduce((a,p)=>a+(p.qty||0),0)} pcs`:""}</div>
    <div class="top" style="margin-top:8px"><input id="jpQ" type="search" placeholder="Search part number, name, assembly, material…" value="${esc(q)}"><button class="btn sm" type="button" id="jpImp">Import zip</button><button class="btn sm" type="button" id="jpImp3">Add 3D models</button><button class="btn sm" type="button" id="jpRefresh">Refresh</button></div>
    <div class="chips">${[["name","By name"],["asm","By assembly"],["none","All parts"]].map(([k,t])=>`<button class="btn sm ${grouped===k?"primary":""}" data-jg="${k}">${t}</button>`).join("")}${grouped!=="none"&&!narrowed?`<button class="btn sm ghost" type="button" data-jx="1">${openG.size?"Collapse all":"Expand all"}</button>`:""}</div>
    <div class="chips">${[["all","Bent + flat"],["bent","Bent"],["flat","Flat"]].map(([k,t])=>`<button class="btn sm ${flt===k?"primary":""}" data-jf="${k}">${t}</button>`).join("")}</div>
    ${mats.length>1?`<div class="chips"><button class="btn sm ${mat?"":"primary"}" data-jm="">Any material</button>${mats.map(m=>`<button class="btn sm ${mat===m?"primary":""}" data-jm="${esc(m)}">${esc(m)}</button>`).join("")}</div>`:""}
    <div id="jpImpBox"></div>
    <div class="list">${body}</div></div>`;
  const redraw=()=>{ const y=D.scrollTop; draw(jobNo,jobName,rows); D.scrollTop=y; };
  $("#jpBack").onclick=()=>backOut(jobNo);
  const qi=$("#jpQ"); qi.oninput=()=>{ q=qi.value; const pos=qi.selectionStart; draw(jobNo,jobName,rows); const n=$("#jpQ"); n.focus(); n.setSelectionRange(pos,pos); };
  D.querySelectorAll("[data-jf]").forEach(b=>b.onclick=()=>{ flt=b.dataset.jf; redraw(); });
  D.querySelectorAll("[data-jm]").forEach(b=>b.onclick=()=>{ mat=b.dataset.jm; redraw(); });
  D.querySelectorAll("[data-jg]").forEach(b=>b.onclick=()=>{ grouped=b.dataset.jg; openG.clear(); try{localStorage.setItem("gvc_jp_grouped",grouped)}catch(e){} redraw(); });
  D.querySelectorAll("[data-jx]").forEach(b=>b.onclick=()=>{ if(openG.size) openG.clear(); else groups(list,rows).forEach(g=>openG.add(g.k)); redraw(); });
  D.querySelectorAll("[data-g]").forEach(b=>b.onclick=()=>{ if(narrowed) return; const k=b.dataset.g; openG.has(k)?openG.delete(k):openG.add(k); redraw(); });
  $("#jpRefresh").onclick=async()=>{ const r=await load(jobNo,true); await sign(r.map(x=>x.thumb_path)); draw(jobNo,jobName,r); };
  D.querySelectorAll("[data-jv]").forEach(el=>el.onclick=async()=>{ const p=rows.find(x=>x.id===el.dataset.jv); if(!p||!p.thumb_path) return;
    await sign([p.thumb_path].concat(p.pdf_path?[p.pdf_path]:[]));
    scrollTo=D.scrollTop;   // Back from the drawing lands on the same spot in the list, same groups open
    viewDrawing(urls[p.thumb_path],"Bend drawing - "+p.part_no,false,p.pdf_path?urls[p.pdf_path]:null); });   // the PDF is drawn sharp; the picture shows until it's ready
  D.querySelectorAll("[data-jo]").forEach(el=>el.onclick=async()=>{ el.disabled=true;
    const r=await sb.storage.from("gvc-parts").createSignedUrl(el.dataset.jo,60*30,el.dataset.dl?{download:el.dataset.jn}:undefined); el.disabled=false;
    if(r.data&&r.data.signedUrl) window.open(r.data.signedUrl,"_blank"); });
  $("#jpImp").onclick=()=>importBox(jobNo,jobName);
  $("#jpImp3").onclick=()=>import3dBox(jobNo,jobName,rows);
  D.querySelectorAll("[data-j3]").forEach(el=>el.onclick=async()=>{ const p=rows.find(x=>x.id===el.dataset.j3); if(!p||!p.model_path) return;
    el.disabled=true; const r=await sb.storage.from("gvc-parts").createSignedUrl(p.model_path,60*60); el.disabled=false;
    if(!r.data||!r.data.signedUrl){ alert("Couldn't open the 3D model"); return; }
    open3D(r.data.signedUrl, p.part_no+" · 3D", {part:p}); });
}
/* ---- 3D models: STEP files named <part number>.step (folded, from Fusion) -> jobs/<job>/model/, sets model_path ---- */
function import3dBox(jobNo,jobName,rows){
  const box=$("#jpImpBox");
  box.innerHTML=`<div class="imp">Pick STEP files (folded parts from Fusion) named with the part number, e.g. <b>PULLOUTLIGHT.1.step</b>. Each one goes on the part with that number; a part that already has a model gets the new one.
    <div class="row" style="margin-top:8px;align-items:center"><input type="file" id="jp3Files" multiple accept=".step,.stp,.STEP,.STP"><button class="btn primary sm" type="button" id="jp3Go">Upload to ${esc(jobNo)}</button><button class="btn sm" type="button" id="jp3Cancel">Cancel</button></div>
    <div id="jp3Msg" class="tnote" style="margin-top:6px"></div></div>`;
  $("#jp3Cancel").onclick=()=>{ box.innerHTML=""; };
  $("#jp3Go").onclick=async()=>{
    const fs=[...$("#jp3Files").files], msg=$("#jp3Msg"); if(!fs.length){ msg.textContent="Choose STEP files first."; return; }
    $("#jp3Go").disabled=true; const safe=s=>String(s).replace(/[^A-Za-z0-9._-]+/g,"_").toLowerCase(); const done=[], miss=[];
    try{
      for(const f of fs){
        const stem=f.name.replace(/\.(step|stp)$/i,""); const p=rows.find(r=>r.part_no===stem)||rows.find(r=>safe(r.part_no)===safe(stem));
        if(!p){ miss.push(f.name); continue; }
        msg.textContent=`Uploading ${p.part_no}…`;
        const path=`jobs/${jobNo}/model/${p.part_no.replace(/[^A-Za-z0-9._-]+/g,"_")}.step`;
        const up=await sb.storage.from("gvc-parts").upload(path,f,{upsert:true,contentType:"application/octet-stream"}); if(up.error) throw up.error;
        const r=await sb.from("gvc_job_parts").update({model_path:path,updated_at:new Date().toISOString()}).eq("id",p.id); if(r.error) throw r.error;
        done.push(p.part_no);
      }
      msg.textContent=`Done: ${done.length} model${done.length===1?"":"s"}${done.length?" ("+done.join(", ")+")":""}.${miss.length?" No part number match for: "+miss.join(", "):""}`;
      const fresh=await load(jobNo,true); await sign(fresh.map(x=>x.thumb_path)); draw(jobNo,jobName,fresh);
      const m=$("#jpImpBox"); if(m) m.innerHTML=`<div class="imp">${esc(msg.textContent)}</div>`;
    }catch(e){ msg.textContent="Upload failed: "+(e.message||e); $("#jp3Go").disabled=false; }
  };
}
try{ const g=localStorage.getItem("gvc_jp_grouped"); if(["name","asm","none"].includes(g)) grouped=g; }catch(e){}
window.jpCount=async()=>{ if(typeof sb==="undefined") return {}; const r=await sb.from("gvc_job_parts").select("job_no,bends"); const o={};
  (r.data||[]).forEach(x=>{ const c=o[x.job_no]=o[x.job_no]||{n:0,bent:0}; c.n++; if(x.bends>0) c.bent++; }); return o; };
window.jpFresh=()=>{ q=""; flt="all"; mat=""; openG.clear(); scrollTo=null; };
window.jpGroups=(l,mode)=>{ grouped=mode; return groups(l,l); }; window.jpThick=thick; window.jpMatText=matText; window.jpGrpKey=grpKey;

/* ---- import a generator zip: manifest.json + dxf/*.dxf + pdf/*.pdf + thumb/*.png ---- */
function importBox(jobNo,jobName){
  const box=$("#jpImpBox");
  box.innerHTML=`<div class="imp">Pick the zip from the bend-drawing generator (it holds manifest.json, dxf/, pdf/ and thumb/). Existing parts with the same number are replaced.
    <div class="row" style="margin-top:8px;align-items:center"><input type="file" id="jpZip" accept=".zip,application/zip"><button class="btn primary sm" type="button" id="jpGo">Upload to ${esc(jobNo)}</button><button class="btn sm" type="button" id="jpCancel">Cancel</button></div>
    <div id="jpMsg" class="tnote" style="margin-top:6px"></div><div class="prog" id="jpProg" hidden><div style="width:0%"></div></div></div>`;
  $("#jpCancel").onclick=()=>{ box.innerHTML=""; };
  $("#jpGo").onclick=async()=>{
    const f=$("#jpZip").files[0]; if(!f){ $("#jpMsg").textContent="Choose a zip first."; return; }
    $("#jpGo").disabled=true; const msg=$("#jpMsg"), prog=$("#jpProg"); prog.hidden=false;
    try{
      msg.textContent="Reading zip…"; const entries=await unzip(await f.arrayBuffer());
      const man=entries.find(e=>/(^|\/)manifest\.json$/.test(e.name)); if(!man) throw new Error("No manifest.json in the zip");
      const manifest=JSON.parse(new TextDecoder().decode(await man.data()));
      const parts=manifest.parts||[]; const base=man.name.replace(/manifest\.json$/,"");
      const byName={}; entries.forEach(e=>byName[e.name]=e);
      let n=0, total=parts.reduce((a,p)=>a+["dxf","pdf","thumb"].filter(k=>p[k]).length,0);
      const rows=[];
      for(const p of parts){
        const row={job_no:jobNo, part_no:p.part_no, name:p.name||null, assembly:p.assembly||null, material:p.material||null, thickness:p.thickness??null, qty:p.qty??null,
          flat_w:p.flat_w??null, flat_h:p.flat_h??null, bends:p.bends||0, source:manifest.source||null, notes:p.notes||null, updated_at:new Date().toISOString()};
        for(const k of ["dxf","pdf","thumb"]){
          if(!p[k]) continue; const e=byName[base+p[k]]||byName[p[k]]; if(!e){ msg.textContent=`Missing in zip: ${p[k]}`; continue; }
          const safe=p.part_no.replace(/[^A-Za-z0-9._-]+/g,"_"); const ext=p[k].split(".").pop().toLowerCase();
          const path=`jobs/${jobNo}/${k}/${safe}.${ext}`;
          const type=ext==="pdf"?"application/pdf":ext==="png"?"image/png":ext==="svg"?"image/svg+xml":"application/octet-stream";
          const blob=new Blob([await e.data()],{type});
          const up=await sb.storage.from("gvc-parts").upload(path,blob,{upsert:true,contentType:type}); if(up.error) throw up.error;
          row[k+"_path"]=path; n++; prog.firstElementChild.style.width=Math.round(n/Math.max(1,total)*100)+"%"; msg.textContent=`Uploading ${n} of ${total} files… (${p.part_no})`;
        }
        rows.push(row);
      }
      msg.textContent="Saving part list…";
      for(let i=0;i<rows.length;i+=200){ const r=await sb.from("gvc_job_parts").upsert(rows.slice(i,i+200),{onConflict:"job_no,part_no"}); if(r.error) throw r.error; }
      msg.textContent=`Done: ${rows.length} parts, ${n} files.`;
      const fresh=await load(jobNo,true); await sign(fresh.map(x=>x.thumb_path)); draw(jobNo,jobName,fresh);
    }catch(e){ msg.textContent="Import failed: "+(e.message||e); $("#jpGo").disabled=false; }
  };
}
/* minimal zip reader (stored + deflate) using DecompressionStream */
async function unzip(buf){
  const dv=new DataView(buf), u8=new Uint8Array(buf); const out=[];
  let eocd=buf.byteLength-22; while(eocd>=0&&dv.getUint32(eocd,true)!==0x06054b50) eocd--;
  if(eocd<0) throw new Error("Not a zip file");
  const count=dv.getUint16(eocd+10,true); let off=dv.getUint32(eocd+16,true);
  for(let i=0;i<count;i++){
    if(dv.getUint32(off,true)!==0x02014b50) break;
    const method=dv.getUint16(off+10,true), csize=dv.getUint32(off+20,true), nlen=dv.getUint16(off+28,true), elen=dv.getUint16(off+30,true), clen=dv.getUint16(off+32,true), loc=dv.getUint32(off+42,true);
    const name=new TextDecoder().decode(u8.subarray(off+46,off+46+nlen));
    out.push({name,method,csize,loc,data:async()=>{
      const ln=dv.getUint16(loc+26,true), le=dv.getUint16(loc+28,true); const start=loc+30+ln+le; const chunk=u8.subarray(start,start+csize);
      if(method===0) return chunk;
      if(method!==8) throw new Error("Unsupported zip compression");
      const ds=new DecompressionStream("deflate-raw"); const w=ds.writable.getWriter(); w.write(chunk); w.close();
      return new Uint8Array(await new Response(ds.readable).arrayBuffer());
    }});
    off+=46+nlen+elen+clen;
  }
  return out.filter(e=>!e.name.endsWith("/"));
}

/* ---- button in the job dialog ---- */
const _draw=drawDlg;
drawDlg=function(){
  _draw(); const j=job(); if(!j) return; const D=$("#dlg"); const no=jobNum(j.name); if(!no) return;
  const bar=D.querySelector(".stagebar"); if(!bar) return;
  const b=document.createElement("button"); b.className="btn sm"; b.type="button"; b.id="jpBtn"; b.textContent="Parts & drawings";
  const cnt=cache[no]; if(cnt) b.textContent=`Parts & drawings (${cnt.length})`;
  else if(typeof sb!=="undefined") sb.from("gvc_job_parts").select("id",{count:"exact",head:true}).eq("job_no",no).then(r=>{ if(r.count) b.textContent=`Parts & drawings (${r.count})`; });
  b.onclick=()=>{ q=""; flt="all"; mat=""; openG.clear(); scrollTo=null; openJobParts(no,j.name); };
  const row=document.createElement("div"); row.className="row"; row.style.marginTop="8px"; row.appendChild(b); bar.after(row);
};
})();
