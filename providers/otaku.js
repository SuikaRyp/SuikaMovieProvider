var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID)
  ? String(__SOURCE_ID) : 'Otaku';

var SITE = 'https://otakotaku.com';
var UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/120.0.0.0 Mobile Safari/537.36';

function getInfo() {
  return { name: 'OtakuNime', lang: 'zh', baseUrl: SITE,
    logo: SITE + '/favicon.ico', type: 'anime', version: '1.0.8' };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function _get(url) {
  return fetch(url, { headers: {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': SITE + '/'
  } }).then(function (r) { return r.body || ''; }).catch(function () { return ''; });
}

function _decode(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); });
}

function _text(html) {
  var t = _decode(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
  return t || null;
}

function _attr(tag, name) {
  var m = String(tag || '').match(new RegExp('\\s' + name + '\\s*=\\s*"([^"]*)"', 'i'))
    || String(tag || '').match(new RegExp("\\s" + name + "\\s*=\\s*'([^']*)'", 'i'));
  return m ? _decode(m[1]) : null;
}

function _abs(href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.indexOf('//') === 0) return 'https:' + href;
  return SITE + (href.charAt(0) === '/' ? href : '/' + href);
}

// "/anime/view/3461/hirayasumi" -> "3461/hirayasumi"
function _idFromUrl(url) {
  var m = String(url || '').match(/\/anime\/view\/(\d+)(?:\/([^\/?#]*))?/);
  return m ? (m[1] + '/' + (m[2] || 'x')) : null;
}

function _cardsFrom(html) {
  var parts = String(html || '').split(/<div[^>]*class="[^"]*\banime-list\b[^"]*"[^>]*>/i);
  var out = [], seen = {};
  for (var i = 1; i < parts.length; i++) {
    var p = parts[i].slice(0, 6000);
    var hm = p.match(/class="[^"]*anime-img[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"/i);
    if (!hm) continue;
    var id = _idFromUrl(hm[1]);
    if (!id || seen[id]) continue;
    seen[id] = 1;
    var tm = p.match(/class="[^"]*anime-title[^"]*"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    var im = p.match(/class="[^"]*anime-img[^"]*"[\s\S]*?(<img[^>]*>)/i);
    var img = im ? im[1] : '';
    var title = tm ? _text(tm[1]) : null;
    if (!title) title = (_attr(img, 'alt') || '').replace(/^Gambar\s+/, '') || null;
    var cover = _attr(img, 'data-src') || _attr(img, 'src');
    out.push({ id: id, title: title || id, cover: cover ? _abs(cover) : null,
      url: id, type: 'anime', sourceId: SOURCE_ID });
  }
  return out;
}

// ── Listings ─────────────────────────────────────────────────────────────────
function getHome(opts) {
  return Promise.all([_get(SITE + '/'), _get(SITE + '/anime/feed')]).then(function (res) {
    var home = _cardsFrom(res[0]);
    var feed = _cardsFrom(res[1]);
    var rows = [
      { title: 'Terbaru', items: feed.length ? feed : home },
      { title: 'Populer', items: home }
    ];
    return rows.filter(function (r) { return r.items.length; });
  }).catch(function () { return []; });
}

function popular(opts) {
  return getHome(opts).then(function (rows) { return rows.length ? rows[rows.length - 1].items : []; });
}

function search(query, page, opts) {
  var q = String(query || '').trim();
  if (!q) return Promise.resolve([]);
  var enc = encodeURIComponent(q);
  var paths = ['/search?q=' + enc, '/?s=' + enc, '/anime/search?q=' + enc];
  var i = 0;
  function next() {
    if (i >= paths.length) return Promise.resolve([]);
    return _get(SITE + paths[i++]).then(function (html) {
      var items = _cardsFrom(html);
      return items.length ? items : next();
    });
  }
  return next();
}

// ── Detail ───────────────────────────────────────────────────────────────────
function getDetail(url, opts) {
  var id = String(url || '');
  var path = /^https?:\/\//i.test(id) ? id
    : (/^\d+/.test(id) ? SITE + '/anime/view/' + (id.indexOf('/') > 0 ? id : id + '/x') : SITE + id);
  return _get(path).then(function (html) {
    var h1 = html.match(/<h1[^>]*id="judul_anime"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    var title = h1 ? _text(h1[1]) : null;

    var cm = html.match(/class="[^"]*cover-content[^"]*"[\s\S]*?(<img[^>]*>)/i);
    var cover = cm ? (_attr(cm[1], 'src') || _attr(cm[1], 'data-src')) : null;
    if (!cover) {
      var og = html.match(/<meta[^>]+property="og:image"[^>]*>/i);
      cover = og ? _attr(og[0], 'content') : null;
    }

    var dm = html.match(/<meta[^>]+name="description"[^>]*>/i);
    var desc = dm ? _attr(dm[0], 'content') : null;
    if (desc) desc = desc.replace(/^Sinopsis\s+[^:]+:\s*/i, '').trim();

    var tbl = html.match(/<table[^>]*class="[^"]*table-detail[^"]*"[\s\S]*?<\/table>/i);
    var tb = tbl ? tbl[0] : '';
    var genres = [], studios = [], m;
    var gre = /<a[^>]+href="[^"]*\/anime\/genre\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = gre.exec(tb)) !== null) { var g = _text(m[1]); if (g && genres.indexOf(g) < 0) genres.push(g); }
    var sre = /<a[^>]+href="[^"]*\/anime\/producer\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = sre.exec(tb)) !== null) { var s = _text(m[1]); if (s && studios.indexOf(s) < 0) studios.push(s); }

    var info = {}, rre = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    while ((m = rre.exec(tb)) !== null) {
      var tds = m[1].match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
      if (tds.length < 2) continue;
      var label = (_text(tds[0]) || '').replace(/:$/, '').toLowerCase().replace(/\s+/g, '_');
      var val = _text(tds[1]);
      if (label && val && val !== '-') info[label] = val;
    }
    var sc = html.match(/class="[^"]*skor_anime[^"]*"[^>]*>([\s\S]*?)<\//i);
    var score = sc ? parseFloat(_text(sc[1])) : NaN;
    var yr = (info.tayang || '').match(/(19|20)\d{2}/);

    return {
      id: id, title: title || id, englishTitle: null, cover: cover ? _abs(cover) : null,
      url: id, description: desc || '', status: info.status || 'unknown',
      genres: genres, studios: studios, type: 'anime', sourceId: SOURCE_ID,
      year: yr ? parseInt(yr[0], 10) : null, malId: null,
      score: isNaN(score) ? null : score,
      episodes: [], subCount: 0, dubCount: 0
    };
  });
}

function getEpisodes(url, opts) {
  return Promise.resolve([]);
}

function getVideoSources(episodeUrl) {
  return Promise.reject(new Error('OtakuNime: situs ini hanya katalog, tidak menyediakan video'));
}
