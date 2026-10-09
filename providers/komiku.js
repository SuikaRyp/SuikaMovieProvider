var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID)
  ? String(__SOURCE_ID) : 'komiku';

var SITE = 'https://komiku.org';
var API = 'https://api.komiku.org';
var UA = 'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/124.0.0.0 Mobile Safari/537.36';

function getInfo() {
  return { name: 'Komiku', lang: 'id', baseUrl: SITE,
    logo: SITE + '/favicon.ico', type: 'movie', version: '1.0.0' };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function _get(url, ref) {
  return fetch(url, { headers: {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    'Referer': ref || SITE + '/'
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
  href = String(href).trim();
  if (/^https?:\/\//i.test(href)) return href;
  if (href.indexOf('//') === 0) return 'https:' + href;
  return SITE + (href.charAt(0) === '/' ? href : '/' + href);
}

// Placeholder lazy-load Komiku (asset/img/lazy.jpg) bukan cover sungguhan.
function _isLazy(u) { return !u || /\/lazy\.(jpe?g|png|gif|webp)/i.test(u) || /^data:/i.test(u); }

function _img(tag) {
  var cands = [_attr(tag, 'data-src'), _attr(tag, 'data-lazy-src'), _attr(tag, 'src')];
  for (var i = 0; i < cands.length; i++) { if (cands[i] && !_isLazy(cands[i])) return _abs(cands[i]); }
  return null;
}

function _uniq(arr) {
  var out = [], seen = {};
  for (var i = 0; i < arr.length; i++) { if (arr[i] && !seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); } }
  return out;
}

// "https://komiku.org/manga/one-piece/" | "/manga/one-piece/" | "one-piece" -> "one-piece"
function _slug(u) {
  var s = String(u || '');
  var m = s.match(/\/manga\/([^\/?#]+)/i);
  if (m) return m[1];
  if (/^https?:\/\//i.test(s)) return null;
  s = s.replace(/^\/+|\/+$/g, '');
  return s && s.indexOf('/') < 0 ? s : null;
}

// "https://komiku.org/one-piece-chapter-1100/" -> "one-piece-chapter-1100"
function _chSlug(u) {
  var m = String(u || '').match(/^(?:https?:\/\/[^\/]+)?\/?([^\/?#]*-chapter-[^\/?#]*)/i);
  return m ? m[1] : null;
}

function _cleanTitle(t) {
  return String(t || '').replace(/^\s*(?:Baca\s+)?(?:Komik|Manga|Manhwa|Manhua)\s+/i, '')
    .replace(/\s+Bahasa\s+Indonesia\s*$/i, '').replace(/\s+/g, ' ').trim();
}

function _imgAltTitle(tag) {
  var alt = _attr(tag, 'alt') || _attr(tag, 'title') || '';
  return _cleanTitle(alt.replace(/^\s*Baca\s+(?:Komik\s+)?(?:Manga|Manhwa|Manhua)?\s*/i, ''));
}

// Semua tautan /manga/<slug>/ pada halaman -> kartu unik (gabung judul, cover, chapter).
function _cardsFrom(html) {
  var out = [], idx = {};
  var re = /<a\b([^>]*?)href="([^"]*\/manga\/[^"\/?#]+\/?[^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi, m;
  while ((m = re.exec(String(html || ''))) !== null) {
    var slug = _slug(m[2]);
    if (!slug || slug === 'page') continue;
    var inner = m[4];
    var imTag = (inner.match(/<img\b[^>]*>/i) || [''])[0];
    var cover = imTag ? _img(imTag) : null;
    var hm = inner.match(/<h[2-5][^>]*>([\s\S]*?)<\/h[2-5]>/i);
    var title = hm ? _cleanTitle(_text(hm[1])) : '';
    if (!title) title = _cleanTitle(_attr(m[1] + ' ' + m[3], 'title') || '');
    if (!title && imTag) title = _imgAltTitle(imTag);
    if (!title && !imTag) title = _cleanTitle(_text(inner) || '');
    var at = idx[slug];
    if (!at) {
      at = { id: slug, title: '', cover: null, url: slug, type: 'movie', sourceId: SOURCE_ID };
      idx[slug] = at; out.push(at);
    }
    if (title && (!at.title || title.length > at.title.length)) at.title = title;
    if (cover && !at.cover) at.cover = cover;
  }
  var res = [];
  for (var i = 0; i < out.length; i++) {
    if (out[i].title && out[i].title.length > 1) res.push(out[i]);
  }
  return res;
}

// ── Listings ─────────────────────────────────────────────────────────────────
function getHome(opts) {
  return Promise.all([
    _get(SITE + '/'),
    _get(SITE + '/p/ranking/'),
    _get(SITE + '/p/trending/')
  ]).then(function (res) {
    var latest = _cardsFrom(res[0]).slice(0, 30);
    var rank = _cardsFrom(res[1]).slice(0, 30);
    var trend = _cardsFrom(res[2]).slice(0, 30);
    var rows = [
      { title: 'Terbaru', items: latest },
      { title: 'Peringkat', items: rank.length ? rank : latest },
      { title: 'Trending', items: trend.length ? trend : rank }
    ];
    return rows.filter(function (r) { return r.items.length; });
  }).catch(function () { return []; });
}

function popular(opts) {
  return _get(SITE + '/p/ranking/').then(function (html) {
    var items = _cardsFrom(html).slice(0, 30);
    if (items.length) return items;
    return getHome(opts).then(function (rows) { return rows.length ? rows[0].items : []; });
  }).catch(function () { return []; });
}

function search(query, page, opts) {
  var q = String(query || '').trim();
  if (!q) return Promise.resolve([]);
  var enc = encodeURIComponent(q);
  var pg = parseInt(page, 10) > 1 ? parseInt(page, 10) : 1;
  var urls = [
    SITE + '/?post_type=manga&s=' + enc,
    API + '/?post_type=manga&s=' + enc
  ];
  if (pg > 1) urls = [
    SITE + '/page/' + pg + '/?post_type=manga&s=' + enc,
    API + '/page/' + pg + '/?post_type=manga&s=' + enc
  ];
  var i = 0;
  function next() {
    if (i >= urls.length) return Promise.resolve([]);
    return _get(urls[i++]).then(function (html) {
      var items = _cardsFrom(html).slice(0, 40);
      return items.length ? items : next();
    });
  }
  return next().catch(function () { return []; });
}

// ── Detail ───────────────────────────────────────────────────────────────────
function getDetail(url, opts) {
  var id = String(url || '');
  var slug = _slug(id);
  var path = /^https?:\/\//i.test(id) ? id
    : (slug ? SITE + '/manga/' + slug + '/' : _abs(id));
  return _get(path).then(function (html) {
    var h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    var title = h1 ? _cleanTitle(_text(h1[1])) : null;

    var og = html.match(/<meta[^>]+property="og:image"[^>]*>/i);
    var cover = og ? _attr(og[0], 'content') : null;
    if (!cover || _isLazy(cover)) {
      var im = html.match(/class="[^"]*\b(?:ims|thumb)\b[^"]*"[\s\S]*?(<img[^>]*>)/i);
      cover = im ? _img(im[1]) : null;
    }

    var syn = html.match(/<(?:p|div|section)[^>]*class="[^"]*\b(?:desc|entry-content-single|sinopsis)\b[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|section)>/i)
      || html.match(/<(?:p|div|section)[^>]*id="Sinopsis"[^>]*>([\s\S]*?)<\/(?:p|div|section)>/i);
    var desc = syn ? _text(syn[1]) : null;
    if (!desc) {
      var dm = html.match(/<meta[^>]+name="description"[^>]*>/i);
      desc = dm ? _attr(dm[0], 'content') : null;
    }

    // Tabel info: <tr><td>Label</td><td>Nilai</td></tr>  (juga bentuk "Label: Nilai")
    var info = {}, m;
    var rre = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    while ((m = rre.exec(html)) !== null) {
      var tds = m[1].match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
      if (tds.length < 2) continue;
      var label = (_text(tds[0]) || '').replace(/:$/, '').toLowerCase().replace(/\s+/g, '_');
      var val = _text(tds[1]);
      if (label && val && val !== '-') info[label] = val;
    }
    var sre = /<span[^>]*>([^<:]{2,30}):\s*([^<]{1,200})<\/span>/gi;
    while ((m = sre.exec(html)) !== null) {
      var k2 = (_text(m[1]) || '').toLowerCase().replace(/\s+/g, '_');
      var v2 = _text(m[2]);
      if (k2 && v2 && !info[k2]) info[k2] = v2;
    }

    var genres = [];
    var gre = /<a[^>]+href="[^"]*\/(?:genre|genres)\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = gre.exec(html)) !== null) { var g = _text(m[1]); if (g && genres.indexOf(g) < 0) genres.push(g); }

    // Daftar chapter: semua tautan *-chapter-*, unik, urut naik per nomor.
    var chs = [], seen = {};
    var cre = /<a\b([^>]*?)href="([^"]*-chapter-[^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi;
    while ((m = cre.exec(html)) !== null) {
      var abs = _abs(m[2]);
      var cslug = _chSlug(abs);
      if (!abs || !cslug || seen[cslug]) continue;
      seen[cslug] = 1;
      var label2 = _text(m[4]) || _attr(m[1] + ' ' + m[3], 'title') || '';
      var nm = (label2.match(/chapter\s*(\d+(?:[.,]\d+)?)/i) || cslug.match(/-chapter-(\d+(?:[-.]\d+)?)/i) || [])[1];
      var num = nm ? parseFloat(String(nm).replace(',', '.').replace('-', '.')) : NaN;
      chs.push({ id: cslug, number: num, title: label2, url: abs, _o: chs.length });
    }
    // Situs menampilkan chapter terbaru di atas; balik jika tidak ada nomor yang bisa dipakai.
    chs.sort(function (a, b) {
      var an = isNaN(a.number) ? null : a.number, bn = isNaN(b.number) ? null : b.number;
      if (an !== null && bn !== null && an !== bn) return an - bn;
      return b._o - a._o;
    });
    var episodes = [];
    for (var i = 0; i < chs.length; i++) {
      var n = isNaN(chs[i].number) ? (i + 1) : chs[i].number;
      episodes.push({ id: chs[i].id, number: n,
        title: chs[i].title || ('Chapter ' + n), url: chs[i].url });
    }

    var typ = '';
    var tm = html.match(/\/(manga|manhwa|manhua)\.(?:png|webp|svg)|(?:^|[^a-z])(Manga|Manhwa|Manhua)(?:[^a-z]|$)/);
    if (tm) typ = (tm[1] || tm[2] || '').toLowerCase();
    var yr = (info.tanggal_rilis || info.rilis || info.terbit || '').match(/(19|20)\d{2}/);
    var st = info.status || info.status_komik || 'unknown';

    return {
      id: slug || id, title: title || slug || id, englishTitle: null,
      cover: cover ? _abs(cover) : null, url: slug || id,
      description: desc || '', status: st, genres: _uniq(genres).slice(0, 12), studios: [],
      type: 'movie', sourceId: SOURCE_ID, year: yr ? parseInt(yr[0], 10) : null,
      comicType: typ || null, info: info,
      episodes: episodes, subCount: episodes.length, dubCount: 0
    };
  });
}

function getEpisodes(url, opts) { return getDetail(url, opts).then(function (d) { return d.episodes; }); }

// ── Pages (chapter reader) ───────────────────────────────────────────────────
// Satu entri per halaman gambar, urut sesuai halaman. Header Referer wajib
// agar CDN gambar Komiku tidak menolak hotlink.
function _pageOk(u) {
  if (!u || _isLazy(u)) return false;
  if (/(^|[\/_\-.])(logo|favicon|avatar|banner|ads?|placeholder|loading|icon)([\/_\-.]|$)/i.test(u)) return false;
  return true;
}

function _pageImages(html) {
  var h = String(html || '');
  var zone = h.match(/id="(?:Baca_Komik|baca-comic|readerarea|chimg)"[\s\S]*?(?=<footer|id="Komentar"|class="[^"]*\bnavig|$)/i);
  var scope = zone ? zone[0] : '';
  var out = [], m, re = /<img\b[^>]*>/gi;
  while ((m = re.exec(scope)) !== null) {
    var u = _img(m[0]);
    if (_pageOk(u)) out.push(u);
  }
  if (out.length < 2) {
    out = [];
    re = /<img\b[^>]*>/gi;
    while ((m = re.exec(h)) !== null) {
      var u2 = _img(m[0]);
      if (_pageOk(u2)) out.push(u2);
    }
  }
  return _uniq(out);
}

function getVideoSources(episodeUrl) {
  var u = String(episodeUrl || '');
  var url = /^https?:\/\//i.test(u) ? u : _abs(u.replace(/^\/?/, '/').replace(/\/?$/, '/'));
  if (!u) return Promise.reject(new Error('Komiku: url chapter kosong'));
  return _get(url).then(function (html) {
    var imgs = _pageImages(html);
    if (!imgs.length) throw new Error('Komiku: halaman chapter tidak ditemukan');
    var hdr = { 'User-Agent': UA, 'Referer': SITE + '/' };
    var out = [];
    for (var i = 0; i < imgs.length; i++) {
      out.push({
        url: imgs[i], quality: 'Halaman ' + (i + 1), container: 'image',
        headers: hdr, kind: 'sub', audioLang: 'id', subtitles: [],
        label: 'Halaman ' + (i + 1) + '/' + imgs.length
      });
    }
    return out;
  });
}
