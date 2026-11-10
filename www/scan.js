/* ---------- Scan engraved part numbers with the live camera (Kyle, 2026-11-08) ----------
   Like a QR scanner: point the phone at the part, it reads the engraving and opens that part. Nothing is uploaded and no
   API is used - text is read on the phone:
     Android app  -> ShopNative.ocr (Google ML Kit, on-device)          (needs the Nov 8 APK or newer)
     Chrome w/ TextDetector -> built-in text detection
     anything else (iPhone, PC, older APK) -> Tesseract.js in the browser (slower)
   Only the parts on the open order are candidates, so a partial read is enough. Matching is fuzzy (look-alike letters,
   missing dots - a missing dot costs little) but strict on the number at the end: ".1" never matches a part ending ".10".
   window.gvcScan({items:[{id, keys:[...], label, sub, img}], info(id)->{label,sub,got,qty,img}, act(id, op), title})
     op: "+1" | "-1" | "all"                                                                                  */
(()=>{
const css=document.createElement("style");
css.textContent=`
#gScan{position:fixed;inset:0;z-index:9000;background:#000;color:#fff;display:flex;flex-direction:column;font-family:Inter,system-ui,sans-serif}
#gScan video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#gScan .shade{position:absolute;inset:0;pointer-events:none}
#gScan .box{position:absolute;left:6%;right:6%;top:30%;height:22%;border:3px solid rgba(255,255,255,.9);border-radius:14px;box-shadow:0 0 0 2000px rgba(0,0,0,.45)}
#gScan .box.hit{border-color:#3ad06b}
#gScan .top{position:relative;display:flex;gap:8px;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 10px;background:linear-gradient(#000c,#0000)}
#gScan .top b{flex:1;font-size:15px}
#gScan button{font:inherit;font-weight:600;border:0;border-radius:999px;padding:10px 14px;background:rgba(255,255,255,.16);color:#fff;cursor:pointer;min-height:42px}
#gScan button.on{background:#ffd23a;color:#000}
#gScan .msg{position:absolute;left:0;right:0;top:calc(52% + 12px);text-align:center;font-size:14px;text-shadow:0 1px 3px #000;padding:0 16px}
#gScan .msg small{display:block;opacity:.7;font-size:12px;margin-top:4px;font-family:ui-monospace,monospace;word-break:break-all}
#gScan .guess{position:absolute;left:10px;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);display:flex;flex-direction:column;gap:6px}
#gScan .guess button{background:rgba(20,22,25,.92);text-align:left;border-radius:12px}
#gScan .guess .gh{font-size:12.5px;opacity:.85;text-shadow:0 1px 3px #000;padding:0 4px}
#gScan .guess button{min-height:50px;font-size:15px}
#gScan .card{position:absolute;left:10px;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);background:#15171b;border:2px solid #3ad06b;border-radius:16px;padding:14px;display:grid;gap:10px}
#gScan .card .r{display:flex;gap:10px;align-items:center}
#gScan .card img{width:84px;height:60px;object-fit:contain;background:#fff;border-radius:8px}
#gScan .card .nm{font-weight:700;font-size:16px;word-break:break-word}
#gScan .card .sb{font-size:12.5px;opacity:.75}
#gScan .card .ct{font:600 30px Oswald,sans-serif;text-align:center}
#gScan .card .ct.full{color:#3ad06b}
#gScan .card .bt{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:8px}
#gScan .card .bt button{font-size:18px;min-height:52px;border-radius:12px}
#gScan .card .bt .p{background:#3ad06b;color:#0d1a10}
#gScan .card .nx{display:flex;gap:8px}#gScan .card .nx button{flex:1}
#gScan .card .nx .go{background:#2f8ff0}
`;
document.head.appendChild(css);

/* ---- text matching ---- */
const LOOK={O:"0",Q:"0",D:"0",I:"1",L:"1","|":"1","!":"1",T:"1",S:"5",B:"8",Z:"2",G:"6"};
// look-alike letters folded together; every separator (. , _ - space : ;) becomes "."
const canon=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9|!]+/g,".").replace(/[A-Z|!]/g,c=>LOOK[c]||c).replace(/\.+/g,".").replace(/^\.|\.$/g,"");
// end number, dots ignored ("18.2" and "182" agree) - engraved dots are tiny and often don't read (Kyle's photos, Nov 9).
// Letters fold to digits (L->1, D->0), so a digit run glued to a word may be a letter: "CENTERL .10" -> CEN1ER1.10.
// Two numbers agree if the whole trailing run matches, or it matches with the glued run dropped on both sides.
const tailF=s=>{ const m=String(s).match(/[\d.]*$/)[0]; return m.replace(/\./g,""); };
const tailD=s=>{ s=String(s); let m=s.match(/[\d.]*$/)[0]; const pre=s[s.length-m.length-1];
  if(pre&&/[A-Z]/.test(pre)) m=m.replace(/^\d+/,""); return m.replace(/\./g,""); };
