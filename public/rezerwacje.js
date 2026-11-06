/* Emage FLEET — grafik: kierowca, auto, trasa, uwagi na dany dzień */
'use strict';
function viewAssign(){
  const conf = conflicts();
  const add = canCreate('bookings') && P().bookings==='rw' ? `<button class="primary" data-new="bookings">${ic('plus')}Przydział</button>` : '';
  const head = `<div class="bar"><h2>Grafik</h2><div class="tools">${add}</div></div>`;
  const confNote = conf.size ? `<div class="notice err"><span>Konflikty w grafiku (${conf.size}): to samo auto u dwóch kierowców albo kierowca z dwoma autami tego samego dnia. Popraw przydziały zaznaczone na czerwono.</span></div>` : '';
  const out = S.bookings.filter(b => holds(b));
  const nowPanel = out.length ? `<details class="panel fold"><summary class="sec-head"><h3>Teraz w trasie</h3><span class="count">${out.length}</span></summary><div class="dl">${out.map(b => `<div class="mini"><span>${vPlate(b.vehicleId)}</span>
      <span>${esc(crewName(b))}${b.routeId ? ' · ' + esc(rLabel(b.routeId)) : ''}</span><span class="mini-r">${handoverBtn(b)}</span></div>`).join('')}</div></details>` : '';
  return `<div class="section">${head}${confNote}${viewSchedule()}${P().manage ? loadingsPanel() : ''}${nowPanel}</div>`;
}
