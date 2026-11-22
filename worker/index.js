/* Emage FLEET – mały „pośrednik” na Cloudflare dla danych, których przeglądarka nie może pobrać sama (brak CORS):
   /api/fuel/orlen – hurtowe ceny oleju napędowego ORLEN (zł/m³ netto) z ostatnich 45 dni
   /api/fuel/eu    – plik Weekly Oil Bulletin Komisji Europejskiej (ceny paliw w krajach UE, co tydzień)
   Wszystko inne to zwykłe pliki strony z katalogu public/. Odpowiedzi trzymamy w pamięci podręcznej Cloudflare. */
const UA = {'User-Agent': 'Mozilla/5.0 (Emage FLEET)', 'Accept': 'application/json, */*'};
const EU_URL = 'https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx';

export default {
  async fetch(req, env, ctx){
    const u = new URL(req.url);
    if (u.pathname==='/api/fuel/orlen') return cached(req, ctx, 6 * 3600, orlen);
    if (u.pathname==='/api/fuel/orlen-raw'){ // diagnostyka: surowa odpowiedź API ORLEN (tylko ceny hurtowe)
      const q = u.searchParams.get('q') || 'Products'; if (!/^[A-Za-z]+(\?[\w=&:.\-%]*)?$/.test(q)) return json({error: 'q'}, 400);
      const r = await fetch('https://tool.orlen.pl/api/wholesalefuelprices/' + q, {headers: UA});
      return new Response(await r.text(), {status: r.status, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
    }
    if (u.pathname==='/api/fuel/eu') return cached(req, ctx, 12 * 3600, eu);
    return env.ASSETS.fetch(req);
  }
};

const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'Content-Type': 'application/json; charset=utf-8'}});

async function cached(req, ctx, ttl, fn){
  const cache = caches.default, key = new Request(new URL(req.url).origin + new URL(req.url).pathname);
  const hit = await cache.match(key); if (hit) return hit;
  let r;
  try { r = await fn(); } catch(e){ return json({error: String(e && e.message || e)}, 502); }
  if (!r.ok) return r;
  r = new Response(r.body, r); r.headers.set('Cache-Control', 'public, max-age=' + ttl);
  ctx.waitUntil(cache.put(key, r.clone()));
  return r;
}

async function orlen(){
  const base = 'https://tool.orlen.pl/api/wholesalefuelprices';
  const pr = await fetch(base + '/Products', {headers: UA});
  if (!pr.ok) throw new Error('ORLEN Products ' + pr.status);
  const prods = await pr.json();
  const txt = p => [p.name, p.symbol, p.nameEn].filter(Boolean).join(' ');
  const pick = prods.find(p => /ekodiesel/i.test(txt(p)) && !/arkty|grzew/i.test(txt(p))) || prods.find(p => /olej nap|diesel/i.test(txt(p)) && !/grzew/i.test(txt(p)));
  if (!pick) throw new Error('ORLEN: nie znaleziono oleju napędowego');
  const f = d => d.toISOString().slice(0, 10), to = new Date(), from = new Date(Date.now() - 45 * 864e5);
  const rr = await fetch(`${base}/ByProduct?productId=${pick.id}&from=${f(from)}&to=${f(to)}`, {headers: UA});
  if (!rr.ok) throw new Error('ORLEN ByProduct ' + rr.status);
  const rows = (await rr.json()) || [];
  return json({product: pick.name || pick.symbol, unit: 'zł/m³ netto',
    rows: (Array.isArray(rows) ? rows : rows.data || []).map(r => ({d: String(r.effectiveDate || r.date || '').slice(0, 10), v: Number(r.value)})).filter(r => r.d && r.v > 0),
    products: prods.map(txt)});
}

async function eu(){
  const r = await fetch(EU_URL, {headers: {'User-Agent': UA['User-Agent']}});
  if (!r.ok) throw new Error('EU Oil Bulletin ' + r.status);
  return new Response(r.body, {headers: {'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
}
