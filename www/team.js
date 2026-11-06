/* ---------- Team: who's on the app, messages, crew My time (Kyle, 2026-11-05) ----------
   WHO'S ON: every signed-in phone joins a realtime "gvc-online" presence channel. On Home (Crew today) each
   person's circle gets a green glowing ring while they have the app open; otherwise it says when they were last on,
   or that they haven't signed in yet. gvc_seen() stamps gvc_members.first_seen/last_seen; the first time a crew
   member signs in, Kyle gets a message from "Vault".
   MESSAGES: tap a person on Home -> their card with a chat thread (gvc_messages, realtime). New messages pop up
   with a banner and a red count on the sender's circle. More > Messages lists every thread.
   CREW MY TIME: crew (Colton) see their own punches by week - edit start/end, delete, add time they forgot to punch.
   Separate from Kyle's My time / invoices. "Copy week" puts the week on the clipboard to text to Robin for now. */
(()=>{
const COL={Kyle:"#2f8ff0",Colton:"#3ad06b",Aaron:"#c9a46a",Cooper:"#e04fa0",Vault:"#ff8a2a"};
const st=document.createElement("style");
st.textContent=`
.cw .p .av{position:relative;transition:box-shadow .3s}
.cw .p.onl .av{box-shadow:0 0 0 3px #17191d,0 0 0 5px #3ad06b,0 0 16px 4px rgba(58,208,107,.55);animation:onl 2.4s ease-in-out infinite}
@keyframes onl{50%{box-shadow:0 0 0 3px #17191d,0 0 0 5px #3ad06b,0 0 6px 1px rgba(58,208,107,.3)}}
.cw .p.never .av{opacity:.55;box-shadow:0 0 0 3px #17191d,0 0 0 4px #4a4f56}
.cw .p .ost{display:block;font-size:10.5px;letter-spacing:.06em;color:var(--muted);margin-top:2px;text-transform:uppercase}
.cw .p.onl .ost{color:#7ff0a8}
.cw .p .mbd{position:absolute;top:-6px;right:-8px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#e5483b;color:#fff;font:700 11px/18px system-ui;text-align:center;box-shadow:0 0 0 2px #17191d}
.tmav{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;font:600 28px Oswald,sans-serif;color:#111;flex:none}
.tmav.onl{box-shadow:0 0 0 3px #17191d,0 0 0 6px #3ad06b,0 0 22px 6px rgba(58,208,107,.5)}
.tmhd{display:flex;gap:14px;align-items:center;margin-bottom:12px}.tmhd b{font:600 24px Oswald,sans-serif;letter-spacing:.04em}.tmhd small{display:block;color:var(--muted);font-size:13px;margin-top:2px}
.tmhd small.on{color:#7ff0a8}
.mthr{display:flex;flex-direction:column;gap:6px;max-height:46vh;overflow:auto;padding:4px 2px 8px}
.mb{max-width:80%;padding:8px 11px;border-radius:14px;font-size:14.5px;line-height:1.35;white-space:pre-wrap;word-wrap:break-word}
.mb.me{align-self:flex-end;background:#2f8ff0;color:#fff;border-bottom-right-radius:4px}
.mb.th{align-self:flex-start;background:#262a30;border-bottom-left-radius:4px}
.mb small{display:block;font-size:10.5px;opacity:.7;margin-top:3px}
.mday0{text-align:center;color:var(--muted);font-size:11px;letter-spacing:.08em;margin:6px 0 2px}
.msend{display:flex;gap:8px;margin-top:8px}.msend textarea{flex:1;min-height:44px;max-height:120px;resize:none;border-radius:12px;padding:10px 12px;font:inherit;font-size:15px}
.msend button{border:0;border-radius:12px;background:#2f8ff0;color:#fff;font:600 14px Oswald,sans-serif;letter-spacing:.08em;padding:0 16px;cursor:pointer}
.tmbtns{display:flex;gap:8px;margin-top:12px}.tmbtns button{flex:1}
.mban{position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top));transform:translate(-50%,-140%);z-index:95;display:flex;gap:10px;align-items:center;
  width:min(520px,calc(100vw - 20px));background:#1d2025;border:1px solid #2f8ff0;border-radius:14px;padding:10px 12px;box-shadow:0 10px 40px rgba(0,0,0,.6);transition:transform .3s cubic-bezier(.2,.8,.2,1);cursor:pointer}
.mban.on{transform:translate(-50%,0)}.mban .tmav{width:36px;height:36px;font-size:17px}.mban div{min-width:0;flex:1}.mban b{display:block;font-size:13px}.mban span{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)}
.mlist button{display:flex;gap:12px;align-items:center;width:100%;text-align:left;background:#1d2025;border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:8px;color:inherit;cursor:pointer}
.mlist .tmav{width:42px;height:42px;font-size:19px}.mlist div{flex:1;min-width:0}.mlist b{display:block}.mlist span{display:block;color:var(--muted);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mlist em{font-style:normal;background:#e5483b;color:#fff;border-radius:9px;padding:1px 7px;font-size:12px;font-weight:700}
.tmrow{margin-top:4px}
/* crew My time */
.mtw{display:flex;align-items:center;gap:8px;margin-bottom:10px}.mtw b{flex:1;text-align:center;font:600 16px Oswald,sans-serif;letter-spacing:.06em}
.mtw button{border:1px solid var(--line);background:#1d2025;color:inherit;border-radius:10px;width:42px;height:38px;font-size:20px;cursor:pointer}
.mttot{display:flex;gap:10px;margin-bottom:12px}.mttot div{flex:1;background:#1d2025;border:1px solid var(--line);border-radius:12px;padding:10px;text-align:center}
.mttot b{display:block;font:600 24px Oswald,sans-serif;color:#7ff0a8}.mttot span{font-size:11px;letter-spacing:.08em;color:var(--muted)}
.mtd{display:flex;justify-content:space-between;font:600 13px Oswald,sans-serif;letter-spacing:.08em;color:var(--muted);margin:12px 2px 6px}
.mtr{display:flex;gap:10px;align-items:center;background:#1d2025;border:1px solid var(--line);border-radius:12px;padding:9px 11px;margin-bottom:6px;cursor:pointer;width:100%;text-align:left;color:inherit}
.mtr div{flex:1;min-width:0}.mtr b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mtr span{font-size:12.5px;color:var(--muted)}
.mtr em{font-style:normal;font:600 16px Oswald,sans-serif;font-variant-numeric:tabular-nums}.mtr.run{border-color:rgba(58,208,107,.6)}.mtr.run em{color:#7ff0a8}
.mtr i{font-style:normal;font-size:10.5px;color:#f5b041;margin-left:6px}
.mted{background:#14161a;border:1px solid #2f8ff0;border-radius:12px;padding:10px;margin:-2px 0 8px}
.mted .row{display:flex;gap:8px}.mted label{flex:1;font-size:12px;color:var(--muted)}.mted input,.mted select{width:100%;margin-top:3px}
.mted .acts{display:flex;gap:8px;margin-top:10px}.mted .acts button{flex:1;min-height:42px}
.mycard{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:#1d2025;border:1px solid var(--line);border-radius:14px;padding:12px 14px;color:inherit;cursor:pointer}
.mycard b{font:600 26px Oswald,sans-serif;color:#7ff0a8}.mycard div{flex:1}.mycard span{display:block;font-size:12px;letter-spacing:.08em;color:var(--muted)}
`;
document.head.appendChild(st);

const $=s=>document.querySelector(s);
const E=s=>typeof esc==="function"?esc(s):String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const me=()=>(window.ME&&ME.name)||"Kyle";
const crew=()=>window.ME&&ME.role==="crew";
const pv=()=>window.ME&&ME.preview;
const say=m=>{ if(typeof todoToast==="function"){ todoToast(m,null); const u=document.getElementById("toastUndo"); if(u) u.style.display="none"; } };
const people=()=>typeof CREW!=="undefined"?CREW:["Kyle","Colton","Aaron","Cooper"];
const av=(n,cls="")=>`<span class="tmav ${cls}" style="background:${COL[n]||"#9aa1aa"}">${E((n||"?")[0])}</span>`;
const ago=t=>{ if(!t) return ""; const s=(Date.now()-new Date(t))/1e3; if(s<90) return "just now"; if(s<3600) return Math.round(s/60)+" min ago"; if(s<86400) return Math.round(s/3600)+"h ago";
  const d=Math.round(s/86400); return d===1?"yesterday":d<7?d+" days ago":new Date(t).toLocaleDateString([], {month:"short",day:"numeric"}); };
const tm=t=>new Date(t).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}).replace(" ","").toLowerCase();