const tail=s=>tailF(s)||null;
const sameEnd=(K,x)=>tailF(K)===tailF(x)||(tailD(K)!==""&&tailD(K)===tailD(x));
const contNum=(K,rest)=>/\d$/.test(K)&&/^\.?\d/.test(rest||"");   // the read number keeps going: "D.1" inside "D.10" / "D.1.0"
// edit distance; a missing or extra separator only costs 0.3
function lev(a,b){ const m=a.length,n=b.length, D=46, sep=x=>x===D?0.3:1;
  let p=new Array(n+1),c=new Array(n+1); p[0]=0; for(let j=1;j<=n;j++) p[j]=p[j-1]+sep(b.charCodeAt(j-1));
  for(let i=1;i<=m;i++){ const ai=a.charCodeAt(i-1), di=sep(ai); c[0]=p[0]+di;
    for(let j=1;j<=n;j++){ const bj=b.charCodeAt(j-1); c[j]=Math.min(p[j]+di,c[j-1]+sep(bj),p[j-1]+(ai===bj?0:1)); } [p,c]=[c,p]; }
  return p[n]; }
// best match of key K anywhere in line L: 1 = exact. The text right after the match may not continue the end number.
function partial(K,L){
  if(!K||!L) return 0; if(L.includes(K)){ const i=L.indexOf(K), rest=L.slice(i+K.length); return contNum(K,rest)?0.6:/^[A-Z0-9]/.test(rest)?0.9:1; }   // "CENTERLOC.5" inside "CENTERLOC.SHIM…" (S reads as 5)
  let best=0; const k=K.length;
  for(let w=Math.max(3,k-2); w<=k+2; w++) for(let s=0; s+w<=L.length; s++){ const sub=L.substr(s,w); let sc=1-lev(K,sub)/k;
    if(contNum(K,L.slice(s+w))) sc-=0.3;
    if(tail(K)&&!sameEnd(K,sub)) sc-=0.25;                              // end number must agree
    if(sc>best) best=sc; }
  if(k>L.length){ let sc=1-lev(K,L)/k; if(tail(K)&&!sameEnd(K,L)) sc-=0.25; if(sc>best) best=sc; }
  return best; }
function keysFor(it){
  const out=new Set();
  (it.keys||[]).filter(Boolean).forEach(k=>{ const c=canon(k); if(c.length>=3) out.add(c);
    const short=String(k).replace(/^[0-9]{3,}[A-Z0-9_]*[.\-]/i,""); const cs=canon(short); if(cs.length>=4) out.add(cs); });   // also without the "1086_7W." job prefix
  return [...out]; }
function rank(lines,cands){
  const L=lines.map(canon).filter(x=>x.length>=3);
  // short names: each line, and all lines run together when they're short (vertical text can come back one letter a line)
  const raw=lines.map(x=>String(x).trim()).filter(Boolean), reads=[...raw,raw.join(" "),raw.join("")].flatMap(abbrReads);
  if(!L.length&&!reads.length) return [];
  const all=L.join("."); const pool=[...L,all];
  const AB=reads.length?abbrDeduce(reads,cands):new Map();
  return cands.map(c=>{ const full=L.length?Math.max(...c.K.map(K=>Math.max(...pool.map(l=>partial(K,l))))):0, a=AB.get(c)||{s:0}, ab=a.s;
      return {c,s:Math.max(full,ab),ab:ab>full?a.r:null,ded:ab>full?a.why:""}; })
    .filter(x=>x.s>0.45).sort((a,b)=>b.s-a.s||b.c.K[0].length-a.c.K[0].length); }

