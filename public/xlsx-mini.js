/* ============================================================================
   Emage FLEET — mały zapis plików Excel (.xlsx) ze stylami, bez zewnętrznych bibliotek.
   xlsxMini({sheets:[{name, cols:[szer], rows:[[{v, s}|v]], merges:['A1:F1'], heights:{1:35}}], styles}) → Blob
   Komórka: {v: tekst | liczba | {date:'YYYY-MM-DD'} | {time:minuty}, s: numer stylu z XM_STYLES}.
   ============================================================================ */
const XM_STYLES = (() => {
  // czcionki: 0 Calibri 11, 1 Calibri 20 pogrub., 2 Calibri 11 pogrub., 3 Arial 11, 4 Arial 11 pogrub.
  const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>', '<font><b/><sz val="20"/><name val="Calibri"/></font>', '<font><b/><sz val="11"/><name val="Calibri"/></font>',
    '<font><sz val="11"/><name val="Arial"/></font>', '<font><b/><sz val="11"/><name val="Arial"/></font>'];
  // wypełnienia: 0,1 wymagane, 2 szary nagłówek (jak we wzorze), 3 jasnożółty (pola danych)
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFD0CECE"/><bgColor indexed="64"/></patternFill></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>'];
  const bd = (l, r, t, b) => `<border><left${l ? ` style="${l}"><color auto="1"/></left` : '/'}><right${r ? ` style="${r}"><color auto="1"/></right` : '/'}><top${t ? ` style="${t}"><color auto="1"/></top` : '/'}><bottom${b ? ` style="${b}"><color auto="1"/></bottom` : '/'}><diagonal/></border>`;
  // ramki: 0 brak, 1 cienka, 2 gruba lewa + cienkie, 3 włosowa, 4 gruba lewa + włosowe, 5 gruba (tytuł)
  const borders = [bd(), bd('thin', 'thin', 'thin', 'thin'), bd('medium', 'thin', 'thin', 'thin'), bd('hair', 'hair', 'hair', 'hair'), bd('medium', 'hair', 'hair', 'hair'), bd('medium', 'medium', 'medium', 'medium')];
  const al = (h, v, w) => `<alignment horizontal="${h}" vertical="${v}"${w ? ' wrapText="1"' : ''}/>`;
  // style komórek (cellXfs): [numFmt, font, fill, border, alignment]
  const xf = [[0, 0, 0, 0, ''], [0, 1, 2, 5, al('left', 'center')], [0, 2, 2, 2, al('left', 'center', 1)], [0, 2, 2, 1, al('left', 'center', 1)], [0, 2, 3, 1, al('left', 'center', 1)],
    [0, 3, 3, 4, al('left', 'center')], [164, 3, 3, 3, al('left', 'center')], [20, 3, 3, 3, al('left', 'center')], [165, 3, 3, 3, al('left', 'center')], [0, 3, 3, 3, al('left', 'center')],
    [0, 2, 0, 0, al('left', 'center')], [0, 0, 0, 0, al('left', 'center', 1)], [2, 4, 0, 0, al('right', 'center')], [0, 0, 0, 0, al('left', 'center')]];
  // 0 zwykła, 1 tytuł, 2 nagłówek (gruba lewa), 3 nagłówek, 4 wartość nagłówka (żółta, pogrub.), 5 dane – kolumna A, 6 data, 7 godzina, 8 godzina do (24:00), 9 dane tekst,
  // 10 pogrubiony opis, 11 tekst zawijany, 12 liczba 0,00 pogrubiona, 13 tekst
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/><numFmt numFmtId="165" formatCode="[h]:mm"/></numFmts>
<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xf.length}">${xf.map(([n, f, fi, b, a]) => `<xf numFmtId="${n}" fontId="${f}" fillId="${fi}" borderId="${b}" xfId="0"${n ? ' applyNumberFormat="1"' : ''} applyFont="1" applyFill="1" applyBorder="1"${a ? ` applyAlignment="1">${a}</xf>` : '/>'}`).join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
})();
const xmEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xmCol = n => { let s = ''; n++; while (n){ const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const xmSerial = iso => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
function xmSheet(sh){
  const rows = sh.rows.map((r, i) => `<row r="${i + 1}"${sh.heights && sh.heights[i + 1] ? ` ht="${sh.heights[i + 1]}" customHeight="1"` : ''}>${r.map((c, j) => {
    if (c==null) return ''; const o = typeof c==='object' && !Array.isArray(c) && ('v' in c || 's' in c) ? c : {v: c}, ref = xmCol(j) + (i + 1), s = o.s ? ` s="${o.s}"` : '', v = o.v;
    if (v==null || v==='') return `<c r="${ref}"${s}/>`;
    if (typeof v==='number') return `<c r="${ref}"${s}><v>${v}</v></c>`;
    if (v.date) return `<c r="${ref}"${s}><v>${xmSerial(v.date)}</v></c>`;
    if (v.time!=null) return `<c r="${ref}"${s}><v>${v.time / 1440}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmEsc(v)}</t></is></c>`; }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${sh.cols ? `<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''}<sheetData>${rows}</sheetData>
${sh.merges && sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}
/* zip bez kompresji (STORE) */
const xmCrcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const xmCrc = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = xmCrcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function xmZip(files){
  const enc = new TextEncoder(), parts = [], cent = []; let off = 0;
  const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const [name, text] of files){
    const nb = enc.encode(name), data = enc.encode(text), crc = xmCrc(data);
    const head = [0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0)];
    parts.push(new Uint8Array(head), nb, data);
    cent.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb);
    off += head.length + nb.length + data.length;
  }
  const csize = cent.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(csize), ...u32(off), ...u16(0)]);
  return new Blob([...parts, ...cent, end], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function xlsxMini(book){
  const sh = book.sheets;
  return xmZip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sh.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sh.map((s, i) => `<sheet name="${xmEsc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sh.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sh.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', XM_STYLES],
    ...sh.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, xmSheet(s)])
  ]);
}
