/* Emage FLEET — kalendarz: oś rezerwacji pojazdów na 14 dni */
'use strict';
const CAL_DAYS = 14;
const DOW = ['pn','wt','śr','cz','pt','so','nd'];
function mondayOf(iso){ const d = parse(iso); d.setDate(d.getDate() - (d.getDay()+6)%7); return isoOf(d); }
let calStart = mondayOf(today());

function viewCalendar(){
  const days = Array.from({length:CAL_DAYS}, (_,i) => addDays(calStart, i));
  const end = days[CAL_DAYS-1], t = today();
  const conf = conflicts();
  const dayCls = d => { const wd = (parse(d).getDay()+6)%7; return (wd>4?'we ':'') + (d===t?'today':''); };
  const nav = `<div class="cal-nav"><button class="small" data-cal="-7" aria-label="Poprzedni tydzień">‹</button><button class="small" data-cal="0">Dziś</button><button class="small" data-cal="7" aria-label="Następny tydzień">›</button><span class="label num">${fdate(calStart)} – ${fdate(end)}</span></div>`;
  const head = `<div class="cal-row cal-head"><div class="cal-label"></div><div class="cal-days">${days.map(d => { const dt = parse(d); return `<div class="cal-day ${dayCls(d)}"><span>${DOW[(dt.getDay()+6)%7]}</span><b class="num">${dt.getDate()}</b></div>`; }).join('')}</div></div>`;
  const vehs = S.vehicles.filter(v => v.status!=='wycofany').sort((a,b) => String(a.plate).localeCompare(b.plate));
  if (!vehs.length) return nav + `<div class="panel empty"><p>Dodaj pojazdy, aby zobaczyć kalendarz rezerwacji.</p></div>`;
  const rows = vehs.map(v => {
    const bs = S.bookings.filter(b => b.vehicleId===v.id && b.from<=end && b.to>=calStart);
    const bars = bs.map(b => {
      const s = Math.max(0, diffDays(calStart, b.from)), e = Math.min(CAL_DAYS-1, diffDays(calStart, b.to));
      const ed = canEditDoc('bookings', b);
      const tip = `${dName(b.driverId)} · ${fdate(b.from)}–${fdate(b.to)}${b.routeId?' · trasa '+rLabel(b.routeId):''}${b.purpose?' · '+b.purpose:''}`;
      return `<div class="cal-bar ${conf.has(b.id)?'bad':''} ${mine('bookings',b)?'mine':''} ${b.pickup&&!b.returned?'out':''} ${b.returned?'back':''}" style="grid-column:${s+1}/${e+2}" ${ed?`data-edit="bookings" data-id="${esc(b.id)}" tabindex="0"`:'data-noop="1"'} title="${esc(tip)}">${b.pickup&&!b.returned?'<i class="dot"></i>':''}<b>${esc(dName(b.driverId))}</b> <span>${esc(b.purpose||'')}</span></div>`;
    }).join('');
    const stop = stopIssue(v.id);
    const svc = v.status==='serwis' ? `<div class="cal-bar svc" data-noop="1" style="grid-column:1/-1">W serwisie${v.notes?' · '+esc(v.notes):''}</div>`
      : stop ? `<div class="cal-bar svc" data-noop="1" style="grid-column:1/-1">Niesprawny · ${esc(stop.title)}</div>` : '';
    return `<div class="cal-row"><div class="cal-label">${plate(v.plate)}<span class="sub">${esc(v.make+' '+v.model)}</span></div>
      <div class="cal-lane" ${canCreate('bookings')?`data-cal-lane="${esc(v.id)}" title="Kliknij dzień, aby zarezerwować"`:''}>
        <div class="cal-bg">${days.map(d => `<div class="${dayCls(d)}"></div>`).join('')}</div>
        <div class="cal-bars">${svc}${bars}</div>
      </div></div>`;
  }).join('');
  return nav + `<div class="panel cal"><div class="cal-inner">${head}${rows}</div></div>
    <p class="muted" style="margin:0;font-size:13px">${canCreate('bookings')?'Kliknij wolny dzień w wierszu auta, aby dodać rezerwację. ':''}<span class="key mine"></span> Twoje rezerwacje · <span class="key bad"></span> konflikt terminów · <i class="dot"></i> auto wydane</p>`;
}

function calLaneClick(lane, ev){
  const r = lane.getBoundingClientRect();
  const idx = Math.max(0, Math.min(CAL_DAYS-1, Math.floor((ev.clientX - r.left) / r.width * CAL_DAYS)));
  const d = addDays(calStart, idx);
  openForm('bookings', null, {vehicleId: lane.dataset.calLane, from: d, to: d});
}
