// Reads supplier PDFs from their text - no Claude, no API credit (Kyle, 2026-11-05).
// Knows: Russel Metals quotes + order acks, Grandview Fabrication (Fabrik) quotes, Starfab quotes.
// Returns the same shape the Claude reader gives ({vendor, doc_type, doc_no, doc_date, job_ref, lines[]}), or null
// when the layout isn't one it knows (then the caller can fall back to Claude).
// @ts-nocheck
const FR = { ".063": "1/16", ".125": "1/8", ".188": "3/16", ".250": "1/4", ".313": "5/16", ".375": "3/8", ".500": "1/2", ".625": "5/8", ".750": "3/4", "1.000": "1" };
const frac = (d) => FR[d] || FR["." + String(d).split(".")[1]] || d;
const num = (s) => Number(String(s || "").replace(/[$,]/g, ""));
const toDec = (s) => { s = String(s).trim(); let m = s.match(/^(\d+) (\d+)\/(\d+)$/); if (m) return +m[1] + m[2] / m[3]; m = s.match(/^(\d+)\/(\d+)$/); if (m) return m[1] / m[2]; return Number(s); };
const metalOf = (d) => /ALUM|6061|5052|3003/i.test(d) ? "alum" : /STLS|\bSS\b|TP30[46]|31[06]/i.test(d) ? "ss" : "steel";
const PART = /^(?=.*[A-Z])[A-Z0-9][A-Z0-9_\-]*(?:\.[A-Z0-9_\-]+)+$/i;   // our part numbers look like FE.1, 1086_7.HYDTANK.3, RA.KENWORTH.1

