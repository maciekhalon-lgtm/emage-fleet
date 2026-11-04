/* Emage FLEET — pojazdy: lista pojazdów */
'use strict';
function viewVehicles(){
  const head = `<div class="bar"><h2>Pojazdy</h2><div class="tools"><input class="search" id="search" type="search" placeholder="Szukaj: rejestracja, marka…" value="${esc(q)}" aria-label="Szukaj pojazdu">${canCreate('vehicles')?'<button data-action="open-import">Import z Excela</button><button class="primary" data-new="vehicles">+ Dodaj pojazd</button>':''}</div></div>`;
  if (!S.vehicles.length) return head + loadingOr('vehicles', emptyBlock('Brak pojazdów w ewidencji','Dodaj pierwszy pojazd – numer rejestracyjny, markę i przebieg. Potem przypiszesz kierowców, terminy przeglądów i koszty.','<button class="primary" data-new="vehicles">+ Dodaj pojazd</button>', (canCreate('vehicles')?'<button data-action="open-import">Importuj z Excela</button>':''), 'vehicles'));
  const ql = q.toLowerCase();
  const list = S.vehicles.filter(v => !ql || [v.plate,v.make,v.model,v.vin,respNames(v)].join(' ').toLowerCase().includes(ql))
    .sort((a,b)=> (a.status==='wycofany') - (b.status==='wycofany') || String(a.plate).localeCompare(b.plate));
  const rows = list.map(v => {
    const st = vehicleState(v); const nd = nextDeadline(v.id); const ds = nd && dlState(nd);
    return `<tr class="click" data-card="${esc(v.id)}" tabindex="0" title="Otwórz kartę pojazdu">
      <td>${plate(v.plate)}</td>
      <td><b>${esc(v.make)} ${esc(v.model)}</b><span class="sub">${esc([v.year, v.fuel].filter(Boolean).join(' · '))}${v.hasTacho ? ' · tachograf' : ''}${v.tires ? ' · opony ' + TIRES[v.tires].toLowerCase() : ''}</span></td>
      <td class="r num">${km(v.km)}</td>
      <td>${respOf(v).length?esc(respNames(v)):'<span class="muted">—</span>'}</td>
      <td><span class="pill ${st.cls}">${esc(st.txt)}</span></td>
      <td>${nd?`<span class="pill ${ds.cls}">${esc(nd.type)}</span><span class="sub num">${fdate(nd.date)} · ${esc(ds.txt.toLowerCase())}</span>`:'<span class="muted">brak terminów</span>'}</td>
    </tr>`; }).join('');
  return head + `<div class="panel tablewrap"><table><thead><tr><th>Rejestracja</th><th>Pojazd</th><th class="r">Przebieg</th><th>Odpowiedzialni</th><th>Status</th><th>Najbliższy termin</th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="muted">Brak pojazdów pasujących do „${esc(q)}”.</td></tr>`}</tbody></table></div>`;
}

