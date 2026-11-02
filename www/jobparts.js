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
@media (max-width:600px){ .jp .pt{grid-template-columns:72px 1fr} .jp .pt .th{width:72px;height:52px} }
`;
document.head.appendChild(css);

const cache={};          // job_no -> rows
const urls={};           // storage path -> signed url
let q="", flt="all", mat="";

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
function matText(p){ const t=p.thickness?n3(p.thickness)+'"':""; return [t,p.material].filter(Boolean).join(" "); }

window.openJobParts=async function(jobNo, jobName){
  openId=null; const D=$("#dlg"); $("#scrim").classList.add("on");
  D.innerHTML=`<div class="jp"><div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">${esc(jobNo)} · Parts & drawings</h3><button class="btn ghost" type="button" id="jpBack">Back to job</button></div><div class="tnote">Loading…</div></div>`;
  $("#jpBack").onclick=()=>{ const j=jobs.find(x=>jobNum(x.name)===jobNo)||archivedJobs.find(x=>jobNum(x.name)===jobNo); if(j) openJob(j.id); else closeDlg(); };
  const rows=await load(jobNo);
  await sign(rows.map(r=>r.thumb_path));
  draw(jobNo,jobName,rows);
};

function draw(jobNo,jobName,rows){
  const D=$("#dlg"); const words=q.toLowerCase().split(/\s+/).filter(Boolean);
  const mats=[...new Set(rows.map(matText).filter(Boolean))].sort();
  const list=rows.filter(p=>{
    if(flt==="bent"&&!(p.bends>0)) return false; if(flt==="flat"&&p.bends>0) return false;
    if(mat&&matText(p)!==mat) return false;
    const hay=[p.part_no,p.name,p.assembly,p.material,p.notes].join(" ").toLowerCase();
    return words.every(w=>hay.includes(w));
  });
  const bent=rows.filter(p=>p.bends>0).length;
  D.innerHTML=`<div class="jp">
    <div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">${esc(jobNo)} · Parts & drawings</h3><button class="btn ghost" type="button" id="jpBack">Back to job</button></div>
    <div class="sum">${rows.length} parts · ${bent} bent · ${rows.length-bent} flat${rows.length?` · ${rows.reduce((a,p)=>a+(p.qty||0),0)} pcs`:""}</div>
    <div class="top" style="margin-top:8px"><input id="jpQ" type="search" placeholder="Search part number, name, assembly, material…" value="${esc(q)}"><button class="btn sm" type="button" id="jpImp">Import zip</button><button class="btn sm" type="button" id="jpRefresh">Refresh</button></div>
    <div class="chips">${[["all","All"],["bent","Bent parts"],["flat","Flat parts"]].map(([k,t])=>`<button class="btn sm ${flt===k?"primary":""}" data-jf="${k}">${t}</button>`).join("")}
      ${mats.length>1?`<span class="sep" style="width:1px;background:var(--line)"></span><button class="btn sm ${mat?"":"primary"}" data-jm="">Any material</button>${mats.map(m=>`<button class="btn sm ${mat===m?"primary":""}" data-jm="${esc(m)}">${esc(m)}</button>`).join("")}`:""}</div>
    <div id="jpImpBox"></div>
    <div class="list">${list.map(p=>`<div class="pt" data-id="${p.id}">
      <div class="th" data-jv="${p.id}">${p.thumb_path&&urls[p.thumb_path]?`<img src="${urls[p.thumb_path]}" alt="">`:(p.bends>0?"drawing":"flat part")}</div>
      <div><div class="nm">${esc(p.part_no)}${p.name&&p.name!==p.part_no?` <span style="font-weight:400;color:var(--muted)">· ${esc(p.name)}</span>`:""}</div>
        <div class="mt">${[p.assembly,matText(p),p.flat_w?`flat ${n3(p.flat_w)} × ${n3(p.flat_h)}`:"",p.bends>0?`${p.bends} bend${p.bends>1?"s":""}`:"flat",p.qty?`qty ${p.qty}`:""].filter(Boolean).join(" · ")}${p.notes?`<div>${esc(p.notes)}</div>`:""}</div>
        <div class="bt">${p.pdf_path?`<button class="btn sm" type="button" data-jv="${p.id}">Bend drawing</button><button class="btn sm" type="button" data-jo="${esc(p.pdf_path)}" data-jn="${esc(p.part_no)}.pdf">PDF</button>`:""}${p.dxf_path?`<button class="btn sm" type="button" data-jo="${esc(p.dxf_path)}" data-jn="${esc(p.part_no)}.dxf" data-dl="1">DXF</button>`:""}</div></div>
    </div>`).join("")||`<div class="empty" style="text-align:left">${rows.length?"Nothing matches.":"No parts loaded for this job yet. Use Import zip with a package from the bend-drawing generator."}</div>`}</div></div>`;
  $("#jpBack").onclick=()=>{ const j=jobs.find(x=>jobNum(x.name)===jobNo)||archivedJobs.find(x=>jobNum(x.name)===jobNo); if(j) openJob(j.id); else closeDlg(); };
  const qi=$("#jpQ"); qi.oninput=()=>{ q=qi.value; const pos=qi.selectionStart; draw(jobNo,jobName,rows); const n=$("#jpQ"); n.focus(); n.setSelectionRange(pos,pos); };
  D.querySelectorAll("[data-jf]").forEach(b=>b.onclick=()=>{ flt=b.dataset.jf; draw(jobNo,jobName,rows); });
  D.querySelectorAll("[data-jm]").forEach(b=>b.onclick=()=>{ mat=b.dataset.jm; draw(jobNo,jobName,rows); });
  $("#jpRefresh").onclick=async()=>{ const r=await load(jobNo,true); await sign(r.map(x=>x.thumb_path)); draw(jobNo,jobName,r); };
  D.querySelectorAll("[data-jv]").forEach(el=>el.onclick=async()=>{ const p=rows.find(x=>x.id===el.dataset.jv); if(!p||!p.thumb_path) return;
    await sign([p.thumb_path]); const back=()=>draw(jobNo,jobName,rows);
    viewDrawing(urls[p.thumb_path],"Bend drawing - "+p.part_no,false);
    const x=$("#dlg").querySelector("button[onclick='closeDlg()']"); if(x){ x.textContent="Back"; x.onclick=e=>{ e.preventDefault(); back(); }; x.removeAttribute("onclick"); } });
  D.querySelectorAll("[data-jo]").forEach(el=>el.onclick=async()=>{ el.disabled=true;
    const r=await sb.storage.from("gvc-parts").createSignedUrl(el.dataset.jo,60*30,el.dataset.dl?{download:el.dataset.jn}:undefined); el.disabled=false;
    if(r.data&&r.data.signedUrl) window.open(r.data.signedUrl,"_blank"); });
  $("#jpImp").onclick=()=>importBox(jobNo,jobName);
}

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
  b.onclick=()=>{ q=""; flt="all"; mat=""; openJobParts(no,j.name); };
  const row=document.createElement("div"); row.className="row"; row.style.marginTop="8px"; row.appendChild(b); bar.after(row);
};
})();
