/* ---------- In-app update (phone app only) ----------
   Checks GitHub for the newest APK (release tag v1.0.N = build N) against the installed build,
   shows "⬆ Update" in the header when there's a newer one, downloads it and opens Android's installer.
   The first time, Android asks to allow "Install unknown apps" for GVC Vault. */
(()=>{
/* Web version (Robin's iPhone, any browser): no app store - just show "⬆ New version" when the site has been updated
   since this page was opened; tapping it pulls the fresh files past the browser cache and reloads (Robin, Nov 8). */
if(typeof Native==="undefined"||!Native){
  if(!/^https?:/.test(location.protocol)) return;
  const btn=document.createElement("button"); btn.className="btn"; btn.type="button"; btn.id="updBtn"; btn.style.display="none";
  btn.style.cssText+=";border-color:#3ad06b;color:#7be29b"; btn.textContent="⬆ Update"; btn.title="A new version is out - tap to load it";
  const host=document.getElementById("undoBtn"); if(host) host.parentNode.insertBefore(btn,host); else document.body.appendChild(btn);
  let mine=null;
  const ver=async()=>{ try{ const r=await fetch("version.txt?t="+Date.now(),{cache:"no-store"}); if(r.ok) return (await r.text()).trim(); }catch(e){} return null; };
  const check=async()=>{ const v=await ver(); if(!v) return; if(!mine){ mine=v; return; } if(v!==mine) btn.style.display=""; };
  btn.onclick=async()=>{ btn.textContent="Updating…";
    const urls=[location.pathname,...[...document.scripts].map(s=>s.src).filter(Boolean),...[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.href)];
    await Promise.all(urls.map(u=>fetch(u,{cache:"reload"}).catch(()=>{})));
    location.reload(); };
  check(); setInterval(check,5*60e3);
  document.addEventListener("visibilitychange",()=>{ if(!document.hidden) check(); });
  return;
}
const REL="https://api.github.com/repos/jackslinger6/gvc-shop/releases/latest";
let latest=null, mine=null, busy=false;
const btn=document.createElement("button"); btn.className="btn"; btn.type="button"; btn.id="updBtn"; btn.style.display="none";
btn.style.cssText+=";border-color:#3ad06b;color:#7be29b";
const host=document.getElementById("undoBtn"); if(host) host.parentNode.insertBefore(btn,host);
const foot=document.createElement("div"); foot.style.cssText="text-align:center;font-size:12px;color:var(--dim);margin:-24px 0 30px";
const so=document.getElementById("signOut"); if(so&&so.parentNode) so.parentNode.after(foot);
function show(){
  foot.innerHTML=`App ${mine?esc(mine.name):"?"} · <button type="button" class="signout" id="updChk">Check for updates</button>`;
  const c=document.getElementById("updChk"); if(c) c.onclick=()=>check(true);
  const n=latest&&+String(latest.tag_name||"").split(".").pop();
  if(mine&&n&&n>Number(mine.code)){ btn.style.display=""; if(!busy) btn.textContent=`⬆ Update to ${latest.tag_name.replace(/^v/,"")}`; }
  else btn.style.display="none";
}
async function check(manual){
  try{ mine=await Native.appVersion(); }catch(e){ mine=null; if(manual) alert("This copy of the app is too old to update itself - install the latest APK from GitHub once more."); return; }
  try{ const r=await fetch(REL,{headers:{Accept:"application/vnd.github+json"}}); if(r.ok) latest=await r.json(); }catch(e){}
  show();
  if(manual){ const n=latest&&+String(latest.tag_name||"").split(".").pop();
    if(!latest) alert("Couldn't reach GitHub - check your signal.");
    else if(!(n>Number(mine.code))) alert(`You're on the newest version (${mine.name}).`); }
}
btn.onclick=async()=>{
  if(busy) return;
  try{ mine=await Native.appVersion(); }catch(e){}
  if(mine&&mine.canInstall===false){
    if(confirm("Android needs your OK once to let GVC Vault install its own updates.\n\nTap OK, switch on \"Allow from this source\", then come back and tap Update again.")) Native.allowInstalls();
    return;
  }
  const asset=(latest&&latest.assets||[]).find(a=>/\.apk$/i.test(a.name));
  busy=true; btn.textContent="Downloading…";
  let sub=null; try{ sub=await Native.addListener("updateProgress",e=>{ if(e.pct>=0) btn.textContent=`Downloading… ${e.pct}%`; }); }catch(e){}
  try{ await Native.installUpdate({url:asset?asset.browser_download_url:undefined}); btn.textContent="Installing - follow Android's prompt"; }
  catch(e){ const m=String(e.message||e);
    if(/NEED_PERMISSION/.test(m)){ if(confirm("Allow GVC Vault to install updates? Switch on \"Allow from this source\", then tap Update again.")) Native.allowInstalls(); }
    else alert("Update failed: "+m);
    show(); }
  finally{ busy=false; try{ sub&&sub.remove(); }catch(e){} }
};
setTimeout(()=>check(false),4000);
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) check(false); });
})();