let REAL=null, ONLINE=new Set(), TEAM={}, MSGS=[], started=false;

/* ---- status of a person ---- */
function status(n){
  if(ONLINE.has(n)) return {cls:"onl",txt:"On the app now",short:"ONLINE"};
  const t=TEAM[n];
  if(!t) return {cls:"never",txt:"No app account yet",short:"NO APP"};
  if(!t.first_seen) return {cls:"never",txt:"Hasn't signed in yet",short:"NOT SIGNED IN"};
  return {cls:"",txt:"Last on "+ago(t.last_seen),short:ago(t.last_seen)};
}
const unreadFrom=n=>MSGS.filter(m=>m.to_name===me()&&m.from_name===n&&!m.read_at).length;
const unreadAll=()=>MSGS.filter(m=>m.to_name===me()&&!m.read_at).length;
window.msgUnread=unreadAll;

/* ---- decorate the Crew today circles (Home) ---- */
function decorate(){
  document.querySelectorAll(".cw .p[data-cw]").forEach(b=>{
    const n=b.dataset.cw, s=status(n);
    b.classList.toggle("onl",s.cls==="onl"); b.classList.toggle("never",s.cls==="never");
    let o=b.querySelector(".ost"); if(!o){ o=document.createElement("span"); o.className="ost"; const nm=b.querySelector(".n"); (nm||b).after(o); }
    o.textContent=n===me()?(s.cls==="onl"?"YOU · ONLINE":"YOU"):s.short;
    const a=b.querySelector(".av"); let bd=a&&a.querySelector(".mbd"); const u=unreadFrom(n);
    if(a){ if(u){ if(!bd){ bd=document.createElement("span"); bd.className="mbd"; a.appendChild(bd); } bd.textContent=u; } else if(bd) bd.remove(); }
    b.onclick=()=>person(n);
  });
}
window.teamDecorate=decorate;