// "2 X 2 X .250 HSS 50W C" -> kind/size/material
function russelDesc(d) {
  d = d.replace(/^IN /, "").trim(); let m;
  const grade = (d.match(/\b(44W|50W C|50W|A500C|A500|A53|A36|6061-T6|5052 H32|TP304 #\d|TP304|TP316|A1011 CS TP B|A1011)\b/) || [])[1] || null;
  if ((m = d.match(/^(\.\d{3})(?: \(([\d/]+)\))? .*?\b(PLT|SHT|PL|SHEET|PLATE)\b/))) {
    const t = Number(m[1]); const plate = /PLT|PL\b|PLATE/.test(m[3]);
    return { kind: plate ? "plate" : "sheet", thickness_in: t, metal: metalOf(d), material: grade, size: (plate ? "PL " : "SHT ") + (m[2] || frac(m[1])) };
  }
  if ((m = d.match(/^([\d .\/]+?) X ([\d .\/]+?) X ([\d .\/]+?) (HSS|HSR|SQ TUBE|TUBE)\b/))) return { kind: "tube", metal: metalOf(d), material: grade, size: `HSS ${m[1]}x${m[2]}x${frac(m[3])}` };
  if ((m = d.match(/^([\d .\/]+?) X ([\d .\/]+?) X ([\d .\/]+?) STR ANG/))) return { kind: "angle", metal: metalOf(d), material: grade, size: `L ${m[1]}x${m[2]}x${frac(m[3])}` };
  if ((m = d.match(/^([\d .\/]+?) X ([\d.]+) STR CHAN/))) return { kind: "channel", metal: metalOf(d), material: grade, size: `C ${m[1]}x${m[2]}` };
  if ((m = d.match(/^([\d .\/]+?) X ([\d .\/]+?) (HR |CF )?FLAT/))) { const a = toDec(m[1]), b = toDec(m[2]); const [t, w] = a <= b ? [m[1], m[2]] : [m[2], m[1]]; return { kind: "flat bar", metal: metalOf(d), material: grade, size: `FB ${w}x${frac(t)}` }; }
  if ((m = d.match(/^([\d .\/]+?)"? (HR |CF )?(ROUND|RD)\b/))) return { kind: "round", metal: metalOf(d), material: grade, size: `RD ${m[1]}` };
  if ((m = d.match(/^([\d .\/]+?) SQ X ([\d.]+) RD CRN/))) return { kind: "tube", metal: metalOf(d), material: grade, size: `SQ ${m[1]}x${frac(m[2])} (round corner)` };
  if ((m = d.match(/^([\d .\/]+?) SCH ?(\d+)/))) return { kind: "pipe", metal: metalOf(d), material: grade, size: `PIPE ${m[1]} SCH${m[2]}` };
  if ((m = d.match(/^W ?(\d+) ?X ?([\d.]+)/))) return { kind: "beam", metal: metalOf(d), material: grade, size: `W ${m[1]}x${m[2]}` };
  return { kind: "other", metal: metalOf(d), material: grade, size: null };
}
const lenFt = (s) => { const m = String(s || "").match(/^(\d+(?:\.\d+)?)'/); return m ? Number(m[1]) : null; };

function russel(text) {
  const doc_no = (text.match(/\n(6\d{7})\b/) || [])[1] || null;
  const dm = text.match(/(\d\d)\/(\d\d)\/(\d\d) \d\d\/\d\d\/\d\d/);
  const doc_date = dm ? `20${dm[3]}-${dm[1]}-${dm[2]}` : null;
  const job_ref = ((text.match(/PO#: ?([^\n]*?)(?:\s{2,}|\n|$)/) || [])[1] || "").trim() || null;
  const isAck = /CUSTOMER ACCT:|SUBTOTAL:/.test(text) && !/SALES REPRESENTATIVE/.test(text);
  // drop page headers
  const body = text.replace(/RUSSEL METALS INC\.[\s\S]*?(SALES PERSON: [^\n]*|SALES REPRESENTATIVE)\n(-{10,}\n)?/g, "\n").replace(/--- page \d+ ---\n?/g, "").replace(/\n-{10,}\n/g, "\n");
  const L = body.split("\n").map((s) => s.trim()).filter(Boolean);
  const lines = [];
  let cur = null;
  const STOP = /^(TOTAL|SUBTOTAL|GST|PST|GRAND TOTAL|[\d,]+\.\d\dSUBTOTAL|\d+ LBSTOTAL)/;
  for (let i = 0; i < L.length; i++) {
    let s = L[i], m;
    // money on its own line (wrapped line total)
    if (cur && cur._wantTotal && /^[\d,]+\.\d\d$/.test(s)) { cur.line_total = num(s); cur._wantTotal = false; continue; }
    if (isAck && (m = s.match(/^(\d+(?:\.\d+)?)(EA|FT|LB|PC) (.+?) (\d+\.\d{4}) ([\d,]+\.\d{2})(\d{5})$/))) {
      cur = { item: m[3].replace(/^IN /, ""), q1: [Number(m[1]), m[2]], unit_price: Number(m[4]), line_total: num(m[5]), code: m[6], notes: [] }; lines.push(cur); continue;
    }
    if (!isAck && (m = s.match(/^(\d{5}) (\d+(?:\.\d+)?) (.+?) (\d+\.\d{4})(?: ([\d,]+\.\d{2}))?$/))) {
      cur = { item: m[3], q1: [Number(m[2]), null], unit_price: Number(m[4]), line_total: m[5] ? num(m[5]) : null, _wantTotal: !m[5], code: m[1], notes: [], _q: true }; lines.push(cur); continue;
    }
    if (!cur) continue;
    if (STOP.test(s)) { cur = null; continue; }
    // dimension line
    if ((m = s.match(/^(?:(\d+(?:\.\d+)?)(EA|LB|FT) )?(EA|FT|LB)?\s*(?:(EA|LOT|FT))?WIDTH ?(\S*) LENGTH (\S+)(?: (EA|LOT|FT|LB))?$/))) {
      if (m[1]) cur.q2 = [Number(m[1]), m[2]]; else if (m[3] && cur._q) cur.q1[1] = m[3];
      cur.width = m[5] || null; cur.length = m[6]; cur.unit = (m[7] || m[4] || "").toLowerCase() || null; cur._dim = true; continue;
    }
    if (cur._q && !cur._wt && (m = s.match(/^(\d+)(?: (.+))?$/))) { cur._wt = Number(m[1]); if (m[2]) cur.name = m[2].trim(); continue; }
    if (cur._q && s === "LB") continue;
    if (cur._dim && !cur.part && !cur.name && PART.test(s.replace(/\s+/g, ""))) { cur.part = s.replace(/\s+/g, ""); continue; }
    if (cur._dim && !cur.part && !cur.name && /^\d{4}[_\w.-]*\s+\S/.test(s) && !/LASER|CUT|STOCK|LEAD|CALL|INCOMING|CROP/i.test(s)) { cur.name = s; continue; }
    cur.notes.push(s);
  }
  const out = lines.filter((l) => l.unit_price != null).map((l) => {
    const D = russelDesc(l.item);
    const qs = [l.q1, l.q2].filter(Boolean);
    const ea = qs.find((q) => q[1] === "EA" || q[1] === "PC" || q[1] == null);
    const ft = qs.find((q) => q[1] === "FT");
    let qty = ea ? ea[0] : (l.unit_price ? Math.round(l.line_total / l.unit_price * 100) / 100 : null);
    let unit = "ea";
    if (l.q1 && l.q1[1] === "FT") { unit = "ft"; qty = l.q1[0]; }
    else if (l.unit === "lot" || (l.unit_price && Math.abs(l.unit_price - l.line_total) < 0.02 && qty > 1)) unit = "lot";
    const length_ft = lenFt(l.length);
    let per_ft = null;
    if (unit === "ft") per_ft = l.unit_price;
    else if (length_ft && ["tube", "angle", "channel", "flat bar", "round", "pipe", "beam"].includes(D.kind) && qty) per_ft = Math.round(l.line_total / (qty * length_ft) * 10000) / 10000;
    const partNo = l.part || (l.name && PART.test(l.name.replace(/\s+/g, "")) ? l.name.replace(/\s+/g, "") : null);
    const cutTo = l.width && /^[\d.]+$/.test(l.width) && /^[\d.]+$/.test(l.length) ? `${l.width} x ${l.length}` : null;
    const notes = [cutTo ? `cut ${cutTo}` : null, l.name && !partNo ? l.name : null, ...l.notes.filter((n) => !/^LB$/.test(n))].filter(Boolean).join(" · ").slice(0, 300) || null;
    return { item: (l.item + (l.name ? " - " + l.name : partNo ? " - " + partNo : "")).slice(0, 300), part_no: partNo, parts: partNo ? [partNo] : [], ...D,
      length_ft, qty, unit, unit_price: l.unit_price, line_total: l.line_total, per_ft, note: notes, thickness_in: D.thickness_in ?? null };
  });
  return { vendor: "Russel Metals", doc_type: isAck ? "order ack" : "quote", doc_no, doc_date, job_ref, lines: out };
}

const MONTHS = "january february march april may june july august september october november december".split(" ");
function grandview(text) {
  const doc_no = (text.match(/\b(FAB-\d+)\b/) || [])[1] || null;
  const dm = text.match(/QUOTED EXPIRATION\n(\w+) (\d+), (\d{4})/);
  const doc_date = dm ? `${dm[3]}-${String(MONTHS.indexOf(dm[1].toLowerCase()) + 1).padStart(2, "0")}-${dm[2].padStart(2, "0")}` : null;
  const title = (text.match(/GordeyVille Customs\n([^\n]+)\n/) || [])[1] || "";
  const t = text.replace(/--- page \d+ ---\n?/g, "");
  const lines = []; const re = /\n(\d+)\n([^\n]+)\n([^\n]*?)\s+(\d+(?:\.\d+)?) \$([\d,]+\.\d+) \$([\d,]+\.\d+)(?=\n)/g; let m;
  while ((m = re.exec(t))) {
    const part = m[2].trim(), spec = m[3];
    const thk = (spec.match(/· ([\d.]+)" ·/) || [])[1]; const size = spec.match(/Size: ([\d.]+)" × ([\d.]+)"/);
    const grade = (spec.match(/^([^·]+?) ·/) || [])[1] || null; const ga = (spec.match(/· (?:Mild Steel|Stainless|Aluminum|Aluminium)? ?([^·]+?) ·/) || [])[1] || "";
    const qty = Number(m[4]);
    lines.push({ item: `${part} - ${spec}`.slice(0, 300), part_no: PART.test(part) ? part : null, parts: PART.test(part) ? [part] : [], kind: thk ? "laser part" : "other",
      metal: metalOf(spec + (/Stainless/i.test(spec) ? " SS" : /Alumin/i.test(spec) ? " ALUM" : "")), material: grade ? grade.trim() : null,
      size: thk ? `PL ${ga.trim() || thk}` : null, thickness_in: thk ? Number(thk) : null, length_ft: null, qty, unit: "ea",
      unit_price: num(m[5]), line_total: num(m[6]), per_ft: null, note: size ? `flat ${size[1]} x ${size[2]}` : null });
  }
  return { vendor: "Grandview Fabrication", doc_type: "quote", doc_no, doc_date, job_ref: (title.match(/\b(\d{4}[_\w]*)/) || [])[1] || null, title, lines };
}

function starfab(text) {
  const doc_no = (text.match(/Quote number: (\S+)/) || [])[1] || null;
  const dm = text.match(/(\d\d)-(\d\d)-(\d{4})/); const doc_date = dm ? `${dm[3]}-${dm[1]}-${dm[2]}` : null;
  const lines = []; const re = /\n([^\n]+?) - ([^\n]*)\n[^\n]*\.dxf\n(\d+) \$([\d.,]+) \$([\d.,]+) (\w+) ([\d.]+) in\./g; let m;
  while ((m = re.exec(text))) {
    const part = m[1].trim(); const thk = Number(m[7]);
    lines.push({ item: `${part} - ${m[2]}`, part_no: part, parts: [part], kind: "laser part", metal: /^AL/i.test(m[6]) ? "alum" : /^SS/i.test(m[6]) ? "ss" : "steel", material: m[6],
      size: m[2].replace(/\s*(MS|AL|SS)\s*$/i, "").trim(), thickness_in: thk, length_ft: null, qty: Number(m[3]), unit: "ea", unit_price: num(m[4]), line_total: num(m[5]), per_ft: null, note: null });
  }
  return { vendor: "Starfab", doc_type: "quote", doc_no, doc_date, job_ref: null, lines };
}

// the document's own pre-tax total, to check the lines add up
export function docSubtotal(text) {
  const m = text.match(/TOTALS ([\d,]+\.\d\d)/) || text.match(/([\d,]+\.\d\d)SUBTOTAL:/) || text.match(/Subtotal \$([\d,]+\.\d\d)/) || text.match(/Total: \$([\d,]+\.\d\d)/);
  return m ? num(m[1]) : null;
}
export function parseDoc(name, text) {
  if (!text || text.length < 40) return null;
  if (/^TERMS AND CONDITIONS/.test(text)) return { skip: "terms" };
  if (/RUSSEL METALS/.test(text)) return russel(text);
  if (/gvfab\.ca|Grandview Fabrication/i.test(text) && /PRODUCT QTY UNIT PRICE TOTAL/.test(text)) return grandview(text);
  if (/Quote number: Quote\d+/.test(text) && /\.dxf/.test(text)) return starfab(text);
  return null;
}
