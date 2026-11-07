/* Emage FLEET — zgłoszenie kolizji / szkody przez kierowcę (krok po kroku na jednym ekranie).
   Zapisuje się jako usterka „Szkoda: …” z pełnym opisem (druga strona, policja, oświadczenie) i do 8 zdjęć,
   więc kierownicy widzą ją od razu w Serwis → Usterki (i dostają powiadomienie o nowej usterce). */

const ACC_KINDS = ['Kolizja z innym pojazdem', 'Uszkodzenie przy manewrowaniu / na parkingu', 'Uderzenie w obiekt (słupek, brama, rampa)', 'Szyba – uderzenie kamienia', 'Kradzież lub włamanie', 'Inna szkoda'];
const ACC_MAX_PHOTOS = 8;
const isAccident = i => /^Szkoda:/.test(i.title || '');
/* w już zescapowanym tekście zamienia link GPS z „Moja lokalizacja” na klikalne „mapa” */
const mapLinks = html => String(html).replace(/\(?(https:\/\/maps\.google\.com\/\?q=-?[\d.]+,-?[\d.]+)\)?/g, (_, u) => `<a class="maplink" href="${u}" target="_blank" rel="noopener">${ic('route')}mapa</a>`);

function openAccident(vid){
  const v = byId('vehicles', vid); if (!v) return;
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  editing = {col:'accident', id: null, base:{vehicleId: vid}, special: saveAccident};
  $('#dlg-title').textContent = `Kolizja / szkoda · ${v.plate}`;
  $('#dlg-body').innerHTML = `<div class="field full"><div class="acc-safe">
      <b>Najpierw bezpieczeństwo</b>
      <ol><li>Włącz światła awaryjne, załóż kamizelkę, ustaw trójkąt.</li><li>Są ranni? Dzwoń <a class="btn small" href="tel:112">${ic('phone')}112</a></li><li>Zrób zdjęcia, zanim auta zostaną przestawione (jeśli to bezpieczne).</li></ol>
    </div></div>
    <div class="field full"><label for="acc-kind">Co się stało?</label><select id="acc-kind">${ACC_KINDS.map(k => `<option>${esc(k)}</option>`).join('')}</select></div>
    <div class="field"><label for="acc-when">Kiedy</label><input id="acc-when" type="datetime-local" value="${nowLocal}"></div>
    <div class="field"><label for="acc-km">Licznik (km)</label><input id="acc-km" type="number" inputmode="numeric" placeholder="${esc(String(v.km || ''))}"></div>
    <div class="field full"><label for="acc-where">Gdzie (miejscowość, ulica / droga)</label><div class="acc-loc"><input id="acc-where" placeholder="np. Legnica, ul. Jaworzyńska przy Orlenie">${navigator.geolocation ? `<button type="button" class="small ghost" data-acc-gps>${ic('route')}Moja lokalizacja</button>` : ''}</div><span class="muted small" id="acc-gps-info" hidden></span></div>
    <fieldset class="field full acc-other" id="acc-other"><legend>Druga strona</legend>
      <div class="acc-grid">
        <input id="acc-o-name" placeholder="Imię i nazwisko kierowcy" aria-label="Imię i nazwisko drugiego kierowcy">
        <input id="acc-o-plate" placeholder="Nr rejestracyjny" aria-label="Nr rejestracyjny drugiego pojazdu">
        <input id="acc-o-phone" type="tel" placeholder="Telefon" aria-label="Telefon drugiego kierowcy">
        <input id="acc-o-ins" placeholder="Ubezpieczyciel i nr polisy OC" aria-label="Ubezpieczyciel drugiego pojazdu">
      </div>
      <label for="acc-fault" class="acc-l">Kto spowodował?</label>
      <select id="acc-fault"><option value="">nie wiadomo / do ustalenia</option><option>druga strona</option><option>ja (kierowca Emage)</option><option>obie strony</option></select>
      <label class="check"><input type="checkbox" id="acc-stmt"> Spisaliśmy oświadczenie sprawcy (zrób mu zdjęcie)</label>
    </fieldset>
    <div class="field full acc-checks">
      <label class="check"><input type="checkbox" id="acc-police"> Była policja</label>
      <label class="check"><input type="checkbox" id="acc-witness"> Są świadkowie (dane w opisie)</label>
      <label class="check"><input type="checkbox" id="acc-stop"> Auto nie nadaje się do dalszej jazdy</label>
    </div>
    <div class="field full"><label for="acc-desc">Opis – co się stało, co jest uszkodzone</label><textarea id="acc-desc" rows="3" placeholder="np. cofając pod rampę uderzyłem tylnym zderzakiem w słupek"></textarea></div>
    ${photoField('acc').replace(`(do ${MAX_PHOTOS}, JPG lub PNG)`, `(do ${ACC_MAX_PHOTOS}: całe miejsce, uszkodzenia, tablica drugiego auta, oświadczenie)`)}
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Wyślij zgłoszenie';
  $('#dlg-del').hidden = true;
  $('#scrim').hidden = false;
  accToggle();
}
function accToggle(){
  const k = ($('#acc-kind') || {}).value || '';
  const other = /Kolizja|parkingu/.test(k);
  const box = $('#acc-other'); if (box) box.hidden = !other;
}
async function saveAccident(){
  const w = $('#dlg-warn'), g = id => (($('#' + id) || {}).value || '').trim(), c = id => !!($('#' + id) || {}).checked;
  const kind = g('acc-kind'), where = g('acc-where'), desc = g('acc-desc');
  if (!where){ w.textContent = 'Wpisz, gdzie to się stało.'; w.hidden = false; $('#acc-where').focus(); return; }
  if (!desc){ w.textContent = 'Opisz krótko, co się stało i co jest uszkodzone.'; w.hidden = false; $('#acc-desc').focus(); return; }
  const kmV = Number(g('acc-km')) || null;
  const other = !$('#acc-other').hidden;
  const when = g('acc-when');
  const lines = [
    `Rodzaj: ${kind}`,
    `Kiedy: ${when ? when.replace('T', ' ') : '—'}`,
    `Gdzie: ${where}`,
    other ? `Druga strona: ${[g('acc-o-name'), g('acc-o-plate'), g('acc-o-phone'), g('acc-o-ins')].filter(Boolean).join(' · ') || 'brak danych'}` : '',
    other ? `Sprawca: ${g('acc-fault') || 'do ustalenia'}${c('acc-stmt') ? ' · oświadczenie spisane' : ''}` : '',
    `Policja: ${c('acc-police') ? 'tak' : 'nie'} · Świadkowie: ${c('acc-witness') ? 'tak' : 'nie'}`,
    c('acc-stop') ? 'AUTO NIE NADAJE SIĘ DO JAZDY' : '',
    '', desc,
  ].filter(x => x !== '').join('\n');
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    const photos = await uploadPhotos('acc', 0, ACC_MAX_PHOTOS);
    if (photos === null) return;
    await db.collection('issues').doc().set({vehicleId: editing.base.vehicleId, title: `Szkoda: ${kind}`, description: lines,
      severity: c('acc-stop') ? 'stop' : 'istotna', status: 'nowe', date: (when || today()).slice(0, 10), km: kmV, photos});
    closeForm();
    toast('Zgłoszenie wysłane – kierownik je widzi');
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}
document.addEventListener('change', e => { if (e.target.id==='acc-kind') accToggle(); });
/* GPS: dopisuje współrzędne i link do mapy (kierownik od razu wie, gdzie stoi auto) */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-acc-gps]'); if (!b) return; e.preventDefault();
  const info = $('#acc-gps-info'); b.disabled = true; info.hidden = false; info.textContent = 'Ustalam lokalizację…';
  navigator.geolocation.getCurrentPosition(p => {
    const la = p.coords.latitude.toFixed(5), lo = p.coords.longitude.toFixed(5), inp = $('#acc-where');
    const tag = `GPS ${la}, ${lo} (https://maps.google.com/?q=${la},${lo})`;
    if (inp){ const base = inp.value.replace(/(\s*·\s*)?GPS [\d.,\s-]+\(https:[^)]*\)/, '').trim(); inp.value = base ? base + ' · ' + tag : tag; }
    info.textContent = `Dodano lokalizację (dokładność ok. ${Math.round(p.coords.accuracy)} m). Dopisz miejscowość / ulicę, jeśli znasz.`; b.disabled = false;
  }, err => { info.textContent = err.code===1 ? 'Brak zgody na lokalizację – wpisz miejsce ręcznie.' : 'Nie udało się ustalić lokalizacji – wpisz miejsce ręcznie.'; b.disabled = false; },
  {enableHighAccuracy: true, timeout: 15000, maximumAge: 60000});
});
document.addEventListener('click', e => { const t = e.target.closest('[data-accident]'); if (!t) return; e.preventDefault(); openAccident(t.dataset.accident); });

