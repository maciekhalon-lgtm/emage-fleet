/* Emage FLEET — Zwroty: kierowca skanuje kody zwrotów (aparat, zdjęcie, czytnik / ręcznie), każdy skan osobno
   z datą i godziną; zdaje zwroty na magazyn główny. Kierownik floty: lista wszystkich zwrotów, Excel,
   dołączenie zdanych zwrotów do listu przewozowego i wydruk specyfikacji zwrotów. Tabela return_scans (migracja 073). */
'use strict';
const zwOn = () => optOn('returns');
const zwMyOpen = () => (S.returns || []).filter(r => r.driverId===myDriverId() && r.status==='u_kierowcy').length;
const ZW_SRC = {kamera: 'aparat', zdjecie: 'zdjęcie', reka: 'ręcznie'};
let zwSel = new Set(), zwPending = null;   // zaznaczone w „Zwroty” / czekające na nowy list
let zwHandArm = 0, zwLast = null, zwF = {from: '', to: '', drv: '', st: ''}, zwPick = new Set(), zwPickOpen = false;
const zwTs = ts => { const d = new Date(ts); return {day: d.toLocaleDateString('sv-SE', {timeZone: 'Europe/Warsaw'}), time: d.toLocaleTimeString('pl-PL', {timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', second: '2-digit'})}; };
const zwWhen = ts => { const x = zwTs(ts); return `${fdate(x.day)} ${x.time}`; };
const zwDrvName = id => { const d = id && byId('drivers', id); return d ? d.name : '—'; };
const zwPlate = id => { const v = id && byId('vehicles', id); return v ? v.plate : ''; };
const zwSort = xs => xs.slice().sort((a, b) => String(b.scannedAt).localeCompare(String(a.scannedAt)));
const zwStatus = r => r.waybillId ? 'lista' : r.status==='zdany' ? 'zdany' : 'u_kierowcy';
function zwStatusPill(r){
  if (r.waybillId){ const w = byId('waybills', r.waybillId); return `<span class="pill ok">list ${w ? esc(wbNo(w)) : ''}</span>`; }
  if (r.status==='zdany') return `<span class="pill info" title="Zdany na magazyn ${r.handedAt ? esc(zwWhen(r.handedAt)) : ''}">na magazynie</span>`;
  return '<span class="pill warn">u kierowcy</span>';
}

/* ---------- dodawanie skanu ---------- */
let zwLastCode = '', zwLastAt = 0, zwAc = null;
function zwBeep(ok = true){
  try { zwAc = zwAc || new (window.AudioContext || window.webkitAudioContext)(); const o = zwAc.createOscillator(), g = zwAc.createGain();
    o.frequency.value = ok ? 1250 : 380; g.gain.value = .08; o.connect(g); g.connect(zwAc.destination); o.start(); o.stop(zwAc.currentTime + (ok ? .09 : .25)); } catch(_){}
  try { navigator.vibrate && navigator.vibrate(ok ? 60 : [80, 60, 80]); } catch(_){}
}
async function zwAdd(raw, src){
  const code = String(raw || '').trim().slice(0, 200); if (!code) return false;
  if (src==='kamera' && code===zwLastCode && Date.now() - zwLastAt < 2500) return false;   // ten sam kod wciąż w kadrze
  zwLastCode = code; zwLastAt = Date.now();
  const drv = myDriverId(); if (!drv){ toast('Twoje konto nie jest połączone z kierowcą – poproś kierownika floty.'); return false; }
  const act = typeof myActive==='function' ? myActive() : null;
  const dup = (S.returns || []).find(r => r.code===code);
  try {
    await db.collection('returns').doc().set({code, scannedAt: new Date().toISOString(), driverId: drv, vehicleId: act ? act.vehicleId : null, bookingId: act ? act.id : null, src, note: '', status: 'u_kierowcy', handedAt: null, waybillId: null});
    zwLast = {code, at: Date.now(), dup: !!dup}; zwBeep(!dup);
    zwCamMsg();
    if (!$('#zw-cam')) render();
    return true;
  } catch(e){ handleWriteErr(e); zwBeep(false); return false; }
}

/* ---------- aparat (pełny ekran, poza widokiem – odświeżanie listy nie przerywa skanowania) ---------- */
let zwReader = null, zwStream = null, zwTorch = false, zwLib = null;
function zwLoadLib(){
  if (window.ZXing) return Promise.resolve();
  if (zwLib) return zwLib;
  zwLib = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'; s.onload = ok; s.onerror = () => { zwLib = null; no(new Error('lib')); }; document.head.appendChild(s); });
  return zwLib;
}
function zwCamMsg(){
  const el = $('#zw-cam-last'); if (!el) return;
  const n = (S.returns || []).filter(r => r.status==='u_kierowcy' && r.driverId===myDriverId()).length;
  el.innerHTML = zwLast ? `<b>${esc(zwLast.code)}</b>${zwLast.dup ? '<span class="pill warn">ten kod już był skanowany</span>' : ''}<span>do zdania: ${n}</span>` : `<span>Nakieruj kod w ramkę</span>`;
  const box = $('#zw-cam'); if (box && zwLast && Date.now() - zwLast.at < 600){ box.classList.add('hit'); setTimeout(() => box.classList.remove('hit'), 400); }
}
function zwCamStop(){
  if (zwReader){ try { zwReader.reset(); } catch(_){} zwReader = null; }
  zwStream = null; zwTorch = false; const el = $('#zw-cam'); if (el) el.remove(); document.documentElement.classList.remove('zw-cam-open'); render();
}
async function zwCamStart(){
  if (!navigator.mediaDevices || !window.isSecureContext){ toast('Aparat niedostępny w tej przeglądarce – użyj „Zdjęcie kodu”.'); return; }
  const box = document.createElement('div'); box.id = 'zw-cam'; box.className = 'zw-cam';
  box.innerHTML = `<video playsinline muted autoplay></video><div class="zw-aim"></div>
    <div class="zw-cam-top"><button type="button" class="zw-cam-btn" data-zw-torch hidden>Latarka</button><button type="button" class="zw-cam-btn" data-zw-camstop>Zakończ</button></div>
    <div class="zw-cam-last" id="zw-cam-last"><span>Wczytywanie aparatu…</span></div>`;
  document.body.appendChild(box); document.documentElement.classList.add('zw-cam-open');
  try { await zwLoadLib(); } catch(_){ zwCamStop(); toast('Nie udało się wczytać skanera – sprawdź internet albo użyj „Zdjęcie kodu”.'); return; }
  const v = box.querySelector('video');
  try {
    zwReader = new ZXing.BrowserMultiFormatReader(null, 150);
    await zwReader.decodeFromConstraints({video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}}}, v, res => { if (res) zwAdd(res.getText(), 'kamera'); });
    zwStream = v.srcObject; zwLast = null; zwCamMsg();
    try { const tr = zwStream && zwStream.getVideoTracks()[0], cap = tr && tr.getCapabilities && tr.getCapabilities(); if (cap && cap.torch) box.querySelector('[data-zw-torch]').hidden = false; } catch(_){}
  } catch(err){ zwCamStop(); toast(err && err.name==='NotAllowedError' ? 'Brak zgody na aparat – zezwól na dostęp do aparatu w ustawieniach przeglądarki.' : 'Nie udało się włączyć aparatu.'); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden && zwReader) zwCamStop(); });
async function zwPhoto(file){
  toast('Odczytuję kod ze zdjęcia…');
  let codes = [];
  try {
    const bmp = await createImageBitmap(file), sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if ('BarcodeDetector' in window){ try { codes = (await new BarcodeDetector().detect(bmp)).map(x => x.rawValue); } catch(_){} }
    if (!codes.length){ await zwLoadLib();
      const url = await new Promise(r => c.toBlob(b => r(URL.createObjectURL(b)), 'image/jpeg', .92));
      try { const h = new Map(); h.set(ZXing.DecodeHintType.TRY_HARDER, true); const res = await new ZXing.BrowserMultiFormatReader(h).decodeFromImageUrl(url); codes = [res.getText()]; } catch(_){} finally { URL.revokeObjectURL(url); } }
  } catch(_){}
  if (!codes.length){ zwBeep(false); toast('Nie znaleziono kodu na zdjęciu. Zrób ostre zdjęcie z bliska, kod na środku.'); return; }
  for (const c of [...new Set(codes)]) await zwAdd(c, 'zdjecie');
  toast(codes.length > 1 ? `Dodano ${codes.length} kody ze zdjęcia` : 'Dodano kod ze zdjęcia');
}

/* ---------- kierowca: Skanuj zwroty ---------- */
function viewMyReturns(){
  const back = `<a class="ghost btn small" href="#moje">${ic('back')}Wróć</a>`;
  if (!zwOn()) return `<div class="section driver"><div class="bar"><h2>Zwroty</h2><div class="tools">${back}</div></div>${loadingOr('returns', `<div class="panel empty"><p>Skanowanie zwrotów nie jest jeszcze włączone.</p></div>`)}</div>`;
  const me_ = myDriverId(), mine = zwSort((S.returns || []).filter(r => r.driverId===me_)), open = mine.filter(r => r.status==='u_kierowcy');
  const codeCount = new Map(); (S.returns || []).forEach(r => codeCount.set(r.code, (codeCount.get(r.code) || 0) + 1));
  const armed = Date.now() - zwHandArm < 5000;
  const row = r => { const v = zwPlate(r.vehicleId);
    return `<li class="zw-item${zwLast && zwLast.code===r.code && Date.now() - zwLast.at < 3000 ? ' flash' : ''}"><div><b class="zw-code">${esc(r.code)}</b>${codeCount.get(r.code) > 1 ? ' <span class="pill warn" title="Ten sam kod zeskanowano więcej niż raz">powtórzony</span>' : ''}
      <span class="muted small">${esc(zwWhen(r.scannedAt))}${v ? ' · ' + esc(v) : ''}${r.src ? ' · ' + esc(ZW_SRC[r.src] || r.src) : ''}</span></div>
      <button type="button" class="ghost small zw-del" data-zw-del="${esc(r.id)}" aria-label="Usuń skan ${esc(r.code)}">${ic('x')}</button></li>`; };
  const handed = mine.filter(r => r.status!=='u_kierowcy'), byDay = new Map();
  handed.forEach(r => { const k = zwTs(r.handedAt || r.scannedAt).day; byDay.set(k, (byDay.get(k) || 0) + 1); });
  return `<div class="section driver zw">
    <div class="bar"><h2>Skanuj zwroty</h2><div class="tools">${back}</div></div>
    <section class="zw-scan">
      <button type="button" class="d-main zw-cambtn" data-zw-cam>${ic('scan')}Skanuj aparatem</button>
      <div class="zw-row"><label class="btn ghost zw-photo">${ic('camera')}Zdjęcie kodu<input type="file" accept="image/*" capture="environment" data-zw-photo hidden></label></div>
      <form class="zw-form" data-zw-form autocomplete="off"><label for="zw-code">Albo wpisz kod / zeskanuj czytnikiem i Enter</label>
        <div class="zw-row"><input id="zw-code" inputmode="text" enterkeyhint="done" placeholder="np. 5901234123457"><button class="primary" type="submit">Dodaj</button></div></form>
      ${zwLast && Date.now() - zwLast.at < 8000 ? `<p class="zw-lastmsg">Dodano: <b>${esc(zwLast.code)}</b>${zwLast.dup ? ' – <span class="neg">ten kod już był skanowany</span>' : ''}</p>` : ''}
    </section>
    <section class="panel d-card"><div class="sec-head"><h3>Do zdania na magazyn <span class="muted">(${open.length})</span></h3></div><div class="zw-body">
      ${open.length ? `<ul class="zw-list">${open.map(row).join('')}</ul>
        <button type="button" class="d-main ${armed ? 'warn' : ''}" data-zw-hand>${ic('check')}${armed ? `Na pewno? Zdaję ${open.length} ${isPlural(open.length, 'zwrot', 'zwroty', 'zwrotów')}` : `Zdaj zwroty na magazyn główny (${open.length})`}</button>
        <p class="muted small">Zdaj, gdy oddasz zwroty na magazynie głównym. Po zdaniu nie można ich już usunąć.</p>`
      : `<p class="muted">Nie masz zwrotów do zdania. Zeskanuj pierwszy kod powyżej.</p>`}</div></section>
    ${byDay.size ? `<details class="panel d-card zw-hist"><summary>Zdane wcześniej</summary><ul class="zw-body">${[...byDay].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30).map(([d, n]) => `<li><span>${fdate(d)}</span><b>${n}</b></li>`).join('')}</ul></details>` : ''}
  </div>`;
}