/* ---- short names (Kyle, Nov 9) ----
   On small parts the laser shop engraves a short name instead of the full part number: "CB.5" = CHAINBASKET.5,
   "PB.6" = PASSBOX.6 (our DXFs carry no engraving text - checked all 121 for 1086WT). A short name = a few letters
   (the first letters of the words in the name) + the full end number. The number must match exactly; the letters must
   start the name and appear in order, best when each one starts a word. Once Kyle confirms a part, the short name is
   remembered on the phone ("CB" -> CHAINBASKET) and opens straight away next time. */
const WORDS=("CHAIN BASKET PASS BOX PUCK BOARD FENDER UPPER LOWER ROUND HEAD ACHE CENTER LOC LOCK STEP AL ALUM HYD TANK DRIVER "+
  "PASSENGER TOP BOTTOM DOOR TIRE HANGER HANGERS MIDDLE FRONT REAR SHEAR PLATE LOGO AVAL AVALANCHE AVALANCE MOUNT LIGHT LIGHTS PULL "+
  "OUT REMOVE MUD FLAP RAMP KENWORTH WINDOW CAGE SIGN END CAP EXTRUSION FORMED BENDIX OVAL UP DOWN SIDE BODY BRACKET BRACE "+
  "SKIRT WHEEL PIN TROUGH SHIM FRAME RACK WINCH BUMPER GUSSET TAB FLANGE COVER CABINET BELLY DECK RAIL POST LID BASE CLIP STRAP "+
  "HOOK HINGE HANDLE LATCH TRAY SHELF BIN SUPPORT ANGLE CHANNEL TUBE BAR BLOCK PANEL WALL FLOOR ROOF CONSOLE TOOL HOSE REEL "+
  "VALVE PUMP BATTERY GUARD SPLASH STRIKER RUB STRIP CORNER INNER OUTER LEFT RIGHT HEADER FILLER SPACER WASHER DOUBLER STIFFENER").split(" ");
const WSET=new Set(WORDS);
// split a run of letters into words: dictionary words where possible (fewest leftover letters, then fewest words)
function wordStarts(name){
  const n=name.length, best=new Array(n+1).fill(null); best[0]={u:0,w:0,st:[],unk:false};
  const put=(j,o)=>{ const c=best[j]; if(!c||o.u<c.u||o.u===c.u&&o.w<c.w) best[j]=o; };
  for(let i=0;i<n;i++){ const b=best[i]; if(!b) continue;
    for(let j=i+1;j<=n&&j-i<=12;j++) if(WSET.has(name.slice(i,j))) put(j,{u:b.u,w:b.w+1,st:[...b.st,i],unk:false});
    put(i+1,b.unk?{u:b.u+1,w:b.w,st:b.st,unk:true}:{u:b.u+1,w:b.w+1,st:[...b.st,i],unk:true}); }   // a run of unknown letters counts as one word
  return best[n].st; }
const D2L={"0":"O","1":"I","5":"S","8":"B","2":"Z","6":"G"}, L2D={O:"0",Q:"0",D:"0",I:"1",L:"1",T:"1",S:"5",B:"8",Z:"2",G:"6"};
const numNorm=s=>String(s).toUpperCase().replace(/[^A-Z0-9]/g,"");
// name letters + end number of a part number: "1086_7.CHAINBASKET.5" -> {name:"CHAINBASKET", num:"5"}
function abbrInfo(it){
  const k=String((it.keys||[])[0]||"").toUpperCase().replace(/^[0-9]{3,}[A-Z0-9_]*[.\-]/,"");
  const m=k.match(/^(.*?)[.\s_-]+(\d+(?:[.\-][A-Z0-9]+)*)$/); if(!m) return null;
  const segs=m[1].split(/[^A-Z]+/).filter(Boolean), name=segs.join(""); if(name.length<4) return null;
  const starts=new Set(); let off=0; segs.forEach(sg=>{ wordStarts(sg).forEach(i=>starts.add(off+i)); off+=sg.length; });   // "." also splits words
  return {name, num:numNorm(m[2]), starts}; }
