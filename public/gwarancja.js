/* Emage FLEET — gwarancja auta.
   Zbudowane na terminach (bez nowych tabel):
   - „Koniec gwarancji” – termin z datą i opcjonalnym limitem km (kmDue), bez powtarzania;
   - „Przegląd gwarancyjny” – termin z cyklem (miesiące / km) i przypomnieniem N km przed (remindKm, domyślnie 5000);
   - potwierdzenie przeglądu = wpis w książce serwisowej z datą i przebiegiem, podpięty pod termin;
     baza (trigger z 011/016) sama przesuwa następny przegląd: data wpisu + cykl miesięcy, przebieg wpisu + cykl km. */
'use strict';
const WR_END = 'Koniec gwarancji', WR_INSP = 'Przegląd gwarancyjny';
const wrEnd = vid => S.deadlines.find(d => d.vehicleId===vid && d.type===WR_END) || null;
const wrInsp = vid => S.deadlines.filter(d => d.vehicleId===vid && d.type===WR_INSP).sort((a, b) => a.date < b.date ? -1 : 1)[0] || null;
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
  const cyc = ins ? [ins.intervalMonths ? `co ${ins.intervalMonths} mies.` : '', ins.intervalKm ? `co ${km(ins.intervalKm)}` : ''].filter(Boolean).join(' lub ') : '';
  const afterEnd = w && ins && !w.over && ((w.e.date && ins.date > w.e.date && !(ins.kmDue && w.e.kmDue && Number(ins.kmDue) <= Number(w.e.kmDue))) );
  const body = !w && !ins ? `<p class="muted sec-empty">Nie ustawiono gwarancji. Wpisz, do kiedy auto ma gwarancję i co ile robić przegląd gwarancyjny – przypomnimy z wyprzedzeniem (np. 5000 km przed).</p>`
    : `<div class="wr">
      <div class="wr-row"><span class="dot ${w ? w.cls : ''}"></span><span><b>Gwarancja</b><span class="sub">${w ? esc(w.txt) : 'koniec nie wpisany'}</span></span>${w ? `<span class="pill ${w.over ? 'off' : w.cls}">${w.over ? 'zakończona' : 'trwa'}</span>` : ''}</div>
      ${ins ? `<div class="wr-row"><span class="dot ${st.cls==='ok' ? 'ok' : st.cls==='soon' ? 'warn' : st.cls}"></span><span><b>Następny przegląd gwarancyjny</b><span class="sub">${fdate(ins.date)}${ins.kmDue ? ` lub przy ${km(ins.kmDue)}` : ''}${cyc ? ` · ${cyc}` : ''} · przypomnienie ${km(ins.remindKm || 1000)} przed</span></span><span class="pill ${st.cls}">${esc(st.txt)}</span></div>` : `<div class="wr-row"><span class="dot"></span><span><b>Przegląd gwarancyjny</b><span class="sub">nie ustawiony</span></span></div>`}
      ${afterEnd ? `<p class="d-hint">Następny przegląd wypada po końcu gwarancji – jeśli nie jest już potrzebny, usuń go w „Ustaw gwarancję”.</p>` : ''}
      ${done.length ? `<div class="wr-hist"><span class="label">Wykonane przeglądy</span>${done.slice(0, 5).map(x => `<span class="wr-h num"><b>${fdate(x.date)}</b> · ${x.km ? km(x.km) : 'bez przebiegu'}${x.workshop ? ` · ${esc(x.workshop)}` : ''}</span>`).join('')}</div>` : ''}
    </div>`;
  const btns = can ? `<span class="wr-btns">${ins && canCreate('serviceEntries') ? `<button class="small primary" data-wr-done="${esc(v.id)}">${ic('check')}Przegląd wykonany</button>` : ''}<button class="small ${ins ? 'ghost' : ''}" data-wr-set="${esc(v.id)}">${w || ins ? 'Ustaw gwarancję' : '+ Gwarancja'}</button></span>` : '';
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
    <label class="field"><span class="label">Co ile miesięcy</span><input id="wr-m" type="number" inputmode="numeric" min="1" max="60" placeholder="np. 12" value="${val(ins ? ins.intervalMonths : 12)}"></label>
    <label class="field"><span class="label">Co ile km</span><input id="wr-k" type="number" inputmode="numeric" min="1000" step="1000" placeholder="np. 30000" value="${val(ins ? ins.intervalKm : 30000)}"></label>
    <label class="field"><span class="label">Przypomnij … km przed</span><input id="wr-r" type="number" inputmode="numeric" min="0" step="500" placeholder="np. 5000" value="${val(ins ? (ins.remindKm || 5000) : 5000)}"></label>
    <span class="field"></span>
    <label class="field"><span class="label">Ostatni przegląd – data</span><input id="wr-ld" type="date" value="${val(last && last.date)}"></label>
    <label class="field"><span class="label">Ostatni przegląd – przebieg (km)</span><input id="wr-lk" type="number" inputmode="numeric" min="0" value="${val(last && last.km)}"></label>
    <p class="muted small field full" style="margin:0" id="wr-next"></p>
    <label class="field"><span class="label">Następny przegląd – data</span><input id="wr-nd" type="date" value="${val(ins && ins.date)}"></label>
    <label class="field"><span class="label">Następny przegląd – przy przebiegu (km)</span><input id="wr-nk" type="number" inputmode="numeric" min="0" value="${val(ins && ins.kmDue)}"></label>
    ${ins ? `<label class="check field full"><input type="checkbox" id="wr-off"> Usuń przegląd gwarancyjny (np. gwarancja się skończyła)</label>` : ''}
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  const calc = ev => {   // ostatni przegląd + cykl → następny (gdy wpisano ostatni)
    const ld = $('#wr-ld').value, lk = Number($('#wr-lk').value) || 0, m = Number($('#wr-m').value) || 0, k = Number($('#wr-k').value) || 0;
    if (ev && ['wr-ld','wr-lk','wr-m','wr-k'].includes(ev.target.id) && (ld || lk)){
      if (ld && m) $('#wr-nd').value = addMonths(ld, m);
      if (lk && k) $('#wr-nk').value = lk + k;
    }
    const nd = $('#wr-nd').value, nk = Number($('#wr-nk').value) || 0, r = Number($('#wr-r').value) || 0;
    $('#wr-next').textContent = nd || nk ? `Następny przegląd: ${nd ? fdate(nd) : ''}${nd && nk ? ' lub ' : ''}${nk ? 'przy ' + km(nk) : ''} – co nastąpi pierwsze.${nk && r ? ` Przypomnienie przy ${km(Math.max(0, nk - r))}.` : ''}` : 'Wpisz ostatni przegląd (policzymy następny) albo od razu następny.';
  };
  $('#dlg-body').querySelectorAll('input').forEach(i => i.addEventListener('input', calc)); calc();
}
async function saveWarranty(vid){
  const v = byId('vehicles', vid), warn = $('#dlg-warn'); warn.hidden = true;
  const num = id => { const x = $(id).value.trim(); return x==='' ? null : Number(x); };
  const endD = $('#wr-end').value || null, endK = num('#wr-endkm'), m = num('#wr-m'), k = num('#wr-k'), r = num('#wr-r');
  const ld = $('#wr-ld').value || null, lk = num('#wr-lk'), nd = $('#wr-nd').value || null, nk = num('#wr-nk'), off = $('#wr-off') && $('#wr-off').checked;
  const fail = t => { warn.textContent = t; warn.hidden = false; };
  if (endK!=null && !endD) return fail('Podaj też datę końca gwarancji (np. 3 lata od rejestracji) – limit km działa razem z datą.');
  if (endK!=null && endK < 1000) return fail('Limit przebiegu gwarancji wygląda na błędny.');
  if (lk!=null && v.km && lk > Number(v.km) + 1000) return fail(`Przebieg ostatniego przeglądu (${km(lk)}) jest większy niż obecny przebieg auta (${km(v.km)}).`);
  if (ld && ld > today()) return fail('Data ostatniego przeglądu jest w przyszłości.');
  if (!off && (nd || nk || ld) && !nd && !(ld && m)) return fail('Podaj datę następnego przeglądu albo datę ostatniego i cykl w miesiącach.');
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    const e = wrEnd(vid);
    if (endD){ const doc = {vehicleId: vid, type: WR_END, date: endD, kmDue: endK, intervalMonths: null, intervalKm: null, remindKm: endK ? 10000 : null, note: e && e.note || null};
      await db.collection('deadlines').doc(e ? e.id : undefined).set(doc); }
    else if (e) await db.collection('deadlines').doc(e.id).delete();
    let ins = wrInsp(vid);
    if (off && ins){ await db.collection('deadlines').doc(ins.id).delete(); ins = null; }
    else if (nd || (ld && m)){
      const doc = {vehicleId: vid, type: WR_INSP, date: nd || addMonths(ld, m), kmDue: nk!=null ? nk : (lk!=null && k ? lk + k : null), intervalMonths: m, intervalKm: k, remindKm: r!=null ? r : 5000, note: ins && ins.note || null};
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

/* „Przegląd wykonany”: wpis do książki serwisowej z datą i przebiegiem, podpięty pod termin → baza ustawia następny */
function openWarrantyDone(vid){
  const ins = wrInsp(vid), v = byId('vehicles', vid); if (!ins || !v) return;
  if (!canCreate('serviceEntries')){ renew(ins.id); return; }
  openForm('serviceEntries', null, {vehicleId: vid, date: today(), km: v.km || '', description: WR_INSP, deadlineId: ins.id});
  setTimeout(() => { $('#dlg-title').textContent = `Przegląd gwarancyjny wykonany · ${v.plate}`;
    const k = $('#f-serviceEntries-km'); if (k){ k.focus(); k.select && k.select(); }
    const n = document.createElement('p'); n.className = 'muted small field full'; n.style.margin = '0';
    n.textContent = `Następny przegląd ustawi się sam: data + ${ins.intervalMonths || 12} mies.${ins.intervalKm ? `, przebieg + ${nf0(ins.intervalKm)} km` : ''}.`;
    $('#dlg-body').prepend(n); }, 40);
}

document.addEventListener('click', e => {
  const s = e.target.closest('[data-wr-set]'); if (s){ e.preventDefault(); e.stopPropagation(); openWarranty(s.dataset.wrSet); return; }
  const d = e.target.closest('[data-wr-done]'); if (d){ e.preventDefault(); e.stopPropagation(); openWarrantyDone(d.dataset.wrDone); return; }
});
