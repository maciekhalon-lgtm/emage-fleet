/* Emage FLEET — gwarancja auta.
   Zbudowane na terminach (bez nowych tabel):
   - „Koniec gwarancji” – termin z datą i opcjonalnym limitem km (kmDue), bez powtarzania;
   - „Przegląd gwarancyjny” – termin tylko na km (migracja 042): cykl km i przypomnienie N km przed (remindKm, domyślnie 5000);
   - „Przegląd wykonany” = wpis w książce serwisowej z datą i przebiegiem, podpięty pod termin;
     baza (service_apply) sama ustawia następny przegląd: przebieg wpisu + cykl km ustawiony dla auta. */
'use strict';
const WR_END = 'Koniec gwarancji', WR_INSP = 'Przegląd gwarancyjny';
const wrEnd = vid => S.deadlines.find(d => d.vehicleId===vid && d.type===WR_END) || null;
const wrInsp = vid => S.deadlines.filter(d => d.vehicleId===vid && d.type===WR_INSP).sort((a, b) => (Number(a.kmDue) || Infinity) - (Number(b.kmDue) || Infinity))[0] || null;
const WR_STEP = 30000;
const wrDone = vid => { const ins = wrInsp(vid);
  return (S.serviceEntries || []).filter(x => x.vehicleId===vid && ((ins && x.deadlineId===ins.id) || /przegl[aą]d gwarancyjny/i.test(x.description || ''))).sort((a, b) => a.date < b.date ? 1 : -1); };
const canWr = () => canCreate('deadlines');
const nf0 = n => new Intl.NumberFormat('pl-PL').format(Math.round(n));

/* Stan gwarancji: czy trwa, ile zostało dni / km */
function wrState(v){
  const e = wrEnd(v.id); if (!e) return null;
  const days = e.date ? diffDays(today(), e.date) : null, left = e.kmDue && v.km ? Number(e.kmDue) - Number(v.km) : null;
  const over = (days!=null && days < 0) || (left!=null && left <= 0);
  const cls = over ? 'off' : (days!=null && days <= 60) || (left!=null && left <= 10000) ? 'warn' : 'ok';
  const parts = [days!=null ? (days < 0 ? `minęła ${fdate(e.date)}` : `do ${fdate(e.date)} (${days} ${isPlural(days,'dzień','dni','dni')})`) : '',
    e.kmDue ? (left!=null && left <= 0 ? `limit ${km(e.kmDue)} przekroczony` : `lub do ${km(e.kmDue)}${left!=null ? ` (zostało ${km(left)})` : ''}`) : ''].filter(Boolean);
  return {e, days, left, over, cls, txt: parts.join(' · ')};
}

