/* ---------- Game-style shell (Nov 4 2026, first pass) ----------
   Design: claude.ai/artifact/WnAQ86H8RWNK1gciZiD7cg
   - Home: "Next up" cards you swipe through (everything that needs you, most urgent first, one big button each),
     crew progress for today, top to-dos, what the email check did.
   - Navigation: bottom bar on phones, rail on the left on a PC: Home · Jobs · [+] · Crew · More.
     More pops up: To do, My time, Inventory, NCRs, Revisions, Finished jobs, App ideas, New job, Undo, Sign out.
   - The orange + opens the quick-action wheel (tap, or hold and slide to one and let go):
     Record · Count · Quick job · Log time · Add to-do · Ask Claude.
   - Quick job: work someone is already on (e.g. Randy gave Cooper something) - goes on the shop floor with a task
     assigned to them; no job number = a "Get a job number" card with Email Robin / Email Randy.
   Everything else (boards, job cards, planner, time, inventory) is the existing app, shown inside the new frame. */
(()=>{
const ROBIN="Robin.GVC@hotmail.com", RANDY="gordeyvillecustoms@hotmail.com";
const css=document.createElement("style");
css.textContent=`
body>header{display:none}
.shtop .bd[hidden],.shnav .bd[hidden]{display:none !important}
#ideasBtn{display:none !important}
body:has(.scrim.on) .shnav,body:has(.chatp.on) .shnav{display:none}
.nu .ntt{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
#app>div:has(>#signOut){display:none}
#chatFab{display:none !important}
#tabs{display:none !important}
.subnav .sn[data-sv="crew"],.subnav .sn[data-sv="ncr"],.subnav .sn[data-sv="revs"],.subnav .sep{display:none !important}
.shtop{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:calc(12px + env(safe-area-inset-top)) 16px 4px;max-width:1500px;margin:0 auto}
.shtop .nm{font-family:"Russo One",sans-serif;font-size:21px;letter-spacing:.05em;color:#f4f1ec;line-height:1}
.shtop .dt{font-family:Oswald,sans-serif;font-size:12px;letter-spacing:.14em;color:var(--muted);margin-top:4px}
.shtop .ib{width:44px;height:44px;border-radius:12px;border:1px solid var(--line);background:var(--panel);display:flex;align-items:center;justify-content:center;position:relative;cursor:pointer;color:var(--text)}
.shtop .ib .bd{position:absolute;top:-5px;right:-5px;min-width:20px;height:20px;border-radius:10px;background:var(--orange);color:#111;font:600 12px Oswald,sans-serif;display:flex;align-items:center;justify-content:center;padding:0 4px}
.shnav{position:fixed;z-index:60;background:#15171a;border-color:var(--line);display:grid}
.shnav .ni{font:500 12px Oswald,sans-serif;letter-spacing:.08em;color:#9aa1aa;background:none;border:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;position:relative;min-height:56px;transition:color .15s,transform .12s}
.shnav .ni:active{transform:scale(.92)}
.shnav .ni.on{color:var(--orange)}
.shnav .ni .bd{position:absolute;top:2px;left:calc(50% + 6px);min-width:18px;height:18px;border-radius:9px;background:var(--red);color:#fff;font:600 11px Inter,sans-serif;display:flex;align-items:center;justify-content:center;padding:0 4px}
.shnav .plus{width:64px;height:64px;border-radius:32px;border:4px solid var(--bg);background:linear-gradient(180deg,#ff9a40,#e8711a);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 18px rgba(255,120,40,.35);transition:transform .15s;touch-action:none;margin:auto}
.shnav .plus:active{transform:scale(.93)}
.shnav .plus.open{transform:rotate(45deg)}
@media (max-width:899px){
  .shnav{left:0;right:0;bottom:0;height:calc(78px + env(safe-area-inset-bottom));padding:0 4px env(safe-area-inset-bottom);grid-template-columns:repeat(5,minmax(0,1fr));align-items:center;border-top:1px solid var(--line)}
  .shnav .plus{margin-top:-30px}
  body{padding-bottom:96px}
}
@media (min-width:900px){
  .shnav{top:0;bottom:0;left:0;width:92px;padding:16px 6px;grid-template-rows:auto repeat(4,72px) 1fr;align-content:start;gap:6px;border-right:1px solid var(--line)}
  .shnav .plus{order:-1;margin:4px auto 14px}
  body{padding-left:92px}
}
@keyframes shIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.shanim{animation:shIn .24s cubic-bezier(.2,.8,.2,1)}
.btn{transition:transform .1s,border-color .15s}
.btn:active{transform:scale(.97)}
/* home */
.hm{display:grid;gap:16px;margin-top:10px;grid-template-columns:minmax(0,1fr)}
@media (min-width:1000px){ .hm{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);align-items:start} }
.hm h4{margin:0 0 8px;font:500 12px Oswald,sans-serif;letter-spacing:.16em;color:var(--muted);display:flex;justify-content:space-between;align-items:baseline}
.ajs{grid-column:1/-1}
.ajg{margin-bottom:10px}.ajh{font:600 11px Oswald,sans-serif;letter-spacing:.16em;color:var(--c);margin:6px 2px 6px}
.aj{display:grid;grid-template-columns:auto 1fr auto;grid-template-rows:auto auto;column-gap:10px;align-items:center;width:100%;text-align:left;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 14%,#17191d),#15171a 60%);border:1px solid #2a2e34;border-left:4px solid var(--c);border-radius:12px;padding:10px 12px;margin-bottom:6px;color:var(--text);cursor:pointer;font:inherit;transition:transform .1s}
.aj:active{transform:scale(.985)}
.ajn{grid-row:1/3;font:600 13px Oswald,sans-serif;letter-spacing:.06em;background:rgba(0,0,0,.35);border:1px solid #3a3e45;border-radius:8px;padding:6px 8px;min-width:58px;text-align:center}
.ajn.none{color:#ff9b91;border-color:#7a2e28}
.ajt{font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ajs2{grid-column:2;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ajd{grid-column:3;grid-row:1/3;width:10px;height:10px;border-radius:50%;background:#e5483b;box-shadow:0 0 8px #e5483b}
@media (min-width:1000px){ .ajs .ajg{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));column-gap:8px} .ajs .ajh{grid-column:1/-1} }
.hm h4 button{font:500 13px Inter,sans-serif;letter-spacing:0;color:#ffb36b;background:none;border:none;cursor:pointer;padding:4px}
.nu{position:relative}
.nu .trk{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding-bottom:2px}
.nu .trk::-webkit-scrollbar{display:none}
.nu .cd{flex:0 0 100%;scroll-snap-align:center;border-radius:18px;padding:16px;background:linear-gradient(160deg,rgba(255,138,42,.10),rgba(0,0,0,.25));border:1px solid color-mix(in srgb,var(--c) 45%,#2a2e35);display:flex;flex-direction:column;gap:10px;min-height:178px;box-sizing:border-box}
.nu .ntg{align-self:flex-start;font:600 11px Oswald,sans-serif;letter-spacing:.1em;padding:3px 8px;border-radius:6px;background:var(--c);color:#111}
.nu .ntt{font:600 22px/1.15 Oswald,sans-serif;color:#f4f5f6}
.nu .nsub{font-size:13px;color:#b9bec5}
.nu .nac{display:flex;gap:8px;margin-top:auto}
.nu .nac .go{flex:1;height:48px;border-radius:12px;border:none;background:var(--c);color:#111;font:600 16px Oswald,sans-serif;letter-spacing:.06em;cursor:pointer;transition:transform .1s}
.nu .nac .go:active{transform:scale(.97)}
.nu .nac .lt{min-width:92px;height:48px;border-radius:12px;border:1px solid #3a3e45;background:transparent;color:#d6d9dd;font:500 15px Oswald,sans-serif;letter-spacing:.06em;cursor:pointer}
.nu .dots{display:flex;gap:6px;justify-content:center;align-items:center;margin-top:10px}
.nu .dots i{width:7px;height:7px;border-radius:4px;background:#3a3e45;transition:width .2s,background .2s}
.nu .dots i.on{width:20px;background:var(--orange)}
.nu .dots span{font:500 12px Oswald,sans-serif;letter-spacing:.1em;color:var(--muted);margin-left:8px}
.nu .arr{position:absolute;top:70px;width:36px;height:36px;border-radius:18px;border:1px solid #3a3e45;background:#15171a;color:#e9ebee;cursor:pointer;display:none}
@media (hover:hover){ .nu .arr{display:block} }
.nu .arr.l{left:-12px}.nu .arr.r{right:-12px}
.nu .empty{border-radius:18px;padding:22px;border:1px solid #2a2e35;background:rgba(0,0,0,.25);text-align:center;color:#b9bec5}
.cw{display:grid;grid-template-columns:repeat(auto-fit,minmax(62px,1fr));gap:8px}
.cw .p{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 6px;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer}
.cw .p.idle{border-color:#5a2a2a}
.cw .av{width:36px;height:36px;border-radius:18px;font:600 15px Oswald,sans-serif;display:flex;align-items:center;justify-content:center;color:#111}
.cw .n{font-size:12px;color:#d6d9dd}.cw .s{font-size:11px;color:var(--muted)}.cw .p.idle .s{color:#ff9b9b}
.cw .bar{width:80%;height:5px;border-radius:3px;background:#2a2e35;overflow:hidden}.cw .bar i{display:block;height:100%;background:var(--green)}
.qs{display:flex;flex-direction:column;gap:8px}
.qs .q{display:flex;align-items:center;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px;cursor:pointer;text-align:left;color:var(--text);font:inherit;font-size:14px}
.qs .q i{width:4px;align-self:stretch;border-radius:2px;background:var(--c)}
.qs .q span{flex:1}
.qs .q em{font:500 11px Oswald,sans-serif;font-style:normal;letter-spacing:.08em;color:var(--muted)}
.adone{font-size:12.5px;color:#8e959e;display:flex;gap:6px;align-items:center;background:none;border:none;cursor:pointer;padding:6px 0;text-align:left}
/* popups */
.shov{position:fixed;inset:0;z-index:80;background:rgba(5,6,8,.0);transition:background .2s;display:flex;align-items:flex-end;justify-content:center}
.shov.on{background:rgba(5,6,8,.72)}
.shsheet{width:min(560px,100%);background:#17191d;border:1px solid var(--line);border-radius:20px 20px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom));transform:translateY(100%);transition:transform .26s cubic-bezier(.2,.8,.2,1);max-height:86vh;overflow:auto}
.shov.on .shsheet{transform:none}
@media (min-width:900px){ .shov{align-items:center} .shsheet{border-radius:20px;transform:translateY(20px) scale(.96);opacity:0;transition:transform .22s,opacity .22s} .shov.on .shsheet{transform:none;opacity:1} }
.shsheet h3{margin:0 0 12px;font:600 18px Oswald,sans-serif;letter-spacing:.06em}
.mgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.mgrid button{min-height:86px;border-radius:14px;border:1px solid var(--line);background:var(--panel);color:var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font:500 13px Oswald,sans-serif;letter-spacing:.06em;cursor:pointer;position:relative;opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s,border-color .15s}
.shov.on .mgrid button{opacity:1;transform:none}
.mpv{margin:4px 0 16px;padding:12px;border:1px solid rgba(144,133,233,.45);border-radius:16px;background:rgba(144,133,233,.07)}
.mpvh{font:600 11.5px Oswald,sans-serif;letter-spacing:.16em;color:#b9b1ff;margin:0 2px 8px}
.mpvb{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mpvb button{display:flex;gap:10px;align-items:center;text-align:left;min-height:64px;border-radius:14px;border:1px solid #9085e9;background:linear-gradient(135deg,rgba(144,133,233,.28),rgba(144,133,233,.08));color:var(--text);padding:10px 12px;cursor:pointer;font:inherit;box-shadow:0 0 16px rgba(144,133,233,.18)}
.mpvb button:hover{border-color:#b9b1ff}
.mpvb .av{width:34px;height:34px;border-radius:50%;background:#9085e9;color:#0b0b14;display:grid;place-items:center;font:600 16px Oswald,sans-serif;flex:none}
.mpvb b{display:block;font-size:14px}.mpvb small{display:block;font-size:11.5px;color:var(--muted)}
.mgrid button:hover{border-color:#5a5f68}
.mgrid button .bd{position:absolute;top:6px;right:8px;min-width:18px;height:18px;border-radius:9px;background:var(--red);color:#fff;font:600 11px Inter,sans-serif;display:flex;align-items:center;justify-content:center;padding:0 4px}
.shsheet label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted);margin-bottom:12px}
.shsheet input,.shsheet select{font:inherit;font-size:16px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:11px 12px}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chips button{min-height:44px;padding:0 16px;border-radius:22px;border:1px solid var(--line);background:var(--panel2);color:var(--text);font:500 15px Oswald,sans-serif;letter-spacing:.05em;cursor:pointer}
.chips button.on{background:var(--orange);color:#111;border-color:var(--orange)}
.talk{width:100%;min-height:54px;border-radius:14px;border:none;background:linear-gradient(180deg,#ff9a40,#e8711a);color:#111;font:600 16px Oswald,sans-serif;letter-spacing:.06em;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;margin:2px 0 14px;transition:transform .1s}
.talk:active{transform:scale(.97)}
.orl{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px;margin:0 0 12px}.orl:before,.orl:after{content:"";flex:1;height:1px;background:var(--line)}
/* wheel */
.whl{position:fixed;inset:0;z-index:90;background:rgba(5,6,8,0);transition:background .18s;touch-action:none}
.whl.on{background:rgba(5,6,8,.8)}
.whl .ring{position:absolute;width:300px;height:300px;margin:-150px 0 0 -150px;border-radius:150px;border:1px solid #2a2e35;background:radial-gradient(circle,#15171a 0 45%,rgba(21,23,26,.9) 46%);transform:scale(.6);opacity:0;transition:transform .22s cubic-bezier(.2,.8,.2,1),opacity .18s}
.whl.on .ring{transform:none;opacity:1}
.whl .it{position:absolute;width:78px;margin:-39px 0 0 -39px;display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:none;color:#e9ebee;font:500 12.5px Oswald,sans-serif;letter-spacing:.08em;cursor:pointer;transform:translate(0,0) scale(.3);opacity:0;transition:transform .26s cubic-bezier(.2,.9,.3,1.3),opacity .18s;transition-delay:var(--d)}
.whl.on .it{transform:translate(var(--x),var(--y)) scale(1);opacity:1}
.whl .it .c{width:66px;height:66px;border-radius:33px;background:#1f2328;border:2px solid var(--c);display:flex;align-items:center;justify-content:center;transition:transform .12s,background .12s}
.whl .it.hot .c,.whl .it:hover .c{transform:scale(1.12);background:color-mix(in srgb,var(--c) 30%,#1f2328)}
.whl .ctr{position:absolute;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:30px;border:none;background:linear-gradient(180deg,#ff9a40,#e8711a);display:flex;align-items:center;justify-content:center;cursor:pointer}
.whl .hint{position:absolute;left:0;right:0;text-align:center;font-size:13px;color:#9aa1aa;opacity:0;transition:opacity .3s .15s}
.whl.on .hint{opacity:1}
#app>section.list.shhide{display:none}
`;
document.head.appendChild(css);

const ic={
  home:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  jobs:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  crew:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  more:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  chat:'<path d="M21 12a8 8 0 0 1-11.6 7.2L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  rec:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  count:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 9l2 2 4-4M8 16h8"/>',
  bolt:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  check:'<path d="M5 12l5 5L20 7"/>',
  list:'<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  box:'<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  warn:'<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>',
  rev:'<path d="M4 4v6h6M20 20v-6h-6"/><path d="M5 15a7 7 0 0 0 12 3M19 9A7 7 0 0 0 7 6"/>',
  trophy:'<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>',
  bulb:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  out:'<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11"/>',
  newj:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>',
  heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
};
const svg=(k,c="currentColor",s=24,w=1.8)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic[k]}</svg>`;
const SECT=v=>v==="home"?"home":["pipeline","ordering","build","archive"].includes(v)?"jobs":v==="crew"?"crew":"more";
const go=v=>{ cur=v; try{history.replaceState(null,"","#"+v)}catch(e){} render(); window.scrollTo({top:0,behavior:"smooth"}); };
window.shellGo=go;
const lastJobs=()=>{ try{ const v=localStorage.getItem("gvc_last_jobs"); return ["pipeline","ordering","build"].includes(v)?v:"ordering"; }catch(e){ return "ordering"; } };
const jobNum=n=>window.jobNum?window.jobNum(n):"";
const jname=id=>{ const j=jobs.find(x=>x.id===id); return j?j.name:""; };

/* ---- top bar + nav ---- */
const top=document.createElement("div"); top.className="shtop"; top.hidden=true;
top.innerHTML=`<div><div class="nm">GVC VAULT</div><div class="dt" id="shDate"></div></div>
  <div style="display:flex;gap:8px"><button class="ib" type="button" id="shBell" aria-label="To do">${svg("list","#e9ebee",20)}<span class="bd" id="shBellN" hidden></span></button><button class="ib" type="button" id="shChat" aria-label="Ask Claude">${svg("chat","#ffb36b",20)}</button></div>`;
const wrap=document.querySelector(".wrap"); wrap.parentNode.insertBefore(top,wrap);
const nav=document.createElement("nav"); nav.className="shnav"; nav.setAttribute("aria-label","Main"); nav.hidden=true;
nav.innerHTML=`<button class="ni" type="button" data-n="home">${svg("home")}HOME</button>
  <button class="ni" type="button" data-n="jobs">${svg("jobs")}JOBS<span class="bd" id="shJobsN" hidden></span></button>
  <div style="display:flex;align-items:center;justify-content:center"><button class="plus" type="button" id="shPlus" aria-label="Quick actions">${svg("plus","#111",28,2.6)}</button></div>
  <button class="ni" type="button" data-n="crew">${svg("crew")}CREW<span class="bd" id="shCrewN" hidden></span></button>
  <button class="ni" type="button" data-n="more">${svg("more")}MORE<span class="bd" id="shMoreN" hidden></span></button>`;
document.body.appendChild(nav);
nav.querySelectorAll("[data-n]").forEach(b=>b.onclick=()=>{ const n=b.dataset.n; if(n==="more") return moreMenu(); go(n==="jobs"?((window.ME&&(ME.role==="crew"||ME.role==="parts"))?"build":lastJobs()):n); });
top.querySelector("#shChat").onclick=()=>openChat();
top.querySelector("#shBell").onclick=()=>go("todo");
function note(m){ todoToast(m,null); const u=$("#toastUndo"); if(u) u.style.display="none"; }
const upd=$("#updBtn"); if(upd) top.lastElementChild.prepend(upd);
/* talk instead of typing: opens Ask Claude with a short instruction already in the box and starts the mic;
   what Kyle says goes after it and is sent when he stops (Kyle, 2026-11-04) */
function talk(prefix,close){ if(close) close(); openChat(); setTimeout(()=>{ const box=$("#chatIn"); if(box) box.value=prefix?prefix+" ":"";
  if(typeof micStart==="function"&&!micOn) micStart(); },350); }
window.shellTalk=talk;
/* "Talk about this": a mic that knows what's on screen. What Kyle is looking at (open job, count sheet, tab) goes to
   Claude with the message, so "move this job to done" just works. Snapshot is taken when the mic is pressed
   because the chat panel can cover the card. (Kyle, 2026-11-04) */
const VIEWN={home:"Home",todo:"To do",pipeline:"Jobs - pipeline",ordering:"Jobs - ordering",build:"Jobs - shop floor",archive:"Finished jobs",crew:"Crew & week plan",time:"My time",inv:"Inventory",ncr:"NCRs",revs:"Revisions"};
function lookNow(){
  const sc=$("#scrim"), D=$("#dlg"), open=sc&&sc.classList.contains("on");
  if(open&&D){
    const c=D.querySelector(".cnt h3");
    if(c){ const sub=[...D.querySelectorAll(".cnt .csub")].map(x=>x.textContent.trim()).join(" · ");
      return `Count sheet open: ${c.textContent.trim()}${sub?" ("+sub+")":""}`; }
    let j=null; try{ j=typeof job==="function"?job():null; }catch(e){}
    if(j){ const st=(STAGES.find(s=>s.k===j.stage)||{}).t||j.stage;
      const sups=(j.suppliers||[]).filter(x=>x.status!=="dropped").map(x=>`${x.name} [supplier id ${x.id}]: ${x.status}${x.quoteNo?" #"+x.quoteNo:""}`).join("; ");
      const tasks=(j.assemblies||[]).map(a=>`${a.name}: ${a.status}${a.who?" ("+a.who+")":""}`).join("; ");
      return `Job card open: "${j.name}" [job id ${j.id}] - stage ${st}${j.archived?" (archived)":""}${sups?". Suppliers: "+sups:""}${tasks?". Tasks: "+tasks:""}`; }
    const h=D.querySelector("h2,h3"); if(h) return `Popup open: ${h.textContent.trim()}`;
  }
  return `Tab: ${VIEWN[cur]||cur}`;
}
let lookSnap=null, lookAt=0;
window.shellLook=()=>{ const live=lookNow(); if(lookSnap&&Date.now()-lookAt<15*60e3&&/^Tab:/.test(live)) return lookSnap; return live; };
function talkHere(){ lookSnap=lookNow(); lookAt=Date.now(); talk(""); setTimeout(()=>{ const n=$("#lookNote"); if(n) n.textContent="Claude sees: "+lookSnap.replace(/\s*\[[^\]]*\]/g,"").slice(0,140); },400); }
window.shellTalkHere=talkHere;
{ const st=document.createElement("style"); st.textContent=`.hereMic{position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:60;width:56px;height:56px;border-radius:50%;border:none;background:linear-gradient(180deg,#ff9a40,#e8711a);box-shadow:0 6px 18px rgba(0,0,0,.45),0 0 0 3px rgba(255,138,42,.25);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .12s}
.hereMic:active{transform:scale(.92)}.hereMic small{position:absolute;bottom:-17px;font:600 9.5px Oswald,sans-serif;letter-spacing:.06em;color:#ffb36b;white-space:nowrap}
@media(min-width:900px){.hereMic{bottom:24px;right:24px}}
body:has(.scrim.on) .hereMic{z-index:1001;bottom:24px}
body:has(.chatp.on) .hereMic,body:has(.shov) .hereMic{display:none}
#lookNote{font-size:11.5px;color:#ffb36b;padding:4px 12px 0}`; document.head.appendChild(st); }
const hereMic=document.createElement("button"); hereMic.type="button"; hereMic.className="hereMic"; hereMic.hidden=true;
hereMic.title="Talk to Claude about what's on screen"; hereMic.innerHTML=svg("rec","#111",24,2)+"<small>TALK</small>";
hereMic.onclick=talkHere; document.body.appendChild(hereMic);
{ const ci=$("#chatP .ci"); if(ci&&!$("#lookNote")){ const n=document.createElement("div"); n.id="lookNote"; ci.before(n); } }
{ const x=$("#chatX"); if(x) x.addEventListener("click",()=>{ lookSnap=null; const n=$("#lookNote"); if(n) n.textContent=""; }); }
const TALKBTN=(id,label)=>`<button class="talk" type="button" id="${id}">${svg("rec","#111",20,2)}<span>${label}</span></button>`;
function openChat(){ const f=$("#chatFab"); if(f&&f.onclick) f.onclick(); }
// show the frame once signed in (the app section becomes visible)
new MutationObserver(()=>{ const on=!$("#app").hidden; top.hidden=!on; nav.hidden=!on; hereMic.hidden=!on; }).observe($("#app"),{attributes:true,attributeFilter:["hidden"]});

/* ---- home is the start screen ---- */
if(!location.hash||location.hash==="#"||location.hash==="#home") cur="home";

/* ---- Next up: everything that needs Kyle, most urgent first ---- */
const KIND=[
  [/^Count|count & check/i,"COUNT","#f5b041"],[/^Pick up/i,"PICK UP","#22c3e6"],[/quote/i,"QUOTE","#ff8a2a"],
  [/^Follow up/i,"FOLLOW UP","#e5483b"],[/^Send the order/i,"ORDER","#e5483b"],[/^Assign|^Give work/i,"CREW","#ff8a2a"],
  [/^Log your time/i,"TIME","#3ad06b"],[/^Bend|flat/i,"BEND","#e04fa0"],[/^Look over|^Check drawings|^Make DXFs/i,"PIPELINE","#a374ff"]];
const RANK=t=>{ const x=t.text||""; return t.count||/^Count/i.test(x)?0:/^Pick up/i.test(x)?1:t.nonum?2:/quote/i.test(x)?3:/^Follow up/i.test(x)?4:/^Send the order/i.test(x)?5:/^Assign|^Give work/i.test(x)?6:t.mine?7:/^Log your time/i.test(x)?8:9; };
function nextUp(){
  const out=[];
  const auto=(typeof liveAuto==="function"?liveAuto():[]).filter(t=>!/^Add job numbers|^Archive finished/.test(t.text));
  auto.forEach(t=>{ const k=KIND.find(([re])=>re.test(t.text))||[null,"BOARD","#9aa1aa"];
    let act=null;
    if(t.count&&window.openCount) act={t:"COUNT IT",fn:()=>window.openCount(t.job,t.count)};
    else if(/^Pick up/i.test(t.text)&&t.job){ const j=jobs.find(x=>x.id===t.job); const s=j&&(j.suppliers||[]).find(x=>ACTIVE(x)&&(x.status==="ready"||x.status==="arrived")); act=s&&window.openCount?{t:"PICKED UP - COUNT IT",fn:()=>window.openCount(j.id,s.id)}:{t:"OPEN JOB",fn:()=>openJob(t.job)}; }
    else if(/^Log your time/i.test(t.text)) act={t:"LOG TIME",fn:()=>go("time")};
    else if(t.view) act={t:"OPEN "+String(t.view).toUpperCase(),fn:()=>go(t.view)};
    else if(t.job) act={t:"OPEN JOB",fn:()=>openJob(t.job)};
    const jn0=t.job?jname(t.job):""; const title=jn0&&t.text.endsWith(" - "+jn0)?t.text.slice(0,-(jn0.length+3)):t.text;
    out.push({...t,text:title||t.text,tag:k[1],c:t.c&&!/^var/.test(t.c)?t.c:k[2],act,sub:t.job?jname(t.job):"From the board",later:{text:t.text,job:t.job}}); });
  // orders ready for pickup that no reminder covers yet (e.g. on INV or a received job)
  jobs.forEach(j=>(j.suppliers||[]).filter(x=>ACTIVE(x)&&x.status==="ready").forEach(x=>{
    const txt=`Pick up ${first(x.name)}${x.quoteNo?" #"+x.quoteNo:""}`;
    if(out.some(o=>o.job===j.id&&/^Pick up/i.test(o.text))) return;
    if(typeof snoozedAuto==="function"&&snoozedAuto(txt)) return;
    out.push({text:txt,tag:"PICK UP",c:"#22c3e6",job:j.id,sub:j.name+(x.scope?" · "+x.scope.slice(0,80):""),
      act:window.openCount?{t:"PICKED UP - COUNT IT",fn:()=>window.openCount(j.id,x.id)}:{t:"OPEN JOB",fn:()=>openJob(j.id)},later:{text:txt,job:j.id}}); }));
  // jobs with no job number - one card each, with who's on it and who gave it
  jobs.filter(j=>!jobNum(j.name)&&!j.sample&&j.id!=="inventory").forEach(j=>{
    const who=[...new Set((j.assemblies||[]).flatMap(a=>String(a.who||"").split(",").map(s=>s.trim()).filter(Boolean)))].join(", ");
    out.push({text:`Get a job number: ${j.name}`,tag:"NO JOB #",c:"#f5b041",nonum:true,job:j.id,sub:[who?who+" is on it":"",j.from?"from "+j.from:""].filter(Boolean).join(" · ")||"Ask Robin or Randy",
      act:{t:"EMAIL ROBIN",fn:()=>mailNum(j,ROBIN)},act2:{t:"RANDY",fn:()=>mailNum(j,RANDY)}}); });
  (typeof liveMine==="function"?liveMine():[]).forEach(t=>out.push({text:t.text,tag:"TO DO",c:"#ffd28a",mine:true,id:t.id,job:t.job_id,sub:[t.from_name,t.job_id?jname(t.job_id):""].filter(Boolean).join(" · ")||"Your to-do",
    act:{t:"DONE",fn:()=>{ setTodo(t.id,true); todoToast("Done: "+t.text,()=>setTodo(t.id,false)); }},later:{id:t.id,text:t.text}}));
  return out.sort((a,b)=>RANK(a)-RANK(b));
}
window.shellNextUp=()=>nextUp();
function mailNum(j,to){
  const who=[...new Set((j.assemblies||[]).flatMap(a=>String(a.who||"").split(",").map(s=>s.trim()).filter(Boolean)))].join(", ");
  const body=`Hi${to===ROBIN?" Robin":" Randy"},\n\n${who||"The crew"} ${who&&who.includes(",")?"are":"is"} working on "${j.name}"${j.from?" (from "+j.from+")":""} and it doesn't have a job number yet. Can you send me the number for it?\n\nThanks,\nKyle`;
  location.href=`mailto:${to}${to===ROBIN?"?cc="+RANDY+"&":"?"}subject=${encodeURIComponent("Job number needed: "+j.name)}&body=${encodeURIComponent(body)}`;
  j0log(j.id,`Asked ${to===ROBIN?"Robin":"Randy"} for a job number (email)`);
}
async function j0log(id,text){ const j0=jobs.find(x=>x.id===id); if(!j0) return; const j=structuredClone(j0); delete j.id; j.log=[...(j.log||[]),{at:new Date().toISOString(),text}]; try{ await saveJob(id,j); }catch(e){} }

let nuIdx=0;
function renderHome(){
  const B=$("#board"); B.className="home"; B.style.gridTemplateColumns="";
  if(window.ME&&ME.role==="parts"&&window.partsHome){ window.partsHome(B); return; }
  if(window.ME&&ME.role==="crew"&&window.crewHome){ window.crewHome(B); return; }
  const items=nextUp(); if(nuIdx>=items.length) nuIdx=0;
  const today=new Date(); const P=window.gvcPlan; let crew=[];
  try{ const {M}=P.mc(); const d=P.iso(today);
    crew=CREW.map(p=>{ const ks=(M.S[p]||{})[d]||[]; const done=ks.filter(k=>M.T[k]&&M.T[k].done).length; return {p,n:ks.length,done}; }); }
  catch(e){ crew=CREW.map(p=>({p,n:0,done:0})); }
  const all=crew.reduce((a,c)=>a+c.n,0), dn=crew.reduce((a,c)=>a+c.done,0);
  const COL={Kyle:"#2f8ff0",Colton:"#3ad06b",Aaron:"#c9a46a",Cooper:"#e04fa0"};
  const doneToday=(typeof autoDone!=="undefined"?autoDone:[]).filter(x=>x.applied_at&&new Date(x.applied_at).toDateString()===today.toDateString()).length;
  const quests=(typeof liveMine==="function"?liveMine():[]).slice(0,4);
  // every job still on the go (not Done, not archived, not the standing INV job), in board/stage order (Kyle, 2026-11-04)
  const act=jobs.filter(j=>j.stage!=="done"&&!j.archived&&j.id!=="inventory"&&!/^INV\b/i.test(j.name||"")).sort((x,y)=>(SIDX[y.stage]??0)-(SIDX[x.stage]??0)||String(x.name).localeCompare(String(y.name),undefined,{numeric:true}));
  B.innerHTML=`<div class="hm shanim">
    <section aria-label="Next up">
      <h4><span>NEXT UP${items.length?" · "+items.length:""}</span>${items.length>1?`<span style="letter-spacing:.08em">SWIPE FOR MORE</span>`:""}</h4>
      <div class="nu">${items.length?`<div class="trk" id="nuTrk">${items.map((t,i)=>`<article class="cd" style="--c:${t.c}">
          <span class="ntg">${esc(t.tag)}</span><div class="ntt">${esc(t.text.replace(/^Get a job number: /,""))}</div><div class="nsub">${t.nonum?"No job number yet · ":""}${esc(t.sub||"")}</div>
          <div class="nac">${t.act?`<button class="go" type="button" data-nu="${i}">${esc(t.act.t)}</button>`:""}${t.act2?`<button class="lt" type="button" data-nu2="${i}">${esc(t.act2.t)}</button>`:""}${t.later?`<button class="lt" type="button" data-nl="${i}">LATER</button>`:""}</div></article>`).join("")}</div>
        <button class="arr l" type="button" aria-label="Previous" id="nuL">‹</button><button class="arr r" type="button" aria-label="Next" id="nuR">›</button>
        <div class="dots" id="nuDots">${items.slice(0,12).map((_,i)=>`<i class="${i===nuIdx?"on":""}"></i>`).join("")}<span id="nuOf">${nuIdx+1} OF ${items.length}</span></div>`
        :`<div class="empty">${svg("check","#3ad06b",28,2)}<div style="margin-top:6px;font:600 18px Oswald,sans-serif">All caught up</div><div style="font-size:13px;margin-top:4px">Nothing needs you right now.</div></div>`}</div>
      ${doneToday?`<button class="adone" type="button" id="shAuto">${svg("check","#3ad06b",14,2.2)} ${doneToday} update${doneToday>1?"s":""} put on the board for you today - tap to see or undo</button>`:""}
      ${window.recapLine?window.recapLine():""}
    </section>
    <div style="display:flex;flex-direction:column;gap:16px">
      <section aria-label="Crew today">
        <h4><span>CREW TODAY</span><span style="color:var(--text)">${all?`${dn} / ${all} TASKS`:""}</span></h4>
        <div class="cw">${crew.map(c=>`<button class="p ${c.n?"":"idle"}" type="button" data-cw="${c.p}"><span class="av" style="background:${COL[c.p]||"#9aa1aa"}">${c.p[0]}</span><span class="n">${c.p}</span><div class="bar"><i style="width:${c.n?Math.round(c.done/c.n*100):0}%"></i></div><span class="s">${c.n?`${c.done} / ${c.n}`:"nothing planned"}</span></button>`).join("")}<button class="p" type="button" data-cw="Robin"><span class="av" style="background:#9b7bff">R</span><span class="n">Robin</span><div class="bar" style="visibility:hidden"><i></i></div><span class="tnote" style="font-size:11px">parts</span></button></div>
      </section>
      <section aria-label="To do">
        <h4><span>TO DO · ${(typeof liveMine==="function"?liveMine().length:0)+(typeof liveAuto==="function"?liveAuto().length:0)}</span><button type="button" id="shAll">See all</button></h4>
        <div class="qs">${quests.map(t=>`<button class="q" type="button" style="--c:#ffd28a" data-q="${t.id}"><i></i><span>${esc(t.text)}</span><em>${t.job_id?esc((jobNum(jname(t.job_id))||"JOB")):"MINE"}</em></button>`).join("")||`<div class="tnote">No to-dos of your own. Board reminders are in Next up.</div>`}</div>
      </section>
    </div>
  </div>`;
  if(window.myDayHtml){ const md=window.myDayHtml(); if(md){ const hm=B.querySelector(".hm"); if(hm){ hm.insertAdjacentHTML("afterbegin",md); window.myDayWire&&window.myDayWire(hm); } } }
  const trk=$("#nuTrk");
  if(trk){
    const dots=()=>{ const i=Math.round(trk.scrollLeft/Math.max(1,trk.clientWidth)); nuIdx=i; $("#nuDots").querySelectorAll("i").forEach((d,k)=>d.classList.toggle("on",k===i)); const of=$("#nuOf"); if(of) of.textContent=`${i+1} OF ${items.length}`; };
    trk.scrollLeft=nuIdx*trk.clientWidth; trk.onscroll=()=>{ clearTimeout(trk._t); trk._t=setTimeout(dots,60); };
    $("#nuL").onclick=()=>trk.scrollBy({left:-trk.clientWidth,behavior:"smooth"}); $("#nuR").onclick=()=>trk.scrollBy({left:trk.clientWidth,behavior:"smooth"});
    B.querySelectorAll("[data-nu]").forEach(b=>b.onclick=()=>{ const t=items[+b.dataset.nu]; t&&t.act&&t.act.fn(); });
    B.querySelectorAll("[data-nu2]").forEach(b=>b.onclick=()=>{ const t=items[+b.dataset.nu2]; t&&t.act2&&t.act2.fn(); });
    B.querySelectorAll("[data-nl]").forEach(b=>b.onclick=e=>{ e.stopPropagation(); const t=items[+b.dataset.nl]; if(t&&t.later&&typeof laterMenu==="function") laterMenu(b,t.later); });
  }
  const sa=$("#shAuto"); if(sa) sa.onclick=()=>{ try{localStorage.setItem("gvc_auto_open","true")}catch(e){} go("todo"); };
  $("#shAll").onclick=()=>go("todo");
  B.querySelectorAll("[data-cw]").forEach(b=>b.onclick=()=>go("crew"));
  B.querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>go("todo"));
}

/* ---- render: home is ours, everything else is the existing app inside the frame ---- */
const _render=render; let lastView=null;
render=function(){
  if(cur==="home"){
    try{ if(typeof autoTodos==="function"&&autoTodos.reset) autoTodos.reset(); }catch(e){}
    try{ if(typeof drawTrack==="function") drawTrack(); }catch(e){}
    try{ if(typeof publishTodo==="function") publishTodo(); }catch(e){}
    const sub=$("#subnav"); if(sub) sub.hidden=true;
    const bar=document.querySelector("#app .bar"); if(bar) bar.style.display="none";
    renderHome();
  } else {
    const bar=document.querySelector("#app .bar"); if(bar) bar.style.display=SECT(cur)==="jobs"?"":"none";
    _render();
    if(lastView!==cur){ const B=$("#board"); if(B){ B.classList.remove("shanim"); void B.offsetWidth; B.classList.add("shanim"); } }
  }
  lastView=cur;
  const L=document.querySelector("#app>section.list"); if(L) L.classList.toggle("shhide",!["jobs","home"].includes(SECT(cur)));  // All jobs stage track also on Home (Kyle, 2026-11-04)
  // nav state + badges
  const s=SECT(cur); nav.querySelectorAll("[data-n]").forEach(b=>b.classList.toggle("on",b.dataset.n===s));
  const d=new Date(); $("#shDate").textContent=d.toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"}).toUpperCase();
  const tdN=(typeof liveMine==="function"?liveMine().length:0)+(typeof liveAuto==="function"?liveAuto().length:0);
  const bn=$("#shBellN"); bn.hidden=!tdN; bn.textContent=tdN;
  const jn=jobs.filter(j=>typeof needsAttention==="function"&&needsAttention(j)).length; const je=$("#shJobsN"); je.hidden=!jn; je.textContent=jn;
  let un=0; try{ un=crewItems().filter(x=>!whoList(x.a).length&&x.a.status!=="done"&&!finalLocked(x.j,x.a)).length; }catch(e){}
  const ce=$("#shCrewN"); ce.hidden=!un; ce.textContent=un;
};

/* ---- More menu ---- */
function sheet(html,onReady){
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); };
  ov.onclick=e=>{ if(e.target===ov) close(); };
  if(onReady) onReady(ov.querySelector(".shsheet"),close);
  return close;
}
function moreMenu(){
  const n=id=>{ const el=document.getElementById(id); const m=el&&el.textContent.match(/\((\d+)/); return m?+m[1]:0; };
  let timeN=0; try{ const tmp=document.createElement("div"); tmp.innerHTML=window.timeTab?window.timeTab():""; timeN=parseInt((tmp.querySelector(".at")||{}).textContent)||0; }catch(e){}
  const items=[["todo","To do","list"],["msgs","Messages","chat",(window.msgUnread?window.msgUnread():0)],["time","My time","clock",timeN],["mytime","My time","clock"],["inv","Inventory","box"],["ncr","NCRs","warn",n("ncrBtn")],["revs","Revisions","rev",n("revBtn")],["supplies","Need supplies","box"],["count","Count an order","count"],["talks","Talks","rec"],["prices","Prices","count"],["requests","Supply requests","box",(window.reqCount?window.reqCount():0)],["pos","RFQs & POs","list",(window.posOpen?window.posOpen():0)],["porders",window.ME&&ME.role==="parts"?"My orders":"Robin's orders","box",(window.pordersOpen?window.pordersOpen():0)],["staging","Staging kits","box"],["crewview","Colton's view","crew"],["partsview","Robin's view","crew"],["archive","Finished jobs","trophy",(typeof archivedJobs!=="undefined"?archivedJobs.length:0),true],
    ["theme",window.gvcTheme&&gvcTheme.get()==="girly"?"Girly mode ✓":"Girly mode","heart"],["newjob","New job","newj"],["ideas","App ideas","bulb"],["undo","Undo","undo"],["signout","Sign out","out"]];
  const CREWOK=["msgs","mytime","supplies","requests","count","inv","ncr","revs","archive","signout"];
  const PARTSOK=["porders","msgs","inv","staging","archive","theme","signout"];   // Robin: no time clock, My time, Count or requests (Kyle, Nov 6)
  const items2=window.ME&&ME.role==="crew"?items.filter(x=>CREWOK.includes(x[0])):window.ME&&ME.role==="parts"?PARTSOK.map(k=>items.find(x=>x[0]===k)).filter(Boolean):items.filter(x=>!["mytime","staging"].includes(x[0]));
  // Kyle: the two preview buttons get their own highlighted row at the bottom (Nov 6)
  const PVK=["crewview","partsview"], pvItems=items2.filter(x=>PVK.includes(x[0])); const grid=items2.filter(x=>!PVK.includes(x[0]));
  const pvRow=pvItems.length?`<div class="mpv"><div class="mpvh">👁 SEE THE APP AS…</div><div class="mpvb">${pvItems.map(([k])=>{ const who=k==="partsview"?"Robin":"Colton";
    return `<button type="button" data-m="${k}"><span class="av">${who[0]}</span><span><b>${who}'s view</b><small>${who==="Robin"?"Parts · ordering":"Shop crew"}</small></span></button>`; }).join("")}</div></div>`:"";
  sheet(`<h3>MENU</h3>${TALKBTN("mTalk","TALK TO CLAUDE")}${pvRow}<div class="mgrid">${grid.map(([k,t,i,c,grey],x)=>`<button type="button" data-m="${k}" style="transition-delay:${x*25}ms">${svg(i,k==="signout"?"#ff9b9b":"#e9ebee",26)}${t}${c?`<span class="bd" style="${grey?"background:#4a4f56":""}">${c}</span>`:""}</button>`).join("")}</div>`,(el,close)=>{
    el.querySelector("#mTalk").onclick=()=>talk("",close);
    el.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{ const k=b.dataset.m; close();
      if(k==="msgs"){ window.openInbox&&window.openInbox(); }
      else if(k==="mytime"){ window.openMyTime&&window.openMyTime(); }
      else if(k==="supplies"){ window.needSupplies&&window.needSupplies(); }
      else if(k==="count"){ if(window.ME&&ME.preview){ if(typeof todoToast==="function") todoToast("Preview - nothing is saved. Exit the preview to count.",null); return; } window.countPicker&&window.countPicker(); }
      else if(k==="talks"){ window.openRecaps&&window.openRecaps(); }
      else if(k==="prices"){ window.openPrices&&window.openPrices(); }
      else if(k==="crewview"){ window.crewPreview&&window.crewPreview(true,"Colton"); }
      else if(k==="partsview"){ window.crewPreview&&window.crewPreview(true,"Robin"); }
      else if(k==="newjob"){ go(lastJobs()); setTimeout(()=>$("#addJob").click(),60); }
      else if(k==="undo") $("#undoBtn").click();
      else if(k==="theme"){ window.gvcTheme&&gvcTheme.toggle(); }
      else if(k==="signout") $("#signOut").click();
      else go(k); });
  });
}

/* ---- quick-action wheel ---- */
const ACTS=[["punch","PUNCH IN","clock","#3ad06b"],["rec","RECORD","rec","#e5483b"],["count","COUNT","count","#f5b041"],["quick","QUICK JOB","bolt","#22c3e6"],["time","LOG TIME","clock","#3ad06b"],["todo","ADD TO-DO","check","#5aa7f3"],["chat","ASK CLAUDE","chat","#ff8a2a"]];
// phone app only: Check texts on the wheel too (it also stays on the To do tab) (Kyle, 2026-11-04)
const CREW_ACTS=[["punch","PUNCH IN","clock","#3ad06b"],["mywork","ADD MY WORK","bolt","#22c3e6"],["supplies","NEED SUPPLIES","box","#9fb3c8"],["count","COUNT","count","#f5b041"],["ncr","PROBLEM / NCR","warn","#e5483b"],["rev","REVISION","rev","#a374ff"],["chat","TALK","chat","#ff8a2a"]];
const PARTS_ACTS=[["inv","INVENTORY","box","#9fb3c8"],["msgs","MESSAGES","chat","#2f8ff0"],["chat","TALK","chat","#ff8a2a"]];
const ACTL=()=>window.ME&&ME.role==="parts"?PARTS_ACTS:window.ME&&ME.role==="crew"?CREW_ACTS:ACTS.concat(typeof Native!=="undefined"&&Native?[["sms","CHECK TEXTS","chat","#9b7bff"]]:[]);
const plus=$("#shPlus"); let whl=null, hot=null;
function wheelOpen(){
  if(whl) return; const r=plus.getBoundingClientRect(); const phone=innerWidth<900;
  const cx=phone?innerWidth/2:innerWidth/2+46, cy=phone?Math.min(innerHeight-250,r.top-150):innerHeight/2;
  whl=document.createElement("div"); whl.className="whl";
  const R=118; whl.innerHTML=`<div class="hint" style="top:${cy-200}px">Tap one - or hold the + and slide to it</div><div class="ring" style="left:${cx}px;top:${cy}px"></div>`+
    ACTL().map(([k,t,i,c],n,L)=>{ const a=(-90+n*360/L.length)*Math.PI/180; return `<button class="it" type="button" data-w="${k}" style="left:${cx}px;top:${cy}px;--x:${Math.round(R*Math.cos(a))}px;--y:${Math.round(R*Math.sin(a))}px;--c:${c};--d:${n*30}ms"><span class="c">${svg(i,c,28)}</span>${t}</button>`; }).join("")+
    `<button class="ctr" type="button" aria-label="Close" style="left:${cx}px;top:${cy}px">${svg("plus","#111",26,2.6).replace("<path",'<path transform="rotate(45 12 12)"')}</button>`;
  document.body.appendChild(whl); plus.classList.add("open"); { const w=whl; requestAnimationFrame(()=>w.classList.add("on")); }
  whl.onclick=e=>{ const b=e.target.closest("[data-w]"); if(b){ wheelClose(); act(b.dataset.w); } else wheelClose(); };
}
function wheelClose(){ if(!whl) return; const w=whl; whl=null; hot=null; w.classList.remove("on"); plus.classList.remove("open"); setTimeout(()=>w.remove(),220); }
let downAt=0, slid=false;
plus.addEventListener("pointerdown",e=>{ downAt=Date.now(); slid=false; if(whl){ wheelClose(); downAt=0; return; } wheelOpen(); try{plus.setPointerCapture(e.pointerId)}catch(_){} });
plus.addEventListener("pointermove",e=>{ if(!whl||!downAt) return; const el=document.elementFromPoint(e.clientX,e.clientY); const b=el&&el.closest&&el.closest("[data-w]");
  if(b!==hot){ if(hot) hot.classList.remove("hot"); hot=b; if(b){ b.classList.add("hot"); slid=true; try{navigator.vibrate&&navigator.vibrate(8)}catch(_){} } } });
plus.addEventListener("pointerup",()=>{ if(!downAt) return; downAt=0; if(hot&&slid){ const k=hot.dataset.w; wheelClose(); act(k); } });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") wheelClose(); });

function act(k){
  if(window.crewAct&&window.crewAct(k)) return;
  if(k==="chat") return openChat();
  if(k==="time") return go("time");
  if(k==="todo") return addTodoSheet();
  if(k==="quick") return quickJob();
  if(k==="sms"){ go("todo"); return setTimeout(()=>{ const b=document.getElementById("smsNow"); if(b) b.click(); },200); }
  if(k==="count"){
    if(window.countPicker) return window.countPicker();
    const t=(typeof liveAuto==="function"?liveAuto():[]).find(x=>x.count);
    if(t&&window.openCount) return window.openCount(t.job,t.count);
    const j=jobs.find(x=>(x.suppliers||[]).some(s=>ACTIVE(s)&&(s.status==="ready"||s.status==="arrived")));
    if(j&&window.openCount){ const s=j.suppliers.find(s=>ACTIVE(s)&&(s.status==="ready"||s.status==="arrived")); return window.openCount(j.id,s.id); }
    return note("Nothing waiting to be counted");
  }
  if(k==="rec"){
    if(typeof Native!=="undefined"&&Native&&typeof toggleRec==="function") return toggleRec();
    const f=document.createElement("input"); f.type="file"; f.accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm"; f.onchange=()=>{ const x=f.files[0]; if(x&&typeof uploadAudio==="function"){ go("todo"); uploadAudio(x); } }; f.click();
  }
}
function addTodoSheet(){
  sheet(`<h3>ADD A TO-DO</h3>${TALKBTN("qtTalk","SAY IT TO CLAUDE")}<div class="orl">or type it</div><label>What needs doing<input id="qtTx" placeholder="e.g. Call Randy about the hitch plates"></label><div class="row" style="justify-content:flex-end"><button class="btn primary" type="button" id="qtGo" style="min-height:44px;padding:0 20px">Add</button></div>`,(el,close)=>{
    const i=el.querySelector("#qtTx");
    el.querySelector("#qtTalk").onclick=()=>talk("[Add to-dos with add_todo for each thing I say, on the right job if I name one.]",close);
    const add=async()=>{ const v=i.value.trim(); if(!v) return; close(); await addTodos([{text:v,source:"manual"}]); note("Added: "+v); };
    el.querySelector("#qtGo").onclick=add; i.onkeydown=e=>{ if(e.key==="Enter") add(); };
  });
}
/* Quick job: someone's already on it (e.g. Randy handed Cooper something). Shop floor, task assigned, number optional. */
function quickJob(){
  const who=new Set(); let from="Randy";
  sheet(`<h3>QUICK JOB</h3>
    ${TALKBTN("qjTalk","SAY IT TO CLAUDE")}<div class="tnote" style="margin:-8px 0 10px">e.g. "Randy gave Cooper a hitch rack repair for Hansen - cut out the old receiver, weld in the new one. No job number yet."</div>
    <div class="orl">or type it</div>
    <label>What is it<input id="qjWhat" placeholder="e.g. Hitch rack repair for Hansen"></label>
    <label>Who's on it</label><div class="chips" id="qjWho" style="margin:-6px 0 14px">${CREW.map(c=>`<button type="button" data-c="${c}">${c}</button>`).join("")}</div>
    <label>Who gave it out</label><div class="chips" id="qjFrom" style="margin:-6px 0 14px">${["Randy","Customer","Me"].map(c=>`<button type="button" data-f="${c}" class="${c===from?"on":""}">${c}</button>`).join("")}</div>
    <label>Job # (leave empty if nobody knows yet)<input id="qjNum" placeholder="e.g. 2015G" autocapitalize="characters"></label>
    <div class="tnote" id="qjMsg" style="margin-bottom:10px"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" type="button" id="qjGo" style="min-height:44px;padding:0 20px">Put it on the board</button></div>`,(el,close)=>{
    el.querySelector("#qjTalk").onclick=()=>talk("[Quick job: create it with create_job on the Shop floor (stage fab) right away. Job number only if I say one - if I don't, create it without one and don't ask. Use my words for the name and tasks, put who's doing each task in who, and say who gave it out in the summary and log.]",close);
    el.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{ const c=b.dataset.c; who.has(c)?who.delete(c):who.add(c); b.classList.toggle("on",who.has(c)); });
    el.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{ from=b.dataset.f; el.querySelectorAll("[data-f]").forEach(x=>x.classList.toggle("on",x===b)); });
    el.querySelector("#qjGo").onclick=async()=>{
      const what=el.querySelector("#qjWhat").value.trim(); const num=el.querySelector("#qjNum").value.trim().toUpperCase();
      if(!what){ el.querySelector("#qjMsg").textContent="Say what it is."; return; }
      const id=uid(), now=new Date().toISOString(); const fromTx=from==="Me"?"":from;
      const data={name:num?`${num} - ${what}`:what,folder:"",summary:[who.size?[...who].join(", ")+" on it":"",fromTx?"from "+fromTx:"",num?"":"no job # yet"].filter(Boolean).join(" · "),
        stage:"fab",from:fromTx,suppliers:[],order:Date.now(),
        assemblies:[{id:uid(),name:what,meta:"",status:"ready",who:[...who].join(", "),final:false}],
        log:[{at:now,text:`Quick job${fromTx?" - given out by "+fromTx:""}${who.size?", "+[...who].join(", ")+" on it":""}${num?"":" - no job number yet"}`}]};
      try{ await saveJob(id,data); if(!jobs.some(x=>x.id===id)) jobs.push({id,...data}); close(); pushUndo(id,null,"Added quick job "+data.name);
        if(!num) sheet(`<h3>NO JOB NUMBER YET</h3><div class="tnote" style="margin-bottom:14px">"${esc(what)}" is on the shop floor${who.size?" with "+esc([...who].join(", ")):""}. It stays in Next up until it has a number.</div>
          <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn primary" type="button" id="qnR" style="min-height:44px">${svg("mail","#1b0f05",16)} Email Robin</button><button class="btn" type="button" id="qnY" style="min-height:44px">Email Randy</button><button class="btn ghost" type="button" id="qnL" style="min-height:44px">Later</button></div>`,(e2,c2)=>{
            const j={id,...data}; e2.querySelector("#qnR").onclick=()=>{ c2(); mailNum(j,ROBIN); }; e2.querySelector("#qnY").onclick=()=>{ c2(); mailNum(j,RANDY); }; e2.querySelector("#qnL").onclick=c2; });
        else note("On the board: "+data.name);
      }catch(e){ el.querySelector("#qjMsg").textContent="Couldn't save: "+(e.message||e); }
    };
  });
}
})();