/* ---- a person's card: status + messages ---- */
let openThread=null;
function sheetOpen(html){
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); if(openThread&&openThread.ov===ov) openThread=null; };
  ov.onclick=e=>{ if(e.target===ov) close(); };
  return {ov,el:ov.querySelector(".shsheet"),close};
}
function threadHtml(n){
  const L=MSGS.filter(m=>(m.from_name===me()&&m.to_name===n)||(m.from_name===n&&m.to_name===me())).slice(-80);
  if(!L.length) return `<div class="tnote" style="text-align:center;padding:14px 0">${n==="Vault"?"Nothing yet.":`No messages with ${E(n)} yet. Say hi.`}</div>`;
  let day="";
  return L.map(m=>{ const d=new Date(m.at).toDateString(); const dh=d!==day?`<div class="mday0">${d===new Date().toDateString()?"TODAY":new Date(m.at).toLocaleDateString([], {weekday:"short",month:"short",day:"numeric"}).toUpperCase()}</div>`:""; day=d;
    return dh+`<div class="mb ${m.from_name===me()?"me":"th"}">${E(m.text)}<small>${tm(m.at)}${m.from_name===me()&&m.read_at?" · seen":""}</small></div>`; }).join("");
}
async function markRead(n){
  const ids=MSGS.filter(m=>m.to_name===me()&&m.from_name===n&&!m.read_at).map(m=>m.id); if(!ids.length||pv()) return;
  const at=new Date().toISOString(); MSGS.forEach(m=>{ if(ids.includes(m.id)) m.read_at=at; });
  try{ await sb.from("gvc_messages").update({read_at:at}).in("id",ids); }catch(e){} decorate();
}
function person(n){
  const s=status(n), self=n===me();
  const S=sheetOpen(`<div class="tmhd">${av(n,s.cls==="onl"?"onl":"")}<div><b>${E(n)}${self?" (you)":""}</b><small class="${s.cls==="onl"?"on":""}">${s.cls==="onl"?"● ":""}${E(s.txt)}</small></div></div>
    ${self?"":`<div class="mthr" id="tmT">${threadHtml(n)}</div>
    <div class="msend"><textarea id="tmIn" rows="1" placeholder="Message ${E(n)}…"></textarea><button type="button" id="tmGo">SEND</button></div>
    ${s.cls==="never"?`<div class="tnote" style="margin-top:6px">${E(n)} will see it once ${TEAM[n]?"he signs in":"he's set up on the app"}.</div>`:""}`}
    <div class="tmbtns">${crew()?"":`<button class="btn" type="button" id="tmDay">See ${self?"my":E(n)+"'s"} day</button>`}<button class="btn" type="button" id="tmX">Close</button></div>`);
  S.el.querySelector("#tmX").onclick=S.close;
  const dy=S.el.querySelector("#tmDay"); if(dy) dy.onclick=()=>{ S.close(); go("crew"); };
  if(self) return;
  openThread={n,ov:S.ov,el:S.el};
  const T=S.el.querySelector("#tmT"); T.scrollTop=T.scrollHeight; markRead(n);
  const inp=S.el.querySelector("#tmIn"), btn=S.el.querySelector("#tmGo");
  inp.oninput=()=>{ inp.style.height="auto"; inp.style.height=Math.min(120,inp.scrollHeight)+"px"; };
  inp.onkeydown=e=>{ if(e.key==="Enter"&&!e.shiftKey&&innerWidth>900){ e.preventDefault(); btn.click(); } };
  btn.onclick=async()=>{
    const text=inp.value.trim(); if(!text) return;
    if(pv()){ say("Preview only - messages aren't sent from Colton's view."); return; }
    if(n==="Vault"){ say("That's the app's own notes - you can't reply to it."); return; }
    btn.disabled=true;
    const r=await sb.from("gvc_messages").insert({from_name:me(),to_name:n,text}).select().single();
    btn.disabled=false;
    if(r.error){ say("Couldn't send: "+r.error.message); return; }
    inp.value=""; inp.style.height="auto"; if(!MSGS.some(m=>m.id===r.data.id)) MSGS.push(r.data); redrawThread();
  };
  if(innerWidth>900) setTimeout(()=>inp.focus(),300);
}
function redrawThread(){ if(!openThread) return; const T=openThread.el.querySelector("#tmT"); if(!T) return; T.innerHTML=threadHtml(openThread.n); T.scrollTop=T.scrollHeight; }
window.openPerson=person;