// a read that looks like a short name: 1-5 letters (a dotted letter group allowed, "CH.D.1"), a separator or not, then a
// number. A job number in front ("1086 CB.5") is dropped. Look-alike digits/letters folded. A read can be split more than
// one way ("CH.D.1" = CHD + 1, or CH + D.1 with D misread for 0), so every way is returned.
function abbrReads(line){
  let t=String(line).toUpperCase().replace(/\s+/g," ").trim().replace(/^\d{3,}[A-Z0-9_]*[ .\-]+(?=[A-Z])/,"");
  const out=[], seen=new Set();
  const add=(L,N)=>{ const letters=L.replace(/[ .\-]/g,"").replace(/[0-9]/g,c=>D2L[c]||c); if(!/^[A-Z]{1,5}$/.test(letters)) return;
    const parts=N.split(/[ .\-]/), num=[parts[0].replace(/[A-Z]/g,c=>L2D[c]||c),...parts.slice(1)].join(""); if(!/^\d/.test(num)) return;
    const k=letters+"|"+num; if(!seen.has(k)){ seen.add(k); out.push({letters,num}); } };
  const N="([0-9OILSBGZTQD]{1,3}(?:[ .\-][0-9A-Z]{1,3})?)$";
  let m=t.match(new RegExp("^([A-Z0-9]{1,5}[ .\\-][A-Z]{1,2})[ .,:_\\-]*"+N)); if(m) add(m[1],m[2]);
  m=t.match(new RegExp("^([A-Z0-9]{1,5})[ .,:_\\-]*"+N)); if(m) add(m[1],m[2]);
  return out; }
const abbrRead=line=>abbrReads(line)[0]||null;   // first way only (kept for testing)
let learned={}; try{ learned=JSON.parse(localStorage.getItem("gvcScanAbbr")||"{}"); }catch(e){}
const saveL=()=>{ try{ localStorage.setItem("gvcScanAbbr",JSON.stringify(learned)); }catch(e){} };
const learn=(letters,name)=>{ learned[letters]=name; saveL(); }, forget=letters=>{ delete learned[letters]; saveL(); };
// how well short letters fit a name: 0 = not at all
function abbrFit(letters,A){
  if(letters.length>=A.name.length||letters[0]!==A.name[0]) return 0;
  const st=[...A.starts].sort((x,y)=>x-y);
  let k=0, ok=true; for(const ch of letters){ while(k<st.length&&A.name[st[k]]!==ch) k++; if(k>=st.length){ ok=false; break; } k++; }
  if(ok) return letters.length===st.length?0.8:0.74;          // every letter starts a word (and one per word = 0.8)
  let i=0; for(const ch of letters){ const j=A.name.indexOf(ch,i); if(j<0) return 0; i=j+1; }
  return 0.66; }                                               // letters in order, but not all on word starts
// names on the same count that share a front or back of 3+ letters split there: CHAIN|BASKET + CHAIN|HANGER, PASS|BOX + BELLY|BOX.
// Catches shop words that aren't in WORDS.
function splitShared(cands){
  const segsOf=c=>{ const k=String((c.keys||[])[0]||"").toUpperCase().replace(/^[0-9]{3,}[A-Z0-9_]*[.\-]/,""); const m=k.match(/^(.*?)[.\s_-]+\d/); return m?m[1].split(/[^A-Z]+/).filter(Boolean):[]; };
  const all=cands.filter(c=>c.A).map(c=>({c,segs:segsOf(c)})), words=new Set(); all.forEach(x=>x.segs.forEach(w=>words.add(w)));
  const W=[...words];
  all.forEach(({c,segs})=>{ let off=0;
    segs.forEach(sg=>{ W.forEach(o=>{ if(o===sg) return;
        let i=0; while(i<sg.length&&i<o.length&&sg[i]===o[i]) i++; if(i>=3&&sg.length-i>=2) c.A.starts.add(off+i);
        let j=0; while(j<sg.length&&j<o.length&&sg[sg.length-1-j]===o[o.length-1-j]) j++; if(j>=3&&sg.length-j>=2) c.A.starts.add(off+sg.length-j); });
      off+=sg.length; }); }); }

/* Deduce a short name from what's on the count (Kyle, Nov 10: "a bunch of parts have an abbreviated part name").
   For each read, every part on the count is tried - not just one at a time - so the scanner can rule parts out:
   - learned on this phone (CB was confirmed as CHAINBASKET before)           0.97, opens by itself
   - ONLY ONE part on the count fits the letters + number, AND those letters fit no other name on the count
     at the same strength ("CB" = only CHAINBASKET; nothing else is C.. B..)  0.9, opens after 2 good frames
   - only one part has that number + fits, but the letters could also mean another name on the count   0.8
   - several parts fit                                                       up to 0.78, a guess to tap
   A part opened from a short name teaches the phone, and ↺ Rescan / "Not this part" undoes it. */
