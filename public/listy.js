/* ============================================================================
   Emage FLEET — Listy przewozowe (migracja 069)
   Wystawia tylko kierownik floty. Numer kolejny w roku nadaje baza (w 2026 od 370).
   Odbiorca zapisany w liście (kopia z chwili wystawienia) + książka odbiorców do szybkiego wyboru.
   Wydruk A4 w układzie firmowego wzoru: nadawca, numer i data, odbiorca, magazyn odbiorczy,
   tabela pozycji (inna / karton / paleta, razem), łączna liczba palet i waga, auto, podpisy.
   ============================================================================ */
const wbOn = () => !!P().manage && optOn('waybills');
const WB_HEAD_DEF = 'Emage Group Sp. z o.o.\n53-534 Wrocław, ul. Tadeusza Zielińskiego 43/6\nTel. 882166933\nKRS: 0000579426    REGON: 362706691    NIP: 8943067387\nNr rej. BDO: 000584657    www.emage.com.pl';
const wbCfg = () => { const s = S.settings.find(x => x.id==='waybill') || {}; return {head: s.header || WB_HEAD_DEF, senders: Array.isArray(s.senders) ? s.senders : [], startYear: s.startYear || 2026, startNo: s.startNo || 370}; };
const wbSenderName = t => String(t || '').trim().split('\n')[0];
async function wbCfgSave(patch){ const cur = S.settings.find(x => x.id==='waybill') || {}; const {id, updatedAt, updatedBy, createdBy, ...rest} = cur;
  await db.collection('settings').doc('waybill').set({startYear: 2026, startNo: 370, ...rest, ...patch}); }
const wbNo = w => w.no ? `${w.no}/${w.year}` : '—';
const wbInt = v => Math.max(0, Math.round(Number(v) || 0));
const wbRowSum = it => wbInt(it.inna) + wbInt(it.karton) + wbInt(it.paleta);
const wbTot = items => items.reduce((t, it) => ({inna: t.inna + wbInt(it.inna), karton: t.karton + wbInt(it.karton), paleta: t.paleta + wbInt(it.paleta), all: t.all + wbRowSum(it)}), {inna: 0, karton: 0, paleta: 0, all: 0});
const wbFmtKg = n => n==null || n==='' ? '' : new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 1}).format(Number(n)) + ' kg';

let wbSearchT = null, wbEdit = null, wbView = null, wbQ = '', wbYear = '', wbCancelArm = null, wbRecEdit = null, wbCfgOpen = false;