/* ---------- kierownik: Zwroty ---------- */
function zwFiltered(){
  const f = zwF;
  return zwSort((S.returns || []).filter(r => { const d = zwTs(r.scannedAt).day;
    return (!f.from || d >= f.from) && (!f.to || d <= f.to) && (!f.drv || r.driverId===f.drv) && (!f.st || zwStatus(r)===f.st); }));
}
function viewReturns(){
  if (!P().manage) return '';
  if (!zwOn()) return `<div class="bar"><h2>Zwroty</h2></div>${loadingOr('returns', `<div class="panel empty"><p>Moduł zwrotów wymaga uruchomienia migracji 073 w bazie.</p></div>`)}`;
  if (!zwF.from && !zwF.to){ zwF.from = today().slice(0, 8) + '01'; zwF.to = today(); }
  const rows = zwFiltered(), all = S.returns || [];
  const cnt = k => all.filter(r => zwStatus(r)===k).length;
  const drvs = [...new Set(all.map(r => r.driverId).filter(Boolean))].map(id => byId('drivers', id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const head = `<div class="bar"><h2>Zwroty</h2><div class="tools"><button class="ghost" data-zw-xlsx ${rows.length ? '' : 'disabled'}>${ic('download')}Excel</button></div></div>
    <div class="zw-sum"><div><b>${cnt('u_kierowcy')}</b><span>u kierowców</span></div><div><b>${cnt('zdany')}</b><span>na magazynie, bez listu</span></div><div><b>${cnt('lista')}</b><span>na listach przewozowych</span></div></div>
    <div class="wb-filters zw-filters">
      <label>Od <input type="date" data-zw-f="from" value="${esc(zwF.from)}"></label><label>Do <input type="date" data-zw-f="to" value="${esc(zwF.to)}"></label>
      <select data-zw-f="drv" aria-label="Kierowca"><option value="">Wszyscy kierowcy</option>${drvs.map(d => `<option value="${esc(d.id)}" ${zwF.drv===d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      <select data-zw-f="st" aria-label="Status"><option value="">Każdy status</option>${[['u_kierowcy', 'U kierowcy'], ['zdany', 'Na magazynie, bez listu'], ['lista', 'Na liście przewozowym']].map(([k, l]) => `<option value="${k}" ${zwF.st===k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  if (!rows.length) return head + `<div class="panel empty"><p>${all.length ? 'Brak zwrotów dla tych filtrów.' : 'Kierowcy nie zeskanowali jeszcze żadnych zwrotów. Skanują je w swoim panelu: „Skanuj zwroty”.'}</p></div>`;
  const shown = rows.slice(0, 1000), canSel = r => r.status==='zdany' && !r.waybillId;
  [...zwSel].forEach(id => { const r = byId('returns', id); if (!r || !canSel(r)) zwSel.delete(id); });
  const selable = shown.filter(canSel), allOn = selable.length && selable.every(r => zwSel.has(r.id));
  const wbs = (S.waybills || []).filter(w => w.status!=='anulowany').sort((a, b) => (b.year - a.year) || (b.no - a.no)).slice(0, 60);
  const bar = zwSel.size ? `<div class="zw-selbar"><b>Zaznaczono: ${zwSel.size}</b>
      <select data-zw-towb aria-label="List przewozowy"><option value="">Wybierz list przewozowy…</option>${wbs.map(w => `<option value="${esc(w.id)}">${esc(wbNo(w))} · ${fdate(w.date)} · ${esc(w.rName || '')}</option>`).join('')}</select>
      <button type="button" class="primary" data-zw-addwb>Dodaj do specyfikacji listu</button>
      <button type="button" class="ghost" data-zw-newwb>${ic('plus')}Nowy list z tymi zwrotami</button>
      <button type="button" class="ghost" data-zw-selclear>Odznacz</button></div>`
    : `<p class="muted small zw-selhint">Zaznacz ptaszkiem zwroty zdane na magazyn, żeby dodać je do specyfikacji listu przewozowego. Zwrotów, które są jeszcze u kierowcy, nie można dodać.</p>`;
  return head + bar + `<p class="muted small">${rows.length} ${isPlural(rows.length, 'zwrot', 'zwroty', 'zwrotów')}${rows.length > shown.length ? ` – pokazuję ${shown.length} najnowszych, w Excelu są wszystkie` : ''}</p>
    <div class="panel tablewrap"><table class="zw-tbl stack"><thead><tr><th class="zw-ck">${selable.length ? `<input type="checkbox" data-zw-selall ${allOn ? 'checked' : ''} aria-label="Zaznacz wszystkie zdane">` : ''}</th><th>Lp.</th><th>Kod zwrotu</th><th>Data skanu</th><th>Godzina</th><th>Kierowca</th><th>Auto</th><th>Status</th><th>Zdany na magazyn</th><th></th></tr></thead><tbody>
    ${shown.map((r, i) => { const t = zwTs(r.scannedAt);
      const ck = canSel(r) ? `<input type="checkbox" data-zw-sel="${esc(r.id)}" ${zwSel.has(r.id) ? 'checked' : ''} aria-label="Zaznacz ${esc(r.code)}">`
        : `<input type="checkbox" disabled title="${r.waybillId ? 'Już na liście przewozowym' : 'Niezdany na magazyn – nie może trafić na specyfikację'}" aria-label="Niedostępny">`;
      return `<tr class="${zwSel.has(r.id) ? 'zw-on' : ''}"><td class="zw-ck">${ck}</td><td class="num" data-l="Lp.">${rows.length - i}</td><td data-l="Kod"><b class="zw-code">${esc(r.code)}</b>${r.note ? `<span class="sub">${esc(r.note)}</span>` : ''}</td><td class="num" data-l="Data">${fdate(t.day)}</td><td class="num" data-l="Godzina">${t.time}</td>
        <td data-l="Kierowca">${esc(zwDrvName(r.driverId))}</td><td data-l="Auto">${esc(zwPlate(r.vehicleId))}</td><td data-l="Status">${zwStatusPill(r)}</td><td class="num" data-l="Zdany">${r.handedAt ? esc(zwWhen(r.handedAt)) : '—'}</td>
        <td class="r"><button type="button" class="ghost small" data-zw-mdel="${esc(r.id)}" title="Usuń zwrot" aria-label="Usuń zwrot ${esc(r.code)}">${ic('x')}</button></td></tr>`; }).join('')}</tbody></table></div>`;
}
function zwExcel(rows, name){
  const H = ['Lp.', 'Kod zwrotu', 'Data skanu', 'Godzina skanu', 'Kierowca', 'Nr rej.', 'Źródło', 'Status', 'Zdany na magazyn', 'List przewozowy', 'Notatka'];
  const data = zwSort(rows).reverse().map((r, i) => { const t = zwTs(r.scannedAt), w = r.waybillId && byId('waybills', r.waybillId);
    return [{v: i + 1, s: 9}, {v: String(r.code), s: 9}, {v: {date: t.day}, s: 6}, {v: t.time, s: 9}, {v: zwDrvName(r.driverId), s: 9}, {v: zwPlate(r.vehicleId), s: 9}, {v: ZW_SRC[r.src] || r.src || '', s: 9},
      {v: r.waybillId ? 'na liście' : r.status==='zdany' ? 'na magazynie' : 'u kierowcy', s: 9}, {v: r.handedAt ? zwWhen(r.handedAt) : '', s: 9}, {v: w ? wbNo(w) : '', s: 9}, {v: r.note || '', s: 9}]; });
  const blob = xlsxMini({sheets: [{name: 'Zwroty', cols: [6, 26, 12, 13, 24, 12, 10, 14, 20, 15, 30], rows: [H.map(v => ({v, s: 3})), ...data]}]}), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- list przewozowy: specyfikacja zwrotów ---------- */
// tylko zwroty zdane na magazyn i jeszcze bez listu (baza też tego pilnuje – migracja 074)
async function zwAttachIds(ids, wid){
  const ok = ids.filter(id => { const r = byId('returns', id); return r && r.status==='zdany' && !r.waybillId; });
  if (ok.length < ids.length) toast(`${ids.length - ok.length} pominięto – niezdane na magazyn albo już na liście`);
  try { for (const id of ok) await db.collection('returns').doc(id).update({waybillId: wid}); return ok.length; } catch(e){ handleWriteErr(e); return 0; }
}
async function zwAfterWbSave(wid){   // nowy list wystawiony z „Nowy list z tymi zwrotami”
  if (!zwPending || !zwPending.length) return; const ids = zwPending; zwPending = null;
  const n = await zwAttachIds(ids, wid); if (n) toast(`Do specyfikacji listu dołączono ${n} ${isPlural(n, 'zwrot', 'zwroty', 'zwrotów')}`);
}
const zwOfWaybill = id => zwSort((S.returns || []).filter(r => r.waybillId===id)).reverse();
function zwSpecHtml(w){
  const xs = zwOfWaybill(w.id); if (!xs.length) return '';
  return `<div class="wb-doc zw-spec">
    <h1 class="wb-title">SPECYFIKACJA ZWROTÓW <small>do listu przewozowego nr</small> <b>${esc(wbNo(w))}</b> <small>z dnia</small> <b>${fdate(w.date)}</b></h1>
    <div class="wb-kv"><span>Odbiorca:</span><div>${esc(w.rName || '')}</div></div>
    <table class="zw-spec-t"><thead><tr><th>Lp.</th><th>Kod zwrotu</th><th>Data i godzina skanu</th><th>Kierowca</th><th>Nr rej.</th><th>Zdany na magazyn</th></tr></thead><tbody>
      ${xs.map((r, i) => `<tr><td class="r">${i + 1}</td><td><b>${esc(r.code)}</b>${r.note ? `<br><small>${esc(r.note)}</small>` : ''}</td><td>${esc(zwWhen(r.scannedAt))}</td><td>${esc(zwDrvName(r.driverId))}</td><td>${esc(zwPlate(r.vehicleId))}</td><td>${r.handedAt ? esc(zwWhen(r.handedAt)) : ''}</td></tr>`).join('')}
    </tbody></table>
    <p class="wb-big">ŁĄCZNA LICZBA ZWROTÓW: <b>${xs.length}</b></p>
    <div class="wb-sign"><div><span>.................................</span>Podpis magazyniera wydającego</div><div><span>...................................</span>Podpis odbierającego</div></div>
  </div>`;
}
function zwWaybillPanel(w){
  if (!zwOn() || !P().manage) return '';
  const on = zwOfWaybill(w.id), free = zwSort((S.returns || []).filter(r => r.status==='zdany' && !r.waybillId));
  const pick = zwPickOpen && free.length ? `<div class="zw-pick"><p class="muted small">Zaznacz zwroty zdane na magazyn, które jadą z tym listem.</p>
      <label class="check"><input type="checkbox" data-zw-pickall ${free.every(r => zwPick.has(r.id)) ? 'checked' : ''}> Zaznacz wszystkie (${free.length})</label>
      <ul class="zw-pick-list">${free.map(r => `<li><label class="check"><input type="checkbox" data-zw-pick="${esc(r.id)}" ${zwPick.has(r.id) ? 'checked' : ''}><b class="zw-code">${esc(r.code)}</b><span class="muted small">${esc(zwWhen(r.scannedAt))} · ${esc(zwDrvName(r.driverId))}${zwPlate(r.vehicleId) ? ' · ' + esc(zwPlate(r.vehicleId)) : ''}</span></label></li>`).join('')}</ul>
      <div class="zw-row"><button type="button" class="primary" data-zw-attach="${esc(w.id)}" ${zwPick.size ? '' : 'disabled'}>Dołącz zaznaczone (${zwPick.size})</button><button type="button" class="ghost" data-zw-pickclose>Anuluj</button></div></div>` : '';
  return `<section class="panel zw-wb"><div class="sec-head"><h3>Specyfikacja zwrotów <span class="muted">(${on.length})</span></h3><div class="tools">
      ${on.length ? `<button type="button" class="ghost small" data-zw-specprint="${esc(w.id)}">${ic('print')}Drukuj specyfikację</button>` : ''}
      ${w.status!=='anulowany' && free.length && !zwPickOpen ? `<button type="button" class="ghost small" data-zw-pickopen>${ic('plus')}Dołącz zwroty z magazynu (${free.length})</button>` : ''}</div></div>
    ${pick}
    ${on.length ? `<ul class="zw-list">${on.map(r => `<li class="zw-item"><div><b class="zw-code">${esc(r.code)}</b><span class="muted small">${esc(zwWhen(r.scannedAt))} · ${esc(zwDrvName(r.driverId))}${zwPlate(r.vehicleId) ? ' · ' + esc(zwPlate(r.vehicleId)) : ''}</span></div>
        <button type="button" class="ghost small" data-zw-detach="${esc(r.id)}" title="Odłącz od listu" aria-label="Odłącz ${esc(r.code)} od listu">${ic('x')}</button></li>`).join('')}</ul>
      <p class="muted small">Specyfikacja drukuje się razem z listem („Drukuj / PDF”) jako druga strona albo osobno.</p>`
      : !pick ? `<p class="muted small">${free.length ? 'Do tego listu nie dołączono jeszcze zwrotów.' : 'Brak zwrotów zdanych na magazyn, które nie są jeszcze na żadnym liście.'}</p>` : ''}
  </section>`;
}
function zwSpecPrint(id){
  const w = byId('waybills', id); if (!w) return;
  let el = $('#print-area'); if (!el){ el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); }
  el.innerHTML = `<div class="pa wb-print">${zwSpecHtml(w)}</div>`;
  document.documentElement.classList.add('print-doc');
  setTimeout(() => { window.print(); document.documentElement.classList.remove('print-doc'); }, 60);
}

/* ---------- zdarzenia ---------- */
document.addEventListener('submit', e => {
  if (!e.target.matches || !e.target.matches('[data-zw-form]')) return;
  e.preventDefault(); const i = $('#zw-code'); const v = i ? i.value : ''; if (i) i.value = '';
  zwAdd(v, 'reka').then(() => { const n = $('#zw-code'); if (n) n.focus(); });
});
document.addEventListener('change', async e => {
  const t = e.target; if (!t.dataset) return;
  if (t.dataset.zwPhoto!=null){ const f = t.files && t.files[0]; t.value = ''; if (f) zwPhoto(f); return; }
  if (t.dataset.zwF){ zwF[t.dataset.zwF] = t.value; return render(); }
  if (t.dataset.zwSel){ if (t.checked) zwSel.add(t.dataset.zwSel); else zwSel.delete(t.dataset.zwSel); return render(); }
  if (t.dataset.zwSelall!=null){ const ok = zwFiltered().slice(0, 1000).filter(r => r.status==='zdany' && !r.waybillId); if (t.checked) ok.forEach(r => zwSel.add(r.id)); else ok.forEach(r => zwSel.delete(r.id)); return render(); }
  if (t.dataset.zwPick){ if (t.checked) zwPick.add(t.dataset.zwPick); else zwPick.delete(t.dataset.zwPick); return render(); }
  if (t.dataset.zwPickall!=null){ const free = (S.returns || []).filter(r => r.status==='zdany' && !r.waybillId); zwPick = new Set(t.checked ? free.map(r => r.id) : []); return render(); }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-zw-addwb],[data-zw-newwb],[data-zw-selclear],[data-zw-cam],[data-zw-camstop],[data-zw-torch],[data-zw-del],[data-zw-hand],[data-zw-xlsx],[data-zw-mdel],[data-zw-pickopen],[data-zw-pickclose],[data-zw-attach],[data-zw-detach],[data-zw-specprint]');
  if (!b) return;
  const d = b.dataset;
  if (d.zwCam!=null) return zwCamStart();
  if (d.zwCamstop!=null) return zwCamStop();
  if (d.zwTorch!=null){ try { const tr = zwStream.getVideoTracks()[0]; zwTorch = !zwTorch; await tr.applyConstraints({advanced: [{torch: zwTorch}]}); b.textContent = zwTorch ? 'Latarka: wł.' : 'Latarka'; } catch(_){ toast('Latarka niedostępna'); } return; }
  if (d.zwDel){ try { await db.collection('returns').doc(d.zwDel).delete(); toast('Usunięto skan'); render(); } catch(err){ handleWriteErr(err); } return; }
  if (d.zwHand!=null){
    if (Date.now() - zwHandArm > 5000){ zwHandArm = Date.now(); render(); setTimeout(() => { if (Date.now() - zwHandArm >= 5000) render(); }, 5100); return; }
    zwHandArm = 0; const open = (S.returns || []).filter(r => r.driverId===myDriverId() && r.status==='u_kierowcy'), at = new Date().toISOString();
    try { for (const r of open) await db.collection('returns').doc(r.id).update({status: 'zdany', handedAt: at}); toast(`Zdano ${open.length} ${isPlural(open.length, 'zwrot', 'zwroty', 'zwrotów')} na magazyn główny`); zwLast = null; render(); } catch(err){ handleWriteErr(err); render(); }
    return; }
  if (!P().manage) return;
  if (d.zwXlsx!=null) return zwExcel(zwFiltered(), `Zwroty_${zwF.from || 'od'}_${zwF.to || 'do'}.xlsx`);
  if (d.zwMdel){ if (b.dataset.armed!=='1'){ b.dataset.armed = '1'; b.classList.add('danger'); b.title = 'Kliknij ponownie, żeby usunąć'; setTimeout(() => { b.dataset.armed = ''; b.classList.remove('danger'); }, 4000); return; }
    try { await db.collection('returns').doc(d.zwMdel).delete(); toast('Usunięto zwrot'); render(); } catch(err){ handleWriteErr(err); } return; }
  if (d.zwSelclear!=null){ zwSel = new Set(); return render(); }
  if (d.zwAddwb!=null){ const wid = ($('[data-zw-towb]') || {}).value; if (!wid) return toast('Wybierz list przewozowy');
    const n = await zwAttachIds([...zwSel], wid); if (n){ zwSel = new Set(); const w = byId('waybills', wid); toast(`Dodano ${n} ${isPlural(n, 'zwrot', 'zwroty', 'zwrotów')} do specyfikacji listu ${w ? wbNo(w) : ''}`); render(); } return; }
  if (d.zwNewwb!=null){ zwPending = [...zwSel]; zwSel = new Set(); wbEdit = wbNewDraft(); wbView = null; wbSet = null; location.hash = '#listy'; render(); scrollTo(0, 0);
    toast(`Wystaw list – ${zwPending.length} ${isPlural(zwPending.length, 'zwrot dołączy', 'zwroty dołączą', 'zwrotów dołączy')} się do jego specyfikacji`); return; }
  if (d.zwPickopen!=null){ zwPickOpen = true; zwPick = new Set(); return render(); }
  if (d.zwPickclose!=null){ zwPickOpen = false; zwPick = new Set(); return render(); }
  if (d.zwAttach){ const ids = [...zwPick].filter(id => { const r = byId('returns', id); return r && r.status==='zdany'; });
    try { for (const id of ids) await db.collection('returns').doc(id).update({waybillId: d.zwAttach}); toast(`Dołączono ${ids.length} ${isPlural(ids.length, 'zwrot', 'zwroty', 'zwrotów')} do listu`); zwPickOpen = false; zwPick = new Set(); render(); } catch(err){ handleWriteErr(err); } return; }
  if (d.zwDetach){ try { await db.collection('returns').doc(d.zwDetach).update({waybillId: null}); toast('Zwrot odłączony – wraca do „na magazynie”'); render(); } catch(err){ handleWriteErr(err); } return; }
  if (d.zwSpecprint) return zwSpecPrint(d.zwSpecprint);
});