/* ---- Claude comms window (Kyle, 2026-11-04): not a website help-bubble in the corner. Opens in the middle of the
   screen over a dimmed backdrop, with a live "Claude" orb that shows listening / thinking, a big mic, and
   Claude's lines as game-style dialogue. Same chat underneath (sendChat/drawChat unchanged). ---- */
(function(){
const P=document.getElementById("chatP"); if(!P) return;
const st=document.createElement("style"); st.textContent=`
.cbk{position:fixed;inset:0;z-index:1100;background:radial-gradient(ellipse at 50% 40%,rgba(40,22,8,.55),rgba(3,4,6,.88));backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);opacity:0;pointer-events:none;transition:opacity .25s}
body:has(.chatp.on) .cbk{opacity:1;pointer-events:auto}
.chatp{left:50%!important;top:50%!important;right:auto!important;bottom:auto!important;transform:translate(-50%,-48%) scale(.96);width:min(680px,calc(100vw - 20px))!important;height:min(760px,calc(100dvh - 40px))!important;z-index:1101!important;
  border-radius:20px!important;border:1px solid rgba(255,138,42,.35)!important;background:linear-gradient(180deg,#17191d 0%,#101114 100%)!important;
  box-shadow:0 0 0 1px rgba(0,0,0,.6),0 30px 90px rgba(0,0,0,.8),0 0 60px rgba(255,120,30,.12)!important;opacity:0;transition:transform .28s cubic-bezier(.2,1.2,.4,1),opacity .2s}
.chatp.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.chatp::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:20px;background:repeating-linear-gradient(0deg,rgba(255,255,255,.012) 0 2px,transparent 2px 4px)}
.chatp .ch{padding:16px 18px 12px!important;border-bottom:1px solid rgba(255,138,42,.18)!important;gap:14px!important;text-transform:none!important}
.corb{position:relative;width:46px;height:46px;flex:none}
.corb i{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 38% 32%,#ffd2a0,#ff8a2a 45%,#b4470c 80%);box-shadow:0 0 18px rgba(255,138,42,.55),inset 0 -4px 10px rgba(0,0,0,.35)}
.corb b{position:absolute;inset:-6px;border-radius:50%;border:2px solid rgba(255,138,42,.45);animation:corb 3.2s ease-in-out infinite}
.corb u{position:absolute;inset:-12px;border-radius:50%;border:1px solid rgba(255,138,42,.18);animation:corb 3.2s ease-in-out infinite .6s}
@keyframes corb{0%,100%{transform:scale(.92);opacity:.5}50%{transform:scale(1.05);opacity:1}}
.chatp.listen .corb i{background:radial-gradient(circle at 38% 32%,#ffb0a8,#e5483b 45%,#8e1d14 80%);box-shadow:0 0 26px rgba(229,72,59,.75)}
.chatp.listen .corb b,.chatp.listen .corb u{border-color:rgba(229,72,59,.6);animation-duration:.9s}
.chatp.think .corb b{border-style:dashed;animation:cspin 1.2s linear infinite;opacity:1}
@keyframes cspin{to{transform:rotate(360deg)}}
.cid{display:flex;flex-direction:column;line-height:1.1}
.cid strong{font:600 22px Oswald,sans-serif;letter-spacing:.14em;color:#fff}
.cid small{font:600 11px Oswald,sans-serif;letter-spacing:.16em;color:#ffb36b;text-transform:uppercase;margin-top:3px}
.chatp.listen .cid small{color:#ff8b80}
.chatp .ch button{border:1px solid #33373e!important;border-radius:10px!important;padding:6px 10px!important;color:#c9ced6!important;background:rgba(255,255,255,.03)!important}
.chatp .ch #chatX{width:38px;height:38px;padding:0!important;font-size:18px!important}
.chatp .cm{padding:18px 20px!important;gap:14px!important;scroll-behavior:smooth}
.chatp .b{max-width:92%!important;font-size:15.5px!important;line-height:1.5!important;border-radius:0!important;padding:0!important;background:none!important;border:0!important}
.chatp .b.a{color:#ece8e2;padding-left:14px!important;border-left:3px solid #ff8a2a!important}
.chatp .b.a::before{content:"CLAUDE";display:block;font:600 10.5px Oswald,sans-serif;letter-spacing:.18em;color:#ff9a40;margin-bottom:3px}
.chatp .b.u{color:#b9bec6;text-align:right;padding-right:14px!important;border-right:3px solid #4a5059!important}
.chatp .b.u::before{content:"YOU";display:block;font:600 10.5px Oswald,sans-serif;letter-spacing:.18em;color:#7c838d;margin-bottom:3px}
.chatp .cm>.b:last-child,.chatp .cm>.act:last-child{animation:cin .35s ease-out}
@keyframes cin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.chatp .act{font:600 12.5px Inter,sans-serif!important;border-radius:10px!important;padding:7px 11px!important;background:rgba(58,208,107,.1)!important}
.chatp .hint{font-size:14px!important;color:#9aa0a8!important;text-align:center;padding:40px 20px!important;line-height:1.6}
.chatp .ci{align-items:center;gap:10px!important;padding:12px 16px 16px!important;border-top:1px solid rgba(255,138,42,.18)!important}
.chatp .ci textarea{background:#0c0d10!important;border:1px solid #33373e!important;border-radius:14px!important;padding:12px 14px!important;font-size:15px!important;height:50px!important}
.chatp #chatMic{width:62px;height:62px;flex:none;border-radius:50%!important;border:none!important;font-size:24px!important;background:linear-gradient(180deg,#ff9a40,#e8711a)!important;color:#111!important;box-shadow:0 6px 18px rgba(255,120,30,.35)}
.chatp #chatMic.on{background:linear-gradient(180deg,#ff6b5e,#c0392b)!important;color:#fff!important;box-shadow:0 0 0 6px rgba(229,72,59,.25),0 0 0 14px rgba(229,72,59,.1)}
.chatp #chatGo{height:50px;border-radius:14px!important;padding:0 16px!important;font:600 14px Oswald,sans-serif!important;letter-spacing:.1em}
#lookNote{padding:0 20px 2px!important}
#lookNote:empty{display:none}
@media (max-width:600px){ .chatp{width:calc(100vw - 14px)!important;height:calc(100dvh - 28px)!important} .chatp .b{font-size:15px!important}
  .chatp .ch{gap:10px!important;padding:12px 12px 10px!important} .corb{width:38px;height:38px} .cid strong{font-size:19px}
  .chatp .ch #msBtn,.chatp .ch #chatClear{font-size:0!important;width:38px;height:38px;padding:0!important}
  .chatp .ch #msBtn::before{content:"✉";font-size:17px} .chatp .ch #chatClear::before{content:"⟲";font-size:18px}
  .chatp .ci{padding:10px 10px 12px!important} .chatp #chatGo{padding:0 12px!important} }
`; document.head.appendChild(st);
const bk=document.createElement("div"); bk.className="cbk"; document.body.appendChild(bk);
bk.onclick=()=>{ const x=document.getElementById("chatX"); if(x) x.click(); };
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&P.classList.contains("on")){ const x=document.getElementById("chatX"); if(x) x.click(); } });
const ch=P.querySelector(".ch");
if(ch&&ch.firstChild&&ch.firstChild.nodeType===3){ ch.firstChild.remove(); }
if(ch) ch.insertAdjacentHTML("afterbegin",`<div class="corb"><u></u><b></b><i></i></div><div class="cid"><strong>CLAUDE</strong><small id="cStat">Online</small></div>`);
const mic=document.getElementById("chatMic"), M=document.getElementById("chatM"), S=()=>document.getElementById("cStat");
function state(){ const lis=mic&&mic.classList.contains("on"); const thk=!!(M&&M.lastElementChild&&/Thinking…/.test(M.lastElementChild.textContent||""));
  P.classList.toggle("listen",lis); P.classList.toggle("think",thk&&!lis);
  const s=S(); if(s) s.textContent=lis?"Listening - tap ■ when you're done":thk?"Working on it…":(innerWidth<600?"Online":"Online · knows your board"); }
if(mic) new MutationObserver(state).observe(mic,{attributes:true,attributeFilter:["class"]});
if(M) new MutationObserver(state).observe(M,{childList:true});
state();
})();
