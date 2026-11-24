/* ==========================================================================
   slides.js  -  슬라이드 미리보기 + PDF 저장 (/slides/ 페이지 전용)
   --------------------------------------------------------------------------
   흐름
     1) slides.html 이 <template> 에 넣어 둔 재료(프로필, 글 제목·정보·이미지·본문)를 읽습니다.
     2) 이미지 크기를 미리 알아 둡니다(외부 이미지가 PDF 에 들어갈 수 있는지도 확인).
     3) 1280×720 슬라이드를 화면 밖 '측정용 무대'에서 실제로 배치해 보며 넘치면 다음 장으로 나눕니다.
        - h2 = 새 슬라이드의 제목. 넘치면 같은 제목 + "(계속)" 으로 이어 갑니다.
        - 긴 목록은 항목 단위, 표는 행 단위(머리행 반복), 코드는 줄 단위, 긴 문단은 문장 단위로 나눕니다.
        - 이미지는 잘리지 않게 축소하거나 다음 장으로 넘깁니다. 어떤 내용도 버리지 않습니다.
     4) 'PDF 저장' → 슬라이드를 한 장씩 그림(2배 해상도)으로 바꿔 16:9 PDF 의 한 쪽으로 넣고 내려받습니다.
        인쇄 대화상자·새 창 없이 동작합니다. (라이브러리: assets/vendor/ 의 html2canvas, jsPDF)
   점검: 브라우저 콘솔에서 slideCheck() → 글마다 '본문 글자·이미지가 빠짐없이 한 번씩 들어갔는지,
         잘린 곳이 없는지' 를 돌려줍니다. (자동 테스트에서 사용)
   이 파일은 빌드 과정 없이 그대로 쓰는 일반 자바스크립트(ES2017)입니다.
   ========================================================================== */