function abbrDeduce(reads,cands){
  const res=new Map(), put=(c,s,r,why)=>{ const o=res.get(c); if(!o||s>o.s) res.set(c,{s,r,why}); };
  const byName=new Map(); cands.forEach(c=>{ if(c.A&&!byName.has(c.A.name)) byName.set(c.A.name,c.A); });
  for(const r of reads){
    const own=learned[r.letters];
    // how strongly these letters fit each name on the count (number ignored)
    const fitN=new Map(); byName.forEach((A,n)=>{ const f=abbrFit(r.letters,A); if(f>0) fitN.set(n,f); });
    if(!fitN.size&&!own) continue;
    const hits=cands.filter(c=>c.A&&c.A.num===r.num&&(own===c.A.name||fitN.has(c.A.name)));
    for(const c of hits){
      const n=c.A.name, f=fitN.get(n)||0;
      if(own===n){ put(c,0.97,r,"learned"); continue; }
      if(own&&own!==n&&byName.has(own)){ put(c,Math.min(0.6,f),r,""); continue; }   // the phone already knows these letters mean another part here
      const rivals=[...fitN.entries()].filter(([m,g])=>m!==n&&g>=f).length;           // other names the letters fit as well or better
      if(hits.length===1&&!rivals) put(c,0.9,r,"only");
      else if(hits.length===1) put(c,0.8,r,"num");
      else put(c,Math.min(0.78,f),r,"");
    }
  }
  return res; }

