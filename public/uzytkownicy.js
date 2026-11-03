/* Emage FLEET — użytkownicy: zatwierdzanie kont, role, powiązanie z kierowcą, blokowanie */
'use strict';
const STATUS = {pending:{l:'Oczekuje', cls:'warn'}, active:{l:'Aktywne', cls:'ok'}, blocked:{l:'Zablokowane', cls:'bad'}};
const pendingUsers = () => profiles.filter(p => p.status==='pending');
const pendingChoice = {};   // wybór roli/kierowcy dla oczekujących, zanim kliknie się „Zatwierdź”

function viewWaiting(){
  if (!me) return `<div class="panel empty"><p>Logowanie…</p></div>`;
  const name = esc(me.full_name || me.email);
  if (me.status==='blocked') return `<div class="panel empty wait"><h2>Konto zablokowane</h2><p>Konto <b>${esc(me.email)}</b> zostało zablokowane. Jeśli to pomyłka, skontaktuj się z kierownikiem floty.</p><button data-action="logout">Wyloguj się</button></div>`;
  return `<div class="panel empty wait"><h2>Konto czeka na zatwierdzenie</h2>
    <p>Dzień dobry, ${name}. Kierownik floty widzi już Twoje konto na liście i nada Ci rolę. Strona odblokuje się sama, gdy to zrobi – nie musisz jej odświeżać.</p>
    <button data-action="logout">Wyloguj się</button></div>`;
}