(function () {
  'use strict';

  var SLIDE_W = 1280;
  var SLIDE_H = 720;
  var PDF_W = 960;            // PDF 한 쪽 크기(pt) = 16:9
  var PDF_H = 540;
  var PIXEL_RATIO = 2;        // PDF 이미지 해상도 배율
  var JPEG_QUALITY = 0.92;
  var SLIDE_BG = '#faf9f6';
  var BODY_W = 896;           // 본문 내용 칸의 폭(px) = 1280 - 여백 152 - 제목 칸 196 - 간격 32 (안전 폭)
  var BODY_IMG_MAX_H = 440;   // 본문 이미지의 기본 최대 높이(px, 슬라이드 기준)
  var MIN_SHRINK_H = 160;     // 남은 공간에 맞춰 줄일 때 이 높이보다 작아지면 다음 장으로 넘김

  var BLOCK_TAGS = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DETAILS|DIALOG|DD|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|UL|VIDEO|IFRAME|CANVAS|OBJECT|EMBED|AUDIO|SUMMARY|IMG|PICTURE|SVG|MATH)$/;
  var ATOMIC_TAGS = /^(H[1-6]|HR|IMG|PICTURE|SVG|VIDEO|IFRAME|CANVAS|OBJECT|EMBED|AUDIO|MATH|SUMMARY)$/;

  var ui = {};
  var state = {
    data: null,
    mode: 'deck',          // 'deck' = 전체, 'post' = 글 하나
    posts: [],             // 이번 덱에 들어가는 글
    slides: [],            // 슬라이드 노드(순서대로)
    images: {},            // url → { ok, w, h, ratio, raster }
    missing: null,         // PDF 에 넣지 못한 이미지 수 { cors, load } (자리 표시로 대체)
    deckTitle: '',
    fileName: 'slides.pdf',
    busy: false,
    warning: ''            // 점검(slideCheck)에서 문제가 있을 때 도구 막대에 보일 문장
  };

  /* ---------------------------------------------------------------- 도우미 */
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function attr(node, name) { return (node && node.getAttribute(name)) || ''; }
  function tpl(parent, part) {
    var t = parent && parent.querySelector('template[data-part="' + part + '"]');
    // template 안의 문서는 '비활성' 이라 복제해도 이미지를 내려받지 않습니다(실제로 쓰는 글의 이미지만 나중에 불러옴)
    return t ? t.content.cloneNode(true) : document.createDocumentFragment();
  }
  function textOf(node) { return (node.textContent || '').replace(/\s+/g, ' ').trim(); }
  function squash(s) { return String(s || '').replace(/\s+/g, ''); }
  function nextFrame() { return new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 0); }); }); }
  function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function clearNode(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function shorten(s, max) { s = String(s || ''); return s.length > max ? s.slice(0, max - 1) + '…' : s; }

  function setStatus(msg, isError) {
    if (!ui.status) return;
    ui.status.textContent = msg || '';
    ui.status.classList.toggle('is-error', !!isError);
    ui.status.classList.toggle('is-warn', !isError && !!state.warning && String(msg || '').indexOf(state.warning) >= 0);
  }

  // 스스로 점검(slideCheck)해서 문제가 있으면 도구 막대에 알릴 문장을 만듭니다(저장은 그대로 가능).
  function checkWarning() {
    var c = slideCheck();
    if (c.ok) return '';
    var nums = [];
    state.slides.forEach(function (s) { if (overflowList(s, 1).length) nums.push(+s.getAttribute('data-n')); });
    var parts = [];
    if (nums.length) parts.push((nums.length > 8 ? nums.slice(0, 8).join(', ') + ' 등 ' + nums.length + '장' : nums.join(', ') + '번') + ' 슬라이드는 내용이 영역을 벗어나 PDF 에서 잘릴 수 있습니다');
    var lost = c.posts.filter(function (p) { return !p.textOk || !p.imagesOk; }).map(function (p) { return '「' + shorten(p.title, 30) + '」'; });
    if (lost.length) parts.push(lost.join(', ') + ' 글의 본문이 슬라이드와 일치하지 않습니다');
    if (window.console) console.warn('[slides] 점검 결과', c);
    return '주의: ' + parts.join('. ') + '. 저장은 할 수 있습니다.';
  }
  // 안내문: [강조 문장, 설명, [링크 글자, 주소], ...] 형태로 받아 DOM 으로 만듭니다
  function showMessage(strong, parts) {
    clearNode(ui.message);
    var p1 = h('p'); p1.appendChild(h('strong', null, strong)); ui.message.appendChild(p1);
    var p2 = h('p');
    (parts || []).forEach(function (x) {
      if (typeof x === 'string') p2.appendChild(document.createTextNode(x));
      else { var a = h('a', null, x[0]); a.href = x[1]; p2.appendChild(a); }
    });
    ui.message.appendChild(p2);
    ui.message.hidden = false;
    ui.save.hidden = true;
    setStatus('');
  }

  /* ---------------------------------------------------------------- 1. 재료 읽기 */
  function readSource() {
    var root = document.getElementById('slide-src');
    if (!root) return null;
    var site = root.querySelector('[data-src="site"]');
    var prof = root.querySelector('[data-src="profile"]');
    var data = {
      siteTitle: attr(site, 'data-site-title'),
      home: attr(site, 'data-home') || '/',
      profile: {
        name: attr(prof, 'data-name'),
        role: attr(prof, 'data-role'),
        avatar: absUrl(attr(prof, 'data-avatar')),
        email: attr(prof, 'data-email'),
        siteUrl: attr(prof, 'data-site-url'),
        bio: tpl(prof, 'bio'),
        skills: [],
        links: []
      },
      posts: [],
      excluded: []
    };
    Array.prototype.forEach.call(tpl(site, 'excluded').querySelectorAll('li'), function (li) {
      data.excluded.push({ key: attr(li, 'data-key'), title: attr(li, 'data-title') });
    });
    Array.prototype.forEach.call(tpl(prof, 'skills').querySelectorAll('li'), function (li) {
      var t = textOf(li); if (t) data.profile.skills.push(t);
    });
    Array.prototype.forEach.call(tpl(prof, 'links').querySelectorAll('a'), function (a) {
      data.profile.links.push({ label: textOf(a), url: attr(a, 'data-url') });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-src="post"]'), function (art) {
      var post = {
        key: attr(art, 'data-key'),
        type: attr(art, 'data-type') || 'image-top',
        category: attr(art, 'data-category') || '프로젝트',
        title: attr(art, 'data-title') || '(제목 없음)',
        date: attr(art, 'data-date'),
        pinned: art.getAttribute('data-pinned') === 'true',
        meta: [], tags: [], media: [],
        summary: tpl(art, 'summary'),
        body: tpl(art, 'body')
      };
      Array.prototype.forEach.call(tpl(art, 'meta').querySelectorAll('li'), function (li) {
        post.meta.push({ k: textOf(li.querySelector('[data-k]')), v: textOf(li.querySelector('[data-v]')), href: attr(li, 'data-href') });
      });
      Array.prototype.forEach.call(tpl(art, 'tags').querySelectorAll('li'), function (li) {
        var t = textOf(li); if (t) post.tags.push(t);
      });
      Array.prototype.forEach.call(tpl(art, 'media').querySelectorAll('img'), function (img) {
        post.media.push({ src: absUrl(attr(img, 'src')), alt: attr(img, 'alt'), caption: attr(img, 'data-caption') });
      });
      data.posts.push(post);
    });
    // 재료는 다 읽었으니 문서에서 빼 둡니다(PDF 변환 때 복제되는 양을 줄임)
    root.parentNode.removeChild(root);
    return data;
  }

  function absUrl(src, base) {
    if (!src) return '';
    try { return new URL(src, base || location.href).href; } catch (e) { return src; }
  }
  function postBase(post) {
    // 본문의 상대 경로 이미지는 '글 주소' 기준으로 해석해야 합니다
    var home = state.data.home.replace(/\/$/, '');
    return absUrl(home + post.key);
  }
  function isPdfLinkUrl(u) {
    var s = String(u || '').trim();
    if (!s) return false;
    if (/^mailto:/i.test(s)) return s.length > 7;
    try {
      var parsed = new URL(s);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      var host = (parsed.hostname || '').toLowerCase();
      if (!host || host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return false;
      return true;
    } catch (e) {
      return false;
    }
  }
  function publicSiteUrl() {
    var raw = state.data && state.data.profile ? String(state.data.profile.siteUrl || '').trim() : '';
    if (raw && isPdfLinkUrl(raw)) return raw;
    if (state.data && isPdfLinkUrl(location.href)) {
      var hostedHome = absUrl(state.data.home || '/', location.href);
      if (isPdfLinkUrl(hostedHome)) return hostedHome;
    }
    return '';
  }
  function publicPostUrl(post) {
    var base = publicSiteUrl();
    if (!base || !post || !post.key) return '';
    return base.replace(/\/+$/, '') + '/' + String(post.key).replace(/^\/+/, '');
  }
  function displayUrl(u) {
    return String(u || '').trim().replace(/^mailto:/i, '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }
  function resolvePublicHref(rawHref, base) {
    var raw = String(rawHref || '').trim();
    if (!raw || raw.charAt(0) === '#' || /^javascript:/i.test(raw)) return raw;
    var resolved = absUrl(raw, base);
    var pub = publicSiteUrl();
    if (!pub) return resolved;
    try {
      var resUrl = new URL(resolved);
      if (resUrl.origin === location.origin) {
        var localHome = absUrl((state.data && state.data.home) || '/', location.href).replace(/\/+$/, '') + '/';
        var pubBase = pub.replace(/\/+$/, '') + '/';
        if (resolved.indexOf(localHome) === 0) return pubBase + resolved.slice(localHome.length);
        return pub.replace(/\/+$/, '') + resUrl.pathname + resUrl.search + resUrl.hash;
      }
    } catch (e) { /* 무시 */ }
    return resolved;
  }

  /* ---------------------------------------------------------------- 2. 이미지 확인 */
  function isSvgUrl(u) { return /\.svgz?(\?|#|$)/i.test(u) || /^data:image\/svg/i.test(u); }
  function isCross(u) {
    try { var o = new URL(u, location.href); return o.protocol !== 'data:' && o.protocol !== 'blob:' && o.origin !== location.origin; }
    catch (e) { return true; }
  }

  function loadImage(url, cross) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, 15000);
      if (cross) img.crossOrigin = 'anonymous';
      img.onload = function () { if (done) return; done = true; clearTimeout(timer); resolve(img); };
      img.onerror = function () { if (done) return; done = true; clearTimeout(timer); reject(new Error('error')); };
      img.src = url;
    });
  }

  // SVG 는 원래 크기(width/height)가 없는 경우가 많습니다. 그런 SVG 는 PDF 변환 라이브러리가 제대로 그리지 못하므로
  // viewBox 로 크기를 계산해 width/height 를 넣은 사본(blob 주소)을 만들어 슬라이드에서는 그 사본을 씁니다.
  function svgPrepare(url, info) {
    // 사이트 자신의 http(s) 주소만 고칩니다. data: 주소는 같은 출처의 blob: 으로 다시 만들지 않습니다(보안 검토 F4).
    if (!/^https?:/i.test(absUrl(url)) || isCross(url) || !window.fetch || !window.Blob || !window.URL || !URL.createObjectURL) return Promise.resolve();
    return fetch(url).then(function (r) { return r.ok ? r.text() : ''; }).then(function (txt) {
      var m = /<svg\b[^>]*>/i.exec(txt || '');
      if (!m) return;
      var tag = m[0];
      var num = function (re) { var x = re.exec(tag); return x && +x[1] > 0 ? +x[1] : 0; };
      var w = num(/\swidth\s*=\s*["']\s*([\d.]+)\s*(px)?\s*["']/i);
      var hh = num(/\sheight\s*=\s*["']\s*([\d.]+)\s*(px)?\s*["']/i);
      var vb = /viewBox\s*=\s*["']\s*[-\d.eE]+[\s,]+[-\d.eE]+[\s,]+([\d.eE]+)[\s,]+([\d.eE]+)/i.exec(tag);
      var vw = vb ? +vb[1] : 0, vh = vb ? +vb[2] : 0;
      if (w && hh) { info.ratio = w / hh; return; }          // 이미 크기가 있음 → 원본 그대로
      if (!(vw > 0 && vh > 0)) return;
      info.ratio = vw / vh;
      var fixed = tag.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '')
                     .replace(/^<svg\b/i, '<svg width="' + vw + '" height="' + vh + '"');
      var blob = new Blob([txt.replace(tag, fixed)], { type: 'image/svg+xml' });
      info.drawSrc = URL.createObjectURL(blob);
    }).catch(function () { /* 원본 그대로 사용 */ });
  }

  function probe(url) {
    if (state.images[url]) return state.images[url].promise;
    var info = { url: url, ok: false, w: 0, h: 0, ratio: 0, raster: !isSvgUrl(url) };
    state.images[url] = info;
    var cross = isCross(url);
    info.promise = (cross ? loadImage(url, true).catch(function () {
      // CORS 허용 없이도 화면에는 보이는지 확인 → 보이면 'CORS 때문에 못 넣음', 안 보이면 '불러오기 실패'
      return loadImage(url, false).then(function () { info.cors = false; throw new Error('cors'); });
    }) : loadImage(url, false)).then(function (img) {
      info.w = img.naturalWidth; info.h = img.naturalHeight;
      if (cross) {
        // 다른 사이트 이미지: CORS 허용이 없으면 캔버스에 그릴 수 없으므로 PDF 에 넣을 수 없습니다
        var c = document.createElement('canvas'); c.width = 2; c.height = 2;
        var cx = c.getContext('2d');
        cx.drawImage(img, 0, 0, 2, 2);
        try { cx.getImageData(0, 0, 1, 1); }   // 막혀 있으면 여기서 오류
        catch (e) { info.cors = false; throw e; }
      }
      info.ok = true;
      return isSvgUrl(url) ? svgPrepare(url, info) : null;
    }).then(function () {
      if (!info.ratio) info.ratio = (info.w > 0 && info.h > 0) ? info.w / info.h : 4 / 3;
      return info;
    }, function () { info.ok = false; info.ratio = 16 / 9; return info; });
    return info.promise;
  }

  // 상자(maxW×maxH) 안에 비율을 지켜 들어가는 크기. 래스터 이미지는 원래 크기보다 키우지 않습니다.
  function fitSize(info, maxW, maxH) {
    var r = (info && info.ratio) || 16 / 9;
    var w = maxW, hh = w / r;
    if (hh > maxH) { hh = maxH; w = hh * r; }
    if (info && info.raster && info.w > 0 && w > info.w) { w = info.w; hh = w / r; }
    return { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(hh)) };
  }

  // 이미지 크기 지정. 폭은 인라인 스타일로도 넣어 인쇄(Ctrl+P)용 main.css 규칙(width:auto)에 덮이지 않게 하고,
  // 높이는 width/height 속성의 비율로 자동 계산되게 둡니다(좁은 칸에서 max-width 로 줄어도 비율 유지).
  function sizeImg(img, w, hh) {
    img.width = w; img.height = hh;
    img.style.width = w + 'px';
    img.style.height = 'auto';
  }

  // 이미지 한 장(또는 PDF 에 넣을 수 없을 때의 자리 표시)
  function makeImage(src, alt, maxW, maxH) {
    var info = state.images[src];
    var size = fitSize(info, maxW, maxH);
    if (info && info.ok) {
      var img = new Image();
      if (isCross(src)) img.crossOrigin = 'anonymous';
      img.src = info.drawSrc || src;
      img.alt = alt || '';
      sizeImg(img, size.w, size.h);
      img.setAttribute('data-ratio', String(info.ratio));
      return img;
    }
    return missingBox(src, alt, size.w, size.h);
  }
  // 넣지 못한 이미지 자리 표시. 다른 사이트(CORS 미허용) 이미지와 불러오지 못한(없는) 이미지를 구분해 안내합니다.
  function missingBox(src, alt, w, hh) {
    var info = state.images[src];
    var reason = info && info.cors === false ? 'cors' : 'load';
    var box = h('span', 's-missing');
    box.setAttribute('data-missing', reason);
    w = Math.max(w, 260); hh = Math.max(hh, 120);
    box.style.width = w + 'px'; box.style.height = hh + 'px';
    var t = h('strong', null, reason === 'cors' ? '외부 사이트 이미지라 PDF 에 넣을 수 없습니다' : '이미지를 불러오지 못했습니다');
    var host = '';
    try { host = new URL(src).host; } catch (e) { host = src; }
    var d = h('span', null, (alt ? alt + ' · ' : '') + (host || '외부 이미지'));
    t.setAttribute('data-nt', ''); d.setAttribute('data-nt', '');
    box.appendChild(t); box.appendChild(d);
    return box;
  }

  /* ---------------------------------------------------------------- 3. 슬라이드 틀 */
  var measure;
  function newSlide(kind, opts) {
    opts = opts || {};
    var s = h('section', 'slide slide--' + kind);
    s.setAttribute('data-kind', kind);
    if (opts.post) s.setAttribute('data-post', opts.post.key);
    s._footPost = opts.footPost || '';
    var main = h('div', 'slide__main');
    s.appendChild(main);
    var foot = h('footer', 'slide__foot');
    foot.setAttribute('data-region', '');
    var siteTitle = state.data.siteTitle || state.data.profile.name || '';
    var siteHref = publicSiteUrl();
    var siteNode;
    if (siteHref) {
      siteNode = h('a', 'slide__site slide__foot-link', siteTitle);
      siteNode.href = siteHref;
      siteNode.target = '_blank';
      siteNode.rel = 'noopener';
    } else {
      siteNode = h('span', 'slide__site', siteTitle);
    }
    foot.appendChild(siteNode);
    var postHref = opts.post ? publicPostUrl(opts.post) : '';
    var postLabel = shorten(s._footPost, 46);
    var postNode;
    if (postHref && postLabel) {
      postNode = h('a', 'slide__post slide__foot-link', postLabel);
      postNode.href = postHref;
      postNode.target = '_blank';
      postNode.rel = 'noopener';
    } else {
      postNode = h('span', 'slide__post', postLabel);
    }
    foot.appendChild(postNode);
    foot.appendChild(h('span', 'slide__num', '0 / 0'));
    s.appendChild(foot);
    s._main = main;
    measure.appendChild(s);
    state.slides.push(s);
    return s;
  }

  // 영역(data-region) 밖으로 나간 요소가 있는지 = 잘림 검사
  function overflowList(slide, tol) {
    tol = tol == null ? 1 : tol;
    var out = [];
    var sr = slide.getBoundingClientRect();
    var scale = sr.width / SLIDE_W || 1;
    var t = tol * scale;
    var els = slide.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      var r = e.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      var reg = e.parentElement && e.parentElement.closest('[data-region]');
      var box = (reg && slide.contains(reg)) ? reg.getBoundingClientRect() : sr;
      if (r.left < box.left - t || r.top < box.top - t || r.right > box.right + t || r.bottom > box.bottom + t ||
          r.left < sr.left - t || r.top < sr.top - t || r.right > sr.right + t || r.bottom > sr.bottom + t) {
        out.push({ tag: e.tagName.toLowerCase(), cls: e.className && e.className.baseVal == null ? String(e.className) : '', text: shorten(textOf(e), 40),
          over: Math.round(Math.max(r.bottom - box.bottom, r.right - box.right, box.top - r.top, box.left - r.left) / scale) });
      }
    }
    return out;
  }

  // 본문 상자에 다 들어가는가 (아래·오른쪽으로 넘치지 않는가)
  function fits(box) {
    var br = box.getBoundingClientRect();
    if (box.scrollWidth > box.clientWidth + 1) return false;
    var kids = box.children;
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      if (r.bottom > br.bottom + 0.5 || r.right > br.right + 0.5) return false;
    }
    return true;
  }

  /* ---------------------------------------------------------------- 4. 본문 준비 */
  function isImageBlock(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === 'IMG' || el.classList.contains('s-missing')) return true;
    if (!/^(P|FIGURE|DIV|A|PICTURE)$/.test(el.tagName)) return false;
    var media = el.querySelectorAll('img, .s-missing');
    if (media.length !== 1) return false;
    // 이미지 + (선택) 캡션 외에 다른 글이 없으면 '그림 덩어리'
    var c = el.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('img, .s-missing, figcaption, em, br'), function (n) { n.parentNode && n.parentNode.removeChild(n); });
    return squash(c.textContent) === '';
  }

  function prepareBody(post, frag) {
    // 스크립트·스타일은 슬라이드에 넣지 않습니다
    Array.prototype.forEach.call(frag.querySelectorAll('script, style, link, meta, template, noscript'), function (n) { n.parentNode.removeChild(n); });

    // 글 페이지에서도 보이지 않는 요소는 슬라이드에도 넣지 않습니다(비교 기준에서도 뺌):
    // hidden 속성, 인라인 display:none / visibility:hidden, 열리지 않은 <dialog>
    Array.prototype.forEach.call(frag.querySelectorAll('[hidden], [style], dialog:not([open])'), function (n) {
      var st = n.getAttribute('style') || '';
      if (n.hasAttribute('hidden') || n.tagName === 'DIALOG' ||
          /(^|;)\s*display\s*:\s*none/i.test(st) || /(^|;)\s*visibility\s*:\s*(hidden|collapse)/i.test(st)) {
        if (n.parentNode) n.parentNode.removeChild(n);
      }
    });

    // 비교 기준(원본 본문 글자)
    post.srcText = squash(frag.textContent);

    // 눌러야 보이는 내용은 PDF 에서 펼칠 수 없으므로 '펼친 상태'로 바꿉니다.
    //  - <details>(접힘·펼침 모두): <summary> 는 제목 줄로 남기고 내용은 일반 본문처럼 나눠 담습니다(중첩도 같음)
    //  - 열린 <dialog>: 화면 위에 떠 있는 상자 대신 일반 블록으로
    //  - <textarea>: 입력칸 대신 글자 상자(<pre>)로
    expandHidden(frag);

    var base = postBase(post);
    // id 중복 방지 + 상대 경로 해석
    Array.prototype.forEach.call(frag.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); });
    Array.prototype.forEach.call(frag.querySelectorAll('a[href]'), function (a) {
      var nextHref = resolvePublicHref(a.getAttribute('href'), base);
      if (nextHref) a.setAttribute('href', nextHref);
    });

    // 이미지: 번호 붙이기, 크기 계산, PDF 에 못 넣는 이미지는 자리 표시로
    post.srcSids = [];
    Array.prototype.forEach.call(frag.querySelectorAll('img'), function (img, i) {
      var sid = post.idx + '-' + i;
      post.srcSids.push(sid);
      var src = absUrl(img.getAttribute('src'), base);
      var info = state.images[src];
      var node;
      if (info && info.ok) {
        var size = fitSize(info, BODY_W, BODY_IMG_MAX_H);
        node = img;
        node.removeAttribute('srcset'); node.removeAttribute('sizes'); node.removeAttribute('loading');
        if (isCross(src)) node.crossOrigin = 'anonymous';
        node.setAttribute('src', info.drawSrc || src);
        sizeImg(node, size.w, size.h);
        node.setAttribute('data-ratio', String(info.ratio));
      } else {
        var sz = fitSize(info, 640, 300);
        node = missingBox(src, img.getAttribute('alt'), sz.w, sz.h);
        img.parentNode.replaceChild(node, img);
      }
      node.setAttribute('data-sid', sid);
      var p = node.parentElement;
      if (p && p.tagName === 'P' && isImageBlock(p)) p.classList.add('s-imgp');
    });

    // 목록 기호: 직접 그려 넣습니다(나뉜 번호 목록도 번호가 이어지도록)
    Array.prototype.forEach.call(frag.querySelectorAll('ul, ol'), function (list) {
      var ordered = list.tagName === 'OL';
      var n = ordered ? (parseInt(list.getAttribute('start'), 10) || 1) : 0;
      var nested = !!(list.parentElement && list.parentElement.closest('li'));
      Array.prototype.forEach.call(list.children, function (li) {
        if (li.tagName !== 'LI') return;
        var m = h('span', 's-mark ' + (ordered ? 's-mark--num' : 's-mark--dot' + (nested ? ' s-mark--sub' : '')), ordered ? (n++) + '.' : '');
        m.setAttribute('data-nt', ''); m.setAttribute('aria-hidden', 'true');
        li.insertBefore(m, li.firstChild);
      });
    });

    // 표: thead + tbody 하나로 정리
    Array.prototype.forEach.call(frag.querySelectorAll('table'), normalizeTable);

    // 맨 위 단계에 글자가 그대로 있으면 문단 상자로 감쌉니다
    var blocks = [];
    var run = null;
    Array.prototype.slice.call(frag.childNodes).forEach(function (n) {
      var isBlock = n.nodeType === 1 && (BLOCK_TAGS.test(n.tagName) || n.classList.contains('s-missing'));
      if (isBlock) { run = null; blocks.push(n); return; }
      if (n.nodeType === 3 && !n.textContent.trim() && !run) return;
      if (n.nodeType !== 1 && n.nodeType !== 3) return;
      if (!run) { run = h('div', 's-inline'); blocks.push(run); }
      run.appendChild(n);
    });
    return blocks;
  }

  function expandHidden(frag) {
    var list = Array.prototype.slice.call(frag.querySelectorAll('details, dialog, textarea')).reverse();   // 안쪽부터
    list.forEach(function (el) {
      var box;
      if (el.tagName === 'TEXTAREA') {
        box = h('pre', 's-textarea');
        box.textContent = el.textContent;
      } else {
        box = h('div', el.tagName === 'DETAILS' ? 's-details' : 's-dialog');
        var sumDone = false;
        Array.prototype.slice.call(el.childNodes).forEach(function (c) {
          if (!sumDone && c.nodeType === 1 && c.tagName === 'SUMMARY' && el.tagName === 'DETAILS') {
            var label = h('div', 's-details__summary');
            while (c.firstChild) label.appendChild(c.firstChild);
            box.appendChild(label);
            sumDone = true;
          } else box.appendChild(c);
        });
        wrapInline(box);
      }
      el.parentNode.replaceChild(box, el);
    });
  }
  // 블록 상자 안에 글자가 그대로 놓여 있으면 문단 상자(div.s-inline)로 묶어 나누기 쉽게 합니다
  function wrapInline(box) {
    var run = null;
    Array.prototype.slice.call(box.childNodes).forEach(function (n) {
      var isBlock = n.nodeType === 1 && (BLOCK_TAGS.test(n.tagName) || /^(s-details__summary)$/.test(n.className));
      if (isBlock) { run = null; return; }
      if (n.nodeType === 3 && !n.textContent.trim() && !run) return;
      if (n.nodeType !== 1 && n.nodeType !== 3) return;
      if (!run) { run = h('div', 's-inline'); box.insertBefore(run, n); }
      run.appendChild(n);
    });
  }

  function normalizeTable(t) {
    var thead = t.tHead;
    var rows = Array.prototype.slice.call(t.rows);
    var bodyRows = rows.filter(function (r) { return !thead || r.parentElement !== thead; });
    if (!thead && bodyRows.length > 1) {
      var first = bodyRows[0];
      var allTh = Array.prototype.every.call(first.cells, function (c) { return c.tagName === 'TH'; });
      if (allTh) { thead = t.createTHead(); thead.appendChild(first); bodyRows.shift(); }
    }
    Array.prototype.slice.call(t.tBodies).forEach(function (tb) { tb.parentNode.removeChild(tb); });
    if (t.tFoot) t.removeChild(t.tFoot);
    var tb = document.createElement('tbody');
    bodyRows.forEach(function (r) { tb.appendChild(r); });
    t.appendChild(tb);
  }

  /* ---------------------------------------------------------------- 5. 나누기 */
  function kindOf(el) {
    if (el.nodeType !== 1) return 'atomic';
    if (el.tagName === 'TABLE') return 'table';
    if (el.tagName === 'PRE') return 'lines';
    if (ATOMIC_TAGS.test(el.tagName) || isImageBlock(el) || el.classList.contains('s-missing')) return 'atomic';
    for (var i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      if (c.hasAttribute('data-nt')) continue;
      if (BLOCK_TAGS.test(c.tagName) && c.tagName !== 'IMG') return 'children';
    }
    return 'text';
  }

  function shallow(el) {
    var c = el.cloneNode(false);
    c.removeAttribute('id');
    return c;
  }

  // el 은 box 안에 들어 있고 box 가 넘치는 상태. el 을 앞부분만 남기도록 줄이고, 뒷부분(새 요소)을 돌려줍니다.
  // 앞부분이 하나도 들어가지 않으면 el 을 그대로 두고 null.
  function splitNode(el, box, strict) {
    var k = kindOf(el);
    if (k === 'table') return splitTable(el, box, strict);
    if (k === 'lines') return splitText(el, box, strict ? ['lines'] : ['lines', 'words', 'chars'], strict ? 3 : 1);
    if (k === 'text') return splitText(el, box, strict ? ['sentences', 'words'] : ['sentences', 'words', 'chars'], strict ? 2 : 0);
    if (k === 'children') return splitChildren(el, box, strict);
    return null;
  }

  function splitChildren(el, box, strict) {
    var units = Array.prototype.filter.call(el.childNodes, function (n) {
      return !(n.nodeType === 1 && n.hasAttribute('data-nt'));
    });
    var n = units.length;
    if (!n) return null;
    function keep(k) {
      units.forEach(function (u) { if (u.parentNode === el) el.removeChild(u); });
      for (var i = 0; i < k; i++) el.appendChild(units[i]);
    }
    var lo = 0, hi = n - 1, best = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      keep(mid);
      if (mid === 0 || fits(box)) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    // 목록: 다음 장에 항목 하나만 홀로 남지 않게(앞에 3개 이상 있을 때 하나 더 넘김)
    var widowFix = false;
    if (/^(UL|OL)$/.test(el.tagName)) {
      var elsAfter = units.slice(best).filter(function (x) { return x.nodeType === 1; }).length;
      var elsKept = units.slice(0, best).filter(function (x) { return x.nodeType === 1; }).length;
      if (elsAfter === 1 && elsKept >= 3) {
        do { best--; } while (best > 0 && units[best].nodeType !== 1);
        widowFix = true;
      }
    }
    keep(best);
    var partial = null;
    var u = units[best];
    if (u && !widowFix && u.nodeType === 1 && kindOf(u) !== 'atomic') {
      el.appendChild(u);
      if (fits(box)) { best++; }         // 드물게: 측정 오차로 통째로 들어감
      else {
        partial = splitNode(u, box, strict || best > 0);
        if (!partial) el.removeChild(u);
      }
    }
    var keptUnits = best + (partial ? 1 : 0);
    var meaningful = units.slice(0, keptUnits).some(function (x) { return x.nodeType === 1 || squash(x.textContent); });
    if (!meaningful || (best === 0 && !partial)) { keep(n); return null; }
    var tail = shallow(el);
    if (partial) tail.appendChild(partial);
    for (var i = keptUnits; i < n; i++) tail.appendChild(units[i]);
    if (!tail.childNodes.length) return null;
    return tail;
  }

  function splitTable(t, box, strict) {
    var tb = t.tBodies[0];
    if (!tb) return null;
    var rows = Array.prototype.slice.call(tb.rows);
    var n = rows.length;
    if (!n) return null;
    function keep(k) {
      rows.forEach(function (r) { if (r.parentNode === tb) tb.removeChild(r); });
      for (var i = 0; i < k; i++) tb.appendChild(rows[i]);
    }
    lockColumns(t);
    var minRows = strict ? Math.min(2, n) : 1;
    var lo = minRows, hi = n - 1, best = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      keep(mid);
      if (fits(box)) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (best >= 3 && n - best === 1) best--;     // 다음 장에 한 행만 홀로 남지 않게
    var tail = shallow(t);
    var cg = t.querySelector('colgroup');
    if (cg) tail.appendChild(cg.cloneNode(true));
    if (t.caption) { /* 캡션은 앞부분에만 */ }
    if (t.tHead) {
      var th = t.tHead.cloneNode(true);
      th.setAttribute('data-repeat', '');      // 반복된 머리행(비교에서 제외)
      tail.appendChild(th);
    }
    var ntb = document.createElement('tbody');
    tail.appendChild(ntb);
    if (best === 0) {
      if (strict || n === 1) { keep(n); return null; }
      // 빈 슬라이드에도 첫 행이 안 들어감 → 그 행만 남기고(호출한 쪽이 비율 축소) 나머지는 다음 장으로
      keep(1);
      for (var j = 1; j < n; j++) ntb.appendChild(rows[j]);
      return tail;
    }
    keep(best);
    for (var i = best; i < n; i++) ntb.appendChild(rows[i]);
    return tail;
  }

  // 나뉜 표의 칸 너비가 장마다 달라지지 않도록, 나누기 전에 잰 너비로 고정합니다
  function lockColumns(t) {
    if (t.querySelector('colgroup')) return;
    var row = t.rows[0];
    if (!row) return;
    var cells = Array.prototype.slice.call(row.cells);
    if (cells.some(function (c) { return c.colSpan > 1; })) return;
    var total = t.getBoundingClientRect().width || 1;
    var cg = document.createElement('colgroup');
    cells.forEach(function (c) {
      var col = document.createElement('col');
      col.style.width = (c.getBoundingClientRect().width / total * 100).toFixed(3) + '%';
      cg.appendChild(col);
    });
    t.insertBefore(cg, t.firstChild);
    t.style.tableLayout = 'fixed';
  }

  // 글자 단위 나누기: 문장 → 단어 → 글자 순서로 자를 곳을 찾습니다(굵게·링크 등 서식은 유지)
  function textMap(root) {
    var list = [];
    var text = '';
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        for (var p = n.parentNode; p && p !== root; p = p.parentNode) if (p.nodeType === 1 && p.hasAttribute('data-nt')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var t;
    while ((t = w.nextNode())) { list.push({ node: t, start: text.length, end: text.length + t.data.length }); text += t.data; }
    return { list: list, text: text };
  }
  function cutPoints(text, mode, minPos) {
    var out = [];
    var re, m;
    if (mode === 'lines') { re = /\n/g; while ((m = re.exec(text))) out.push(m.index + 1); }
    else if (mode === 'sentences') { re = /[.!?。！？…]+["'”’」』)\]]*\s+/g; while ((m = re.exec(text))) out.push(m.index + m[0].length); }
    else if (mode === 'words') { re = /\s+/g; while ((m = re.exec(text))) out.push(m.index + m[0].length); }
    else {
      for (var i = 1; i < text.length; i++) {
        var c = text.charCodeAt(i);
        if (c >= 0xDC00 && c <= 0xDFFF) continue;     // 서러게이트 쌍 가운데는 자르지 않음
        out.push(i);
      }
    }
    return out.filter(function (p) { return p >= minPos && p < text.length && squash(text.slice(p)) !== ''; });
  }
  function locate(map, pos, forEnd) {
    var L = map.list;
    for (var i = 0; i < L.length; i++) {
      var it = L[i];
      if (forEnd ? (pos > it.start && pos <= it.end) : (pos >= it.start && pos < it.end)) return { node: it.node, off: pos - it.start };
    }
    return null;
  }
  function headFrag(orig, map, pos) {
    var r = document.createRange();
    r.setStart(orig, 0);
    var e = locate(map, pos, true);
    r.setEnd(e.node, e.off);
    return pruneEmpty(r.cloneContents());
  }
  function tailFrag(orig, map, pos) {
    // 앞부분이 끝난 바로 그 지점부터 시작합니다(사이에 있는 이미지 같은 요소가 빠지지 않도록)
    var r = document.createRange();
    var s = locate(map, pos, true);
    r.setStart(s.node, s.off);
    r.setEnd(orig, orig.childNodes.length);
    return pruneEmpty(r.cloneContents());
  }
  // 잘린 자리에 생긴 '글자 없는 빈 껍데기'(예: 빈 <code></code>)를 지웁니다. 이미지·줄바꿈·목록 기호는 남깁니다.
  function pruneEmpty(frag) {
    var els = Array.prototype.slice.call(frag.querySelectorAll('*')).reverse();
    els.forEach(function (e) {
      if (e.hasAttribute('data-nt') || e.closest('[data-nt]')) return;
      if (/^(IMG|BR|HR|SVG|VIDEO|CANVAS|IFRAME|INPUT|COL|COLGROUP|TD|TH|TR)$/i.test(e.tagName) || e.classList.contains('s-missing')) return;
      if (e.textContent !== '') return;              // 공백만 있는 요소(코드 들여쓰기 등)는 남김
      if (e.querySelector('img, br, hr, svg, video, canvas, iframe, input, .s-missing, [data-nt]')) return;
      if (e.parentNode) e.parentNode.removeChild(e);
    });
    return frag;
  }
  function setContent(el, frag) { clearNode(el); el.appendChild(frag); }

  function splitText(el, box, modes, minUnits) {
    var orig = el.cloneNode(true);
    var map = textMap(orig);
    if (!squash(map.text)) return null;
    var minPos = 0;
    if (minUnits > 0) {
      // 앞부분이 너무 짧게 남지 않도록: 줄 단위면 minUnits 줄, 글이면 대략 한 줄(20자) 이상
      if (modes[0] === 'lines') {
        var cnt = 0;
        for (var q = 0; q < map.text.length; q++) if (map.text[q] === '\n' && ++cnt >= minUnits) { minPos = q + 1; break; }
        if (cnt < minUnits) return null;
      } else minPos = 20;
    }
    for (var mi = 0; mi < modes.length; mi++) {
      var cuts = cutPoints(map.text, modes[mi], minPos);
      if (!cuts.length) continue;
      var lo = 0, hi = cuts.length - 1, best = -1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        setContent(el, headFrag(orig, map, cuts[mid]));
        if (fits(box)) { best = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (best >= 0 && modes[mi] === 'lines') {
        // 코드: 다음 장에 1~2줄만 남지 않게 조금 앞에서 자릅니다
        var rest = map.text.slice(cuts[best]).replace(/\n$/, '').split('\n').length;
        var headLines = best + 1;
        if (rest < 3 && headLines > 6) best = Math.max(0, best - (3 - rest));
      }
      if (best >= 0) {
        setContent(el, headFrag(orig, map, cuts[best]));
        var tail = shallow(el);
        tail.appendChild(tailFrag(orig, map, cuts[best]));
        return tail;
      }
    }
    setContent(el, fragOf(orig));
    return null;
  }
  function fragOf(node) {
    var f = document.createDocumentFragment();
    Array.prototype.slice.call(node.childNodes).forEach(function (c) { f.appendChild(c); });
    return f;
  }

  // 그림 덩어리를 남은 높이에 맞게 줄입니다(비율 유지). 성공하면 true.
  function shrinkImageBlock(block, box, minH) {
    var media = block.matches && block.matches('img, .s-missing') ? block : block.querySelector('img, .s-missing');
    if (!media) return false;
    var br = box.getBoundingClientRect();
    var curH = media.getBoundingClientRect().height;
    var over = block.getBoundingClientRect().bottom - br.bottom;
    var saved = media.tagName === 'IMG' ? [media.width, media.height] : [media.style.height];
    function restore() { if (media.tagName === 'IMG') sizeImg(media, saved[0], saved[1]); else media.style.height = saved[0]; return false; }
    for (var tries = 0; tries < 6 && over > 0; tries++) {
      var nh = Math.floor(curH - over - 2);
      if (nh < minH) return restore();
      var ratio = parseFloat(media.getAttribute('data-ratio')) || (media.getBoundingClientRect().width / curH) || 1;
      if (media.tagName === 'IMG') sizeImg(media, Math.max(1, Math.floor(nh * ratio)), nh);
      else { media.style.height = nh + 'px'; }
      curH = media.getBoundingClientRect().height;
      over = block.getBoundingClientRect().bottom - br.bottom;
    }
    return fits(box) ? true : restore();
  }

  // 마지막 수단: 나눌 수 없는 덩어리를 비율 그대로 축소(잘림 방지)
  function forceFit(block, box) {
    var br = box.getBoundingClientRect();
    var r = block.getBoundingClientRect();
    var avail = br.bottom - r.top;
    var s = Math.max(0.2, Math.min((br.width) / Math.max(1, r.width), avail / Math.max(1, r.height)) * 0.98);
    var wrap = h('div', 's-scaled');
    wrap.style.height = Math.floor(r.height * s) + 'px';
    wrap.style.width = Math.floor(r.width * s) + 'px';
    block.parentNode.replaceChild(wrap, block);
    block.style.transformOrigin = '0 0';
    block.style.transform = 'scale(' + s.toFixed(4) + ')';
    block.style.width = Math.ceil(r.width) + 'px';
    wrap.appendChild(block);
    if (window.console) console.warn('[slides] 너무 큰 요소를 축소했습니다:', block.tagName);
  }

  /* ---------------------------------------------------------------- 6. 본문 슬라이드 */
  function bodySlide(post, sec, cont) {
    var s = newSlide('body', { post: post, footPost: post.title });
    s.setAttribute('data-role', post.role || 'body');
    var head = h('header', 'body__head');
    head.setAttribute('data-region', '');
    var kicker = h('p', 'body__kicker', post.key === '' ? '프로필' : post.role === 'info' ? shorten(post.title, 70) : sec.synthetic ? '본문' : shorten(post.title, 70));
    var title = h('h2', 'body__title');
    if (sec.headingNode) {
      Array.prototype.slice.call(sec.headingNode.childNodes).forEach(function (c) { title.appendChild(c.cloneNode(true)); });
    } else title.textContent = sec.heading;
    if (cont) {
      var c = h('span', 'body__cont', '(계속)');
      c.setAttribute('data-nt', '');
      title.appendChild(c);
    }
    if (cont || sec.synthetic) title.setAttribute('data-repeat', '');
    head.appendChild(kicker); head.appendChild(title);
    var content = h('div', 'body__content s-prose');
    content.setAttribute('data-region', '');
    s._main.appendChild(head);
    s._main.appendChild(content);
    s._content = content;
    fitHead(s, head, title, content);
    return s;
  }

  // 왼쪽 제목 칸에 제목이 다 들어가지 않으면 글자를 줄이고, 그래도 넘치면 제목을 위쪽 전체 폭으로 옮겨 줄바꿈합니다.
  function fitHead(s, head, title, content) {
    function over() {
      var hr = head.getBoundingClientRect();
      var mr = s._main.getBoundingClientRect();
      var tb = title.getBoundingClientRect();
      if (head.scrollWidth > head.clientWidth + 1) return true;
      if (s.classList.contains('slide--widehead')) return hr.bottom > mr.bottom - 160;   // 내용 칸이 최소 160px 은 남도록
      return tb.bottom > hr.bottom - 4;
    }
    if (!over()) return;
    var sizes = [26, 24, 22, 20, 18];
    for (var i = 0; i < sizes.length && over(); i++) title.style.fontSize = sizes[i] + 'px';
    if (!over()) return;
    s.classList.add('slide--widehead');
    var wide = [24, 21, 18, 16, 14];
    for (var j = 0; j < wide.length && over(); j++) title.style.fontSize = wide[j] + 'px';
  }

  function isHeading(n) { return n && n.nodeType === 1 && /^H[3-6]$/.test(n.tagName); }

  function makeSubhead(sec) {
    var sub = h('h2', 'body__subhead');
    if (sec.headingNode) {
      Array.prototype.slice.call(sec.headingNode.childNodes).forEach(function (c) { sub.appendChild(c.cloneNode(true)); });
    } else sub.textContent = sec.heading;
    return sub;
  }

  function addHeadSub(slide, label) {
    if (!slide || !label || slide.classList.contains('slide--widehead')) return;
    var head = slide.querySelector('.body__head');
    if (!head) return;
    var sub = h('p', 'body__sub', '+ ' + label);
    sub.setAttribute('data-nt', '');
    head.appendChild(sub);
    var hr = head.getBoundingClientRect();
    if (sub.getBoundingClientRect().bottom > hr.bottom - 2) head.removeChild(sub);
  }

  function tryFitBox(box, sizes) {
    if (fits(box)) return true;
    var saved = box.style.fontSize;
    var cur = parseFloat(saved);
    for (var i = 0; i < sizes.length; i++) {
      if (cur && sizes[i] >= cur) continue;
      box.style.fontSize = sizes[i] + 'px';
      if (fits(box)) return true;
    }
    box.style.fontSize = saved;
    return false;
  }

  function paginateBody(post, blocks, synthTitle) {
    // h1/h2 를 기준으로 구역 나누기
    var sections = [];
    var cur = { heading: synthTitle, synthetic: true, blocks: [] };
    blocks.forEach(function (b) {
      if (b.nodeType === 1 && /^H[12]$/.test(b.tagName)) {
        if (cur.blocks.length || !cur.synthetic) sections.push(cur);
        cur = { heading: textOf(b), headingNode: b, synthetic: false, blocks: [] };
      } else cur.blocks.push(b);
    });
    if (cur.blocks.length || !cur.synthetic) sections.push(cur);

    var curSlide = null;
    var curBox = null;
    var mergedOnCur = 0;

    sections.forEach(function (sec) {
      // 이전 슬라이드에 공간이 남으면 다음 구역 전체를 이어 담아 과도한 쪽 분할을 줄입니다.
      if (curSlide && curBox && sec.blocks.length && mergedOnCur === 0) {
        var curPx = parseFloat(curBox.style.fontSize);
        if (!curPx || curPx >= 14) {
          var sub = makeSubhead(sec);
          var added = [sub];
          curBox.appendChild(sub);
          sec.blocks.forEach(function (b) { curBox.appendChild(b); added.push(b); });
          if (tryFitBox(curBox, [16, 15.5, 15, 14.5, 14, 13.5])) {
            addHeadSub(curSlide, sec.heading);
            mergedOnCur++;
            return;
          }
          added.forEach(function (n) { if (n.parentNode === curBox) curBox.removeChild(n); });
        }
      }

      var slide = bodySlide(post, sec, false);
      var box = slide._content;
      mergedOnCur = 0;

      // 한 구역이 기본 글자 크기에서 살짝 넘치면 글자 크기를 조금 줄여 한 장에 맞춥니다.
      if (sec.blocks.length) {
        sec.blocks.forEach(function (b) { box.appendChild(b); });
        if (tryFitBox(box, [16, 15.5, 15, 14.5, 14])) {
          curSlide = slide; curBox = box;
          return;
        }
        sec.blocks.forEach(function (b) { if (b.parentNode === box) box.removeChild(b); });
        box.style.fontSize = '';
      }

      var queue = sec.blocks.slice();
      var guard = 0;
      while (queue.length) {
        if (++guard > 5000) throw new Error('pagination loop');
        var b = queue.shift();
        box.appendChild(b);
        if (fits(box)) continue;

        var hasOther = box.children.length > 1;
        var kind = kindOf(b);
        if (hasOther) {
          // 이미 다른 내용이 있는 슬라이드
          var br = box.getBoundingClientRect();
          var prev = b.previousElementSibling;
          var usedBottom = prev ? prev.getBoundingClientRect().bottom : br.top;
          var free = (br.bottom - usedBottom) / br.height;
          var bh = b.getBoundingClientRect().height;
          var fitsEmpty = bh <= br.height - 2;

          if (isImageBlock(b)) {
            var need = b.getBoundingClientRect().bottom - br.bottom;
            var media = b.matches('img, .s-missing') ? b : b.querySelector('img, .s-missing');
            var mh = media ? media.getBoundingClientRect().height : 0;
            if (mh - need >= Math.max(MIN_SHRINK_H, mh * 0.5) && shrinkImageBlock(b, box, MIN_SHRINK_H)) continue;
          } else {
            var preferMove = (kind === 'table' || kind === 'lines' || isCode(b)) && fitsEmpty && free < 0.5;
            if (!preferMove && kind !== 'atomic') {
              var tail = splitNode(b, box, true);
              if (tail) {
                // 나눈 앞부분은 이 슬라이드에, 뒷부분은 다음 슬라이드로(뒷부분을 버리는 경로는 없음)
                queue.unshift(tail);
                slide = bodySlide(post, sec, true); box = slide._content;
                continue;
              }
            }
          }
          // 통째로 다음 장으로. 소제목(h3~h6)이 슬라이드 맨 아래에 홀로 남지 않게 같이 넘깁니다.
          box.removeChild(b);
          var carry = [b];
          while (box.lastElementChild && isHeading(box.lastElementChild) && box.children.length > 1) {
            carry.unshift(box.removeChild(box.lastElementChild));
          }
          queue = carry.concat(queue);
          slide = bodySlide(post, sec, true); box = slide._content;
          continue;
        }

        // 빈 슬라이드에도 다 안 들어감
        if (isImageBlock(b)) {
          if (!shrinkImageBlock(b, box, 24)) forceFit(b, box);
          continue;
        }
        var t2 = (kind !== 'atomic') ? splitNode(b, box, false) : null;
        if (t2 && fits(box)) {
          queue.unshift(t2);
          slide = bodySlide(post, sec, true); box = slide._content;
          continue;
        }
        if (t2) queue.unshift(t2);
        forceFit(b, box);
        if (queue.length) { slide = bodySlide(post, sec, true); box = slide._content; }
      }
      // 빈 연속 슬라이드는 지웁니다(나눈 뒤 남은 것이 없을 때)
      if (!box.children.length && slide.querySelector('.body__cont')) {
        removeSlide(slide);
        curSlide = null; curBox = null;
      } else {
        curSlide = slide; curBox = box;
      }
    });
  }
  function isCode(b) { return b.nodeType === 1 && (b.classList.contains('highlighter-rouge') || b.classList.contains('highlight') || !!b.querySelector('pre')); }
  function removeSlide(s) {
    var i = state.slides.indexOf(s);
    if (i >= 0) state.slides.splice(i, 1);
    if (s.parentNode) s.parentNode.removeChild(s);
  }

  /* ---------------------------------------------------------------- 7. 표지·목차·글 표지·갤러리·마무리 */
  function tagsList(tags, extra) {
    var ul = h('ul', 's-tags' + (extra ? ' ' + extra : ''));
    tags.forEach(function (t) { ul.appendChild(h('li', null, t)); });
    return ul;
  }
  function makeLinkValue(text, href) {
    var el;
    if (href && isPdfLinkUrl(href)) {
      el = h('a', 's-link', text);
      el.href = href;
      el.target = '_blank';
      el.rel = 'noopener';
    } else {
      el = h('span', null, text);
    }
    el.setAttribute('data-v', '');
    return el;
  }
  function postMetaItems(post) {
    var items = (post.meta || []).slice();
    var postUrl = publicPostUrl(post);
    if (postUrl) items.push({ k: '웹에서 보기', v: displayUrl(postUrl), href: postUrl });
    return items;
  }
  function metaList(meta) {
    var ul = h('ul', 's-meta');
    meta.forEach(function (m) {
      var li = h('li');
      var k = h('span', null, m.k); k.setAttribute('data-k', '');
      li.appendChild(k); li.appendChild(makeLinkValue(m.v, m.href)); ul.appendChild(li);
    });
    return ul;
  }
  function regionOverflows(slide) { return overflowList(slide, 1).length > 0; }

  // 글자 크기를 단계적으로 줄여 영역 안에 맞춥니다
  function fitSteps(slide, steps) {
    for (var i = 0; i < steps.length && regionOverflows(slide); i++) steps[i]();
  }

  function coverSlides() {
    var p = state.data.profile;
    var name = p.name || state.data.siteTitle;
    var s = newSlide('cover', { footPost: '' });
    var text = h('div', 'cover__text');
    text.setAttribute('data-region', '');
    text.appendChild(h('p', 's-kicker', '포트폴리오'));
    var nm = h('h1', 'cover__name', name);
    text.appendChild(nm);
    if (p.role) text.appendChild(h('p', 'cover__role', p.role));
    var bio = h('div', 'cover__bio');
    bio.appendChild(p.bio.cloneNode(true));
    var hasBio = squash(bio.textContent) !== '' || !!bio.querySelector('img');
    if (hasBio) text.appendChild(bio);
    var contacts = contactItems();
    if (contacts.length) {
      var cl = h('ul', 'cover__links');
      contacts.forEach(function (c) {
        var li = h('li');
        var k = h('span', null, c.k); k.setAttribute('data-k', '');
        li.appendChild(k); li.appendChild(makeLinkValue(c.v, c.href)); cl.appendChild(li);
      });
      text.appendChild(cl);
    }
    s._main.appendChild(text);

    var side = h('div', 'cover__side');
    side.setAttribute('data-region', '');
    if (p.avatar) {
      var av = h('div', 'cover__avatar s-media');
      av.appendChild(makeImage(p.avatar, name + ' 프로필 사진', 240, 240));
      side.appendChild(av);
    } else {
      side.appendChild(h('div', 'cover__initial', (name || '?').slice(0, 1)));
    }
    if (p.skills.length) side.appendChild(tagsList(p.skills, 'cover__skills'));
    s.appendChild(side);

    var size = 92;
    fitSteps(s, [
      function () { nm.style.fontSize = (size = 80) + 'px'; },
      function () { nm.style.fontSize = (size = 68) + 'px'; },
      function () { bio.style.fontSize = '19px'; },
      function () { nm.style.fontSize = '56px'; },
      function () { bio.style.fontSize = '17px'; }
    ]);
    // 소개글이 표지에 다 안 들어가면 표지에서 빼고 '소개' 슬라이드로 나눠 싣습니다
    if (hasBio && regionOverflows(s)) {
      text.removeChild(bio);
      nm.style.fontSize = '';
      fitSteps(s, [function () { nm.style.fontSize = '68px'; }, function () { nm.style.fontSize = '52px'; }]);
      var pseudo = { idx: 'bio', key: '', title: '소개' };
      var frag = p.bio.cloneNode(true);
      var blocks = prepareBody(pseudo, frag);
      paginateBody(pseudo, blocks, '소개');
    }
  }

  function contactItems() {
    var p = state.data.profile;
    var out = [];
    if (p.email) out.push({ k: '이메일', v: p.email, href: 'mailto:' + String(p.email).trim() });
    var siteUrl = publicSiteUrl();
    if (siteUrl) out.push({ k: '웹 포트폴리오', v: displayUrl(siteUrl), href: siteUrl });
    p.links.forEach(function (l) {
      out.push({ k: l.label || '링크', v: displayUrl(l.url), href: isPdfLinkUrl(l.url) ? l.url : '' });
    });
    return out;
  }

  function tocSlides(posts) {
    var made = [];
    var cats = [];
    posts.forEach(function (post) {
      var c = post.category || '프로젝트';
      if (cats.indexOf(c) < 0) cats.push(c);
    });
    var tocKicker = (cats.length === 1 ? cats[0] : '수록 글') + ' ' + posts.length + '개';
    var items = posts.map(function (post, i) {
      var li = h('li', 'toc__item');
      li.appendChild(h('span', 'toc__no', pad2(i + 1)));
      li.appendChild(h('span', 'toc__name', post.title));
      li.appendChild(h('span', 'toc__date', post.date || ''));
      var pg = h('span', 'toc__page', '000');
      li.appendChild(pg);
      post._tocPage = pg;
      return li;
    });
    function mk(cont) {
      var s = newSlide('toc', { footPost: '목차' });
      var wrap = h('div', 'toc');
      wrap.setAttribute('data-region', '');
      wrap.appendChild(h('p', 's-kicker', tocKicker));
      wrap.appendChild(h('h2', 'toc__title', cont ? '목차 (계속)' : '목차'));
      var list = h('ol', 'toc__list');
      wrap.appendChild(list);
      s._main.appendChild(wrap);
      made.push(s);
      return list;
    }
    var list = mk(false);
    items.forEach(function (li) {
      list.appendChild(li);
      if (regionOverflows(list.closest('.slide')) && list.children.length > 1) {
        list.removeChild(li);
        list = mk(true);
        list.appendChild(li);
      }
    });
    return made;
  }

  // level: 0 = 모든 정보, 1 = 요약·태그는 다음 '글 정보' 슬라이드로, 2 = 작성일 등 정보도 함께 이동,
  //        3 = 이미지도 따로 한 장으로(글자 중심 표지). 제목이 아주 길어 넘칠 때만 단계를 올립니다.
  function postTitleSlide(post, no, level) {
    level = level || 0;
    var type = post.type;
    var media = (type === 'text-only') ? [] : post.media;
    var layout = (type === 'image-top' || type === 'image-left' || type === 'image-right') && media.length && level < 3
      ? type
      : (type === 'gallery' && media.length && level < 3 ? 'image-right' : 'type');
    var cls = layout === 'image-top' ? 'ptitle ptitle--top' : layout === 'type' ? 'ptitle ptitle--type' : 'ptitle ptitle--side ptitle--' + (layout === 'image-left' ? 'left' : 'right');
    var s = newSlide('ptitle', { post: post, footPost: post.title });
    s.className += ' ' + cls;
    s.setAttribute('data-layout', layout);

    var cat = post.category || '프로젝트';
    var kick = h('p', 's-kicker', no ? cat + ' ' + pad2(no) : (post.pinned ? '대표 ' + cat : cat));
    var title = h('h1', 'ptitle__title', post.title);
    var summary = null;
    if (level < 1 && squash(post.summary.textContent)) { summary = h('p', 'ptitle__summary'); summary.appendChild(post.summary.cloneNode(true)); }
    var metaItems = postMetaItems(post);
    var meta = level < 2 ? metaList(metaItems) : h('div', 'ptitle__nometa');
    var tags = level < 1 && post.tags.length ? tagsList(post.tags) : null;
    var ts = 52, ss = 22;
    function setT(v) { ts = v; title.style.fontSize = v + 'px'; }
    function setS(v) { ss = v; if (summary) summary.style.fontSize = v + 'px'; }

    if (layout === 'image-top') {
      var band = h('div', 'ptitle__band');
      band.setAttribute('data-region', '');
      var bandH = 330;
      var m0 = media[0];
      var cap = m0.caption ? h('p', 'ptitle__caption', m0.caption) : null;
      var imgWrap = h('div', 's-media');
      band.appendChild(imgWrap);
      if (cap) band.appendChild(cap);
      var setBand = function (hh) {
        bandH = hh;
        band.style.setProperty('--band-h', hh + 'px');
        clearNode(imgWrap);
        imgWrap.appendChild(makeImage(m0.src, m0.alt, SLIDE_W - 176, hh - 48 - (cap ? 30 : 0)));
      };
      setBand(bandH);
      var text = h('div', 'ptitle__text');
      var left = h('div', 'ptitle__left'); left.setAttribute('data-region', '');
      var right = h('div', 'ptitle__right'); right.setAttribute('data-region', '');
      left.appendChild(kick); left.appendChild(title); if (tags) left.appendChild(tags);
      right.appendChild(meta); if (summary) right.appendChild(summary);
      text.appendChild(left); text.appendChild(right);
      s._main.appendChild(band); s._main.appendChild(text);
      setT(44); setS(19);
      fitSteps(s, [
        function () { setT(40); }, function () { setS(18); }, function () { setBand(290); },
        function () { setT(36); }, function () { setBand(250); }, function () { setS(17); },
        function () { setT(32); }, function () { setBand(210); }, function () { setT(28); }, function () { setS(15); },
        function () { setBand(170); }
      ]);
    } else if (layout === 'type') {
      var tx = h('div', 'ptitle__text');
      tx.setAttribute('data-region', '');
      var rule = h('hr', 'ptitle__rule');
      tx.appendChild(kick); tx.appendChild(title); tx.appendChild(rule); tx.appendChild(meta);
      if (tags) tx.appendChild(tags);
      if (summary) tx.appendChild(summary);
      s._main.appendChild(tx);
      setT(64); setS(24);
      fitSteps(s, [
        function () { setT(56); }, function () { setT(48); }, function () { setS(21); }, function () { setT(42); },
        function () { setS(19); }, function () { setT(36); }, function () { setS(17); }, function () { setT(30); }, function () { setS(15); },
        function () { setT(26); }, function () { setT(22); }, function () { setT(19); }
      ]);
    } else {
      var panel = h('div', 'ptitle__panel');
      panel.setAttribute('data-region', '');
      var mm = media[0];
      var pw = h('div', 's-media');
      var capH = mm.caption ? 44 : 0;
      pw.appendChild(makeImage(mm.src, mm.alt, 520 - 68, SLIDE_H - 68 - capH));
      panel.appendChild(pw);
      if (mm.caption) panel.appendChild(h('p', 'ptitle__caption', mm.caption));
      var tx2 = h('div', 'ptitle__text');
      tx2.setAttribute('data-region', '');
      tx2.appendChild(kick); tx2.appendChild(title); tx2.appendChild(meta);
      if (tags) tx2.appendChild(tags);
      if (summary) tx2.appendChild(summary);
      s.appendChild(panel);
      s._main.appendChild(tx2);
      setT(48); setS(20);
      fitSteps(s, [
        function () { setT(42); }, function () { setS(18); }, function () { setT(36); }, function () { setS(17); },
        function () { setT(32); }, function () { setT(28); }, function () { setS(15); },
        function () { setT(26); }, function () { setS(14.5); }
      ]);
    }
    return s;
  }

  // 표지에서 옮겨 온 요약·태그(·작성일 등)를 '글 정보' 슬라이드에 싣습니다. 본문과 같은 방식으로 나눠 담습니다.
  function infoSlides(post, level) {
    var blocks = [];
    if (squash(post.summary.textContent)) {
      var p = h('p', 's-info-summary'); p.appendChild(post.summary.cloneNode(true)); blocks.push(p);
    }
    var metaItems = postMetaItems(post);
    if (level >= 2 && metaItems.length) blocks.push(metaList(metaItems));
    if (post.tags.length) blocks.push(tagsList(post.tags));
    if (!blocks.length) return;
    var pseudo = { key: post.key, title: post.title, idx: post.idx + 'i', role: 'info' };
    paginateBody(pseudo, blocks, '글 정보');
  }

  function gallerySlides(post, heading, customItems) {
    var items = customItems || post.media;
    if (!items.length) return;
    var i = 0, part = 0;
    while (i < items.length) {
      var count = Math.min(6, items.length - i);
      var s = buildGallery(post, items.slice(i, i + count), part > 0, heading);
      // 캡션이 길어 넘치면 한 장에 넣는 수를 줄입니다
      while (regionOverflows(s) && count > 1) {
        removeSlide(s);
        count--;
        s = buildGallery(post, items.slice(i, i + count), part > 0, heading);
      }
      i += count; part++;
    }
  }
  function buildGallery(post, list, cont, heading) {
    var s = newSlide('gallery', { post: post, footPost: post.title });
    var g = h('div', 'gal');
    var head = h('div', 'gal__head');
    head.appendChild(h('p', 'body__kicker', shorten(post.title, 70)));
    var t = h('h2', 'gal__title', heading || '갤러리');
    if (cont) t.appendChild(h('span', 'body__cont', ' (계속)'));
    head.appendChild(t);
    var grid = h('div', 'gal__grid');
    grid.setAttribute('data-region', '');
    g.appendChild(head); g.appendChild(grid);
    s._main.appendChild(g);
    var n = list.length;
    var cols = n <= 3 ? n : (n === 4 ? 2 : 3);
    var rows = n <= 3 ? 1 : 2;
    var gw = SLIDE_W - 176;
    var cw = Math.floor((gw - (cols - 1) * 22) / cols);
    var gh = grid.getBoundingClientRect().height;
    var hasCap = list.some(function (m) { return !!m.caption; });
    var capH = hasCap ? 30 : 0;
    var bh = Math.floor((gh - (rows - 1) * 16) / rows) - capH - 8;
    function fill(boxH) {
      clearNode(grid);
      list.forEach(function (m) {
        var cell = h('figure', 'gal__cell');
        cell.style.width = cw + 'px';
        cell.style.margin = '0';
        var box = h('div', 'gal__box');
        box.style.width = cw + 'px'; box.style.height = boxH + 'px';
        box.appendChild(makeImage(m.src, m.alt, cw - 24, boxH - 24));
        cell.appendChild(box);
        if (m.caption) cell.appendChild(h('figcaption', 'gal__cap', m.caption));
        grid.appendChild(cell);
      });
    }
    fill(bh);
    var guard = 0;
    while (regionOverflows(s) && bh > 100 && guard++ < 30) { bh -= 16; fill(bh); }
    return s;
  }

  function closingSlide() {
    var p = state.data.profile;
    var s = newSlide('closing', { footPost: '' });
    var c = h('div', 'closing');
    c.setAttribute('data-region', '');
    c.appendChild(h('p', 's-kicker', '마무리'));
    c.appendChild(h('h2', 'closing__title', '감사합니다'));
    var who = [p.name || state.data.siteTitle, p.role].filter(Boolean).join(' · ');
    if (who) c.appendChild(h('p', 'closing__sub', who));
    var items = contactItems();
    if (items.length) {
      var ul = h('ul', 'closing__list');
      items.forEach(function (it) {
        var li = h('li');
        var k = h('span', null, it.k); k.setAttribute('data-k', '');
        li.appendChild(k); li.appendChild(makeLinkValue(it.v, it.href)); ul.appendChild(li);
      });
      c.appendChild(ul);
    }
    s._main.appendChild(c);
    return s;
  }

  /* ---------------------------------------------------------------- 8. 덱 만들기 */
  function buildPost(post, no) {
    post.firstSlide = null;
    var before = state.slides.length;
    // 표지에 다 들어가지 않으면(아주 긴 제목·요약·태그) 단계적으로 정보를 다음 슬라이드로 옮깁니다. 잘라 버리지 않습니다.
    var level = 0;
    var ts = postTitleSlide(post, no, 0);
    while (regionOverflows(ts) && level < 3) {
      removeSlide(ts);
      level++;
      ts = postTitleSlide(post, no, level);
    }
    var hasImgTitle = post.type === 'image-top' || post.type === 'image-left' || post.type === 'image-right';
    var usedHeroOnTitle = ts.getAttribute('data-layout') !== 'type';
    if (level >= 3 && (hasImgTitle || post.type === 'gallery') && post.media.length) gallerySlides(post, post.type === 'gallery' ? '갤러리' : '대표 이미지');
    if (level >= 1) infoSlides(post, level);
    if (post.type === 'gallery' && level < 3) {
      var rest = usedHeroOnTitle ? post.media.slice(1) : post.media;
      if (rest.length) gallerySlides(post, '갤러리', rest);
    }
    var blocks = prepareBody(post, post.body.cloneNode(true));
    paginateBody(post, blocks, post.title);
    post.firstSlide = state.slides[before];
  }

  function buildDeck() {
    var posts = state.posts;
    if (state.mode === 'deck') {
      coverSlides();
      var toc = tocSlides(posts);
      posts.forEach(function (p, i) { buildPost(p, i + 1); });
      closingSlide();
      posts.forEach(function (p) { p._tocPage.textContent = String(state.slides.indexOf(p.firstSlide) + 1); });
      void toc;
    } else {
      buildPost(posts[0], 0);
    }
    var N = state.slides.length;
    state.missing = { cors: 0, load: 0 };
    state.slides.forEach(function (s, i) {
      s.querySelector('.slide__num').textContent = (i + 1) + ' / ' + N;
      s.setAttribute('data-n', String(i + 1));
      // 바닥글의 글 제목이 칸보다 길면 말줄임표(…)로 줄입니다(잘린 글자가 보이지 않게). 전체 제목은 표지에 있습니다.
      var fp = s.querySelector('.slide__post');
      if (fp && fp.scrollWidth > fp.clientWidth + 1) {
        var full = s._footPost || '';
        var lo = 0, hi = full.length;
        while (lo < hi) {
          var mid = (lo + hi + 1) >> 1;
          fp.textContent = full.slice(0, mid) + '…';
          if (fp.scrollWidth > fp.clientWidth + 1) hi = mid - 1; else lo = mid;
        }
        fp.textContent = lo ? full.slice(0, lo) + '…' : '';
      }
      state.missing.cors += s.querySelectorAll('[data-missing="cors"]').length;
      state.missing.load += s.querySelectorAll('[data-missing="load"]').length;
    });
  }

  function mountDeck() {
    var N = state.slides.length;
    var frag = document.createDocumentFragment();
    state.slides.forEach(function (s, i) {
      var li = h('li', 'sl-frame');
      li.setAttribute('aria-label', '슬라이드 ' + (i + 1) + ' / ' + N);
      li.appendChild(s);
      frag.appendChild(li);
    });
    ui.deck.appendChild(frag);
    rescale();
    if (window.ResizeObserver) new ResizeObserver(rescale).observe(ui.deck);
    else window.addEventListener('resize', rescale);
  }
  function rescale() {
    var f = ui.deck.firstElementChild;
    if (!f) return;
    var w = f.clientWidth;
    if (w > 0) ui.deck.style.setProperty('--sl-scale', (w / SLIDE_W).toFixed(5));
  }

  /* ---------------------------------------------------------------- 9. 점검 (자동 테스트용) */
  // 글마다: 본문 글자(공백 제외)가 원문과 같은지, 본문 이미지가 정확히 한 번씩 있는지, 잘린 곳이 없는지
  function slideCheck() {
    var res = { ok: true, slideCount: state.slides.length, mode: state.mode, posts: [], otherOverflow: [] };
    state.posts.forEach(function (post) {
      var slides = state.slides.filter(function (s) { return s.getAttribute('data-post') === post.key && s.getAttribute('data-role') === 'body'; });
      var txt = '';
      var sidCount = {};
      slides.forEach(function (s) {
        var title = s.querySelector('.body__title');
        if (title && !title.hasAttribute('data-repeat')) txt += cleanText(title);
        var content = s.querySelector('.body__content');
        txt += cleanText(content);
        Array.prototype.forEach.call(content.querySelectorAll('[data-sid]'), function (n) {
          var k = n.getAttribute('data-sid'); sidCount[k] = (sidCount[k] || 0) + 1;
        });
      });
      var textOk = txt === post.srcText;
      var missingImgs = post.srcSids.filter(function (k) { return sidCount[k] !== 1; });
      var extra = Object.keys(sidCount).filter(function (k) { return post.srcSids.indexOf(k) < 0; });
      var over = [];
      state.slides.forEach(function (s) {
        if (s.getAttribute('data-post') !== post.key) return;
        overflowList(s, 1).forEach(function (o) { o.slide = +s.getAttribute('data-n'); over.push(o); });
      });
      var r = {
        key: post.key, title: post.title, bodySlides: slides.length,
        textOk: textOk, srcChars: post.srcText.length, slideChars: txt.length,
        images: post.srcSids.length, imagesOk: !missingImgs.length && !extra.length,
        overflowOk: !over.length, overflow: over.slice(0, 5)
      };
      if (!textOk) {
        var i = 0; while (i < txt.length && txt[i] === post.srcText[i]) i++;
        r.firstDiffAt = i; r.expected = post.srcText.slice(Math.max(0, i - 15), i + 25); r.got = txt.slice(Math.max(0, i - 15), i + 25);
      }
      r.ok = r.textOk && r.imagesOk && r.overflowOk;
      if (!r.ok) res.ok = false;
      res.posts.push(r);
    });
    state.slides.forEach(function (s) {
      if (s.getAttribute('data-post')) return;
      overflowList(s, 1).forEach(function (o) { o.slide = +s.getAttribute('data-n'); res.otherOverflow.push(o); });
    });
    if (res.otherOverflow.length) res.ok = false;
    return res;
  }
  // 요소가 화면에 보이는가: 접힌 <details> 의 내용, display:none, visibility:hidden, content-visibility 로 감춰진 것은 '안 보임'
  function isShown(el) {
    if (!el) return true;
    var d = el.closest('details:not([open])');
    if (d) { var sm = el.closest('summary'); if (!sm || sm.parentElement !== d) return false; }
    if (el.checkVisibility) return el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true });
    var cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  // 슬라이드에 '실제로 그려진' 글자만 모읍니다. 접혀 있거나 숨겨져 화면에 나오지 않는 글자는 들어간 것으로 치지 않아,
  // 그런 내용이 빠지면 점검에서 드러납니다. 반복 제목·(계속)·목록 기호 등(data-nt, data-repeat)은 제외합니다.
  function cleanText(node) {
    var out = '';
    var r = document.createRange();
    var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    var t;
    while ((t = w.nextNode())) {
      if (!squash(t.data)) continue;
      var el = t.parentElement;
      if (el && el.closest('[data-nt], [data-repeat]') && node.contains(el.closest('[data-nt], [data-repeat]'))) continue;
      if (!isShown(el)) continue;
      r.selectNodeContents(t);
      if (!r.getClientRects().length) continue;
      out += t.data;
    }
    return squash(out);
  }

  /* ---------------------------------------------------------------- 10. PDF 저장 */
  // 파일 이름에 쓸 수 있는 글자로 정리합니다(Windows·macOS 공통).
  //  - Windows 금지 문자 \ / : * ? " < > | 와 제어 문자 → 공백(제어 문자는 삭제), 연속 공백은 하나로
  //  - 앞뒤의 공백·점 제거(끝의 점·공백은 Windows 가 지우고, 앞의 점은 macOS 에서 숨김 파일이 됨)
  //  - 120자에서 자른 뒤 끝의 공백·점을 다시 제거
  //  - Windows 예약 이름(CON, PRN, AUX, NUL, COM1–9, LPT1–9)은 확장자가 붙어도(con.txt) 예약이므로 뒤에 _ 를 붙임
  function cleanName(name) {
    var s = String(name || '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[. ]+|[. ]+$/g, '');
    if (s.length > 120) s = s.slice(0, 120).replace(/[. ]+$/g, '');
    s = s.replace(/^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])(?=\.|$)/i, '$1_');
    return s;
  }
  function safeFileName(name, suffix) {
    var base = cleanName(name);
    if (!base) return suffix ? 'portfolio.pdf' : 'slides.pdf';
    return base + (suffix || '') + '.pdf';
  }

  // PDF 변환용 '무대': 화면 밖에 둔 같은 출처의 빈 iframe 문서.
  // 슬라이드를 한 장씩 이 문서로 복사해 그립니다. 변환 라이브러리는 대상이 속한 문서 전체를 복제하므로,
  // 슬라이드 수십 장이 있는 미리보기 문서 대신 슬라이드 한 장만 있는 문서를 넘겨야 빠르고,
  // WebKit(사파리)에서 이미지가 빠지는 문제도 생기지 않습니다.
  var stage = null;
  function getStage() {
    if (stage) return Promise.resolve(stage);
    return new Promise(function (resolve, reject) {
      var f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true');
      f.setAttribute('tabindex', '-1');
      f.title = 'PDF 변환용 (보이지 않음)';
      f.style.cssText = 'position:absolute;left:-30000px;top:0;width:' + SLIDE_W + 'px;height:' + SLIDE_H + 'px;border:0;';
      document.body.appendChild(f);
      var d = f.contentDocument;
      var links = Array.prototype.map.call(document.querySelectorAll('link[rel="stylesheet"]'), function (l) {
        return '<link rel="stylesheet" href="' + l.href.replace(/"/g, '&quot;') + '">';
      }).join('');
      d.open();
      d.write('<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">' + links +
        '<style>html,body{margin:0;padding:0;min-height:0;display:block;background:' + SLIDE_BG + ';}</style></head><body></body></html>');
      d.close();
      var sheets = Array.prototype.slice.call(d.querySelectorAll('link[rel="stylesheet"]'));
      var timer = setTimeout(function () { reject(new Error('변환용 스타일을 불러오지 못했습니다')); }, 20000);
      Promise.all(sheets.map(function (l) {
        return new Promise(function (r) {
          if (l.sheet) { r(); return; }
          l.addEventListener('load', r); l.addEventListener('error', r);
        });
      })).then(function () {
        clearTimeout(timer);
        stage = { frame: f, doc: d };
        resolve(stage);
      });
    });
  }

  function imagesLoaded(root) {
    return Promise.all(Array.prototype.map.call(root.querySelectorAll('img'), function (img) {
      var p = (img.complete && img.naturalWidth) ? Promise.resolve() : new Promise(function (r) {
        img.addEventListener('load', r); img.addEventListener('error', r); setTimeout(r, 15000);
      });
      return p.then(function () { return img.decode ? img.decode().catch(function () {}) : null; });
    }));
  }

  function collectSlideLinks(slideNode) {
    var nr = slideNode.getBoundingClientRect();
    if (!nr.width || !nr.height) return [];
    var sx = PDF_W / SLIDE_W;
    var sy = PDF_H / SLIDE_H;
    var out = [];
    Array.prototype.forEach.call(slideNode.querySelectorAll('a[href]'), function (a) {
      var href = a.getAttribute('href') || '';
      if (!isPdfLinkUrl(href)) return;
      var rects = (!a.querySelector('img, svg') && a.getClientRects) ? a.getClientRects() : null;
      var list = (rects && rects.length) ? rects : [a.getBoundingClientRect()];
      Array.prototype.forEach.call(list, function (r) {
        if (r.width < 1 || r.height < 1) return;
        var x1 = Math.max(0, (r.left - nr.left) * sx);
        var y1 = Math.max(0, (r.top - nr.top) * sy);
        var x2 = Math.min(PDF_W, (r.right - nr.left) * sx);
        var y2 = Math.min(PDF_H, (r.bottom - nr.top) * sy);
        if (x2 - x1 > 1 && y2 - y1 > 1) {
          out.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, url: href });
        }
      });
    });
    return out;
  }

  async function capture(slide) {
    var st = await getStage();
    var node = st.doc.importNode(slide, true);
    node.style.transform = 'none';
    st.doc.body.appendChild(node);
    try {
      await imagesLoaded(node);
      var links = collectSlideLinks(node);
      var canvas = await window.html2canvas(node, {
        scale: PIXEL_RATIO,
        backgroundColor: SLIDE_BG,
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 15000,
        x: 0, y: 0, width: SLIDE_W, height: SLIDE_H,
        scrollX: 0, scrollY: 0,
        windowWidth: SLIDE_W, windowHeight: SLIDE_H
      });
      return { canvas: canvas, links: links };
    } finally {
      if (node.parentNode) node.parentNode.removeChild(node);
    }
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.parentNode && a.parentNode.removeChild(a); }, 60000);
  }

  async function savePdf() {
    if (state.busy) return;
    if (!window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) {
      setStatus('PDF 라이브러리를 불러오지 못했습니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.', true);
      return;
    }
    state.busy = true;
    ui.save.disabled = true;
    ui.save.setAttribute('aria-busy', 'true');
    var N = state.slides.length;
    var t0 = Date.now();
    try {
      var pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: [PDF_W, PDF_H], compress: true });
      for (var i = 0; i < N; i++) {
        setStatus('슬라이드 ' + (i + 1) + ' / ' + N + ' 생성 중…');
        await nextFrame();
        var captured = await capture(state.slides[i]);
        var canvas = captured.canvas;
        var data = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        // 메모리 정리: 캔버스는 바로 비웁니다
        canvas.width = 0; canvas.height = 0;
        if (i > 0) pdf.addPage([PDF_W, PDF_H], 'landscape');
        pdf.addImage(data, 'JPEG', 0, 0, PDF_W, PDF_H, 'slide-' + (i + 1), 'NONE');
        captured.links.forEach(function (lnk) {
          if (typeof pdf.link === 'function') pdf.link(lnk.x, lnk.y, lnk.w, lnk.h, { url: lnk.url });
        });
        data = null;
      }
      pdf.setProperties({ title: state.deckTitle, subject: state.deckTitle, creator: state.data.siteTitle || '' });
      setStatus('PDF 파일을 만드는 중…');
      await nextFrame();
      var blob = pdf.output('blob');
      download(blob, state.fileName);
      var mb = (blob.size / 1048576).toFixed(1);
      var msg = 'PDF 저장 완료: ' + state.fileName + ' (' + N + '쪽, ' + mb + 'MB, ' + Math.round((Date.now() - t0) / 1000) + '초).';
      msg += missingNote();
      if (state.warning) msg += ' ' + state.warning;
      setStatus(msg);
      document.documentElement.setAttribute('data-pdf', 'done');
    } catch (e) {
      if (window.console) console.error(e);
      setStatus('PDF 를 만들지 못했습니다(' + ((e && e.message) || '알 수 없는 오류') + '). 페이지를 새로 고친 뒤 다시 시도해 주세요. 계속 실패하면 이 페이지에서 Ctrl+P(맥은 ⌘+P)로 인쇄해 PDF 로 저장할 수 있습니다.', true);
      document.documentElement.setAttribute('data-pdf', 'error');
    } finally {
      state.busy = false;
      ui.save.disabled = false;
      ui.save.removeAttribute('aria-busy');
    }
  }

  // PDF 에 넣지 못한 이미지 안내 문구
  function missingNote() {
    var m = state.missing || { cors: 0, load: 0 };
    var parts = [];
    if (m.cors) parts.push('다른 사이트가 허용하지 않은 외부 이미지 ' + m.cors + '개');
    if (m.load) parts.push('불러오지 못한 이미지 ' + m.load + '개');
    return parts.length ? ' ' + parts.join(', ') + '는 PDF 에 넣을 수 없어 자리 표시로 대신합니다.' : '';
  }

  /* ---------------------------------------------------------------- 시작 */
  async function main() {
    ui.status = document.getElementById('sl-status');
    ui.save = document.getElementById('sl-save');
    ui.count = document.getElementById('sl-count');
    ui.deck = document.getElementById('sl-deck');
    ui.message = document.getElementById('sl-message');
    ui.title = document.getElementById('sl-deck-title');
    ui.back = document.getElementById('sl-back');
    ui.backLabel = document.getElementById('sl-back-label');
    measure = document.getElementById('sl-measure');
    var nojs = document.getElementById('sl-nojs');
    if (nojs) nojs.parentNode.removeChild(nojs);

    var data = readSource();
    if (!data) { showMessage('슬라이드 재료를 찾지 못했습니다.', []); return; }
    state.data = data;
    data.posts.forEach(function (p, i) { p.idx = i; });

    var key = new URLSearchParams(location.search).get('post');
    var homeHref = data.home;
    if (key) {
      state.mode = 'post';
      var found = null;
      data.posts.forEach(function (p) {
        if (!found && (p.key === key || safeDecode(p.key) === safeDecode(key))) found = p;
      });
      if (!found) {
        var excludedMatch = null;
        (data.excluded || []).forEach(function (p) {
          if (!excludedMatch && (p.key === key || safeDecode(p.key) === safeDecode(key))) excludedMatch = p;
        });
        if (excludedMatch) {
          ui.title.textContent = excludedMatch.title || 'PDF 추출 제외 글';
          ui.back.href = absUrl(homeHref.replace(/\/$/, '') + excludedMatch.key);
          ui.backLabel.textContent = '글로 돌아가기';
          showMessage('이 글은 PDF 추출 대상에서 제외되어 있습니다.', ['글의 front matter 설정(pdf: false)에 따라 슬라이드 PDF 생성을 비활성화했습니다. ', ['글 본문으로 돌아가기', ui.back.href], ' 또는 ', ['전체 슬라이드 보기', homeHref.replace(/\/?$/, '/') + 'slides/'], '.']);
          document.documentElement.setAttribute('data-slides', 'excluded');
          return;
        }
        ui.title.textContent = '글을 찾을 수 없습니다';
        ui.backLabel.textContent = '메인으로';
        showMessage('요청한 글을 찾을 수 없습니다.', ['주소가 바뀌었거나 삭제된 글일 수 있습니다. ', ['메인 페이지', homeHref], '에서 글을 다시 열어 주세요. 전체 포트폴리오 슬라이드는 ', ['이곳', homeHref.replace(/\/?$/, '/') + 'slides/'], '에서 볼 수 있습니다.']);
        document.documentElement.setAttribute('data-slides', 'not-found');
        return;
      }
      state.posts = [found];
      state.deckTitle = found.title;
      state.fileName = safeFileName(found.title);
      ui.back.href = absUrl(homeHref.replace(/\/$/, '') + found.key);
      ui.backLabel.textContent = '글로 돌아가기';
    } else {
      state.mode = 'deck';
      state.posts = data.posts.slice();
      state.deckTitle = '포트폴리오 전체';
      state.fileName = safeFileName(data.profile.name || data.siteTitle, '-portfolio');
      ui.back.href = homeHref;
      ui.backLabel.textContent = '메인으로';
      if (!state.posts.length) {
        ui.title.textContent = '포트폴리오 전체';
        showMessage('PDF 추출 대상(pdf: true)으로 설정된 글이 없어 슬라이드를 만들 수 없습니다.', ['_posts 폴더의 글 front matter에서 pdf: true 로 설정하면 이곳에서 슬라이드를 PDF 로 저장할 수 있습니다. ', ['메인으로', homeHref]]);
        document.documentElement.setAttribute('data-slides', 'empty');
        return;
      }
    }
    ui.title.textContent = state.deckTitle;
    document.title = state.deckTitle + ' · 슬라이드 PDF · ' + (data.siteTitle || '');

    try {
      setStatus('이미지를 확인하는 중…');
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* 무시 */ } }
      var urls = [];
      if (state.mode === 'deck' && data.profile.avatar) urls.push(data.profile.avatar);
      state.posts.forEach(function (p) {
        p.media.forEach(function (m) { urls.push(m.src); });
        var base = postBase(p);
        Array.prototype.forEach.call(p.body.querySelectorAll('img'), function (img) { urls.push(absUrl(img.getAttribute('src'), base)); });
      });
      await Promise.all(urls.filter(Boolean).map(probe));

      setStatus('슬라이드를 배치하는 중…');
      await nextFrame();
      buildDeck();
      mountDeck();

      var N = state.slides.length;
      ui.count.textContent = '슬라이드 ' + N + '장';
      ui.count.hidden = false;
      ui.save.disabled = false;
      ui.save.addEventListener('click', savePdf);
      state.warning = checkWarning();
      var ready = state.warning
        ? '슬라이드 ' + N + '장을 만들었습니다. ' + state.warning
        : '슬라이드 ' + N + '장이 준비되었습니다. 미리보기와 같은 모양으로 PDF 에 저장되며 링크는 클릭할 수 있습니다.';
      ready += missingNote();
      setStatus(ready);
      document.documentElement.setAttribute('data-check', state.warning ? 'fail' : 'ok');
      document.documentElement.setAttribute('data-slides', 'ready');
    } catch (e) {
      if (window.console) console.error(e);
      setStatus('슬라이드를 만드는 중 오류가 났습니다(' + ((e && e.message) || '알 수 없는 오류') + '). 페이지를 새로 고쳐 주세요.', true);
      document.documentElement.setAttribute('data-slides', 'error');
    }
  }

  window.slideCheck = slideCheck;
  window.slidesSave = savePdf;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