/* ---- text readers ---- */
let tess=null, tessP=null;
const native=()=>{ try{ return window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()&&window.Capacitor.Plugins&&window.Capacitor.Plugins.ShopNative; }catch(e){ return null; } };
let engine=null;   // "native" | "detector" | "tess"
async function readText(cv,rot){
  if(engine==="native"){ const b64=cv.toDataURL("image/jpeg",0.85).split(",")[1]; const r=await native().ocr({img:b64,rot}); return (r.lines&&r.lines.length?r.lines:String(r.text||"").split("\n")); }
  if(engine==="detector"){ const d=new window.TextDetector(); const r=await d.detect(cv); return r.map(x=>x.rawValue); }
  const r=await tess.recognize(cv); return String(r.data.text||"").split("\n");
}
async function pickEngine(setMsg){
  if(native()){ try{ const c=document.createElement("canvas"); c.width=c.height=32; await native().ocr({img:c.toDataURL("image/jpeg").split(",")[1],rot:0}); engine="native"; return; }catch(e){ /* older APK - no ocr */ } }
  if("TextDetector" in window){ try{ const c=document.createElement("canvas"); c.width=c.height=32; await new window.TextDetector().detect(c); engine="detector"; return; }catch(e){} }
  setMsg("Loading the text reader (first time takes a few seconds)…");
  if(!tessP) tessP=new Promise((ok,no)=>{ if(window.Tesseract) return ok(); const s=document.createElement("script"); s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"; s.onload=ok; s.onerror=()=>no(new Error("couldn't load the text reader - check the internet connection")); document.head.appendChild(s); })
    .then(async()=>{ tess=await window.Tesseract.createWorker("eng"); await tess.setParameters({tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-",tessedit_pageseg_mode:"6"}); });
  await tessP; engine="tess";
}

/* ---- the scanner ---- */
/* Nov 9 (Kyle's first real test on 1086WT parts): guesses flickered in and out several times a second and couldn't be
   tapped. Now reads add up over frames (ev, decays 0.8 per frame), a guess stays up 8 s after it was last read, buttons
   never move or get rebuilt while a finger is on them, and a part opens on its own once its added-up reads clearly lead. */
window.gvcScan=async function(o){
  const cands=(o.items||[]).map(it=>({...it,K:keysFor(it),A:abbrInfo(it)})).filter(c=>c.K.length);
  splitShared(cands);
  if(!cands.length){ alert("Nothing on this order has a part number to scan for."); return; }
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ alert("The camera isn't available here."); return; }
  const ov=document.createElement("div"); ov.id="gScan";
  ov.innerHTML=`<video playsinline muted autoplay></video><div class="shade"><div class="box"></div></div>
    <div class="top"><b>${esc(o.title||"Scan a part number")}</b><button type="button" id="gsT" aria-label="Flashlight">🔦</button><button type="button" id="gsX">Close</button></div>
    <div class="msg" id="gsM">Starting the camera…</div><div id="gsB"></div>`;
  document.body.appendChild(ov);
  const V=ov.querySelector("video"), M=ov.querySelector("#gsM"), BOX=ov.querySelector(".box"), B=ov.querySelector("#gsB");
  const setMsg=(t,sm)=>{ M.innerHTML=esc(t)+(sm?`<small>${esc(sm)}</small>`:""); };
  let stream=null, alive=true, paused=false, torch=false, hist=[], ignore={}, rotI=0, misses=0;
  // evidence kept across frames so a hard-to-read engraving adds up, and guesses stay on screen long enough to tap (Kyle, Nov 9)
  let ev=new Map(), shown=[], shownAt=0, hold=false, holdT=0;
  const GUESS_KEEP=8000;   // a guess stays up this long after it was last read
  const close=()=>{ alive=false; try{ stream&&stream.getTracks().forEach(t=>t.stop()); }catch(e){} ov.remove(); window.gvcScanClose=null; o.onClose&&o.onClose(); };
  if(!window.__gsBack){ window.__gsBack=1; const ob=window.gvcBack; window.gvcBack=()=>{ if(window.gvcScanClose&&!document.getElementById("gFlat")){ window.gvcScanClose(); return true; } return ob?ob():false; }; }
  ov.querySelector("#gsX").onclick=close;
  window.gvcScanClose=close;
  try{ stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}},audio:false}); }
  catch(e){ setMsg("Can't open the camera: "+(e.name==="NotAllowedError"?"camera permission was refused - allow it in the phone's settings for this app.":e.message)); return; }
  V.srcObject=stream; try{ await V.play(); }catch(e){}
  const track=stream.getVideoTracks()[0];
  try{ const cap=track.getCapabilities?track.getCapabilities():{}; if(!cap.torch) ov.querySelector("#gsT").style.display="none";
    if(cap.focusMode&&cap.focusMode.includes("continuous")) track.applyConstraints({advanced:[{focusMode:"continuous"}]}).catch(()=>{}); }catch(e){}
  ov.querySelector("#gsT").onclick=async e=>{ torch=!torch; try{ await track.applyConstraints({advanced:[{torch}]}); e.target.classList.toggle("on",torch); }catch(x){ torch=false; } };
  try{ await pickEngine(setMsg); }catch(e){ setMsg(e.message); return; }
  setMsg("Point at a part number - fill the box with it", engine==="tess"?"(slow reader on this device - hold still)":"");

  const cv=document.createElement("canvas"), cx=cv.getContext("2d",{willReadFrequently:true});
  const grab=()=>{ const vw=V.videoWidth, vh=V.videoHeight; if(!vw) return false;
    // the box on screen -> the same area of the video frame (video is object-fit:cover)
    const r=V.getBoundingClientRect(), b=BOX.getBoundingClientRect(); const sc=Math.max(r.width/vw,r.height/vh);
    const ox=(vw*sc-r.width)/2, oy=(vh*sc-r.height)/2;
    let sx=(b.left-r.left+ox)/sc, sy=(b.top-r.top+oy)/sc, sw=b.width/sc, sh=b.height/sc;
    sy-=sh*0.25; sh*=1.5; sx=Math.max(0,sx); sy=Math.max(0,sy); sw=Math.min(vw-sx,sw); sh=Math.min(vh-sy,sh);   // a bit of slack above/below
    const k=Math.min(1,1400/sw); cv.width=Math.round(sw*k); cv.height=Math.round(sh*k);
    cx.drawImage(V,sx,sy,sw,sh,0,0,cv.width,cv.height);
    if(engine==="tess"){ const d=cx.getImageData(0,0,cv.width,cv.height), p=d.data;   // grey + stretch contrast for the slow reader
      let lo=255,hi=0; for(let i=0;i<p.length;i+=4){ const g=(p[i]*.3+p[i+1]*.59+p[i+2]*.11); p[i]=g; if(g<lo) lo=g; if(g>hi) hi=g; }
      const f=255/Math.max(30,hi-lo); for(let i=0;i<p.length;i+=4){ const g=(p[i]-lo)*f; p[i]=p[i+1]=p[i+2]=g; } cx.putImageData(d,0,0); }
    return true; };

  // B holds either the guess list or the found card. The guess buttons are only rebuilt when the list itself changes
  // (never while a finger is on them), so a tap can't land on a button that was just replaced.
  B.addEventListener("pointerdown",e=>{ if(e.target.closest(".guess")){ hold=true; clearTimeout(holdT); } });
  const unhold=()=>{ clearTimeout(holdT); holdT=setTimeout(()=>{ hold=false; },500); };
  B.addEventListener("pointerup",unhold); B.addEventListener("pointercancel",unhold);
  function clearGuess(){ shown=[]; if(B.querySelector(".guess")) B.innerHTML=""; }
  function updateGuess(){
    if(hold||paused) return;
    const now=Date.now();
    const live=[...ev.values()].filter(e=>e.best>=0.6&&now-e.last<GUESS_KEEP&&!(ignore[e.c.id]>now)).sort((a,b)=>b.sum-a.sum);
    if(!live.length){ clearGuess(); return; }
    const ids=live.slice(0,3).map(e=>e.c.id);
    // Buttons never move: an expired guess drops out, free slots fill with the strongest new ones, and only after
    // 2.5 s may the weakest guess be swapped for a much stronger one in the same spot.
    let next=shown.filter(id=>live.some(e=>e.c.id===id));
    ids.forEach(id=>{ if(next.length<3&&!next.includes(id)) next.push(id); });
    if(now-shownAt>2500&&next.length){
      const fresh=live.find(e=>!next.includes(e.c.id)), weak=next.reduce((w,id)=>ev.get(id).sum<ev.get(w).sum?id:w,next[0]);
      if(fresh&&fresh.sum>=1.5*ev.get(weak).sum) next=next.map(id=>id===weak?fresh.c.id:id);
    }
    if(next.join()!==shown.join()||!B.querySelector(".guess")){
      shown=next; shownAt=now;
      B.innerHTML=`<div class="guess"><div class="gh">Not sure yet - tap the right one, or keep pointing</div>${shown.map(id=>{ const e=ev.get(id);
        return `<button type="button" data-g="${esc(id)}">Is it <b>${esc(e.c.label)}</b>?${e.ab?` <span style="opacity:.75">(${esc(e.ab)} ${e.ded==="only"?"- only "+esc(e.c.A.name)+" fits on this count":"short for "+esc(e.c.A.name)})</span>`:""} <span class="pc" style="opacity:.6"></span></button>`; }).join("")}</div>`;
      B.querySelectorAll("[data-g]").forEach(b=>b.onclick=()=>{ hold=false; found(b.dataset.g); });
    }
    B.querySelectorAll("[data-g]").forEach(b=>{ const e=ev.get(b.dataset.g); const pc=b.querySelector(".pc"); if(e&&pc) pc.textContent=Math.round(e.best*100)+"%"; });
  }
  function found(id){
    const fe=ev.get(id), taught=fe&&fe.ab&&fe.c.A&&learned[fe.ab]!==fe.c.A.name?{letters:fe.ab,was:learned[fe.ab]}:null;
    if(taught) learn(taught.letters,fe.c.A.name);          // remember "CB" = CHAINBASKET; undone below if it was the wrong part
    const untaught=()=>{ if(!taught) return; if(taught.was) learn(taught.letters,taught.was); else forget(taught.letters); };
    paused=true; clearGuess(); BOX.classList.add("hit"); try{ navigator.vibrate&&navigator.vibrate(60); }catch(e){}
    if(o.open){ B.innerHTML=""; setMsg("");
      const shown=o.open(id,why=>{ if(!alive) return; if(why==="rescan") untaught(); ignore[id]=Date.now()+(why==="rescan"?4000:2500); resume(); setMsg(why==="rescan"?"Rescanning - point at the part number again":"Point at the next part number"); });
      if(shown!==false) return; }
    const draw=()=>{ const f=o.info(id)||{}; const full=f.qty&&f.got>=f.qty;
      B.innerHTML=`<div class="card"><div class="r">${f.img?`<img src="${esc(f.img)}" alt="">`:""}<div style="flex:1"><div class="nm">${esc(f.label||id)}</div>${f.sub?`<div class="sb">${esc(f.sub)}</div>`:""}</div></div>
        <div class="ct ${full?"full":""}">${f.got||0} of ${f.qty||0}${full?" ✓":""}</div>
        <div class="bt"><button type="button" data-a="-1">−1</button><button type="button" class="p" data-a="+1">+1</button><button type="button" data-a="all">All ${f.qty||""}</button></div>
        <div class="nx"><button type="button" id="gsN">Not this part</button><button type="button" class="go" id="gsG">Scan next ›</button></div></div>`;
      B.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>{ o.act(id,b.dataset.a); draw(); });
      B.querySelector("#gsN").onclick=()=>{ untaught(); ignore[id]=Date.now()+4000; resume(); };
      B.querySelector("#gsG").onclick=()=>{ ignore[id]=Date.now()+2500; resume(); }; };
    draw(); setMsg("");
  }
  function resume(){ paused=false; hist=[]; ev.clear(); shown=[]; hold=false; B.innerHTML=""; BOX.classList.remove("hit"); setMsg("Point at the next part number"); }

  const ROT=[0,180,90,270];
  while(alive){
    if(paused||document.hidden||!grab()){ await new Promise(r=>setTimeout(r,250)); continue; }
    let lines=[]; const rot=engine==="native"?ROT[rotI%4]:0;
    try{ lines=(await readText(cv,rot)).map(s=>String(s).trim()).filter(Boolean); }catch(e){ setMsg("Reader error: "+e.message); await new Promise(r=>setTimeout(r,800)); continue; }
    if(!alive||paused) continue;
    const now=Date.now(); const top=rank(lines,cands).filter(x=>!(ignore[x.c.id]>now));
    ev.forEach(e=>{ e.sum*=0.8; });                     // older reads count for less
    if(!lines.length||!top.length){ misses++; if(misses%2===0) rotI++;
      setMsg(shown.length?"Keep pointing at it, or tap the right one below":lines.length?"Reading - not a part on this order yet":"Point at a part number - fill the box with it", lines.join("  ").slice(0,60));
      hist.push(null); hist=hist.slice(-5); updateGuess(); continue; }      // guesses are NOT cleared here - they expire on their own
    misses=0;
    const a=top[0], b=top[1], margin=a.s-(b?b.s:0);
    top.slice(0,6).forEach(x=>{ if(x.s<0.55||a.s-x.s>0.2) return; const e=ev.get(x.c.id)||{c:x.c,sum:0,best:0,last:0}; if(x.ab){ e.ab=x.ab.letters; e.ded=x.ded; } e.sum+=x.s; e.best=Math.max(e.best,x.s); e.last=now; ev.set(x.c.id,e); });
    hist.push(a.s>=0.75&&margin>=0.04?a.c.id:null); hist=hist.slice(-5);
    const wins=hist.filter(x=>x===a.c.id).length;
    // leader over the last few frames, by added-up evidence
    const lead=[...ev.values()].sort((x,y)=>y.sum-x.sum), L1=lead[0], L2=lead[1];
    const evPick=L1&&L1.best>=0.8&&L1.sum>=2&&L1.sum>=1.6*(L2?L2.sum:0)&&!(L1.ab&&L1.ded!=="only"&&learned[L1.ab]!==(L1.c.A&&L1.c.A.name));
    if(!hold){
      if(a.s>=0.97&&margin>=0.05||a.s>=0.8&&margin>=0.08&&wins>=2){ found(a.c.id); continue; }
      if(evPick&&!(ignore[L1.c.id]>now)){ found(L1.c.id); continue; }
    }
    const noNum=!lines.some(l=>/\d\s*(-\s*[A-Z0-9]+)?\s*$/i.test(l));   // nothing read ends in a number - that's the part that tells siblings apart
    setMsg(noNum?"Can't read the number at the end - tilt the phone a little or try the 🔦":"Hold still…", lines.join("  ").slice(0,60));
    updateGuess();
    if(engine!=="tess") await new Promise(r=>setTimeout(r,120));
  }
};
window.gvcScanMatch={canon,partial,rank,keysFor,abbrInfo,abbrRead,abbrReads,abbrFit,abbrDeduce,splitShared,wordStarts,learned:()=>learned,learn};   // for testing
})();
