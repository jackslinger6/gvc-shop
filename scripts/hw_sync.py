#!/usr/bin/env python3
"""Robin's hardware sheet -> gvc_hardware (GVC inventory sync scheduled task, Nov 2026).
Usage:
  python3 hw_sync.py parse <sheet2 text file> <out dir>   -> writes rows.json, prints bucket fingerprints {bucket: md5}
  python3 hw_sync.py chunks <out dir> <changed buckets json> [rows per chunk]  -> writes chunk_N.json (only rows in those buckets), prints the file list
Sheet text = the Microsoft 365 read_resource output for New_Shop_Master_Inventory.xlsx sheet 2 ("Complete Inventory").
Row array order (must match gvc_hardware_sync2): key,grp,section,sub,vendor,vendor_raw,part_no,description,size,spec,category,qty,unit,pack_qty,unit_cost,per_truck,sort,h
"""
import sys, json, hashlib, os

JUNK = {'d-ring', 'drill bit', 'electrical', 'ear plugs', 'tape', 'safety', 'sandin disk', 'truck parts', 'vendor'}
NORM = {"greggs": "Gregg's", "gregg's": "Gregg's", "lgm": "LGM Hardware", "lgm hardware": "LGM Hardware", "hitch house": "The Hitch House",
        "the hitch house": "The Hitch House", "canada fastener & supply (cfs)": "CFS (Canada Fastener & Supply)", "fastenal": "Fastenal",
        "resource": "Resource", "first choice": "First Choice", "surepoint": "Surepoint"}

def num(x):
    x = (x or '').strip().replace('$', '').replace(',', '').strip()
    if x in ('', '-'): return None
    try:
        v = float(x); return int(v) if v.is_integer() else v
    except ValueError:
        return None

def bucket(k): return int(hashlib.md5(k.encode()).hexdigest()[:2], 16) % 32

def parse(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    s = next(i for i, l in enumerate(lines) if l.startswith('## Sheet: Complete Inventory'))
    e = next((i for i in range(s, len(lines)) if lines[i].startswith('Formulas:') or (i > s and lines[i].startswith('## Sheet:'))), len(lines))
    out, group, seen = [], '', {}
    for l in lines[s + 2:e]:
        if l.startswith('['): continue
        c = [x.strip() for x in (l.split('\t') + [''] * 16)[:15]]
        if not any(c): continue
        if c[0] and not any(c[1:]): group = c[0]; continue
        if c[1] == 'Total' or c[0] == 'Total' or c[3] == 'Part Number': continue
        if not (c[2] or c[3] or c[4]): continue
        if c[0] and c[1] and not any(c[2:]): continue
        vraw = c[2]; v = NORM.get(vraw.lower(), vraw) if vraw else ''
        if vraw.lower().strip() in JUNK: v = ''
        desc = c[4] or (c[5] if c[5] and not c[3] else '')
        base = (v.lower() + '|' + (c[3] or desc or c[5]).lower())[:200]
        n = seen.get(base, 0); key = base if not n else f"{base}#{n + 1}"; seen[base] = n + 1
        row = [key, group, c[0], c[1], v, vraw if vraw and vraw != v else '', c[3], desc, c[5], c[6], c[7],
               num(c[8]), c[9], num(c[10]), num(c[11]), num(c[13]), len(out)]
        row.append(hashlib.md5(json.dumps(row, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest())
        out.append(row)
    return out

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'parse':
        rows = parse(sys.argv[2]); os.makedirs(sys.argv[3], exist_ok=True)
        json.dump(rows, open(os.path.join(sys.argv[3], 'rows.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
        fp = {}
        for b in range(32):
            hs = [r[17] for r in sorted((r for r in rows if bucket(r[0]) == b), key=lambda r: r[0].encode())]
            if hs: fp[str(b)] = hashlib.md5(''.join(hs).encode()).hexdigest()
        print(json.dumps({'rows': len(rows), 'fingerprints': fp}, separators=(',', ':')))
    elif cmd == 'chunks':
        d = sys.argv[2]; want = {int(b) for b in json.loads(sys.argv[3])}; per = int(sys.argv[4]) if len(sys.argv) > 4 else 120
        rows = [r for r in json.load(open(os.path.join(d, 'rows.json'))) if bucket(r[0]) in want]
        files = []
        for i in range(0, len(rows), per):
            f = os.path.join(d, f'chunk_{i // per}.json'); json.dump(rows[i:i + per], open(f, 'w'), ensure_ascii=False, separators=(',', ':')); files.append(f)
        print(json.dumps({'rows': len(rows), 'files': files}))
