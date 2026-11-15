/* ---------- Files from email, per job (Nov 4) ----------
   Table gvc_job_files: every attachment saved off an email (orders Kyle sent, quotes, drawings), files in
   storage gvc-parts/jobs/<job_no>/mail/<date> <subject>/... Zips are unpacked, each file listed under its zip.
   Saved automatically by the gvc-mail-files function when the email check sees an order / quote / drawings.
   Also: "Get files from an email" for one the check missed (pick from the job's emails in the log). */
(()=>{
const css=document.createElement("style");
css.textContent=`
.jf .mail{border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-top:8px;background:rgba(0,0,0,.22)}
.jf .mail .hd{font-weight:600;font-size:14px}
.jf .mail .mt{font-size:12px;color:var(--muted);margin:2px 0 6px}
.jf .f{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:4px 0;border-top:1px solid rgba(255,255,255,.05);font-size:13px}
.jf .f .n{word-break:break-word}
.jf .f .k{font-size:11px;color:var(--muted);margin-left:6px}
.jf details summary{cursor:pointer;font-size:13px;padding:4px 0}
`;
document.head.appendChild(css);
const kb=n=>n>1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB";

async function openFiles(j){
  openId=null; const D=$("#dlg"); $("#scrim").classList.add("on");
  const head=`<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">${esc(j.name)} · Files from email</h3><button class="btn ghost" type="button" id="jfBack">Back to job</button></div>`;
  D.innerHTML=`<div class="jf">${head}<div class="tnote">Loading…</div></div>`;
  $("#jfBack").onclick=()=>openJob(j.id);
  const r=await sb.from("gvc_job_files").select("*").eq("job_id",j.id).order("mail_at",{ascending:false}).order("path");
  if(r.error){ // UX audit 08: a failed load is an error with Retry, never "no files"
    D.innerHTML=`<div class="jf">${head}<div class="addbox" role="alert" style="border-color:#ff6b5a;margin-top:10px"><b>Couldn't load the files from email.</b><div class="tnote">${esc(r.error.message||"Network or server error")}. Nothing was changed.</div><div class="row" style="gap:6px;margin-top:8px"><button class="btn primary" type="button" id="jfRetry">Retry</button></div></div></div>`;
    $("#jfBack").onclick=()=>openJob(j.id); $("#jfRetry").onclick=()=>openFiles(j); return; }
  const rows=r.data||[];
  /* (usability review, Nov 15) a big total like "Files (540)" isn't useful: group by email (newest first, the 3 most
     recent open, older ones folded), filter by file type, search by name; files inside ZIPs stay folded under their ZIP. */
  let kf="", fq="";
  const KIND=f=>String(f.kind||(String(f.name||"").split(".").pop())||"other").toLowerCase();
  const kinds={}; rows.forEach(f=>{ const k=KIND(f); kinds[k]=(kinds[k]||0)+1; });
  const fileRow=f=>`<div class="f"><span class="n">${esc(f.name)}<span class="k">${esc(KIND(f).toUpperCase())} · ${kb(f.size||0)}${f.in_zip?" · in "+esc(f.in_zip):""}</span></span><span style="display:flex;gap:6px"><button class="btn sm" type="button" data-fo="${esc(f.path)}">Open</button><button class="btn sm ghost" type="button" data-fo="${esc(f.path)}" data-fd="${esc(f.name)}">Download</button></span></div>`;
  const when=t=>t?new Date(t).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"";
  const draw=()=>{
    const words=fq.toLowerCase().split(/\s+/).filter(Boolean);
    const keep=f=>(!kf||KIND(f)===kf)&&words.every(w=>String(f.name||"").toLowerCase().includes(w));
    const byMail=new Map(); rows.forEach(f=>{ const k=f.source_ref||f.subject; if(!byMail.has(k)) byMail.set(k,{f,list:[]}); byMail.get(k).list.push(f); });
    const groups=[...byMail.values()].map(g=>({...g,shown:g.list.filter(keep)})).filter(g=>g.shown.length);
    const filtering=!!(kf||words.length);
    const mailHtml=({f,list,shown},i)=>{ const top=shown.filter(x=>!x.in_zip), inz=shown.filter(x=>x.in_zip), zips=[...new Set(inz.map(x=>x.in_zip))];
      const body=`${top.map(fileRow).join("")}
        ${!filtering&&list.some(x=>x.kind==="dxf")&&f.source_ref?`<div class="row" style="margin:4px 0"><button class="btn sm ghost" type="button" data-fp="${esc(f.source_ref)}">Put these DXFs in the count list</button></div>`:""}
        ${zips.map(z=>{ const l=inz.filter(x=>x.in_zip===z); return filtering?l.map(fileRow).join(""):`<details><summary>Inside ${esc(z)} (${l.length} files)</summary>${l.map(fileRow).join("")}</details>`; }).join("")}`;
      const meta=`${esc(f.mail_from||"")}${f.mail_at?" · "+when(f.mail_at):""}${f.supplier?" · "+esc(f.supplier):""} · ${shown.length} file${shown.length>1?"s":""}${zips.length&&!filtering?` (${inz.length} inside ZIP${zips.length>1?"s":""})`:""}`;
      return (i<3||filtering)?`<div class="mail"><div class="hd">${esc(f.subject||"(no subject)")}</div><div class="mt">${meta}</div>${body}</div>`
        :`<details class="mail"><summary><span class="hd">${esc(f.subject||"(no subject)")}</span><span class="mt" style="display:block">${meta}</span></summary>${body}</details>`; };
    const older=groups.length>3&&!filtering;
    D.innerHTML=`<div class="jf">${head}
      <div class="jfsum">${rows.length} file${rows.length===1?"":"s"} from ${byMail.size} email${byMail.size===1?"":"s"}${rows.some(x=>x.in_zip)?` · ${rows.filter(x=>x.in_zip).length} of them inside ZIPs`:""}. Newest first.</div>
      ${rows.length?`<div class="jfbar"><input type="search" id="jfQ" placeholder="Find a file by name…" value="${esc(fq)}" aria-label="Find a file by name">
        <div class="jfk" role="group" aria-label="File type"><button type="button" class="chip ${kf?"":"on"}" data-jk="" aria-pressed="${!kf}">All ${rows.length}</button>${Object.entries(kinds).sort((x,y)=>y[1]-x[1]).map(([k,n])=>`<button type="button" class="chip ${kf===k?"on":""}" data-jk="${esc(k)}" aria-pressed="${kf===k}">${esc(k.toUpperCase())} ${n}</button>`).join("")}</div></div>`:""}
      ${groups.slice(0,older?3:groups.length).map(mailHtml).join("")}
      ${older?`<div class="jfold">Older emails (${groups.length-3})</div>${groups.slice(3).map((g,i)=>mailHtml(g,i+3)).join("")}`:""}
      ${!groups.length?`<div class="tnote" style="margin-top:10px">${rows.length?"No file matches.":"No files saved for this job yet."}</div>`:""}
      <div class="tnote" style="margin-top:12px">Attachments from order, quote and drawing emails are saved here automatically by the email check. Order DXFs also go into Parts &amp; drawings (the count list).</div></div>`;
    wireF();
  };
  const wireF=()=>{
    $("#jfBack").onclick=()=>openJob(j.id);
    D.querySelectorAll("[data-jk]").forEach(b=>b.onclick=()=>{ kf=b.dataset.jk; draw(); const n=D.querySelector(`[data-jk="${CSS.escape(kf)}"]`); if(n) n.focus(); });
    const qi=D.querySelector("#jfQ"); if(qi) qi.oninput=()=>{ fq=qi.value; const p=qi.selectionStart; draw(); const n=D.querySelector("#jfQ"); n.focus(); n.setSelectionRange(p,p); };
    wireFiles();
  };
  const wireFiles=()=>{
  D.querySelectorAll("[data-fp]").forEach(el=>el.onclick=async()=>{ el.disabled=true; el.textContent="Reading the email…";
    const mid=el.dataset.fp.replace(/^mail:/,"").replace(/>#[^>]*$/,">");
    const r=await sb.functions.invoke("gvc-mail-files",{body:{message_id:mid,job_id:j.id,parts:true}});
    const d=r.data||{}; el.textContent=r.error||d.error?"Failed: "+(d.error||r.error.message):`Done - ${d.parts||0} parts in the count list`; });
  D.querySelectorAll("[data-fo]").forEach(el=>el.onclick=async()=>{ el.disabled=true;
    const s=await sb.storage.from("gvc-parts").createSignedUrl(el.dataset.fo,60*30,el.dataset.fd?{download:el.dataset.fd}:undefined); el.disabled=false;
    if(s.data&&s.data.signedUrl){ window.open(s.data.signedUrl,"_blank"); el.title=""; return; }
    const was=el.dataset.lbl||el.textContent; el.dataset.lbl=was; el.textContent="Couldn't open - Retry"; el.title=(s.error&&s.error.message)||"Couldn't get the file"; });
  };
  draw();
}
window.openJobFiles=openFiles;

/* ---- button in the job dialog, beside Parts & drawings ---- */
GVC.on("drawDlg:after",()=>{
  const j=job(); if(!j||typeof sb==="undefined") return; const D=$("#dlg");
  const b=document.createElement("button"); b.className="btn sm"; b.type="button"; b.id="jfBtn"; b.textContent="Files";
  b.onclick=()=>openFiles({...j,id:openId||j.id});
  b.textContent="Files from email";
  const jid=openId; sb.from("gvc_job_files").select("source_ref,subject,mail_at").eq("job_id",jid).then(r=>{ const L=r.data||[]; if(!L.length) return;
    const m=new Set(L.map(x=>x.source_ref||x.subject)).size, last=L.map(x=>x.mail_at).filter(Boolean).sort().pop();
    b.innerHTML=`Files from email<small>${m} email${m>1?"s":""}${last?" · latest "+new Date(last).toLocaleDateString([], {month:"short",day:"numeric"}):""}</small>`; });
  const pb=D.querySelector("#jpBtn"), q2=D.querySelector("#jQuick");
  if(pb) pb.after(b); else if(q2) q2.appendChild(b);
  else { const bar=D.querySelector(".stagebar"); if(!bar) return; const row=document.createElement("div"); row.className="row"; row.style.marginTop="8px"; row.appendChild(b); bar.after(row); }
});
})();

{ const st=document.createElement("style"); st.textContent=`
.jf .jfsum{font-size:14px;color:var(--muted);margin:8px 0}
.jf .jfbar{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
.jf .jfbar input{font:inherit;font-size:15px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-height:44px}
.jf .jfk{display:flex;gap:6px;flex-wrap:wrap}.jf .jfk .chip{min-height:40px}
.jf .jfold{margin:14px 0 6px;font:600 13px var(--font-ui);color:var(--muted)}
.jf details.mail>summary{cursor:pointer;list-style:none;min-height:44px}
.jf details.mail>summary::-webkit-details-marker{display:none}
#dlg #jfBtn small{display:block;font:500 12px var(--font-ui);letter-spacing:0;text-transform:none;opacity:.75;margin-top:2px}
`; document.head.appendChild(st); }
