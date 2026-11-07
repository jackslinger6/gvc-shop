/* Hardware photos.
   1. TYPE photos: free-licence photos from Wikimedia Commons, one per part type (hex bolt, nylock, zip tie...), stored in
      storage gvc-parts/hwimg/type/<key>.<ext>. Credits below (shown on the item sheet).
   2. ITEM photos: Robin/Kyle tap "Add / replace photo" on any item and snap it on the desk. Stored at
      gvc-parts/hwimg/item/<hash of item key>.jpg - no database column, so the daily spreadsheet sync never touches it.
   Order shown: item photo > type photo > drawn icon (hw-icons.js) > nothing. */
(function(){
const C="https://commons.wikimedia.org/wiki/File:";
const T={ // key: [ext, artist, licence, commons file]
hexbolt:["jpg","Ralf Roletschek","GFDL 1.2","18-03-16-Schrauben-M6x20_RRK3179.jpg"],
shcs:["jpg","Ralf Roletschek","GFDL 1.2","18-03-16-Schrauben-M6x20_RRK3177.jpg"],
button:["jpg","Ralf Roletschek","GFDL 1.2","18-03-16-Schrauben-M6x20_RRK3181.jpg"],
flathead:["jpg","Renato.pierri","CC BY-SA 4.0","44215700s_03.jpg"],
nut:["jpg","ARFISA Representaciones, SCP","CC BY-SA 3.0","ARFISA_13.jpg"],
nylock:["png","Btarski (en.wikipedia)","CC BY-SA 3.0","Nylon_Lock_Nut.png"],
carriage:["jpg","Karl Bednarik","Copyrighted free use","TORBANDSCHRAUBEN_DSCM1953.JPG"],
selfdrill:["png","Zheer16 @ Pixabay","CC0","Hex-head-self-drilling-screw-1614969_340.png"],
machscrew:["jpg","Andrew Pertsev","CC0","Screw_Head_-_Slotted-Phillips_(pan_head_with_press_washer).jpg"],
weldnut:["png","Weld Fastener Guy","CC BY-SA 4.0","Four_Projection_Picture.png"],
drill:["jpg","andersen_mrjh","CC BY-SA 2.0","Twist_Drill_Bit_(6954963717).jpg"],
annular:["jpg","Rohan von Indien","CC BY-SA 3.0","Annular_Cutter.jpg"],
washer:["jpg","Tiesse","Public domain","Plain_washer1.jpg"],
fender:["png","Taylor 49","CC BY-SA 4.0","Many_washers_of_different_sizes.png"],
lockwasher:["jpg","Dietmar Rabich","CC BY-SA 4.0","Unterlegscheiben,_Mini-Skyline_--_2020_--_3875.jpg"],
flangenut:["png","Btarski","CC BY-SA 3.0","Serrated_Nut.png"],
rivet:["jpg","Cjp24","CC BY-SA 4.0","Blind_rivets_before_and_after_strain.jpg"],
zip:["jpg","Silverxxx","CC BY-SA 3.0","Cable_ties.jpg"],
disc:["jpg","Scieramy","CC BY-SA 4.0","Klingspor_SMT324_flap_disc_1.jpg"],
light:["jpg","Ehsnils","CC BY-SA 3.0","CombinedLampReflector.jpg"],
flood:["jpg","Rhododendrites","CC BY-SA 4.0","LED_light_(40979).jpg"],
shrink:["jpg","oomlout","CC BY-SA 2.0","Heat-shrink_tubing.jpg"],
grip:["jpg","1-1111","Public domain","Presse-etoupe.jpg"],
jbox:["jpg","S.J. de Waard","CC BY 2.5","Cable_junction_box_for_maintaining_electrical_functional_integrity_according_to_DIN_4102_Part_12.JPG"],
plug:["jpg","Plastimat GmbH","CC BY-SA 4.0","Anh%C3%A4ngersteckdose_12v_13-polig.jpg"],
battery:["jpg","Raimond Spekking","CC BY-SA 4.0","Toshiba_CR2032-92326.jpg"],
fuse:["jpg","havarhen","CC BY-SA 3.0","Electrical_fuses,_plug-in_type,_different_sizes.jpeg"],
terminal:["jpg","Mixabest","CC BY-SA 3.0","%D0%9D%D0%B0%D0%BA%D0%BE%D0%BD%D0%B5%D1%87%D0%BD%D0%B8%D0%BA%D0%B8_%D0%BD%D0%B0_%D1%80%D0%B0%D0%B7%D0%B4%D0%B5%D0%BB%D1%8B%D0%B2%D0%B0%D0%B5%D0%BC%D1%83%D1%8E_%D0%B6%D0%B8%D0%BB%D1%83_112113.jpg"],
fitting:["jpg","PRR","CC BY-SA 3.0","JIC-37deg-Ford1967.jpg"],
hose:["jpg","W.carter","CC BY-SA 4.0","Propane_torch_with_handle_and_hose_in_Tuntorp_1.jpg"],
flange:["jpg","McCrometer, Inc.","CC BY-SA 3.0","VW8-WN-RF-Cls300_composite.Low_Res.jpg"],
mudflap:["jpg","Eric Polk","CC BY-SA 4.0","Semi_wheels_and_mud_flaps.jpg"],
dring:["jpg","Hydrargyrum","Public domain","D-ring_cargo_tiedown.jpg"],
clip:["jpg","FP Preis","Public domain","Couplings.JPG"],
bracket:["jpg","Fructibus","CC0","Bronze_angle_bracket_-_4_x_4_cm_-_A.jpg"],
pin:["jpg","Chris Cross","Public domain","HitchPin.jpg"],
snapring:["jpg","Peter Southwood","CC BY-SA 4.0","Spring_gate_snap_hooks_PA210113.jpg"],
hinge:["jpg","Tomwsulcer","CC0","After_using_a_butt_marker_to_chisel_out_hole_for_door_hinge.JPG"],
qlink:["jpg","Dogburp","CC0","Oval_Mallion.jpg"],
glasses:["jpg","Jacek Halicki","CC BY-SA 4.0","2023_Okulary_ochronne_(1).jpg"],
earplug:["jpg","Sokolikmawwer0","CC BY-SA 3.0","A_pair_of_orange_foam_earplugs.jpg"],
mask:["jpg","Hanabishi","CC0","N95mask.jpg"],
chain:["jpg","Envy fstop","CC BY-SA 4.0","Chain_Macro.jpg"],
};
const typePath=k=>`hwimg/type/${k}.${T[k][0]}`;
// short stable hash of the item key (cyrb53) -> safe file name
const hash=s=>{ let h1=0xdeadbeef,h2=0x41c6ce57; for(let i=0;i<s.length;i++){ const c=s.charCodeAt(i); h1=Math.imul(h1^c,2654435761); h2=Math.imul(h2^c,1597334677); }
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909); h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (h2>>>0).toString(16).padStart(8,"0")+(h1>>>0).toString(16).padStart(8,"0"); };
const itemPath=h=>`hwimg/item/${hash(String(h.key))}.jpg`;
const URL_={}; // storage path -> signed url
const ITEMS=new Set(); // item paths that exist
let ready=false;
const rerender=()=>{ try{ if(typeof cur!=="undefined"&&(cur==="inv"||cur==="home")) render(); }catch(e){} };
async function sign(paths){ for(let i=0;i<paths.length;i+=100){ const r=await sb.storage.from("gvc-parts").createSignedUrls(paths.slice(i,i+100),60*60*12);
  (r.data||[]).forEach(u=>{ if(u.signedUrl) URL_[u.path]=u.signedUrl; }); } }
async function load(){
  try{ const l=await sb.storage.from("gvc-parts").list("hwimg/item",{limit:2000}); (l.data||[]).forEach(f=>{ if(f.name&&f.name.endsWith(".jpg")) ITEMS.add("hwimg/item/"+f.name); }); }catch(e){}
  try{ await sign([...Object.keys(T).map(typePath),...ITEMS]); }catch(e){}
  ready=true; rerender();
}
let started=false;
setInterval(()=>{ if(!started&&typeof sb!=="undefined"&&sb&&window.ME){ started=true; load(); } },1500);

const drawn=window.hwPic; // drawn-icon fallback from hw-icons.js
const img=(u,cls,alt)=>`<span class="hwpic photo ${cls}"><img src="${u}" alt="${String(alt||"").replace(/"/g,"&quot;")}" loading="lazy" decoding="async"></span>`;
window.hwPic=(h,cls="")=>{
  const ip=itemPath(h); if(ITEMS.has(ip)&&URL_[ip]) return img(URL_[ip],cls,h.description);
  const k=window.hwPicKey(h); if(k&&T[k]&&URL_[typePath(k)]) return img(URL_[typePath(k)],cls,k);
  return drawn?drawn(h,cls):"";
};
window.hwHasOwnPhoto=h=>ITEMS.has(itemPath(h));
window.hwPhotoCredit=h=>{ if(ITEMS.has(itemPath(h))) return ""; const k=window.hwPicKey(h); if(!k||!T[k]) return "";
  const t=T[k]; return `Example photo: ${t[1]}, ${t[2]}, <a href="${C+t[3]}" target="_blank" rel="noopener">Wikimedia Commons</a>`; };

// shrink a camera photo to ~900px JPEG before upload (phone photos are 3-5 MB)
async function shrink(file){
  const bmp=await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=URL.createObjectURL(file); });
  const s=Math.min(1,900/Math.max(bmp.naturalWidth,bmp.naturalHeight)); const c=document.createElement("canvas");
  c.width=Math.round(bmp.naturalWidth*s); c.height=Math.round(bmp.naturalHeight*s); c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);
  URL.revokeObjectURL(bmp.src); return await new Promise(r=>c.toBlob(r,"image/jpeg",0.85));
}
window.hwPhotoSet=async(h,file)=>{
  const p=itemPath(h); const b=await shrink(file);
  const r=await sb.storage.from("gvc-parts").upload(p,b,{contentType:"image/jpeg",upsert:true}); if(r.error) throw r.error;
  ITEMS.add(p); await sign([p]); rerender();
};
window.hwPhotoRemove=async h=>{
  const p=itemPath(h); const r=await sb.storage.from("gvc-parts").remove([p]); if(r.error) throw r.error;
  ITEMS.delete(p); delete URL_[p]; rerender();
};
const css=document.createElement("style");
css.textContent=`.hwpic.photo{overflow:hidden;background:#fff}.hwpic.photo img{width:100%;height:100%;object-fit:cover;display:block}
.hwsheetpic.photo{width:180px;height:180px;border-radius:14px}
.hwcred{font-size:11px;color:var(--muted);text-align:center;margin:-4px 0 8px}.hwcred a{color:inherit}`;
document.head.appendChild(css);
})();
