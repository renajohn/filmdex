// Searches ricardo.ch for every album of the CD wish list and groups the hits
// by seller. Runs INSIDE a ricardo.ch tab (javascript_tool): Cloudflare blocks
// server-side requests, but same-origin fetches from a tab that passed the
// challenge get the real search page.
//
// Before injecting, replace __WISHLIST__ with a JSON array of
// { id, artist, title } objects. The last expression is the result.
//
// Only search pages are fetched. Article pages answer 429 + captcha to
// fetch(), so seller nicknames are not available: sellers are grouped by id.

(async () => {
  const wishlist = __WISHLIST__;
  const DELAY_MS = 1200;

  const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'le', 'la', 'les',
    'l', 'de', 'des', 'du', 'et', 'un', 'une', 's', 'what', 'on']);
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = s => norm(s).split(' ').filter(t => t && !STOP.has(t));
  const hasAll = (hay, toks) => toks.length > 0 && toks.every(t => hay.includes(` ${t} `));

  // The search data lives in the React Server Components payload, pushed by
  // inline scripts as JSON string literals.
  const rsc = html => [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
    .map(m => { try { return JSON.parse(m[1]); } catch { return ''; } }).join('');

  // The main result list is the first "articles" after "facetCountAccuracy".
  // A later one, under "suggestedRefinements", holds results for a broadened
  // query when nothing matched: that one is noise and is skipped.
  function mainArticles(payload) {
    const k = payload.indexOf('"facetCountAccuracy"');
    if (k < 0) return null;
    const start = payload.indexOf('"articles":', k) + '"articles":'.length;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < payload.length; i++) {
      const c = payload[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '[') depth++;
      else if (c === ']' && --depth === 0) return JSON.parse(payload.slice(start, i + 1));
    }
    return null;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hits = [];
  const failures = [];

  for (const album of wishlist) {
    const query = `${album.artist} ${album.title}`;
    const res = await fetch(`/fr/s/${encodeURIComponent(norm(query))}/`);
    const html = await res.text();
    const articles = res.ok ? mainArticles(rsc(html)) : null;
    if (!articles) { failures.push({ album: query, status: res.status }); await sleep(DELAY_MS * 3); continue; }

    // hrefs come HTML-escaped: "We Can't Dance" is written we-can&#x27;t-dance.
    const unescape = s => s.replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
    const hrefs = Object.fromEntries([...html.matchAll(/href="(\/fr\/a\/[^"]*-(\d+)\/)"/g)].map(m => [m[2], unescape(m[1])]));
    const artistToks = tokens(album.artist);
    const titleToks = tokens(album.title);

    for (const a of articles) {
      const hay = ` ${norm(a.title)} `;
      const isCd = a.productTypeKey === 'cd' || (!a.productTypeKey && /\bcds?\b/.test(hay));
      if (!isCd || !hasAll(hay, artistToks)) continue;
      const exact = hasAll(hay, titleToks);
      // Artist without the album title: a lot or a compilation, worth a look.
      const lot = !exact && /\b(lot|cds|sammlung|collection|konvolut)\b/.test(hay);
      if (!exact && !lot) continue;
      hits.push({
        wishId: album.id, album: query, match: exact ? 'exact' : 'lot',
        id: a.id, title: a.title, sellerId: a.sellerId,
        price: a.buyNowPrice ?? a.bidPrice, buyNow: a.hasBuyNow, auction: a.hasAuction,
        bids: a.bidsCount, shipping: a.shipping?.[0]?.cost ?? null,
        city: a.shipping?.[0]?.city ?? null, endDate: a.endDate, condition: a.conditionKey,
        url: `https://www.ricardo.ch${hrefs[a.id] || `/fr/a/${a.id}/`}`,
      });
    }
    await sleep(DELAY_MS);
  }

  const bySeller = {};
  for (const h of hits) (bySeller[h.sellerId] ??= []).push(h);
  const sellers = Object.entries(bySeller)
    .map(([sellerId, items]) => {
      const exact = items.filter(i => i.match === 'exact');
      // Shipping is counted per article: many sellers write "pas de commandes
      // groupées", and the search data cannot tell which ones do. A seller who
      // does combine is a good surprise, not a bad one.
      const cheapestPerAlbum = Object.values(exact.reduce((acc, i) => {
        const cost = (i.price || 0) + (i.shipping || 0);
        if (!acc[i.wishId] || cost < acc[i.wishId].cost) acc[i.wishId] = { ...i, cost };
        return acc;
      }, {}));
      const total = cheapestPerAlbum.reduce((s, i) => s + i.cost, 0);
      return { sellerId, albums: cheapestPerAlbum.length, lots: items.length - exact.length,
        total: Math.round(total * 100) / 100,
        perAlbum: cheapestPerAlbum.length ? Math.round(total / cheapestPerAlbum.length * 100) / 100 : null,
        items };
    })
    .sort((x, y) => y.albums - x.albums || x.total - y.total);

  return JSON.stringify({ searched: wishlist.length, failures, sellers });
})()