function driverSelect(p, disabled){
  const cur = p.status==='pending' ? ((pendingChoice[p.id]||{}).drv ?? (p.driver_id||'')) : (p.driver_id||'');
  const opts = [['','— bez powiązania —'], ['__new','+ utwórz wpis kierowcy: '+(p.full_name || p.email)], ...S.drivers.slice().sort((a,b) => a.name.localeCompare(b.name,'pl')).map(d => [d.id, d.name])];
  return `<select id="drv-${esc(p.id)}" data-drv-for="${esc(p.id)}" ${disabled?'disabled':''} aria-label="Powiązany kierowca">${opts.map(([v,l]) => `<option value="${esc(v)}" ${cur===v?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
}
function roleSelect(p, disabled){
  const cur = p.status==='pending' ? ((pendingChoice[p.id]||{}).role ?? (p.role||'')) : (p.role||'');
  return `<select id="role-${esc(p.id)}" data-role-for="${esc(p.id)}" ${disabled?'disabled':''} aria-label="Rola"><option value="">— wybierz rolę —</option>${Object.entries(ROLES).map(([k,r]) => `<option value="${k}" ${cur===k?'selected':''}>${esc(r.name)}</option>`).join('')}</select>`;
}

function viewUsers(){
  const order = {pending:0, active:1, blocked:2};
  const list = profiles.slice().sort((a,b) => order[a.status]-order[b.status] || String(a.full_name||a.email).localeCompare(b.full_name||b.email,'pl'));
  const rows = list.map(p => {
    const isMe = p.id===myId, st = STATUS[p.status] || STATUS.pending;
    const act = isMe ? '<span class="muted small">to Ty</span>'
      : p.status==='pending' ? `<button class="small primary" data-approve="${esc(p.id)}">Zatwierdź</button><button class="small danger" data-block="${esc(p.id)}">Odrzuć</button>`
      : p.status==='active' ? `<button class="small danger" data-block="${esc(p.id)}">Zablokuj</button>`
      : `<button class="small" data-unblock="${esc(p.id)}">Odblokuj</button>`;
    return `<tr>
      <td><b>${esc(p.full_name || '—')}</b>${isMe?' <span class="muted">(Ty)</span>':''}<span class="sub">${esc(p.email)}</span><span class="sub">Konto od ${fdate((p.created_at||'').slice(0,10))}</span></td>
      <td><span class="pill ${st.cls}">${st.l}</span></td>
      <td style="min-width:180px">${roleSelect(p, isMe || p.status==='blocked')}</td>
      <td style="min-width:200px">${(p.role==='kierowca' || (p.status==='pending' && (pendingChoice[p.id]||{}).role!=='floty' && (pendingChoice[p.id]||{}).role!=='serwisu')) ? driverSelect(p, isMe || p.status==='blocked') : '<span class="muted">—</span>'}${p.role==='kierowca' && !p.driver_id && p.status==='active' ? '<span class="sub" style="color:var(--warn)">Powiąż, aby mógł rezerwować i tankować</span>' : ''}</td>
      <td><div class="row-act">${act}</div></td></tr>`;
  }).join('');
  const pend = pendingUsers().length;
  return `<div class="section">
    <div class="bar"><h2>Użytkownicy i role</h2>${pend ? `<span class="pill warn">${pend} ${isPlural(pend,'konto czeka','konta czekają','kont czeka')} na zatwierdzenie</span>` : ''}</div>
    <div class="panel tablewrap"><table><thead><tr><th>Osoba</th><th>Status</th><th>Rola</th><th>Powiązany kierowca</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="muted">Nikt się jeszcze nie zarejestrował. Wyślij pracownikom adres strony – po rejestracji pojawią się tutaj.</td></tr>'}</tbody></table></div>
    ${pushSetupPanel()}
    ${checklistPanel()}
    <div class="panel roles">${Object.values(ROLES).map(r => `<div><b>${esc(r.name)}</b><span class="sub">${esc(r.desc)}</span></div>`).join('')}</div>
    <p class="muted small" style="margin:0;max-width:80ch">Nowa osoba rejestruje się sama na stronie i potwierdza adres e-mail. Do czasu zatwierdzenia nie widzi żadnych danych. Kierowcę powiąż z jego wpisem na liście kierowców – wtedy jego tankowania i rezerwacje przypiszą się automatycznie.</p>
  </div>`;
}

async function profileUpdate(id, body, okMsg){
  try {
    const {error, count} = await sb.from('profiles').update(body, {count:'exact'}).eq('id', id);
    if (error) throw dbErr(error);
    if (!count) throw {code:'invalid_argument'};
    await refresh('members'); toast(okMsg);
  } catch(err){ handleWriteErr(err); }
}
async function ensureDriverFor(p){
  const ref = db.collection('drivers').doc();
  await ref.set({name: p.full_name || p.email});
  return ref.id;
}
async function approveUser(id){
  const p = profiles.find(x => x.id===id); if (!p) return;
  const role = $('#role-'+id)?.value, drv = $('#drv-'+id)?.value || '';
  if (!role){ toast('Najpierw wybierz rolę'); $('#role-'+id)?.focus(); return; }
  let driver_id = null;
  try { driver_id = drv==='__new' ? await ensureDriverFor(p) : (drv || null); } catch(err){ return handleWriteErr(err); }
  if (role==='kierowca' && !driver_id) toast('Zatwierdzono bez powiązania z kierowcą – możesz to uzupełnić później');
  await profileUpdate(id, {status:'active', role, driver_id: role==='kierowca' ? driver_id : null, approved_at:new Date().toISOString(), approved_by:myId}, 'Zatwierdzono konto: '+(p.full_name||p.email));
}
async function setRole(id, role){
  const p = profiles.find(x => x.id===id); if (!p) return;
  if (p.status==='pending'){ pendingChoice[id] = {...pendingChoice[id], role}; schedule(); return; }
  if (p.status!=='active' || !role) return;
  await profileUpdate(id, {role, driver_id: role==='kierowca' ? p.driver_id : null}, 'Zmieniono rolę na: '+ROLES[role].name);
}
async function setDriverLink(id, value){
  const p = profiles.find(x => x.id===id); if (!p) return;
  if (p.status==='pending'){ pendingChoice[id] = {...pendingChoice[id], drv:value}; return; }
  let driver_id = value || null;
  try { if (value==='__new') driver_id = await ensureDriverFor(p); } catch(err){ return handleWriteErr(err); }
  await profileUpdate(id, {driver_id}, driver_id ? 'Powiązano z kierowcą' : 'Usunięto powiązanie');
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-approve],[data-block],[data-unblock]'); if (!a) return;
  if (a.dataset.approve) return approveUser(a.dataset.approve);
  if (a.dataset.block) return profileUpdate(a.dataset.block, {status:'blocked'}, 'Zablokowano konto');
  if (a.dataset.unblock){ const p = profiles.find(x => x.id===a.dataset.unblock); return profileUpdate(a.dataset.unblock, {status: p && p.role ? 'active' : 'pending'}, 'Odblokowano konto'); }
});