/* ---- More > Messages ---- */
window.openInbox=()=>{
  const names=[...new Set([...people(),...MSGS.map(m=>m.from_name===me()?m.to_name:m.from_name)])].filter(n=>n!==me());
  const last=n=>MSGS.filter(m=>(m.from_name===me()&&m.to_name===n)||(m.from_name===n&&m.to_name===me())).slice(-1)[0];
  names.sort((a,b)=>(last(b)?+new Date(last(b).at):0)-(last(a)?+new Date(last(a).at):0));
  const S=sheetOpen(`<h3>MESSAGES</h3><div class="mlist">${names.map(n=>{ const l=last(n), s=status(n), u=unreadFrom(n);
    return `<button type="button" data-tn="${E(n)}">${av(n,s.cls==="onl"?"onl":"")}<div><b>${E(n)}</b><span>${l?E((l.from_name===me()?"You: ":"")+l.text):E(s.txt)}</span></div>${u?`<em>${u}</em>`:l?`<small style="color:var(--muted);font-size:11px">${ago(l.at)}</small>`:""}</button>`; }).join("")}</div>`);
  S.el.querySelectorAll("[data-tn]").forEach(b=>b.onclick=()=>{ S.close(); setTimeout(()=>person(b.dataset.tn),120); });
};

/* ---- incoming banner ---- */
let banT=null;
function banner(m){
  let b=$("#mBan"); if(!b){ b=document.createElement("div"); b.id="mBan"; b.className="mban"; document.body.appendChild(b); }
  b.innerHTML=`${av(m.from_name)}<div><b>${E(m.from_name)}</b><span>${E(m.text)}</span></div>`;
  b.onclick=()=>{ b.classList.remove("on"); person(m.from_name); };
  requestAnimationFrame(()=>b.classList.add("on")); clearTimeout(banT); banT=setTimeout(()=>b.classList.remove("on"),6000);
  try{ navigator.vibrate&&navigator.vibrate([60,40,60]); }catch(e){}
}