/* Druk zgłoszenia szkody (np. dla ubezpieczyciela): dane auta i polisy, kierowca z grafiku, opis, zdjęcia */
async function printAccident(id){
  const i = byId('issues', id); if (!i) return;
  const v = byId('vehicles', i.vehicleId) || {};
  const b = S.bookings.find(x => x.vehicleId===i.vehicleId && x.from<=i.date && x.to>=i.date);
  const row = (l, x) => x ? `<tr><th>${l}</th><td>${x}</td></tr>` : '';
  let el = $('#print-area'); if (!el){ el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); }
  el.innerHTML = `<div class="pa">
    <div class="pa-h"><div><b>Emage Group</b><span>Zgłoszenie szkody komunikacyjnej</span></div><div class="pa-r">Nr ${esc(String(i.id).slice(0, 8).toUpperCase())}<br>${fdate(i.date)}</div></div>
    <h1>${esc(i.title.replace(/^Szkoda:\s*/, ''))}</h1>
    <table class="pa-t">
      ${row('Pojazd', `${esc(v.plate || '')} · ${esc([v.make, v.model].filter(Boolean).join(' '))}${v.year ? ' · ' + esc(String(v.year)) : ''}`)}
      ${row('VIN', esc(v.vin || ''))}
      ${row('Ubezpieczyciel (OC)', esc([v.insurer, v.policyNo ? 'polisa ' + v.policyNo : ''].filter(Boolean).join(' · ')))}
      ${row('Polisa ważna do', v.policyUntil ? fdate(v.policyUntil) : '')}
      ${row('Kierowca (grafik)', b ? esc(crewName(b)) : '')}
      ${row('Licznik', i.km ? km(i.km) : '')}
      ${row('Status naprawy', esc({nowe:'zgłoszona', naprawa:'w naprawie', naprawione:'naprawiona'}[i.status] || i.status))}
    </table>
    <h2>Przebieg zdarzenia</h2><div class="pa-desc">${esc(i.description || '').replace(/\n/g, '<br>').replace(/https:\/\/maps\.google\.com\/\?q=[\d.,-]+/g, u => `<a href="${u}">${u}</a>`)}</div>
    ${i.repairNote ? `<h2>Naprawa</h2><div class="pa-desc">${esc(i.repairNote)}</div>` : ''}
    ${(i.photos || []).length ? `<h2>Zdjęcia (${i.photos.length})</h2><div class="pa-ph">${i.photos.map(p => `<img data-file="${esc(p)}" alt="Zdjęcie szkody">`).join('')}</div>` : ''}
    <div class="pa-sign"><div>Podpis kierowcy</div><div>Podpis kierownika floty</div></div>
    <p class="pa-f">Wygenerowano w Emage FLEET ${new Date().toLocaleString('pl-PL')}</p></div>`;
  try { await hydrateFiles(el); await Promise.all([...el.querySelectorAll('img')].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; setTimeout(r, 4000); }))); } catch(_){}
  document.documentElement.classList.add('print-doc');
  setTimeout(() => { window.print(); document.documentElement.classList.remove('print-doc'); }, 60);
}
document.addEventListener('click', e => { const t = e.target.closest('[data-print-acc]'); if (!t) return; e.preventDefault(); e.stopPropagation(); printAccident(t.dataset.printAcc); }, true);
