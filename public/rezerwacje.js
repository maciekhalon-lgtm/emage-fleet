/* Emage FLEET — grafik: kierowca, auto, trasa, uwagi na dany dzień */
'use strict';
function viewAssign(){
  const conf = conflicts();
  const add = canCreate('bookings') && P().bookings==='rw' ? `<button class="primary" data-new="bookings">${ic('plus')}Przydział</button>` : '';
  const more = (canCreate('bookings') && P().bookings==='rw' ? `<button data-action="copy-week">${ic('cal')}Kopiuj poprzedni tydzień</button>` : '')
    + (P().manage ? `<button data-day-plan>${ic('users')}Plan dnia do wysłania</button><button data-print-week>${ic('clip')}Drukuj tydzień</button>` : '');
  const head = `<div class="bar ${barOpen()}"><h2>Grafik</h2><div class="tools">${moreMenu(more)}${add}</div></div>`;
  const confNote = conf.size ? `<div class="notice err"><span>Konflikty w grafiku (${conf.size}): to samo auto u dwóch kierowców albo kierowca z dwoma autami tego samego dnia. Popraw przydziały zaznaczone na czerwono.</span></div>` : '';
  return `<div class="section">${head}${confNote}${viewSchedule()}${P().manage ? loadingsPanel() : ''}</div>`;
}
