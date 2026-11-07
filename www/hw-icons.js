/* ---------- Pictures for Robin's hardware list (Kyle, Nov 6) ----------
   Drawn line pictures, one per part type (hex bolt, nylock nut, drill bit, gas strut...). Each hardware item gets the
   picture for what its description says it is (window.hwPic); items it can't recognise get none. Original drawings, so
   nothing is copied from vendor sites, and new items in Robin's sheet get a picture automatically. */
(()=>{
const T=(x,y,w,h,n)=>{ let s=""; for(let i=0;i<n;i++){ const yy=y+i*h/n; s+=`<path d="M${x} ${yy+h/n}L${x+w} ${yy}"/>`; } return s; };   // thread lines
const shank=(x,y,w,h,n)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" class="f2"/>${T(x,y,w,h,n)}`;
const I={
hexbolt:`<path d="M20 6h24v12H20z" class="f1"/><path d="M28 6v12M36 6v12"/>${shank(26,18,12,40,9)}`,
shcs:`<rect x="21" y="6" width="22" height="15" rx="3" class="f1"/><path d="M29 10l3-2 3 2v4l-3 2-3-2z"/>${shank(26,21,12,37,8)}`,
button:`<path d="M17 20q15-18 30 0z" class="f1"/><path d="M29 12l3-2 3 2v3l-3 2-3-2z"/>${shank(26,20,12,38,8)}`,
flathead:`<path d="M14 8h36L38 20H26z" class="f1"/><path d="M29 10l3-1 3 1v3l-3 1-3-1z"/>${shank(26,20,12,38,8)}`,
machscrew:`<path d="M18 18q14-16 28 0z" class="f1"/><path d="M26 13h12"/>${shank(27,18,10,40,10)}`,
selfdrill:`<path d="M20 6h24v8H20z" class="f1"/><path d="M16 14h32v4H16z" class="f1"/>${shank(26,18,12,32,7)}<path d="M26 50l6 10 6-10" class="f2"/>`,
carriage:`<path d="M15 18q17-16 34 0z" class="f1"/><rect x="26" y="18" width="12" height="7" class="f1"/>${shank(26,25,12,33,7)}`,
nut:`<path d="M32 8l20 12v24L32 56 12 44V20z" class="f1"/><circle cx="32" cy="32" r="10" class="f0"/><circle cx="32" cy="32" r="7" stroke-dasharray="2 2"/>`,
nylock:`<path d="M32 8l20 12v24L32 56 12 44V20z" class="f1"/><circle cx="32" cy="32" r="12" class="acc"/><circle cx="32" cy="32" r="7" class="f0"/>`,
flangenut:`<circle cx="32" cy="32" r="25" class="f2"/><path d="M32 13l16 9v20l-16 9-16-9V22z" class="f1"/><circle cx="32" cy="32" r="7" class="f0"/>`,
weldnut:`<path d="M6 40h52v8H6z" class="f2"/><path d="M14 40v-6h36v6"/><path d="M22 34V20h20v14z" class="f1"/><path d="M28 20v14M36 20v14"/>`,
washer:`<circle cx="32" cy="32" r="22" class="f1"/><circle cx="32" cy="32" r="9" class="f0"/>`,
fender:`<circle cx="32" cy="32" r="27" class="f1"/><circle cx="32" cy="32" r="6" class="f0"/>`,
lockwasher:`<path d="M44 18A19 19 0 1 1 36 13" class="thick"/><path d="M40 10l-2 9"/>`,
drill:`<path d="M10 54L36 28" class="thick2"/><path d="M36 28l14-14 4 4-14 14z" class="f1"/><path d="M40 24l6 6M44 20l6 6M38 20l8 0"/><path d="M50 14l6-6" />`,
annular:`<path d="M14 22h36v24H14z" class="f1"/><path d="M14 46l4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6"/><rect x="28" y="6" width="8" height="16" class="f2"/>`,
rivet:`<path d="M18 22q14-12 28 0z" class="f1"/><rect x="26" y="22" width="12" height="22" class="f2"/><path d="M32 8v48"/><circle cx="32" cy="56" r="2" class="f1"/>`,
zip:`<path d="M20 44a16 16 0 1 1 24 0"/><rect x="18" y="42" width="12" height="9" rx="2" class="f1"/><path d="M30 46l26 0" class="thick"/><path d="M34 44v4M40 44v4M46 44v4M52 44v4"/>`,
disc:`<circle cx="32" cy="32" r="25" class="acc"/><circle cx="32" cy="32" r="16" stroke-dasharray="3 3"/><circle cx="32" cy="32" r="5" class="f0"/>`,
light:`<circle cx="32" cy="32" r="14" class="acc"/><circle cx="32" cy="32" r="8"/><path d="M32 6v6M32 52v6M6 32h6M52 32h6M14 14l4 4M46 46l4 4M50 14l-4 4M14 50l4-4"/>`,
dome:`<path d="M10 42h44" class="thick"/><path d="M14 42q18-28 36 0z" class="acc"/><path d="M22 34q10-10 20 0"/>`,
flood:`<rect x="10" y="18" width="30" height="24" rx="4" class="acc"/><path d="M40 24l12-6M40 30h14M40 36l12 6"/><path d="M25 42v10M17 52h16"/>`,
plug:`<circle cx="32" cy="32" r="24" class="f1"/><circle cx="32" cy="32" r="4" class="f0"/><circle cx="32" cy="17" r="3" class="f0"/><circle cx="45" cy="25" r="3" class="f0"/><circle cx="45" cy="40" r="3" class="f0"/><circle cx="32" cy="47" r="3" class="f0"/><circle cx="19" cy="40" r="3" class="f0"/><circle cx="19" cy="25" r="3" class="f0"/>`,
shrink:`<rect x="8" y="24" width="48" height="16" rx="8" class="acc"/><path d="M20 24v16M44 24v16"/>`,
grip:`<path d="M20 8h24v10H20z" class="f1"/><path d="M28 8v10M36 8v10"/><rect x="22" y="18" width="20" height="18" class="f2"/>${T(22,18,20,18,5)}<path d="M32 36v22" class="thick2"/>`,
jbox:`<rect x="10" y="14" width="44" height="36" rx="4" class="f1"/><circle cx="16" cy="20" r="2"/><circle cx="48" cy="20" r="2"/><circle cx="16" cy="44" r="2"/><circle cx="48" cy="44" r="2"/><path d="M4 32h6M54 32h6"/>`,
battery:`<circle cx="32" cy="32" r="22" class="f1"/><circle cx="32" cy="32" r="16"/><path d="M28 32h8M32 28v8"/>`,
alarm:`<path d="M12 24h10l14-12v40L22 40H12z" class="f1"/><path d="M42 24q6 8 0 16M48 18q12 14 0 28"/>`,
fuse:`<rect x="18" y="20" width="28" height="24" rx="3" class="acc"/><path d="M24 44v10M40 44v10"/><path d="M24 32h16"/>`,
wire:`<ellipse cx="32" cy="18" rx="22" ry="7" class="f1"/><path d="M10 18v28q22 14 44 0V18"/><path d="M14 26q18 8 36 0M14 34q18 8 36 0M14 42q18 8 36 0"/><circle cx="32" cy="18" r="5" class="f0"/>`,
terminal:`<circle cx="18" cy="32" r="10" class="f1"/><circle cx="18" cy="32" r="4" class="f0"/><path d="M28 28h14v8H28z" class="acc"/><path d="M42 32h16" class="thick"/>`,
switch:`<rect x="16" y="10" width="32" height="44" rx="6" class="f1"/><path d="M22 18l20 10v18L22 36z" class="acc"/>`,
fitting:`<rect x="6" y="26" width="16" height="12" class="f2"/><path d="M22 20h14v24H22z" class="f1"/><path d="M27 20v24M31 20v24"/>${shank(36,24,20,16,5)}`,
hose:`<path d="M8 50c10-30 38-4 30-24s-20-8-10 6 26 10 28-12" class="thick"/><rect x="4" y="46" width="8" height="10" class="f1"/><rect x="52" y="12" width="8" height="10" class="f1"/>`,
flange:`<circle cx="32" cy="32" r="24" class="f1"/><circle cx="32" cy="32" r="9" class="f0"/><circle cx="32" cy="14" r="3" class="f0"/><circle cx="50" cy="32" r="3" class="f0"/><circle cx="32" cy="50" r="3" class="f0"/><circle cx="14" cy="32" r="3" class="f0"/>`,
mudflap:`<path d="M10 8h44" class="thick"/><path d="M14 8h36v48H14z" class="acc"/><path d="M14 20h36"/><circle cx="20" cy="14" r="2"/><circle cx="44" cy="14" r="2"/>`,
dring:`<path d="M14 46h36v8H14z" class="f2"/><path d="M24 46V36h16v10" class="f1"/><path d="M20 36q12-36 24 0" class="thick"/>`,
clip:`<path d="M10 50h16v-6q-12-2-10-18a16 16 0 0 1 32 0q2 16-10 18" class="thick"/><circle cx="18" cy="47" r="2"/>`,
bracket:`<path d="M14 10v40h40v-12H26V10z" class="f1"/><circle cx="20" cy="22" r="3" class="f0"/><circle cx="40" cy="44" r="3" class="f0"/>`,
hinge:`<rect x="8" y="14" width="22" height="36" rx="2" class="f1"/><rect x="34" y="14" width="22" height="36" rx="2" class="f1"/><rect x="29" y="10" width="6" height="44" rx="3" class="acc"/><circle cx="18" cy="24" r="2.5"/><circle cx="18" cy="40" r="2.5"/><circle cx="46" cy="24" r="2.5"/><circle cx="46" cy="40" r="2.5"/>`,
qlink:`<rect x="18" y="8" width="28" height="48" rx="14" class="thick"/><rect x="14" y="26" width="10" height="12" rx="2" class="f1"/>`,
pin:`<path d="M10 32h36" class="thick2"/><circle cx="50" cy="32" r="5" class="f1"/><path d="M10 32q-4-14 14-18q20-4 28 14"/>`,
chain:`<rect x="4" y="22" width="24" height="14" rx="7" class="thick"/><rect x="20" y="25" width="24" height="14" rx="7" class="thick"/><rect x="36" y="22" width="24" height="14" rx="7" class="thick"/>`,
snapring:`<path d="M14 50V22a12 12 0 0 1 24 0v8" class="thick"/><path d="M38 30q6 0 6 6v14" class="thick"/><path d="M14 50h6"/>`,
strut:`<rect x="6" y="26" width="32" height="12" rx="6" class="acc"/><path d="M38 32h18" class="thick2"/><circle cx="6" cy="32" r="3" class="f1"/><circle cx="58" cy="32" r="3" class="f1"/>`,
slide:`<rect x="4" y="22" width="56" height="10" rx="2" class="f1"/><rect x="12" y="32" width="48" height="10" rx="2" class="f2"/><circle cx="12" cy="27" r="2"/><circle cx="32" cy="27" r="2"/><circle cx="52" cy="27" r="2"/>`,
handle:`<path d="M10 40h8V26q0-8 8-8h12q8 0 8 8v14h8" class="thick"/><path d="M6 40h52" />`,
hitch:`<rect x="6" y="22" width="34" height="20" rx="2" class="f1"/><path d="M40 28h14v8H40z" class="f2"/><circle cx="23" cy="32" r="4" class="f0"/><path d="M54 24v16"/>`,
seal:`<path d="M10 54V22h20v32" class="f1"/><circle cx="44" cy="22" r="12" class="acc"/><path d="M30 26h4"/>`,
jack:`<path d="M14 54h36" class="thick"/><rect x="26" y="20" width="12" height="34" class="f1"/><path d="M20 20h24v-6H20z" class="acc"/><path d="M38 34h16"/>`,
glasses:`<path d="M8 26h48"/><path d="M10 26q0 16 10 16t10-16M34 26q0 16 10 16t10-16" class="acc"/>`,
earplug:`<path d="M20 46q-8-10 0-26q8-10 16 0l-4 26z" class="acc"/><path d="M32 46q10 6 20-4" />`,
mask:`<path d="M10 30q22-20 44 0v8q-22 18-44 0z" class="acc"/><path d="M6 26l8 6M58 26l-8 6M24 34h16"/>`,
tape:`<circle cx="30" cy="32" r="22" class="acc"/><circle cx="30" cy="32" r="10" class="f0"/><path d="M50 40l10 12H40"/>`,
};
const RULES=[
 ["fitting",/\bjic\b|hydraulic|tube cap|\bnpt\b|\borb\b|fitting/],["hose",/hose/],
 ["shcs",/socket head cap|\bshcs\b|socket cap/],["button",/button head/],["flathead",/flat head socket|countersunk|flat head/],
 ["selfdrill",/self[- ]drill|tek screw|deck screw|self[- ]tap/],["carriage",/carriage bolt/],["machscrew",/machine screw|pan head|round head|truss head/],
 ["nylock",/nylon insert|nylock|nyloc|lock ?nut|top lock/],["weldnut",/weld nut|bridge w|wl nt/],["flangenut",/flange nut/],["nut",/\bnuts?\b/],
 ["lockwasher",/lock washer|split washer/],["fender",/fender washer/],["washer",/washer/],
 ["hexbolt",/hex cap|hhcs|hex bolt|cap screw|\bbolt\b|\d\s*x\s*\d.*\b(nc|nf)\b|\bg8\d|tap bolt/],
 ["annular",/annular cutter/],["drill",/drill|jobber/],["rivet",/rivet/],["zip",/zip tie|cable tie|nylon tie|locking cabl/],["disc",/sanding|flap disc|grinding|cut[- ]?off|\bdisc\b|\bdisk\b/],
 ["mudflap",/mud ?flap/],["dring",/d[- ]ring/],["clip",/tube clip|clamp|p[- ]clip/],["bracket",/bracket/],
 ["earplug",/earplug|ear plug|nrr\b/],["switch",/switch/],["terminal",/\blug\b|terminal|butt connector|ring term/],
 ["dome",/dome light/],["flood",/flood|work light/],["light",/\blights?\b|\bled\b|lamp|marker|clearance|penny/],
 ["plug",/plug|socket|connector|7[- ]way|4[- ]way|pigtail/],["shrink",/shrink/],["grip",/strain relief|cord grip/],["jbox",/junction box/],
 ["battery",/battery|coin cell/],["alarm",/alarm|buzzer/],["fuse",/fuse|breaker|relay/],["wire",/\bwire\b|cable|\bawg\b/],
 ["flange",/tank flange|weld neck flange|weld-on flange/],["hinge",/hinge/],["qlink",/quick link/],["pin",/\bpin\b/],["chain",/\bchain\b/],
 ["snapring",/snap ring|retaining ring|circlip|spring snap/],["strut",/gas spring|gas shock|\bshock|strut|ball stud/],["slide",/slide/],
 ["handle",/handle/],["hitch",/hitch|receiver|reciever/],["seal",/bulb|seal|edge ?trim|weatherstrip/],["jack",/\bjack\b/],
 ["glasses",/glasses|goggle/],["earplug",/earplug|ear plug/],["mask",/respirator|n95|mask/],["tape",/\btape\b/],
];
const COL={"Bolts & screws":"#9fb3c8","Nuts":"#9fb3c8","Washers":"#9fb3c8","Lights & electrical":"#f5b041","Hydraulic":"#22c3e6","Shop supplies":"#ff8a2a","Safety":"#3ad06b","Grill parts":"#e5483b","Hardware":"#a374ff"};
const css=document.createElement("style");
css.textContent=`.hwpic{flex:none;display:grid;place-items:center;background:#f4f5f7;border-radius:10px;color:#3a3f47}
.hwpic svg{width:80%;height:80%;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.hwpic .f0{fill:#f4f5f7}.hwpic .f1{fill:#d5d9df}.hwpic .f2{fill:#e6e9ed}.hwpic .acc{fill:var(--pc,#ffb36b)}.hwpic .thick{stroke-width:4}.hwpic .thick2{stroke-width:6}
.hwr.pic{grid-template-columns:52px 1fr auto}.hwr.pic .hwpic{width:52px;height:52px;grid-row:1/3}.hwr.pic .s{grid-column:2/-1}
.hwsheetpic{width:120px;height:120px;margin:0 auto 10px}
body.girly .hwpic{background:#fff6fb}body.girly .hwpic .f0{fill:#fff6fb}body.girly .hwpic .f1{fill:#f6d9ea}body.girly .hwpic .f2{fill:#fbe8f3}body.girly .hwpic{color:#7b3a68}`;
document.head.appendChild(css);
window.hwPicKey=h=>{ const a=[h.description,h.size,h.category].filter(Boolean).join(" ").toLowerCase(), b=[h.grp,h.sub,h.section].filter(Boolean).join(" ").toLowerCase();
  for(const t of [a,b]){ if(!t) continue; for(const [k,re] of RULES){ if(re.test(t)) return k; } } return null; };
window.hwPic=(h,cls="")=>{ const k=window.hwPicKey(h); if(!k||!I[k]) return ""; return `<span class="hwpic ${cls}" style="--pc:${COL[h.kind]||"#ffb36b"}" title="${k}"><svg viewBox="0 0 64 64" aria-hidden="true">${I[k]}</svg></span>`; };
window.hwPicKeys=()=>Object.keys(I);
window.hwPicByKey=(k,cls="")=>I[k]?`<span class="hwpic ${cls}"><svg viewBox="0 0 64 64" aria-hidden="true">${I[k]}</svg></span>`:"";
})();