/* Panel na karcie auta (zakładka „Terminy i serwis”) */
function warrantyPanel(v){
  const w = wrState(v), ins = wrInsp(v.id), done = wrDone(v.id), can = canWr();
  if (!w && !ins && !can) return '';
  const st = ins ? dlState(ins) : null;
  const cyc = ins && ins.intervalKm ? `co ${km(ins.intervalKm)}` : '';
  const afterEnd = w && ins && !w.over && ins.kmDue && w.e.kmDue && Number(ins.kmDue) > Number(w.e.kmDue);
  const body = !w && !ins ? `<p class="muted sec-empty">Nie ustawiono gwarancji. Wpisz, do kiedy auto ma gwarancję i co ile km robić przegląd gwarancyjny – przypomnimy z wyprzedzeniem (np. 5000 km przed). Po wykonanym przeglądzie kliknij „Przegląd wykonany”.</p>`
    : `<div class="wr">
      <div class="wr-row"><span class="dot ${w ? w.cls : ''}"></span><span><b>Gwarancja</b><span class="sub">${w ? esc(w.txt) : 'koniec nie wpisany'}</span></span>${w ? `<span class="pill ${w.over ? 'off' : w.cls}">${w.over ? 'zakończona' : 'trwa'}</span>` : ''}</div>
      ${ins ? `<div class="wr-row"><span class="dot ${st.cls==='ok' ? 'ok' : st.cls==='soon' ? 'warn' : st.cls}"></span><span><b>Następny przegląd gwarancyjny</b><span class="sub">${ins.kmDue ? `przy ${km(ins.kmDue)}` : ins.date ? fdate(ins.date) : 'przebieg nie ustawiony'}${cyc ? ` · ${cyc}` : ''} · przypomnienie ${km(ins.remindKm || 1000)} przed</span></span><span class="pill ${st.cls}">${esc(st.txt)}</span></div>` : `<div class="wr-row"><span class="dot"></span><span><b>Przegląd gwarancyjny</b><span class="sub">nie ustawiony</span></span></div>`}
      ${afterEnd ? `<p class="d-hint">Następny przegląd wypada po końcu gwarancji – jeśli nie jest już potrzebny, usuń go w „Ustaw gwarancję”.</p>` : ''}
      ${done.length ? `<div class="wr-hist"><span class="label">Wykonane przeglądy</span>${done.slice(0, 5).map(x => `<span class="wr-h num"><b>${fdate(x.date)}</b> · ${x.km ? km(x.km) : 'bez przebiegu'}${x.workshop ? ` · ${esc(x.workshop)}` : ''}</span>`).join('')}</div>` : ''}
    </div>`;
  const btns = can ? `<span class="wr-btns">${canCreate('serviceEntries') ? `<button class="small ${ins ? 'primary' : ''}" data-wr-done="${esc(v.id)}">${ic('check')}Przegląd wykonany</button>` : ''}<button class="small ${ins ? 'ghost' : ''}" data-wr-set="${esc(v.id)}">${w || ins ? 'Ustaw gwarancję' : '+ Gwarancja'}</button></span>` : '';
  return `<div class="panel"><div class="sec-head"><h3>Gwarancja</h3>${btns}</div>${body}</div>`;
}
/* Krótki opis do listy danych auta */
function warrantyFact(v){ const w = wrState(v); if (!w) return null; return w.over ? `<span class="muted">zakończona</span>` : esc(w.txt); }

