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
  const rows=r.data||[];
  const byMail=new Map(); rows.forEach(f=>{ const k=f.source_ref||f.subject; if(!byMail.has(k)) byMail.set(k,{f,list:[]}); byMail.get(k).list.push(f); });
  const fileRow=f=>`<div class="f"><span class="n">${esc(f.name)}<span class="k">${esc(f.kind||"")} · ${kb(f.size||0)}</span></span><span style="display:flex;gap:6px"><button class="btn sm" type="button" data-fo="${esc(f.path)}">Open</button><button class="btn sm ghost" type="button" data-fo="${esc(f.path)}" data-fd="${esc(f.name)}">Download</button></span></div>`;
  const mails=[...byMail.values()].map(({f,list})=>{
    const top=list.filter(x=>!x.in_zip), inz=list.filter(x=>x.in_zip);
    const zips=[...new Set(inz.map(x=>x.in_zip))];
    return `<div class="mail"><div class="hd">${esc(f.subject||"(no subject)")}</div><div class="mt">${esc(f.mail_from||"")} · ${f.mail_at?new Date(f.mail_at).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):""}${f.supplier?" · "+esc(f.supplier):""} · ${list.length} file${list.length>1?"s":""}</div>
      ${top.map(fileRow).join("")}
      ${zips.map(z=>{ const l=inz.filter(x=>x.in_zip===z); return `<details><summary>Inside ${esc(z)} (${l.length})</summary>${l.map(fileRow).join("")}</details>`; }).join("")}</div>`;
  }).join("");
  D.innerHTML=`<div class="jf">${head}<div class="tnote">Attachments from order, quote and drawing emails are saved here automatically by the email check. Order DXFs also go into Parts &amp; drawings (the count list).</div>${mails||`<div class="tnote" style="margin-top:10px">No files saved for this job yet.</div>`}</div>`;
  $("#jfBack").onclick=()=>openJob(j.id);
  D.querySelectorAll("[data-fo]").forEach(el=>el.onclick=async()=>{ el.disabled=true;
    const s=await sb.storage.from("gvc-parts").createSignedUrl(el.dataset.fo,60*30,el.dataset.fd?{download:el.dataset.fd}:undefined); el.disabled=false;
    if(s.data&&s.data.signedUrl) window.open(s.data.signedUrl,"_blank"); });
}
window.openJobFiles=openFiles;

/* ---- button in the job dialog, beside Parts & drawings ---- */
const _draw=drawDlg;
drawDlg=function(){
  _draw(); const j=job(); if(!j||typeof sb==="undefined") return; const D=$("#dlg");
  const b=document.createElement("button"); b.className="btn sm"; b.type="button"; b.id="jfBtn"; b.textContent="Files";
  b.onclick=()=>openFiles({...j,id:openId||j.id});
  const jid=openId; sb.from("gvc_job_files").select("id",{count:"exact",head:true}).eq("job_id",jid).then(r=>{ if(r.count) b.textContent=`Files (${r.count})`; });
  const pb=D.querySelector("#jpBtn");
  if(pb) pb.after(b);
  else { const bar=D.querySelector(".stagebar"); if(!bar) return; const row=document.createElement("div"); row.className="row"; row.style.marginTop="8px"; row.appendChild(b); bar.after(row); }
};
})();