/* ---------- dokument (podgląd i wydruk – ten sam HTML) ---------- */
function wbDocHtml(w, printedBy){
  const items = (w.items || []).filter(it => it.name || it.place || wbRowSum(it)), t = wbTot(items);
  const lines = s => esc(s || '').split('\n').map(x => x.trim()).filter(Boolean);
  const cell = n => n ? String(n) : '';
  const now = new Date(), p2 = n => String(n).padStart(2, '0');
  const stamp = `${p2(now.getDate())}.${p2(now.getMonth() + 1)}.${String(now.getFullYear()).slice(2)} ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
  const v = w.vehicleId ? byId('vehicles', w.vehicleId) : null, plate = w.plate || (v && v.plate) || '';
  const dots = '.......................';
  const vert = s => s.split('').map(ch => `<span>${ch}</span>`).join('');
  return `<div class="wb-doc${w.status==='anulowany' ? ' wb-void' : ''}">
    ${w.status==='anulowany' ? '<div class="wb-voidmark">ANULOWANY</div>' : ''}
    <div class="wb-kv wb-from"><span>Nadawca:</span><div>${esc(String(w.sender || wbCfg().head).trim())}</div></div>
    ${String(w.senderWh || '').trim() ? `<div class="wb-kv wb-from"><span>Magazyn<br>nadawczy:</span><div>${esc(String(w.senderWh).trim())}</div></div>` : ''}
    <h1 class="wb-title">LIST PRZEWOZOWY <small>nr</small> <b>${esc(wbNo(w))}</b> <small>z dnia</small> <b>${fdate(w.date)}</b></h1>
    <div class="wb-kv"><span>Odbiorca:</span><div>${[esc(w.rName || '')].concat(lines(w.rAddress)).join('<br>')}${w.rRegon || w.rNip ? `<br><span class="wb-ids">${w.rRegon ? `REGON: ${esc(w.rRegon)}` : ''}${w.rNip ? `<span>NIP: ${esc(w.rNip)}</span>` : ''}</span>` : ''}</div></div>
    ${w.whName || w.whAddress ? `<div class="wb-kv"><span>Magazyn<br>odbiorczy:</span><div>${[esc(w.whName || '')].concat(lines(w.whAddress)).filter(Boolean).join('<br>')}</div></div>` : ''}
    <div class="wb-kv wb-printed"><span>Data wydruku:</span><div>${stamp}${printedBy ? ` (${esc(String(printedBy).toUpperCase())})` : ''}</div></div>
    <table class="wb-t">
      <thead>
        <tr><th rowspan="2" class="wb-c1">ODBIORCA<br>MIEJSCE DOSTAWY<br>TOWARU</th><th rowspan="2" class="wb-c2">NAZWA/RODZAJ</th><th colspan="3" class="wb-pack">OPAKOWANIE</th><th rowspan="2" class="wb-v wb-sumcol"><b>${vert('RAZEM')}</b></th><th rowspan="2" class="wb-c4">POTW.<br>ODBIORU<br>TOWARU</th></tr>
        <tr><th class="wb-v">${vert('INNA')}</th><th class="wb-v">${vert('KARTON')}</th><th class="wb-v">${vert('PALETA')}</th></tr>
        <tr class="wb-nums"><td>1</td><td>2</td><td>IN</td><td>KA</td><td>PA</td><td><b>3</b></td><td>4</td></tr>
      </thead>
      <tbody>
        ${items.map(it => { const pl = lines(it.place); return `<tr><td class="wb-place">${pl.length ? `<b>${pl[0]}</b>${pl.slice(1).map(x => '<br>' + x).join('')}` : ''}</td><td class="wb-name">${esc(it.name || '')}</td>
          <td class="r">${cell(wbInt(it.inna))}</td><td class="r">${cell(wbInt(it.karton))}</td><td class="r">${cell(wbInt(it.paleta))}</td><td class="r"><b>${cell(wbRowSum(it))}</b></td><td></td></tr>`; }).join('')}
        <tr class="wb-total"><td><b>SUMA</b></td><td></td><td class="r">${cell(t.inna)}</td><td class="r">${cell(t.karton)}</td><td class="r">${cell(t.paleta)}</td><td class="r"><b>${cell(t.all)}</b></td><td></td></tr>
      </tbody>
    </table>
    <p class="wb-big">ŁĄCZNA LICZBA PALET: <b>${t.paleta}</b></p>
    <p class="wb-big">ŁĄCZNA WAGA TOWARU: <b>${w.weightKg!=null && w.weightKg!=='' ? esc(wbFmtKg(w.weightKg).replace(' kg', 'kg')) : '..........'}</b></p>
    <div class="wb-veh"><div>Nr rej. pojazdu: ${plate ? `<b>${esc(plate)}</b>` : dots}</div><div>Data wyjazdu: ${w.departDate ? `<b>${fdate(w.departDate)}</b>` : dots}</div></div>
    ${w.note ? `<p class="wb-note">Uwagi: ${esc(w.note)}</p>` : ''}
    <div class="wb-sign"><div><span>.................................</span>Podpis magazyniera wydającego towar</div><div><span>...................................</span>Podpis odbierającego towar</div></div>
  </div>`;
}
async function wbPrint(id){
  const w = byId('waybills', id); if (!w) return;
  const who = me && (me.full_name || me.email) || '';
  let el = $('#print-area'); if (!el){ el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); }
  el.innerHTML = `<div class="pa wb-print">${wbDocHtml(w, who)}</div>`;
  document.documentElement.classList.add('print-doc');
  setTimeout(() => { window.print(); document.documentElement.classList.remove('print-doc'); }, 60);
  try { await db.collection('waybills').doc(id).update({printedAt: new Date().toISOString(), printedBy: who}); } catch(_){}   // kto i kiedy drukował – tylko informacja
}

/* ---------- widok ---------- */
function viewWaybills(){
  if (!P().manage) return '';
  if (!optOn('waybills')) return `<div class="bar"><h2>Listy przewozowe</h2></div>${loadingOr('waybills', `<div class="panel empty"><p>Moduł listów przewozowych wymaga uruchomienia migracji 069 w bazie.</p></div>`)}`;
  if (wbEdit) return wbEditor();
  if (wbView && byId('waybills', wbView)) return wbPreview(byId('waybills', wbView));
  const years = [...new Set(S.waybills.map(w => String(w.year || String(w.date).slice(0, 4))))].sort().reverse();
  const q = wbQ.trim().toLowerCase();
  const list = S.waybills.filter(w => (!wbYear || String(w.year)===wbYear) && (!q || [wbNo(w), w.rName, w.whName, w.plate, (w.items || []).map(it => it.name).join(' ')].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (b.year - a.year) || (b.no - a.no));
  const head = `<div class="bar"><h2>Listy przewozowe</h2><div class="tools">
      <input id="wb-q" type="search" placeholder="Szukaj: numer, odbiorca, towar…" value="${esc(wbQ)}" aria-label="Szukaj listów" style="width:min(260px,100%)">
      ${years.length > 1 ? `<select id="wb-year" style="width:auto" aria-label="Rok"><option value="">Wszystkie lata</option>${years.map(y => `<option ${y===wbYear ? 'selected' : ''}>${y}</option>`).join('')}</select>` : ''}
      <button class="primary" data-wb-new>${ic('plus')}Nowy list</button></div></div>`;
  const rows = list.slice(0, 400).map(w => { const t = wbTot(w.items || []), v = w.vehicleId ? byId('vehicles', w.vehicleId) : null;
    return `<tr class="click${w.status==='anulowany' ? ' muted' : ''}" data-wb-open="${esc(w.id)}"><td class="num"><b>${esc(wbNo(w))}</b></td><td class="num">${fdate(w.date)}</td>
      <td><b>${esc(w.rName || '')}</b>${w.whName ? `<span class="sub">${esc(w.whName)}</span>` : ''}</td>
      <td>${esc((w.items || []).map(it => it.name).filter(Boolean).join(', '))}</td>
      <td class="r num">${t.paleta || ''}</td><td class="r num">${esc(wbFmtKg(w.weightKg))}</td><td>${esc(w.plate || (v && v.plate) || '')}</td>
      <td>${w.status==='anulowany' ? '<span class="pill">anulowany</span>' : w.printedAt ? '<span class="pill ok">wydrukowany</span>' : '<span class="pill warn">do druku</span>'}</td></tr>`; }).join('');
  const table = list.length ? `<div class="panel tablewrap"><table class="wb-list"><thead><tr><th>Nr</th><th>Data</th><th>Odbiorca</th><th>Towar</th><th class="r">Palety</th><th class="r">Waga</th><th>Auto</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<div class="panel empty"><p>${S.waybills.length ? 'Brak listów dla tego wyszukiwania.' : `Nie ma jeszcze listów przewozowych. Pierwszy dostanie numer ${wbCfg().startNo}/${wbCfg().startYear}.`}</p><button class="primary" data-wb-new>${ic('plus')}Nowy list</button></div>`;
  return head + table + wbRecipientsPanel() + wbCfgPanel();
}

function wbRecipientsPanel(){
  const rs = S.wbRecipients.slice().sort((a, b) => String(a.name).localeCompare(b.name, 'pl'));
  const ed = wbRecEdit && (wbRecEdit==='new' ? {} : byId('wbRecipients', wbRecEdit));
  const form = ed ? `<div class="wb-recform" data-wb-recform="${esc(wbRecEdit)}">
      <label>Nazwa odbiorcy *<input data-wb-r="name" value="${esc(ed.name || '')}"></label>
      <label>Adres<textarea data-wb-r="address" rows="2" placeholder="kod, miejscowość, ulica">${esc(ed.address || '')}</textarea></label>
      <div class="wb-2"><label>REGON<input data-wb-r="regon" value="${esc(ed.regon || '')}"></label><label>NIP<input data-wb-r="nip" value="${esc(ed.nip || '')}"></label></div>
      <div class="wb-2"><label>Magazyn odbiorczy<input data-wb-r="whName" value="${esc(ed.whName || '')}"></label><label>Adres magazynu<textarea data-wb-r="whAddress" rows="2">${esc(ed.whAddress || '')}</textarea></label></div>
      <div class="row-act">${wbRecEdit!=='new' ? `<button type="button" class="small ghost" data-wb-recdel="${esc(wbRecEdit)}">Usuń z książki</button>` : ''}<button type="button" class="small ghost" data-wb-reccancel>Anuluj</button><button type="button" class="small primary" data-wb-recsave>Zapisz</button></div></div>` : '';
  return `<details class="panel fold wb-fold" ${ed ? 'open' : ''}><summary class="sec-head"><h3>Książka odbiorców</h3><span class="muted small">${rs.length}</span></summary><div class="wb-inner">
    <p class="muted small">Odbiorcy zapisują się tu sami przy wystawianiu listu. Zmiana danych w książce nie zmienia już wystawionych listów.</p>
    ${rs.length ? `<div class="tablewrap"><table><thead><tr><th>Odbiorca</th><th>Adres</th><th>NIP</th><th>Magazyn</th></tr></thead><tbody>${rs.map(r => `<tr class="click" data-wb-recopen="${esc(r.id)}"><td><b>${esc(r.name)}</b></td><td>${esc(r.address || '').replace(/\n/g, ', ')}</td><td class="num">${esc(r.nip || '')}</td><td>${esc(r.whName || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${form || `<div class="row-act" style="justify-content:flex-start"><button type="button" class="small" data-wb-recnew>${ic('plus')}Dodaj odbiorcę</button></div>`}</div></details>`;
}
function wbCfgPanel(){
  const c = wbCfg(), next = S.waybills.filter(w => w.year===new Date().getFullYear()).reduce((m, w) => Math.max(m, w.no || 0), 0);
  const nextNo = next ? next + 1 : (c.startYear===new Date().getFullYear() ? c.startNo : 1);
  return `<details class="panel fold wb-fold" ${wbCfgOpen ? 'open' : ''} data-wb-cfgfold><summary class="sec-head"><h3>Nadawca i numeracja</h3><span class="muted small">następny numer: ${nextNo}/${new Date().getFullYear()}</span></summary><div class="wb-inner">
    <label>Domyślny nadawca (wstawia się do każdego nowego listu)<textarea id="wb-head" rows="6">${esc(c.head)}</textarea></label>
    ${c.senders.length ? `<div><span class="label muted small">Zapisani inni nadawcy – do wyboru w formularzu listu</span><ul class="wb-senders">${c.senders.map(x => `<li><span>${esc(wbSenderName(x.text))}</span><button type="button" class="small ghost" data-wb-snddel="${esc(x.id)}">Usuń</button></li>`).join('')}</ul></div>` : ''}
    <p class="muted small">Numer nadaje się sam: kolejny w roku daty listu. W ${c.startYear} numeracja zaczyna się od ${c.startNo}, w następnych latach od 1. Numer raz nadany się nie zmienia.</p>
    <div class="row-act"><button type="button" class="small primary" data-wb-cfgsave>Zapisz nagłówek</button></div></div></details>`;
}

/* ---------- podgląd jednego listu ---------- */
function wbPreview(w){
  const armed = wbCancelArm===w.id;
  return `<div class="bar"><h2>List przewozowy ${esc(wbNo(w))}</h2><div class="tools">
      <button class="ghost" data-wb-back>${ic('back')}Lista</button>
      ${w.status!=='anulowany' ? `<button class="ghost" data-wb-edit="${esc(w.id)}">Edytuj</button>` : ''}
      <button class="ghost" data-wb-copy="${esc(w.id)}">Kopiuj jako nowy</button>
      ${w.status!=='anulowany' ? `<button class="${armed ? 'danger armed' : 'danger'}" data-wb-cancel="${esc(w.id)}">${armed ? 'Na pewno anulować?' : 'Anuluj list'}</button>` : `<button class="ghost" data-wb-restore="${esc(w.id)}">Przywróć</button>`}
      <button class="primary" data-wb-print="${esc(w.id)}">Drukuj / PDF</button></div></div>
    ${w.printedAt ? `<p class="muted small">Ostatni wydruk: ${fdate(String(w.printedAt).slice(0, 10))} ${String(new Date(w.printedAt).toLocaleTimeString('pl-PL', {hour: '2-digit', minute: '2-digit'}))}${w.printedBy ? ` · ${esc(w.printedBy)}` : ''}</p>` : ''}
    <div class="wb-paper">${wbDocHtml(w, me && (me.full_name || me.email))}</div>`;
}

/* ---------- formularz ---------- */
const wbBlankItem = d => ({place: d ? wbPlaceOf(d) : '', name: '', inna: '', karton: '', paleta: ''});
const wbPlaceOf = d => [d.rName, d.whAddress || d.rAddress].filter(Boolean).join('\n');
function wbNewDraft(src){
  const d = src ? {...src, items: (src.items || []).map(x => ({...x}))} : {date: today(), rName: '', rAddress: '', rRegon: '', rNip: '', whName: '', whAddress: '', items: [], weightKg: '', vehicleId: '', plate: '', departDate: '', note: ''};
  if (src && !src.id){ d.date = today(); d.departDate = ''; d.status = 'wystawiony'; d.printedAt = null; d.printedBy = null; }
  if (!d.items.length) d.items.push(wbBlankItem(d));
  if (!d.sender) d.sender = wbCfg().head;
  d.saveRec = true; d.saveSender = false;
  return d;
}
function wbEditor(){
  const d = wbEdit, t = wbTot(d.items), rs = S.wbRecipients.slice().sort((a, b) => String(a.name).localeCompare(b.name, 'pl'));
  const vs = S.vehicles.filter(v => v.status!=='wycofany').sort((a, b) => String(a.plate).localeCompare(b.plate));
  const f = (k, label, extra = '') => `<label>${label}<input data-wb-f="${k}" value="${esc(d[k] ?? '')}" ${extra}></label>`;
  return `<div class="bar"><h2>${d.id ? `Edycja listu ${esc(wbNo(d))}` : 'Nowy list przewozowy'}</h2><div class="tools"><button class="ghost" data-wb-discard>Anuluj</button><button class="primary" data-wb-save>${d.id ? 'Zapisz zmiany' : 'Wystaw list'}</button></div></div>
  <div class="panel wb-form">
    <div class="wb-2"><label>Data listu<input type="date" data-wb-f="date" value="${esc(d.date || '')}"></label>
      <div class="wb-nohint"><span class="label">Numer</span><b>${d.id ? esc(wbNo(d)) : 'nada się sam przy zapisie'}</b></div></div>
    <h3>Nadawca</h3>
    ${(() => { const c = wbCfg(), cur = String(d.sender || '').trim(), opts = [{id: 'def', text: c.head}, ...c.senders], sel = (opts.find(o => String(o.text).trim()===cur) || {}).id || '';
      const known = !!sel;
      return `<label>Wybierz nadawcę<select data-wb-snd>${opts.map(o => `<option value="${esc(o.id)}" ${o.id===sel ? 'selected' : ''}>${esc(wbSenderName(o.text))}${o.id==='def' ? ' (domyślny)' : ''}</option>`).join('')}${known ? '' : '<option value="" selected>— zmieniony dla tego listu —</option>'}</select></label>
      <label>Nadawca na tym liście<textarea data-wb-f="sender" rows="5">${esc(d.sender || '')}</textarea></label>
      <label>Magazyn nadawczy (opcjonalnie – drukuje się pod nadawcą)<textarea data-wb-f="senderWh" rows="2" placeholder="nazwa magazynu, adres">${esc(d.senderWh || '')}</textarea></label>
      <label class="check" id="wb-sndsave" ${known ? 'hidden' : ''}><input type="checkbox" data-wb-savesnd ${d.saveSender ? 'checked' : ''}> Zapisz tego nadawcę do wyboru przy następnych listach</label>`; })()}
    <h3>Odbiorca</h3>
    <label>Wybierz z książki<select data-wb-rec><option value="">— nowy odbiorca (wpisz poniżej) —</option>${rs.map(r => `<option value="${esc(r.id)}" ${d.recipientId===r.id ? 'selected' : ''}>${esc(r.name)}${r.whName ? ' · ' + esc(r.whName) : ''}</option>`).join('')}</select></label>
    ${f('rName', 'Nazwa odbiorcy *', 'autocomplete="off"')}
    <label>Adres odbiorcy<textarea data-wb-f="rAddress" rows="2" placeholder="80-180 Kowale, ul. Magazynowa 7">${esc(d.rAddress || '')}</textarea></label>
    <div class="wb-2">${f('rRegon', 'REGON', 'inputmode="numeric"')}${f('rNip', 'NIP', 'inputmode="numeric"')}</div>
    <div class="wb-2">${f('whName', 'Magazyn odbiorczy')}<label>Adres magazynu<textarea data-wb-f="whAddress" rows="2">${esc(d.whAddress || '')}</textarea></label></div>
    <label class="check"><input type="checkbox" data-wb-saverec ${d.saveRec ? 'checked' : ''}> ${d.recipientId ? 'Zapisz zmiany danych odbiorcy w książce odbiorców' : 'Zapisz odbiorcę w książce odbiorców'}</label>
    <h3>Pozycje</h3>
    <div class="tablewrap"><table class="wb-items"><thead><tr><th>Odbiorca / miejsce dostawy</th><th>Nazwa / rodzaj</th><th class="r">Inna</th><th class="r">Karton</th><th class="r">Paleta</th><th class="r">Razem</th><th></th></tr></thead><tbody>
      ${d.items.map((it, i) => `<tr><td><textarea data-wb-i="${i}" data-wb-k="place" rows="3" aria-label="Miejsce dostawy">${esc(it.place || '')}</textarea></td>
        <td><input data-wb-i="${i}" data-wb-k="name" value="${esc(it.name || '')}" placeholder="np. ZWROT 47/2026" aria-label="Nazwa / rodzaj"></td>
        ${['inna', 'karton', 'paleta'].map(k => `<td class="r"><input class="wb-n" type="number" min="0" step="1" inputmode="numeric" data-wb-i="${i}" data-wb-k="${k}" value="${esc(it[k] ?? '')}" aria-label="${k}"></td>`).join('')}
        <td class="r num"><b data-wb-rowsum="${i}">${wbRowSum(it) || ''}</b></td>
        <td class="r">${d.items.length > 1 ? `<button type="button" class="small ghost" data-wb-del="${i}" title="Usuń pozycję" aria-label="Usuń pozycję">${ic('x')}</button>` : ''}</td></tr>`).join('')}
      <tr class="wb-total"><td><b>SUMA</b></td><td></td><td class="r num" data-wb-tot="inna">${t.inna || ''}</td><td class="r num" data-wb-tot="karton">${t.karton || ''}</td><td class="r num" data-wb-tot="paleta">${t.paleta || ''}</td><td class="r num"><b data-wb-tot="all">${t.all || ''}</b></td><td></td></tr>
    </tbody></table></div>
    <div class="row-act" style="justify-content:flex-start"><button type="button" class="small" data-wb-add>${ic('plus')}Dodaj pozycję</button></div>
    <div class="wb-2"><div class="wb-nohint"><span class="label">Łączna liczba palet</span><b data-wb-tot="paleta2">${t.paleta}</b><span class="sub">liczona z pozycji</span></div>
      <label>Łączna waga towaru (kg)<input type="number" min="0" step="0.1" inputmode="decimal" data-wb-f="weightKg" value="${esc(d.weightKg ?? '')}"></label></div>
    <h3>Transport</h3>
    <div class="wb-2"><label>Nr rej. pojazdu<select data-wb-veh><option value="">— puste (wpisze się ręcznie na wydruku) —</option>${vs.map(v => `<option value="${esc(v.id)}" ${d.vehicleId===v.id ? 'selected' : ''}>${esc(v.plate)}</option>`).join('')}</select></label>
      <label>Data wyjazdu<input type="date" data-wb-f="departDate" value="${esc(d.departDate || '')}"></label></div>
    <label>Uwagi (drukują się pod danymi transportu)<input data-wb-f="note" value="${esc(d.note || '')}"></label>
    <p class="warn-t" id="wb-err" hidden></p>
    <div class="row-act"><button class="ghost" data-wb-discard>Anuluj</button><button class="primary" data-wb-save>${d.id ? 'Zapisz zmiany' : 'Wystaw list'}</button></div>
  </div>`;
}
function wbUpdateSums(){
  if (!wbEdit) return; const t = wbTot(wbEdit.items);
  wbEdit.items.forEach((it, i) => { const el = document.querySelector(`[data-wb-rowsum="${i}"]`); if (el) el.textContent = wbRowSum(it) || ''; });
  ['inna', 'karton', 'paleta', 'all'].forEach(k => { const el = document.querySelector(`[data-wb-tot="${k}"]`); if (el) el.textContent = t[k] || ''; });
  const p2 = document.querySelector('[data-wb-tot="paleta2"]'); if (p2) p2.textContent = t.paleta;
}
async function wbSave(){
  const d = wbEdit, err = m => { const e = $('#wb-err'); if (e){ e.textContent = m; e.hidden = false; e.scrollIntoView({block: 'center'}); } };
  if (!String(d.rName || '').trim()) return err('Wpisz nazwę odbiorcy.');
  const items = d.items.filter(it => String(it.name || '').trim() || String(it.place || '').trim() || wbRowSum(it))
    .map(it => ({place: String(it.place || '').trim(), name: String(it.name || '').trim(), inna: wbInt(it.inna), karton: wbInt(it.karton), paleta: wbInt(it.paleta)}));
  if (!items.length) return err('Dodaj co najmniej jedną pozycję towaru.');
  if (items.some(it => !it.name)) return err('Każda pozycja musi mieć nazwę / rodzaj towaru.');
  const v = d.vehicleId ? byId('vehicles', d.vehicleId) : null;
  try {
    let recId = d.recipientId || null;
    if (d.saveRec){
      const rec = {name: d.rName.trim(), address: d.rAddress || '', regon: d.rRegon || '', nip: d.rNip || '', whName: d.whName || '', whAddress: d.whAddress || ''};
      if (recId && byId('wbRecipients', recId)) await db.collection('wbRecipients').doc(recId).update(rec);
      else { const ref = db.collection('wbRecipients').doc(); await ref.set(rec); recId = ref.id; }
    }
    const sender = String(d.sender || '').trim() || wbCfg().head;
    if (d.saveSender && !wbCfg().senders.some(x => String(x.text).trim()===sender) && sender!==wbCfg().head.trim()) await wbCfgSave({senders: [...wbCfg().senders, {id: newId(), text: sender, wh: String(d.senderWh || '').trim()}]});
    const ref = db.collection('waybills').doc(d.id || undefined);
    await ref.set({date: d.date || today(), sender, senderWh: String(d.senderWh || '').trim(), recipientId: recId, rName: d.rName.trim(), rAddress: d.rAddress || '', rRegon: d.rRegon || '', rNip: d.rNip || '', whName: d.whName || '', whAddress: d.whAddress || '',
      items, pallets: wbTot(items).paleta, weightKg: d.weightKg==='' || d.weightKg==null ? null : Number(d.weightKg), vehicleId: d.vehicleId || null, plate: v ? v.plate : '', departDate: d.departDate || null,
      note: d.note || '', status: d.status || 'wystawiony', ...(d.id ? {} : {printedAt: null, printedBy: null})});
    const saved = byId('waybills', ref.id);
    toast(d.id ? 'Zapisano zmiany listu' : `Wystawiono list ${saved ? wbNo(saved) : ''}`);
    wbEdit = null; wbView = ref.id; render(); scrollTo(0, 0);
  } catch(e){ handleWriteErr(e); }
}

/* ---------- zdarzenia ---------- */
document.addEventListener('input', e => {
  const t = e.target; if (!t.dataset) return;
  if (t.id==='wb-q'){ wbQ = t.value; clearTimeout(wbSearchT); wbSearchT = setTimeout(() => { const el = $('#wb-q'); if (!el || el.value!==wbQ) return; const pos = el.selectionStart; render(); const n = $('#wb-q'); if (n){ n.focus(); n.setSelectionRange(pos, pos); } }, 250); return; }
  if (!wbEdit) return;
  if (t.dataset.wbF==='sender'){   // tekst zmieniony ręcznie: „zmieniony dla tego listu” + możliwość zapisu
    const c = wbCfg(), cur = t.value.trim(), o = [{id: 'def', text: c.head}, ...c.senders].find(x => String(x.text).trim()===cur), sel = document.querySelector('[data-wb-snd]'), box = $('#wb-sndsave');
    if (sel){ let opt = sel.querySelector('option[value=""]'); if (!o && !opt){ opt = document.createElement('option'); opt.value = ''; opt.textContent = '— zmieniony dla tego listu —'; sel.appendChild(opt); } sel.value = o ? o.id : ''; }
    if (box) box.hidden = !!o; }
  if (t.dataset.wbF){ wbEdit[t.dataset.wbF] = t.value;
    // miejsce dostawy w pozycjach podąża za odbiorcą, dopóki ktoś go nie zmienił ręcznie
    if (['rName', 'rAddress', 'whAddress'].includes(t.dataset.wbF)){ const pl = wbPlaceOf(wbEdit); wbEdit.items.forEach((it, i) => { if (!it.placeTouched){ it.place = pl; const el = document.querySelector(`[data-wb-i="${i}"][data-wb-k="place"]`); if (el) el.value = pl; } }); }
    return; }
  if (t.dataset.wbI!=null){ const it = wbEdit.items[Number(t.dataset.wbI)]; if (!it) return; it[t.dataset.wbK] = t.value; if (t.dataset.wbK==='place') it.placeTouched = true; wbUpdateSums(); }
});
document.addEventListener('change', e => {
  const t = e.target; if (!t.dataset) return;
  if (t.id==='wb-year'){ wbYear = t.value; return render(); }
  if (!wbEdit) return;
  if (t.dataset.wbRec!=null){ const r = byId('wbRecipients', t.value);
    wbEdit.recipientId = r ? r.id : '';
    if (r) Object.assign(wbEdit, {rName: r.name || '', rAddress: r.address || '', rRegon: r.regon || '', rNip: r.nip || '', whName: r.whName || '', whAddress: r.whAddress || ''});
    wbEdit.saveRec = !r; wbEdit.items.forEach(it => { if (!it.placeTouched) it.place = wbPlaceOf(wbEdit); });
    return render(); }
  if (t.dataset.wbVeh!=null){ wbEdit.vehicleId = t.value; return; }
  if (t.dataset.wbSaverec!=null){ wbEdit.saveRec = t.checked; return; }
  if (t.dataset.wbSavesnd!=null){ wbEdit.saveSender = t.checked; return; }
  if (t.dataset.wbSnd!=null){ const c = wbCfg(), o = t.value==='def' ? {text: c.head} : c.senders.find(x => x.id===t.value); if (o){ wbEdit.sender = o.text; wbEdit.senderWh = o.wh || ''; wbEdit.saveSender = false; } return render(); }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-wb-new],[data-wb-open],[data-wb-back],[data-wb-edit],[data-wb-copy],[data-wb-cancel],[data-wb-restore],[data-wb-print],[data-wb-save],[data-wb-discard],[data-wb-add],[data-wb-del],[data-wb-recopen],[data-wb-recnew],[data-wb-reccancel],[data-wb-recsave],[data-wb-recdel],[data-wb-cfgsave],[data-wb-snddel]');
  if (!b || !P().manage) return;
  const d = b.dataset;
  if (d.wbCancel==null) wbCancelArm = null;
  if (d.wbNew!=null){ wbEdit = wbNewDraft(); wbView = null; render(); return scrollTo(0, 0); }
  if (d.wbOpen){ wbView = d.wbOpen; render(); return scrollTo(0, 0); }
  if (d.wbBack!=null){ wbView = null; return render(); }
  if (d.wbEdit){ const w = byId('waybills', d.wbEdit); if (w){ wbEdit = wbNewDraft(w); wbEdit.saveRec = false; wbEdit.items.forEach(it => { it.placeTouched = true; }); render(); scrollTo(0, 0); } return; }
  if (d.wbCopy){ const w = byId('waybills', d.wbCopy); if (w){ const {id, no, year, ...rest} = w; wbEdit = wbNewDraft(rest); wbEdit.saveRec = false; wbEdit.items.forEach(it => { it.placeTouched = true; }); wbView = null; render(); scrollTo(0, 0); } return; }
  if (d.wbCancel){ if (wbCancelArm!==d.wbCancel){ wbCancelArm = d.wbCancel; return render(); }
    wbCancelArm = null; try { await db.collection('waybills').doc(d.wbCancel).update({status: 'anulowany'}); toast('List anulowany – numer zostaje w archiwum'); render(); } catch(err){ handleWriteErr(err); } return; }
  if (d.wbRestore){ try { await db.collection('waybills').doc(d.wbRestore).update({status: 'wystawiony'}); toast('List przywrócony'); render(); } catch(err){ handleWriteErr(err); } return; }
  if (d.wbPrint) return wbPrint(d.wbPrint);
  if (d.wbSave!=null) return wbSave();
  if (d.wbDiscard!=null){ const id = wbEdit && wbEdit.id; wbEdit = null; wbView = id || null; return render(); }
  if (d.wbAdd!=null){ wbEdit.items.push(wbBlankItem(wbEdit)); render(); const el = document.querySelector(`[data-wb-i="${wbEdit.items.length - 1}"][data-wb-k="name"]`); if (el) el.focus(); return; }
  if (d.wbDel!=null){ wbEdit.items.splice(Number(d.wbDel), 1); return render(); }
  if (d.wbRecopen){ wbRecEdit = d.wbRecopen; return render(); }
  if (d.wbRecnew!=null){ wbRecEdit = 'new'; return render(); }
  if (d.wbReccancel!=null){ wbRecEdit = null; return render(); }
  if (d.wbRecsave!=null){ const box = b.closest('[data-wb-recform]'), val = k => (box.querySelector(`[data-wb-r="${k}"]`) || {}).value || '';
    if (!val('name').trim()) return toast('Wpisz nazwę odbiorcy');
    try { const ref = db.collection('wbRecipients').doc(wbRecEdit==='new' ? undefined : wbRecEdit), rec = {name: val('name').trim(), address: val('address'), regon: val('regon'), nip: val('nip'), whName: val('whName'), whAddress: val('whAddress')};
      if (wbRecEdit==='new') await ref.set(rec); else await ref.update(rec);
      wbRecEdit = null; toast('Zapisano odbiorcę'); render(); } catch(err){ handleWriteErr(err); } return; }
  if (d.wbRecdel){ try { await db.collection('wbRecipients').doc(d.wbRecdel).delete(); wbRecEdit = null; toast('Usunięto odbiorcę z książki'); render(); } catch(err){ handleWriteErr(err); } return; }
  if (d.wbSnddel){ wbCfgOpen = true; try { await wbCfgSave({senders: wbCfg().senders.filter(x => x.id!==d.wbSnddel)}); toast('Usunięto nadawcę z listy'); render(); } catch(err){ handleWriteErr(err); } return; }
  if (d.wbCfgsave!=null){ wbCfgOpen = true;
    try { await wbCfgSave({header: ($('#wb-head') || {}).value || WB_HEAD_DEF}); toast('Zapisano nagłówek nadawcy'); render(); } catch(err){ handleWriteErr(err); } return; }
});
document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('[data-wb-cfgfold]')) wbCfgOpen = e.target.open; }, true);