/* ---- data + realtime ---- */
async function loadTeam(){ try{ const r=await sb.rpc("gvc_team"); TEAM={}; (r.data||[]).forEach(t=>TEAM[t.name]=t); }catch(e){} decorate(); }
async function loadMsgs(){
  const n=me(); const r=await sb.from("gvc_messages").select("*").or(`to_name.eq.${n},from_name.eq.${n}`).order("at",{ascending:false}).limit(400);
  if(!r.error){ MSGS=(r.data||[]).reverse(); decorate(); }
}
function start(){
  REAL=me();
  const seen=()=>{ if(!document.hidden) sb.rpc("gvc_seen").then(()=>{}).catch(()=>{}); };
  seen(); setInterval(seen,3*60e3); document.addEventListener("visibilitychange",()=>{ if(!document.hidden){ seen(); loadTeam(); } });
  loadTeam(); loadMsgs(); setInterval(loadTeam,5*60e3);
  try{
    const ch=sb.channel("gvc-online",{config:{presence:{key:REAL}}});
    ch.on("presence",{event:"sync"},()=>{ ONLINE=new Set(Object.keys(ch.presenceState())); decorate(); })
      .subscribe(async s=>{ if(s==="SUBSCRIBED") try{ await ch.track({name:REAL,at:Date.now()}); }catch(e){} });
  }catch(e){}
  try{
    sb.channel("gvc_messages").on("postgres_changes",{event:"*",schema:"public",table:"gvc_messages"},p=>{
      const m=p.new; if(!m||!m.id) return; const n=me();
      if(m.to_name!==n&&m.from_name!==n) return;
      const i=MSGS.findIndex(x=>x.id===m.id); if(i>=0) MSGS[i]=m; else { MSGS.push(m);
        if(m.to_name===n&&m.from_name!==n&&p.eventType==="INSERT"){ if(openThread&&openThread.n===m.from_name) markRead(m.from_name); else banner(m); } }
      redrawThread(); decorate();
    }).subscribe();
    sb.channel("gvc_members_seen").on("postgres_changes",{event:"UPDATE",schema:"public",table:"gvc_members"},()=>loadTeam()).subscribe();
  }catch(e){}
}
setInterval(()=>{ if(!started&&typeof db!=="undefined"&&db&&window.ME){ started=true; start(); } },1000);

/* ---- re-decorate after every render; crew home gets the team row + My time card ---- */
const _render=render;
render=function(){ _render(); decorate(); };
const _ch=window.crewHome;
window.crewHome=B=>{
  _ch(B);
  const hm=B.querySelector(".hm"); if(!hm) return;
  const sec=document.createElement("section"); sec.setAttribute("aria-label","Team");
  sec.innerHTML=`<h4><span>MY TIME</span></h4><button class="mycard" type="button" id="myTimeC"><div><span>THIS WEEK</span><b id="myTimeW">…</b></div><div style="text-align:right"><span>TODAY</span><b id="myTimeD" style="font-size:20px">…</b></div><span style="font-size:22px;color:var(--muted)">›</span></button>
    <h4 style="margin-top:16px"><span>THE CREW</span><span>TAP TO MESSAGE</span></h4>
    <div class="cw tmrow">${people().map(p=>`<button class="p" type="button" data-cw="${E(p)}"><span class="av" style="background:${COL[p]||"#9aa1aa"}">${E(p[0])}</span><span class="n">${E(p)}</span></button>`).join("")}</div>`;
  hm.appendChild(sec);
  sec.querySelector("#myTimeC").onclick=()=>window.openMyTime();
  weekPunches(0).then(L=>{ const w=document.getElementById("myTimeW"), d=document.getElementById("myTimeD"); if(!w) return;
    const now=Date.now(), t0=new Date(); t0.setHours(0,0,0,0);
    const ms=p=>paidMs(p.start_at,p.end_at||now);
    w.textContent=H(L.reduce((a,p)=>a+ms(p),0)); d.textContent=H(L.filter(p=>new Date(p.start_at)>=t0).reduce((a,p)=>a+ms(p),0)); });
  decorate();
};