/* Okno „Ustaw gwarancję” */
function openWarranty(vid){
  const v = byId('vehicles', vid); if (!v || !canWr()) return;
  const e = wrEnd(vid), ins = wrInsp(vid), last = wrDone(vid)[0];
  editing = {col:'warranty', id: vid, base:{}, special: () => saveWarranty(vid)};
  $('#dlg-title').textContent = `Gwarancja · ${v.plate}`;
  const val = x => x==null ? '' : esc(String(x));
  $('#dlg-body').innerHTML = `
    <div class="f-sec field full">Gwarancja</div>
    <label class="field"><span class="label">Gwarancja do</span><input id="wr-end" type="date" value="${val(e && e.date)}"></label>
    <label class="field"><span class="label">Lub do przebiegu (km, opcjonalnie)</span><input id="wr-endkm" type="number" inputmode="numeric" min="0" placeholder="np. 200000" value="${val(e && e.kmDue)}"></label>
    <div class="f-sec field full">Przegląd gwarancyjny</div>
    <label class="field"><span class="label">Co ile km</span><input id="wr-k" type="number" inputmode="numeric" min="1000" step="1000" placeholder="np. 30000" value="${val(ins ? ins.intervalKm || WR_STEP : WR_STEP)}"></label>
    <label class="field"><span class="label">Przypomnij … km przed</span><input id="wr-r" type="number" inputmode="numeric" min="0" step="500" placeholder="np. 5000" value="${val(ins ? (ins.remindKm || 5000) : 5000)}"></label>
    <label class="field"><span class="label">Ostatni przegląd – data</span><input id="wr-ld" type="date" value="${val(last && last.date)}"></label>
    <label class="field"><span class="label">Ostatni przegląd – przebieg (km)</span><input id="wr-lk" type="number" inputmode="numeric" min="0" value="${val(last && last.km)}"></label>
    <label class="field"><span class="label">Następny przegląd – przy przebiegu (km)</span><input id="wr-nk" type="number" inputmode="numeric" min="0" value="${val(ins && ins.kmDue)}"></label>
    <p class="muted small field" style="margin:0;align-self:end" id="wr-next"></p>
    ${ins ? `<label class="check field full"><input type="checkbox" id="wr-off"> Usuń przegląd gwarancyjny (np. gwarancja się skończyła)</label>` : ''}
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  const calc = ev => {   // ostatni przegląd + cykl km → następny (gdy wpisano przebieg ostatniego)
    const lk = Number($('#wr-lk').value) || 0, k = Number($('#wr-k').value) || 0;
    if (ev && ['wr-lk','wr-k'].includes(ev.target.id) && lk && k) $('#wr-nk').value = lk + k;
    const nk = Number($('#wr-nk').value) || 0, r = Number($('#wr-r').value) || 0;
    $('#wr-next').textContent = nk ? `Przypomnienie przy ${km(Math.max(0, nk - r))}${v.km ? (nk > Number(v.km) ? `, zostało ${km(nk - Number(v.km))}` : `, przebieg przekroczony o ${km(Number(v.km) - nk)}`) : ''}.` : 'Wpisz przebieg ostatniego przeglądu – następny policzy się sam.';
  };
  $('#dlg-body').querySelectorAll('input').forEach(i => i.addEventListener('input', calc)); calc();
}
async function saveWarranty(vid){
  const v = byId('vehicles', vid), warn = $('#dlg-warn'); warn.hidden = true;
  const num = id => { const x = $(id).value.trim(); return x==='' ? null : Number(x); };
  const endD = $('#wr-end').value || null, endK = num('#wr-endkm'), k = num('#wr-k'), r = num('#wr-r');
  const ld = $('#wr-ld').value || null, lk = num('#wr-lk'), off = $('#wr-off') && $('#wr-off').checked;
  const nk = num('#wr-nk') ?? (lk!=null && k ? lk + k : null);
  const fail = t => { warn.textContent = t; warn.hidden = false; };
  if (endK!=null && !endD) return fail('Podaj też datę końca gwarancji (np. 3 lata od rejestracji) – limit km działa razem z datą.');
  if (endK!=null && endK < 1000) return fail('Limit przebiegu gwarancji wygląda na błędny.');
  if (lk!=null && v.km && lk > Number(v.km) + 1000) return fail(`Przebieg ostatniego przeglądu (${km(lk)}) jest większy niż obecny przebieg auta (${km(v.km)}).`);
  if (ld && ld > today()) return fail('Data ostatniego przeglądu jest w przyszłości.');
  if (!off && ld && lk==null) return fail('Podaj przebieg ostatniego przeglądu – od niego liczymy następny.');
  if (k!=null && k < 1000) return fail('Cykl przeglądu gwarancyjnego wygląda na błędny (km).');
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    const e = wrEnd(vid);
    if (endD){ const doc = {vehicleId: vid, type: WR_END, date: endD, kmDue: endK, intervalMonths: null, intervalKm: null, remindKm: endK ? 10000 : null, note: e && e.note || null};
      await db.collection('deadlines').doc(e ? e.id : undefined).set(doc); }
    else if (e) await db.collection('deadlines').doc(e.id).delete();
    let ins = wrInsp(vid);
    if (off && ins){ await db.collection('deadlines').doc(ins.id).delete(); ins = null; }
    else if (nk!=null){
      const doc = {vehicleId: vid, type: WR_INSP, date: null, kmDue: nk, intervalMonths: null, intervalKm: k || WR_STEP, remindKm: r!=null ? r : 5000, note: ins && ins.note || null};
      const ref = db.collection('deadlines').doc(ins ? ins.id : undefined); await ref.set(doc);
      // ostatni przegląd zapisujemy w książce serwisowej (jeśli jeszcze go tam nie ma)
      const known = wrDone(vid).some(x => x.date===ld);
      // bez podpięcia pod termin – termin ustawiliśmy wyżej, baza nie przesunie go drugi raz
      if (ld && !known && canCreate('serviceEntries'))
        await db.collection('serviceEntries').doc().set({vehicleId: vid, date: ld, km: lk, description: WR_INSP, deadlineId: null, note: 'Wpisane przy ustawianiu gwarancji'});
    }
    await Promise.all(['deadlines','serviceEntries'].map(c => typeof refresh==='function' ? refresh(c) : null));
    closeForm(); toast('Zapisano gwarancję');
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}

/* „Przegląd wykonany”: data i przebieg → wpis w książce serwisowej podpięty pod termin;
   baza ustawia następny przegląd = przebieg + cykl km (bez daty). Bez terminu – tworzy go z podanym cyklem. */
function openWarrantyDone(vid){
  const ins = wrInsp(vid), v = byId('vehicles', vid); if (!v) return;
  if (!canCreate('serviceEntries')){ if (ins) renew(ins.id); return; }
  editing = {col:'wr-done', id: vid, base:{}, special: () => saveWarrantyDone(vid)};
  $('#dlg-title').textContent = `Przegląd gwarancyjny wykonany · ${v.plate}`;
  $('#dlg-body').innerHTML = `
    <label class="field"><span class="label">Data przeglądu *</span><input id="wd-d" type="date" value="${today()}" max="${today()}"></label>
    <label class="field"><span class="label">Przebieg przy przeglądzie (km) *</span><input id="wd-k" type="number" inputmode="numeric" min="0" value="${v.km ? Math.round(Number(v.km)) : ''}"></label>
    <label class="field"><span class="label">Następny co (km)</span><input id="wd-s" type="number" inputmode="numeric" min="1000" step="1000" value="${ins && ins.intervalKm || WR_STEP}"></label>
    <label class="field"><span class="label">Warsztat</span><input id="wd-w" placeholder="np. ASO Iveco"></label>
    <label class="field"><span class="label">Koszt netto (zł)</span><input id="wd-c" type="number" inputmode="decimal" min="0" step="0.01" placeholder="doda się sam do kosztów"></label>
    <label class="field"><span class="label">Uwagi</span><input id="wd-n"></label>
    <p class="field full small" id="wd-info" style="margin:0;display:block"></p>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz przegląd'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  const calc = () => { const k = Number($('#wd-k').value) || 0, st = Number($('#wd-s').value) || 0;
    $('#wd-info').innerHTML = k && st ? `Następny przegląd gwarancyjny: <b>przy ${km(k + st)}</b>, przypomnienie ${km(ins && ins.remindKm || 5000)} wcześniej.` : 'Wpisz przebieg – następny przegląd policzy się sam.'; };
  $('#dlg-body').querySelectorAll('input').forEach(i => i.addEventListener('input', calc)); calc();
  setTimeout(() => { const k = $('#wd-k'); if (k){ k.focus(); k.select && k.select(); } }, 40);
}
async function saveWarrantyDone(vid){
  const v = byId('vehicles', vid), warn = $('#dlg-warn'); warn.hidden = true;
  const fail = t => { warn.textContent = t; warn.hidden = false; };
  const d = $('#wd-d').value, k = Number($('#wd-k').value) || 0, st = Number($('#wd-s').value) || 0, c = Number(String($('#wd-c').value).replace(',', '.')) || null;
  if (!d) return fail('Podaj datę przeglądu.');
  if (d > today()) return fail('Data przeglądu nie może być w przyszłości.');
  if (!k) return fail('Podaj przebieg przy przeglądzie – od niego liczymy następny.');
  if (v.km && k > Number(v.km) + 1000) return fail(`Przebieg (${km(k)}) jest większy niż obecny przebieg auta (${km(v.km)}).`);
  if (st < 1000) return fail('Podaj, co ile km robić przegląd gwarancyjny.');
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    let ins = wrInsp(vid);
    if (!ins){ const ref = db.collection('deadlines').doc();
      await ref.set({vehicleId: vid, type: WR_INSP, date: null, kmDue: k + st, intervalMonths: null, intervalKm: st, remindKm: 5000, note: null});
      await refresh('deadlines'); ins = wrInsp(vid); }
    else if (Number(ins.intervalKm) !== st || ins.date) await db.collection('deadlines').doc(ins.id).update({intervalKm: st, intervalMonths: null});
    await db.collection('serviceEntries').doc().set({vehicleId: vid, date: d, km: k, description: WR_INSP, workshop: $('#wd-w').value.trim() || null,
      cost: c, note: $('#wd-n').value.trim() || null, deadlineId: ins ? ins.id : null, issueIds: []});
    await Promise.all(['deadlines','serviceEntries','costs','vehicles'].map(c => typeof refresh==='function' ? refresh(c) : null));
    closeForm(); toast(`Zapisano przegląd – następny przy ${km(k + st)}`);
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}

document.addEventListener('click', e => {
  const s = e.target.closest('[data-wr-set]'); if (s){ e.preventDefault(); e.stopPropagation(); openWarranty(s.dataset.wrSet); return; }
  const d = e.target.closest('[data-wr-done]'); if (d){ e.preventDefault(); e.stopPropagation(); openWarrantyDone(d.dataset.wrDone); return; }
});