/* ---- crew My time ---- */
const H=ms=>{ const h=ms/36e5; return (Math.round(h*4)/4).toFixed(2).replace(/\.?0+$/,"")+"h"; };
const wkStart=off=>{ const d=new Date(); d.setHours(0,0,0,0); const dow=(d.getDay()+6)%7; d.setDate(d.getDate()-dow+off*7); return d; }; // weeks start Monday
const pad=n=>String(n).padStart(2,"0");
const dIn=t=>{ const d=new Date(t); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const tIn=t=>{ const d=new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
async function weekPunches(off){
  const a=wkStart(off), b=new Date(a); b.setDate(b.getDate()+7);
  const r=await sb.from("gvc_punches").select("*").eq("who",me()).gte("start_at",a.toISOString()).lt("start_at",b.toISOString()).order("start_at");
  return r.data||[];
}
let mtOff=0;
window.openMyTime=()=>{ mtOff=0; const S=sheetOpen(`<h3>MY TIME · ${E(me()).toUpperCase()}</h3><div id="mtBody"><div class="tnote">Loading…</div></div>`); drawMT(S); };
async function drawMT(S){
  const B=S.el.querySelector("#mtBody"); if(!B) return;
  const L=await weekPunches(mtOff); const a=wkStart(mtOff), z=new Date(a); z.setDate(z.getDate()+6);
  const now=Date.now(), ms=p=>paidMs(p.start_at,p.end_at||now);
  const days={}; L.forEach(p=>{ (days[dIn(p.start_at)]=days[dIn(p.start_at)]||[]).push(p); });
  const tot=L.reduce((s,p)=>s+ms(p),0), nd=Object.keys(days).length;
  const lbl=mtOff===0?"THIS WEEK":mtOff===-1?"LAST WEEK":`${a.toLocaleDateString([], {month:"short",day:"numeric"})} – ${z.toLocaleDateString([], {month:"short",day:"numeric"})}`.toUpperCase();
  B.innerHTML=`<div class="mtw"><button type="button" id="mtP">‹</button><b>${lbl}</b><button type="button" id="mtN" ${mtOff>=0?"disabled style=\"opacity:.3\"":""}>›</button></div>
    <div class="mttot"><div><b>${H(tot)}</b><span>HOURS</span></div><div><b style="color:var(--text)">${nd}</b><span>DAYS</span></div><div><b style="color:var(--text)">${L.length}</b><span>ENTRIES</span></div></div>
    ${Object.keys(days).sort().map(d=>{ const P=days[d]; const dt=new Date(d+"T12:00");
      return `<div class="mtd"><span>${dt.toLocaleDateString([], {weekday:"long",month:"short",day:"numeric"}).toUpperCase()}</span><span>${H(P.reduce((s,p)=>s+ms(p),0))}</span></div>`+
        P.map(p=>`<button type="button" class="mtr ${p.end_at?"":"run"}" data-pid="${p.id}"><div><b>${E(p.job_name||"")}${p.manual?`<i>ADDED</i>`:p.edited_at?`<i>EDITED</i>`:""}</b><span>${E(p.task_name||"")} · ${tm(p.start_at)} – ${p.end_at?tm(p.end_at):"now"}</span></div><em>${H(ms(p))}</em></button><div class="mted" data-ed="${p.id}" hidden></div>`).join(""); }).join("")
      ||`<div class="tnote" style="text-align:center;padding:16px 0">No time punched ${mtOff===0?"this week yet":"that week"}.</div>`}
    <div class="tmbtns"><button class="btn" type="button" id="mtAdd">+ Add time I forgot</button><button class="btn" type="button" id="mtCopy">Copy week</button></div>
    <div class="mted" id="mtNew" hidden></div>
    <div class="tnote" style="margin-top:10px">Breaks don't count (10:00-10:15, 12:00-12:30, 3:00-3:15). Tap an entry to fix the times. This is your own record - it isn't on Kyle's time sheet. "Copy week" copies it so you can text it to Robin.</div>`;
  B.querySelector("#mtP").onclick=()=>{ mtOff--; drawMT(S); };
  B.querySelector("#mtN").onclick=()=>{ if(mtOff<0){ mtOff++; drawMT(S); } };
  B.querySelectorAll("[data-pid]").forEach(b=>b.onclick=()=>{ const p=L.find(x=>String(x.id)===b.dataset.pid); const ed=B.querySelector(`[data-ed="${b.dataset.pid}"]`); if(!ed.hidden){ ed.hidden=true; return; } editor(ed,p,S); });
  B.querySelector("#mtAdd").onclick=()=>{ const ed=B.querySelector("#mtNew"); if(!ed.hidden){ ed.hidden=true; return; } editor(ed,null,S); ed.scrollIntoView({behavior:"smooth",block:"nearest"}); };
  B.querySelector("#mtCopy").onclick=async()=>{
    const txt=`${me()} - hours ${a.toLocaleDateString([], {month:"short",day:"numeric"})} to ${z.toLocaleDateString([], {month:"short",day:"numeric"})}\n`+
      Object.keys(days).sort().map(d=>{ const P=days[d]; return `${new Date(d+"T12:00").toLocaleDateString([], {weekday:"short",month:"short",day:"numeric"})}: ${H(P.reduce((s,p)=>s+ms(p),0))} (${tm(P[0].start_at)}-${P[P.length-1].end_at?tm(P[P.length-1].end_at):"now"})\n`+P.map(p=>`  ${p.job_name||""} - ${p.task_name||""} ${H(ms(p))}`).join("\n"); }).join("\n")+`\nTotal: ${H(tot)}`;
    try{ await navigator.clipboard.writeText(txt); say("Week copied - paste it in a text to Robin."); }catch(e){ prompt("Copy this:",txt); }
  };
}
function editor(ed,p,S){
  const act=(typeof jobs!=="undefined"?jobs:[]).filter(j=>!j.archived&&j.stage!=="done").sort((x,y)=>String(x.name).localeCompare(String(y.name),undefined,{numeric:true}));
  const now=new Date(), st0=p?p.start_at:new Date(now.getTime()-36e5).toISOString();
  ed.hidden=false;
  ed.innerHTML=`${p?"":`<label>Job<select data-f="job">${act.map(j=>`<option value="${E(j.id)}">${E(j.name)}</option>`).join("")}</select></label>
      <label style="display:block;margin-top:6px">What you did<input data-f="task" placeholder="e.g. Welding the headache rack"></label>`}
    <div class="row" style="margin-top:6px"><label>Day<input type="date" data-f="d" value="${dIn(st0)}"></label><label>Start<input type="time" data-f="s" value="${tIn(st0)}"></label><label>End<input type="time" data-f="e" value="${p&&!p.end_at?"":tIn(p?p.end_at:now)}" ${p&&!p.end_at?"placeholder=\"running\"":""}></label></div>
    ${p&&!p.end_at?`<div class="tnote" style="margin-top:4px">Still running - leave End empty to keep the clock going.</div>`:""}
    <div class="acts">${p?`<button class="btn" type="button" data-a="del" style="color:#ff9b9b">Delete</button>`:""}<button class="btn" type="button" data-a="x">Cancel</button><button class="btn primary" type="button" data-a="ok">Save</button></div>`;
  const f=k=>ed.querySelector(`[data-f="${k}"]`);
  ed.querySelector('[data-a="x"]').onclick=()=>{ ed.hidden=true; };
  const dl=ed.querySelector('[data-a="del"]');
  if(dl) dl.onclick=async()=>{ if(pv()){ say("Preview only."); return; } if(!confirm("Delete this time entry?")) return;
    const r=await sb.from("gvc_punches").delete().eq("id",p.id); if(r.error){ say("Couldn't delete: "+r.error.message); return; } say("Entry deleted."); drawMT(S); };
  ed.querySelector('[data-a="ok"]').onclick=async()=>{
    if(pv()){ say("Preview only - Colton's time isn't changed from here."); return; }
    const d=f("d").value, s=f("s").value, e=f("e").value;
    if(!d||!s){ say("Pick the day and start time."); return; }
    const sa=new Date(`${d}T${s}`); let ea=e?new Date(`${d}T${e}`):null;
    if(ea&&ea<=sa) ea.setDate(ea.getDate()+1); // went past midnight
    if(ea&&ea-sa>16*36e5){ say("That's over 16 hours - check the times."); return; }
    if(!p&&!ea){ say("Put in the end time too."); return; }
    if(ea&&ea>new Date(Date.now()+5*60e3)){ say("End time is in the future."); return; }
    let r;
    if(p) r=await sb.from("gvc_punches").update({start_at:sa.toISOString(),end_at:ea?ea.toISOString():null,edited_at:new Date().toISOString()}).eq("id",p.id);
    else { const j=act.find(x=>x.id===f("job").value); const task=f("task").value.trim()||"Shop work";
      r=await sb.from("gvc_punches").insert({who:me(),job_id:j?j.id:null,job_name:j?j.name:"",task_id:null,task_name:task,start_at:sa.toISOString(),end_at:ea.toISOString(),manual:true}); }
    if(r.error){ say("Couldn't save: "+r.error.message); return; }
    say(p?"Time fixed.":"Time added."); drawMT(S);
  };
}
})();
