/* 铁皮盒贴贴 — 离线小工具主逻辑（ES2017 / Chrome 61 基线，经典脚本，无模块） */
(function () {
  'use strict';

  var W = 1080;
  var H = 1440;

  var canvas = document.getElementById('stage');
  var ctx = canvas.getContext('2d');
  var stageFrame = canvas.parentElement;
  var stageHint = document.getElementById('stage-hint');
  var fileInput = document.getElementById('file-input');
  var bgInput = document.getElementById('bg-input');
  var uploadInput = document.getElementById('upload-input');
  var toastEl = document.getElementById('toast');
  var sliderEl = document.getElementById('size-slider');
  var sliderValEl = document.getElementById('slider-val');
  var zoomLabelEl = document.getElementById('zoom-label');
  var stCountEl = document.getElementById('st-count');
  var stZoomEl = document.getElementById('st-zoom');
  var modalEl = document.getElementById('modal');
  var modalTitleEl = document.getElementById('modal-title');
  var modalInputEl = document.getElementById('modal-input');
  var modalHintEl = document.getElementById('modal-hint');
  var modalHelpEl = document.getElementById('modal-help');
  var modalExportEl = document.getElementById('modal-export');
  var exportPreviewEl = document.getElementById('export-preview');
  var materialsEl = document.getElementById('materials');

  /* ---------------- 状态 ---------------- */

  var state = { bg: 'bg_1', items: [] };
  var undoStack = [];
  var nextId = 1;
  var selectedId = null;
  var defaultScale = 1;
  var zoomPct = 100;
  var imgPool = {};
  var pendingFrame = null;
  var modalCb = null;
  var toastTimer = 0;

  var SPEC = {
    tin: { w: 860, h: 1025 },
    tile: { w: 92, h: 92 },
    stStar: { w: 150, h: 150 },
    stHeart: { w: 150, h: 150 },
    stSeal: { w: 130, h: 130 },
    stPetal: { w: 110, h: 150 },
    stBow: { w: 170, h: 120 },
    stKeychain: { w: 140, h: 200 },
    polaroid: { w: 300, h: 360 },
    strip: { w: 220, h: 600 },
    heart: { w: 300, h: 290 },
    stamp: { w: 320, h: 360 },
    cam1: { w: 380, h: 379 },
    cam2: { w: 520, h: 337 },
    cam3: { w: 510, h: 334 }
  };

  /* ---------------- 工具函数 ---------------- */

  function deg2rad(d) { return d * Math.PI / 180; }

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  var BGS = ['bg_1', 'bg_2', 'bg_3', 'bg_4', 'bg_5', 'bg_6', 'bg_7', 'bg_8', 'bg_9', 'bg_10'];
  var bgAssets = {};
  var customBgImg = null;

  function preloadBgs() {
    for (var i = 0; i < BGS.length; i++) {
      var im = new Image();
      im.onload = render;
      im.src = './assets/bg/' + BGS[i] + '.jpg';
      bgAssets[BGS[i]] = im;
    }
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 1800);
  }

  function snapshot() {
    undoStack.push(JSON.stringify({ bg: state.bg, items: state.items }));
    if (undoStack.length > 30) undoStack.shift();
  }

  function undo() {
    if (!undoStack.length) { toast('没有可撤销的操作'); return; }
    var data = JSON.parse(undoStack.pop());
    state.bg = data.bg;
    state.items = data.items;
    selectedId = null;
    syncBgSwatches();
    syncSlider();
    render();
  }

  function findItem(id) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === id) return state.items[i];
    }
    return null;
  }

  function selected() { return selectedId === null ? null : findItem(selectedId); }

  /* ---------------- 图片池 ---------------- */

  function registerUserImage(key, file) {
    var entry = { img: new Image(), loaded: false };
    entry.url = URL.createObjectURL(file);
    entry.img.onload = function () {
      entry.loaded = true;
      URL.revokeObjectURL(entry.url);
      entry.url = null;
      render();
    };
    entry.img.src = entry.url;
    imgPool[key] = entry;
  }

  /* ---------------- 背景绘制 ---------------- */

  function drawBg(c) {
    c.fillStyle = '#f6f2ea';
    c.fillRect(0, 0, W, H);
    var im = state.bg === 'custom' ? customBgImg : bgAssets[state.bg];
    if (im && im.complete && im.naturalWidth > 0) {
      var sc = Math.max(W / im.naturalWidth, H / im.naturalHeight);
      var dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
      c.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
  }

  /* ---------------- 元素绘制 ---------------- */

  var TIN_SPEC = {
    rect: { w: 860, h: 1025 },
    star: { w: 620, h: 930 },
    heart: { w: 560, h: 933 }
  };
  var tinAssets = {};

  function preloadTins() {
    var shapes = ['rect', 'star', 'heart'];
    for (var i = 0; i < shapes.length; i++) {
      var im = new Image();
      im.onload = render;
      im.src = './assets/tins/tin_' + shapes[i] + '.png';
      tinAssets[shapes[i]] = im;
    }
  }

  var CAM_KEYS = ['cam1', 'cam2', 'cam3'];
  var camAssets = {};
  /* 屏幕区域：相对相机图 [x, y, w, h] 归一化坐标，由抠图检测得到 */
  var CAM_SCREEN = {
    cam1: [0.1134, 0.2049, 0.5142, 0.6888],
    cam2: [0.0857, 0.2837, 0.5482, 0.6336],
    cam3: [0.0769, 0.3238, 0.4595, 0.5365]
  };

  function preloadCams() {
    for (var i = 0; i < CAM_KEYS.length; i++) {
      var im = new Image();
      im.onload = render;
      im.src = './assets/cam/' + CAM_KEYS[i] + '.png';
      camAssets[CAM_KEYS[i]] = im;
    }
  }

  function drawTin(c, item) {
    var im = tinAssets[item.shape];
    if (im && im.complete && im.naturalWidth > 0) {
      c.save();
      c.shadowColor = 'rgba(60,30,40,0.28)';
      c.shadowBlur = 14;
      c.shadowOffsetY = 8;
      c.drawImage(im, -item.w / 2, -item.h / 2, item.w, item.h);
      c.restore();
    } else {
      c.fillStyle = '#cfd4da';
      rr(c, -item.w / 2, -item.h / 2, item.w, item.h, 56);
      c.fill();
    }
  }

  var DECALS = ['star_text', 'kaomoji', 'bow', 'star_best', 'bubbles',
                'star_bloom', 'chat', 'heart_text', 'camera', 'patches',
                'license_cream', 'license_blue', 'license_purple',
                'stk_green', 'stk_grid', 'stk_blue',
                'stk_diamond_blue', 'stk_diamond_yellow', 'stk_red'];
  var decalAssets = {};

  function preloadDecals() {
    for (var i = 0; i < DECALS.length; i++) {
      var im = new Image();
      im.onload = render;
      im.src = './assets/decal/decal_' + DECALS[i] + '.png';
      decalAssets[DECALS[i]] = im;
    }
  }

  var SCRIPT_COLOR = '#b8518f';
  var LABEL_COLOR = '#c2689a';
  var LABEL_TEXT_COLOR = '#ffffff';

  function labelFont(size) {
    return '700 ' + size + 'px -apple-system, "Segoe UI", "PingFang SC", sans-serif';
  }

  var OBJS = ['earbud', 'glasses', 'tape', 'cd',
              'clip1', 'clip2', 'clip3', 'clip4', 'pin1', 'pin2',
              'cardvert', 'cardhorz', 'phone',
              'charm', 'cherry', 'star', 'apple',
              'bow_mint', 'bow_pink', 'bow_navy',
              'btn_star', 'btn_heart', 'btn_cloud'];

  function preloadObjs() {
    for (var i = 0; i < OBJS.length; i++) {
      var im = new Image();
      im.onload = render;
      im.src = './assets/obj/obj_' + OBJS[i] + '.png';
      decalAssets['obj_' + OBJS[i]] = im;
    }
  }

  function drawDecal(c, item) {
    var im = decalAssets[item.decal];
    if (im && im.complete && im.naturalWidth > 0) {
      c.save();
      c.shadowColor = 'rgba(60,30,40,0.22)';
      c.shadowBlur = 10;
      c.shadowOffsetY = 6;
      c.drawImage(im, -item.w / 2, -item.h / 2, item.w, item.h);
      c.restore();
    } else {
      c.fillStyle = '#eee';
      c.fillRect(-item.w / 2, -item.h / 2, item.w, item.h);
    }
  }

  var BEADS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
               'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
               'heart', 'star'];
  var tileAssets = {};

  function preloadTiles() {
    for (var i = 0; i < BEADS.length; i++) {
      var im = new Image();
      im.onload = render;
      im.src = './assets/tiles/tile_' + BEADS[i] + '.png';
      tileAssets[BEADS[i]] = im;
    }
  }

  function drawTile(c, item) {
    var im = tileAssets[item.ch];
    if (im && im.complete && im.naturalWidth > 0) {
      c.save();
      c.shadowColor = 'rgba(60,30,40,0.3)';
      c.shadowBlur = 8;
      c.shadowOffsetY = 5;
      c.drawImage(im, -46, -46, 92, 92);
      c.restore();
    } else {
      c.fillStyle = '#ffffff';
      rr(c, -46, -46, 92, 92, 46);
      c.fill();
    }
  }

  function starPath(c, rOut, rIn, points) {
    points = points || 5;
    c.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var r = i % 2 === 0 ? rOut : rIn;
      var a = -Math.PI / 2 + i * Math.PI / points;
      var x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
  }

  function heartPath(c, s) {
    c.beginPath();
    c.moveTo(0, s * 0.35);
    c.bezierCurveTo(-s * 0.9, -s * 0.25, -s * 0.45, -s * 0.85, 0, -s * 0.42);
    c.bezierCurveTo(s * 0.45, -s * 0.85, s * 0.9, -s * 0.25, 0, s * 0.35);
    c.closePath();
  }

  function drawSticker(c, item) {
    var k = item.kind;
    if (k === 'stStar') {
      starPath(c, 72, 30);
      c.fillStyle = '#f7d94c'; c.fill();
      c.strokeStyle = '#d9a520'; c.lineWidth = 5; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.beginPath(); c.arc(-14, -22, 9, 0, Math.PI * 2); c.fill();
    } else if (k === 'stHeart') {
      heartPath(c, 70);
      c.fillStyle = '#f76fa0'; c.fill();
      c.strokeStyle = '#d84a80'; c.lineWidth = 5; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.beginPath(); c.ellipse(-20, -28, 12, 18, -0.5, 0, Math.PI * 2); c.fill();
    } else if (k === 'stSeal') {
      c.fillStyle = '#a32642';
      c.beginPath();
      for (var i = 0; i <= 24; i++) {
        var a = i / 24 * Math.PI * 2;
        var r = 62 + Math.sin(a * 12) * 6;
        var x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath(); c.fill();
      c.fillStyle = '#8c1e38';
      c.beginPath(); c.arc(0, 0, 46, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#c05a78';
      for (var p = 0; p < 5; p++) {
        var pa = p * Math.PI * 2 / 5 - Math.PI / 2;
        c.beginPath();
        c.ellipse(Math.cos(pa) * 18, Math.sin(pa) * 18, 12, 8, pa, 0, Math.PI * 2);
        c.fill();
      }
      c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fill();
    } else if (k === 'stPetal') {
      c.fillStyle = '#d8405a';
      c.beginPath();
      c.moveTo(0, -70);
      c.bezierCurveTo(60, -30, 48, 40, 0, 72);
      c.bezierCurveTo(-48, 40, -60, -30, 0, -70);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(140,20,40,0.5)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, -50); c.lineTo(0, 55); c.stroke();
    } else if (k === 'stBow') {
      c.fillStyle = '#e0446a';
      c.beginPath();
      c.moveTo(-12, 0);
      c.bezierCurveTo(-70, -46, -78, 30, -14, 16);
      c.closePath(); c.fill();
      c.beginPath();
      c.moveTo(12, 0);
      c.bezierCurveTo(70, -46, 78, 30, 14, 16);
      c.closePath(); c.fill();
      c.beginPath();
      c.moveTo(-6, 12); c.lineTo(-26, 62); c.lineTo(-6, 58); c.lineTo(2, 20);
      c.closePath(); c.fill();
      c.beginPath();
      c.moveTo(6, 12); c.lineTo(28, 62); c.lineTo(8, 58); c.lineTo(0, 20);
      c.closePath(); c.fill();
      c.fillStyle = '#c22a52';
      c.beginPath(); c.arc(0, 4, 16, 0, Math.PI * 2); c.fill();
    } else if (k === 'stKeychain') {
      c.strokeStyle = '#9aa1aa'; c.lineWidth = 7;
      c.beginPath(); c.arc(0, -78, 22, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(0, -56); c.lineTo(0, -34); c.stroke();
      c.save();
      c.translate(0, 26);
      starPath(c, 62, 26);
      c.fillStyle = '#f7d94c'; c.fill();
      c.strokeStyle = '#d9a520'; c.lineWidth = 5; c.stroke();
      c.restore();
    }
  }

  function drawPhotoCover(c, item, x, y, w, h) {
    var entry = imgPool[item.imgKey];
    if (!entry || !entry.loaded) {
      c.fillStyle = '#f0e2e9';
      c.fillRect(x, y, w, h);
      c.fillStyle = '#c99cb4';
      c.font = '400 26px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('加载中…', x + w / 2, y + h / 2);
      return;
    }
    var img = entry.img;
    var ir = img.width / img.height, br = w / h;
    var sw = img.width, sh = img.height, sx = 0, sy = 0;
    if (ir > br) { sw = img.height * br; sx = (img.width - sw) / 2; }
    else { sh = img.width / br; sy = (img.height - sh) / 2; }
    c.save();
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    c.restore();
  }

  function stampPath(c, hw, hh, r, nx, ny) {
    var dx = (hw * 2) / nx, dy = (hh * 2) / ny;
    var i, x, y;
    c.beginPath();
    c.moveTo(-hw, -hh);
    for (i = 1; i < nx; i++) {
      x = -hw + i * dx;
      c.lineTo(x - r, -hh);
      c.arc(x, -hh, r, Math.PI, 0, true);
    }
    for (i = 1; i < ny; i++) {
      y = -hh + i * dy;
      c.lineTo(hw, y - r);
      c.arc(hw, y, r, -Math.PI / 2, Math.PI / 2, true);
    }
    c.lineTo(hw, hh);
    for (i = nx - 1; i >= 1; i--) {
      x = -hw + i * dx;
      c.lineTo(x + r, hh);
      c.arc(x, hh, r, 0, Math.PI, true);
    }
    c.lineTo(-hw, hh);
    for (i = ny - 1; i > 0; i--) {
      y = -hh + i * dy;
      c.lineTo(-hw, y + r);
      c.arc(-hw, y, r, Math.PI / 2, -Math.PI / 2, true);
    }
    c.closePath();
  }

  function drawPhotoFrame(c, item) {
    var k = item.kind;
    if (k === 'cam1' || k === 'cam2' || k === 'cam3') {
      var imc = camAssets[k];
      if (imc && imc.complete && imc.naturalWidth > 0) {
        c.save();
        c.shadowColor = 'rgba(60,30,40,0.25)';
        c.shadowBlur = 12;
        c.shadowOffsetY = 7;
        c.drawImage(imc, -item.w / 2, -item.h / 2, item.w, item.h);
        c.restore();
      } else {
        c.fillStyle = '#dfe3e8';
        rr(c, -item.w / 2, -item.h / 2, item.w, item.h, 24);
        c.fill();
      }
      var sr = CAM_SCREEN[k];
      drawPhotoCover(c, item,
        -item.w / 2 + sr[0] * item.w, -item.h / 2 + sr[1] * item.h,
        sr[2] * item.w, sr[3] * item.h);
      return;
    }
    if (k === 'polaroid') {
      c.fillStyle = 'rgba(60,30,40,0.25)';
      rr(c, -150 + 5, -180 + 7, 300, 360, 10); c.fill();
      c.fillStyle = '#ffffff';
      rr(c, -150, -180, 300, 360, 10); c.fill();
      drawPhotoCover(c, item, -132, -162, 264, 264);
      c.strokeStyle = '#e8dfe3'; c.lineWidth = 2;
      c.strokeRect(-132, -162, 264, 264);
    } else if (k === 'strip') {
      c.fillStyle = 'rgba(60,30,40,0.25)';
      rr(c, -110 + 5, -300 + 7, 220, 600, 12); c.fill();
      c.fillStyle = '#ffffff';
      rr(c, -110, -300, 220, 600, 12); c.fill();
      for (var i = 0; i < 3; i++) {
        var sub = { imgKey: (item.imgKeys && item.imgKeys[i]) || item.imgKey };
        drawPhotoCover(c, sub, -90, -280 + i * 196, 180, 180);
      }
    } else if (k === 'stamp') {
      c.save();
      c.translate(5, 7);
      c.fillStyle = 'rgba(60,30,40,0.22)';
      stampPath(c, 160, 180, 13, 8, 9);
      c.fill();
      c.restore();
      c.fillStyle = '#fdfaf6';
      stampPath(c, 160, 180, 13, 8, 9);
      c.fill();
      drawPhotoCover(c, item, -128, -148, 256, 296);
      c.strokeStyle = 'rgba(180,160,170,0.45)';
      c.lineWidth = 2;
      c.strokeRect(-128, -148, 256, 296);
    } else if (k === 'heart') {
      c.save();
      heartPath(c, 130);
      c.clip();
      drawPhotoCover(c, item, -120, -120, 240, 240);
      c.restore();
      heartPath(c, 130);
      c.strokeStyle = '#f76fa0'; c.lineWidth = 14; c.stroke();
      heartPath(c, 130);
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 4; c.stroke();
    }
  }

  function drawTextItem(c, item) {
    if (item.kind === 'script') {
      c.font = 'italic 700 116px "Brush Script MT", "Segoe Script", "Snell Roundhand", cursive';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.shadowColor = 'rgba(180,80,130,0.4)';
      c.shadowBlur = 8;
      c.shadowOffsetY = 4;
      c.fillStyle = item.color || SCRIPT_COLOR;
      c.fillText(item.text, 0, 0);
      c.shadowColor = 'transparent';
      c.shadowBlur = 0;
      c.shadowOffsetY = 0;
    } else if (item.kind === 'label') {
      var shape = item.shape || 'rect';
      var hw = item.w / 2, hh = item.h / 2;
      var badge = shape === 'heart' || shape === 'star';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = item.color || LABEL_COLOR;
      if (shape === 'pill') {
        rr(c, -hw, -hh, item.w, item.h, hh); c.fill();
      } else if (shape === 'bubble') {
        rr(c, -hw, -item.h / 2, item.w, item.h - 24, 14); c.fill();
        c.beginPath();
        c.moveTo(-hw + 20, item.h / 2 - 24);
        c.lineTo(-hw + 38, item.h / 2 - 24);
        c.lineTo(-hw + 22, item.h / 2);
        c.closePath(); c.fill();
      } else if (shape === 'heart') {
        c.save();
        c.translate(0, item.h * 0.12);
        c.scale(item.w / 104, item.h / 92);
        heartPath(c, 100);
        c.fill();
        c.restore();
      } else if (shape === 'star') {
        starPath(c, hw, hw * 0.82, 12);
        c.fill();
      } else {
        rr(c, -hw, -34, item.w, 68, 14); c.fill();
      }
      var dy = 2;
      if (shape === 'bubble') dy = -12;
      else if (shape === 'heart') dy = -item.h * 0.18;
      else if (shape === 'star') dy = 0;
      var fs = 36;
      if (badge) {
        c.font = labelFont(36);
        var tw = c.measureText(item.text).width;
        if (tw > item.w * 0.8) fs = Math.max(18, Math.floor(36 * item.w * 0.8 / tw));
      }
      c.fillStyle = item.textColor || LABEL_TEXT_COLOR;
      c.font = labelFont(fs);
      c.fillText(item.text, 0, dy);
    }
  }

  function measureTextItem(kind, text) {
    ctx.save();
    var w;
    if (kind === 'script') {
      ctx.font = 'italic 700 116px "Brush Script MT", "Segoe Script", "Snell Roundhand", cursive';
      w = ctx.measureText(text).width + 40;
    } else {
      ctx.font = labelFont(36);
      w = ctx.measureText(text).width + 44;
    }
    ctx.restore();
    return Math.max(80, w);
  }

  function drawItem(c, item) {
    c.save();
    c.translate(item.x, item.y);
    c.rotate(deg2rad(item.r));
    c.scale(item.s, item.s);
    var k = item.kind;
    if (k === 'tin') drawTin(c, item);
    else if (k === 'decal') drawDecal(c, item);
    else if (k === 'tile') drawTile(c, item);
    else if (k === 'polaroid' || k === 'strip' || k === 'heart' || k === 'stamp' ||
             k === 'cam1' || k === 'cam2' || k === 'cam3') drawPhotoFrame(c, item);
    else if (k.indexOf('st') === 0) drawSticker(c, item);
    else drawTextItem(c, item);
    if (item.id === selectedId) {
      c.strokeStyle = '#ff4f8b';
      c.lineWidth = 4 / item.s;
      c.setLineDash([12 / item.s, 9 / item.s]);
      rr(c, -item.w / 2 - 8, -item.h / 2 - 8, item.w + 16, item.h + 16, 12);
      c.stroke();
      c.setLineDash([]);
    }
    c.restore();
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBg(ctx);
    for (var i = 0; i < state.items.length; i++) drawItem(ctx, state.items[i]);
    var selItem = selected();
    if (selItem) drawSelection(ctx, selItem);
    stCountEl.textContent = String(state.items.length);
    stageHint.hidden = state.items.length > 0;
  }

  function drawSelection(c, item) {
    c.save();
    c.translate(item.x, item.y);
    c.rotate(deg2rad(item.r));
    c.scale(item.s, item.s);
    var hw = item.w / 2 + 8, hh = item.h / 2 + 8;
    c.strokeStyle = '#f06292';
    c.lineWidth = 4;
    c.setLineDash([16, 10]);
    c.strokeRect(-hw, -hh, hw * 2, hh * 2);
    c.setLineDash([]);
    c.fillStyle = '#f06292';
    var corners = [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]];
    for (var i = 0; i < 4; i++) {
      c.beginPath();
      c.arc(corners[i][0], corners[i][1], 9, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  /* ---------------- 元素创建 ---------------- */

  function jitter() { return (Math.random() - 0.5) * 120; }

  function addItem(kind, extra) {
    var spec = SPEC[kind];
    var item = {
      id: nextId++,
      kind: kind,
      x: W / 2 + jitter(),
      y: H / 2 + jitter(),
      r: Math.round((Math.random() - 0.5) * 16),
      s: defaultScale,
      w: spec ? spec.w : 100,
      h: spec ? spec.h : 100
    };
    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) item[key] = extra[key];
      }
    }
    snapshot();
    state.items.push(item);
    selectedId = item.id;
    syncSlider();
    render();
    return item;
  }

  /* ---------------- 命中与手势 ---------------- */

  function toCanvasPoint(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * W / rect.width,
      y: (clientY - rect.top) * H / rect.height
    };
  }

  function hitTest(p) {
    for (var i = state.items.length - 1; i >= 0; i--) {
      var it = state.items[i];
      var dx = p.x - it.x, dy = p.y - it.y;
      var a = -deg2rad(it.r);
      var lx = (dx * Math.cos(a) - dy * Math.sin(a)) / it.s;
      var ly = (dx * Math.sin(a) + dy * Math.cos(a)) / it.s;
      if (Math.abs(lx) <= it.w / 2 + 6 && Math.abs(ly) <= it.h / 2 + 6) return it;
    }
    return null;
  }

  var pointers = {};
  var pointerCount = 0;
  var drag = null;   /* {item, offX, offY, moved} */
  var pinch = null;  /* {item, d0, a0, s0, r0} */

  function onDown(e) {
    e.preventDefault();
    var p = toCanvasPoint(e.clientX, e.clientY);
    pointers[e.pointerId] = { x: p.x, y: p.y, cx: e.clientX, cy: e.clientY };
    pointerCount++;
    canvas.setPointerCapture(e.pointerId);

    var it = hitTest(p);
    if (it) {
      selectedId = it.id;
      syncSlider();
      if (pointerCount === 1) {
        drag = { item: it, offX: p.x - it.x, offY: p.y - it.y, moved: false, sx: p.x, sy: p.y };
      } else if (pointerCount === 2 && drag && drag.item === it) {
        var ids = Object.keys(pointers);
        var p1 = pointers[ids[0]], p2 = pointers[ids[1]];
        pinch = {
          item: it,
          d0: Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)),
          a0: Math.atan2(p2.y - p1.y, p2.x - p1.x),
          s0: it.s, r0: it.r
        };
        drag.moved = true;
      }
    } else {
      selectedId = null;
      syncSlider();
    }
    render();
  }

  function onMove(e) {
    if (!pointers[e.pointerId]) return;
    var p = toCanvasPoint(e.clientX, e.clientY);
    pointers[e.pointerId] = { x: p.x, y: p.y, cx: e.clientX, cy: e.clientY };

    if (pinch && pointerCount >= 2) {
      var ids = Object.keys(pointers);
      var p1 = pointers[ids[0]], p2 = pointers[ids[1]];
      var d = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      var ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      var it = pinch.item;
      it.s = Math.min(3, Math.max(0.2, pinch.s0 * d / pinch.d0));
      it.r = pinch.r0 + Math.round((ang - pinch.a0) * 180 / Math.PI);
      syncSlider();
      render();
      return;
    }

    if (drag && pointerCount === 1) {
      var item = drag.item;
      item.x = p.x - drag.offX;
      item.y = p.y - drag.offY;
      if (!drag.moved && Math.abs(p.x - drag.sx) + Math.abs(p.y - drag.sy) > 4) {
        snapshot();
        drag.moved = true;
      }
      render();
    }
  }

  function onUp(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    pointerCount = Math.max(0, pointerCount - 1);

    if (drag && pointerCount === 0) {
      drag = null;
      pinch = null;
      render();
      return;
    }
    if (pinch && pointerCount < 2) {
      pinch = null;
      drag = null;
    }
  }

  function removeItem(id) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === id) { state.items.splice(i, 1); break; }
    }
    if (selectedId === id) selectedId = null;
  }

  /* 拖动前记录快照以便撤销位置 */
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  /* ---------------- 滑杆 / 缩放 ---------------- */

  var rotateRow = document.getElementById('rotate-row');
  var rotateSlider = document.getElementById('rotate-slider');
  var rotateValEl = document.getElementById('rotate-val');
  var rotateDirty = false;

  var colorRow = document.getElementById('color-row');
  var colorDots = [].slice.call(document.querySelectorAll('#color-dots .color-dot'));
  var colorDirty = false;
  var labelbgRow = document.getElementById('labelbg-row');
  var labelbgDots = [].slice.call(document.querySelectorAll('#labelbg-dots .color-dot'));
  var labelbgDirty = false;
  var labeltextRow = document.getElementById('labeltext-row');
  var labeltextDots = [].slice.call(document.querySelectorAll('#labeltext-dots .color-dot'));
  var labeltextDirty = false;
  var labelshapeRow = document.getElementById('labelshape-row');
  var shapeBtns = [].slice.call(document.querySelectorAll('#labelshape-dots .shape-btn'));
  var shapeDirty = false;

  function markActiveDots(dots, cur) {
    for (var i = 0; i < dots.length; i++) {
      var on = dots[i].getAttribute('data-color') === cur;
      dots[i].className = on ? 'color-dot is-active' : 'color-dot';
    }
  }

  function labelHeight(shape, w) {
    if (shape === 'heart') return Math.round(w * 0.88);
    if (shape === 'star') return w;
    return shape === 'bubble' ? 92 : 68;
  }

  function normDeg(d) { return ((d % 360) + 540) % 360 - 180; }

  function syncSlider() {
    var it = selected();
    rotateRow.hidden = !it;
    var isScript = !!it && it.kind === 'script';
    var isLabel = !!it && it.kind === 'label';
    colorRow.hidden = !isScript;
    labelbgRow.hidden = !isLabel;
    labeltextRow.hidden = !isLabel;
    labelshapeRow.hidden = !isLabel;
    if (isScript) {
      colorDirty = false;
      markActiveDots(colorDots, it.color || SCRIPT_COLOR);
    }
    if (isLabel) {
      labelbgDirty = false;
      labeltextDirty = false;
      shapeDirty = false;
      markActiveDots(labelbgDots, it.color || LABEL_COLOR);
      markActiveDots(labeltextDots, it.textColor || LABEL_TEXT_COLOR);
      var curShape = it.shape || 'rect';
      for (var s = 0; s < shapeBtns.length; s++) {
        shapeBtns[s].className = shapeBtns[s].getAttribute('data-shape') === curShape
          ? 'shape-btn is-active' : 'shape-btn';
      }
    }
    var v = it ? Math.round(it.s * 100) : parseInt(sliderEl.value, 10);
    sliderEl.value = String(Math.min(250, Math.max(30, v)));
    sliderValEl.textContent = sliderEl.value + '%';
    if (it) {
      rotateDirty = false;
      rotateSlider.value = String(normDeg(Math.round(it.r)));
      rotateValEl.textContent = rotateSlider.value + '°';
    }
  }

  function bindDots(dots, getIt, prop, def, flag) {
    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        var it = getIt();
        if (!it) return;
        var col = dot.getAttribute('data-color');
        if ((it[prop] || def) === col) return;
        if (!flag.v) { snapshot(); flag.v = true; }
        it[prop] = col;
        syncSlider();
        render();
      });
    });
  }
  bindDots(colorDots, function () {
    var it = selected();
    return it && it.kind === 'script' ? it : null;
  }, 'color', SCRIPT_COLOR, { get v() { return colorDirty; }, set v(x) { colorDirty = x; } });
  bindDots(labelbgDots, function () {
    var it = selected();
    return it && it.kind === 'label' ? it : null;
  }, 'color', LABEL_COLOR, { get v() { return labelbgDirty; }, set v(x) { labelbgDirty = x; } });
  bindDots(labeltextDots, function () {
    var it = selected();
    return it && it.kind === 'label' ? it : null;
  }, 'textColor', LABEL_TEXT_COLOR, { get v() { return labeltextDirty; }, set v(x) { labeltextDirty = x; } });

  shapeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var it = selected();
      if (!it || it.kind !== 'label') return;
      var sh = btn.getAttribute('data-shape');
      if ((it.shape || 'rect') === sh) return;
      if (!shapeDirty) { snapshot(); shapeDirty = true; }
      it.shape = sh;
      it.h = labelHeight(sh, it.w);
      syncSlider();
      render();
    });
  });

  rotateSlider.addEventListener('input', function () {
    var it = selected();
    if (!it) return;
    if (!rotateDirty) { snapshot(); rotateDirty = true; }
    it.r = parseInt(rotateSlider.value, 10);
    rotateValEl.textContent = rotateSlider.value + '°';
    render();
  });
  rotateSlider.addEventListener('change', function () {
    rotateDirty = false;
  });

  sliderEl.addEventListener('input', function () {
    var pct = parseInt(sliderEl.value, 10);
    sliderValEl.textContent = pct + '%';
    var it = selected();
    if (it) { it.s = pct / 100; render(); }
    else defaultScale = pct / 100;
  });

  function setZoom(pct) {
    zoomPct = Math.min(200, Math.max(50, pct));
    zoomLabelEl.textContent = zoomPct === 100 ? '1:1' : zoomPct + '%';
    stZoomEl.textContent = zoomPct + '%';
    fitStage();
  }

  function fitStage() {
    var wrap = stageFrame.parentElement;
    var availW = wrap.clientWidth - 42;
    var availH = wrap.clientHeight - 42;
    if (availW <= 0 || availH <= 0) return;
    var sc = Math.min(availW / W, availH / H) * zoomPct / 100;
    canvas.style.width = Math.floor(W * sc) + 'px';
    canvas.style.height = Math.floor(H * sc) + 'px';
  }

  document.getElementById('btn-zoomin').addEventListener('click', function () { setZoom(zoomPct + 25); });
  document.getElementById('btn-zoomout').addEventListener('click', function () { setZoom(zoomPct - 25); });

  /* ---------------- 铁盒形状 ---------------- */

  var modalTinEl = document.getElementById('modal-tin');
  var guidePending = true;

  document.getElementById('btn-tin').addEventListener('click', function () {
    modalTinEl.hidden = false;
  });
  document.getElementById('tin-cancel').addEventListener('click', function () {
    guidePending = false;
    modalTinEl.hidden = true;
  });

  function applyTin(shape) {
    var spec = TIN_SPEC[shape];
    var existing = null;
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].kind === 'tin') { existing = state.items[i]; break; }
    }
    if (existing) {
      snapshot();
      existing.shape = shape;
      existing.w = spec.w;
      existing.h = spec.h;
      selectedId = existing.id;
    } else {
      addItem('tin', { shape: shape, x: W / 2, y: Math.round(H * 0.46), r: 0, s: 1, w: spec.w, h: spec.h });
    }
    syncSlider();
    render();
  }

  var tinOpts = document.querySelectorAll('.tin-opt');
  for (var ti = 0; ti < tinOpts.length; ti++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        modalTinEl.hidden = true;
        applyTin(btn.getAttribute('data-tin'));
        if (guidePending) {
          guidePending = false;
          toast('再点下方「图案」挑喜欢的贴纸吧');
        }
      });
    })(tinOpts[ti]);
  }

  /* ---------------- 图案 ---------------- */

  function addDecal(key) {
    var im = decalAssets[key];
    var w = 320, h = 320;
    if (im && im.naturalWidth > 0) {
      var sc = 320 / Math.max(im.naturalWidth, im.naturalHeight);
      w = Math.max(60, Math.round(im.naturalWidth * sc));
      h = Math.max(60, Math.round(im.naturalHeight * sc));
    }
    addItem('decal', { decal: key, w: w, h: h, s: 1 });
  }

  var matDecals = document.querySelectorAll('.mat-decal');
  for (var mi = 0; mi < matDecals.length; mi++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-decal');
        if (!key) return;
        addDecal(key);
      });
    })(matDecals[mi]);
  }

  /* ---------------- 自主上传素材位 ---------------- */

  var UPLOAD_SLOTS = 10;
  /* 手机原图动辄上千万像素，直接解码会撑爆内存；素材最大边压到 768 足够放大到 250% 使用 */
  var UPLOAD_MAX_SIDE = 768;
  var uploaded = {};
  var pendingSlot = 0;

  function uploadBtn(slot) {
    return materialsEl.querySelector('.mat-up[data-up="' + slot + '"]');
  }

  function buildUploadRow() {
    var row = document.getElementById('upload-row');
    for (var i = 1; i <= UPLOAD_SLOTS; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mat-decal mat-up';
      b.setAttribute('data-up', String(i));
      b.title = '上传素材 ' + i;
      var plus = document.createElement('span');
      plus.className = 'up-plus';
      plus.textContent = '+';
      var x = document.createElement('span');
      x.className = 'up-clear';
      x.setAttribute('data-clear', '1');
      x.textContent = '×';
      b.appendChild(plus);
      b.appendChild(x);
      row.appendChild(b);
    }
  }

  function tapUploadSlot(slot, target) {
    if (target && target.hasAttribute && target.hasAttribute('data-clear')) {
      resetUploadSlot(slot);
      return;
    }
    if (uploaded[slot]) { addDecal('up_' + slot); return; }
    pendingSlot = slot;
    uploadInput.click();
  }

  function resetUploadSlot(slot) {
    var btn = uploadBtn(slot);
    if (!uploaded[slot] || !btn) return;
    var old = btn.getElementsByTagName('img')[0];
    if (old) btn.removeChild(old);
    btn.classList.remove('is-filled');
    delete uploaded[slot];
    toast('第 ' + slot + ' 格已清空');
  }

  function fillUploadSlot(slot, src) {
    var btn = uploadBtn(slot);
    if (!btn) return;
    var old = btn.getElementsByTagName('img')[0];
    if (old) btn.removeChild(old);
    var im = document.createElement('img');
    im.src = src;
    im.alt = '我的素材 ' + slot;
    btn.insertBefore(im, btn.firstChild);
    btn.classList.add('is-filled');
    uploaded[slot] = true;
  }

  function hasTransparent(cc, w, h) {
    var data;
    try { data = cc.getImageData(0, 0, w, h).data; } catch (err) { return true; }
    for (var y = 0; y < h; y += 3) {
      var row = y * w * 4;
      for (var x = 0; x < w; x += 3) {
        if (data[row + x * 4 + 3] < 250) return true;
      }
    }
    return false;
  }

  function prepareUpload(im, cb) {
    var maxSide = Math.max(im.naturalWidth, im.naturalHeight);
    if (maxSide <= UPLOAD_MAX_SIDE) { cb(im, im.src); return; }
    var sc = UPLOAD_MAX_SIDE / maxSide;
    var w = Math.max(1, Math.round(im.naturalWidth * sc));
    var h = Math.max(1, Math.round(im.naturalHeight * sc));
    var cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    var cc = cv.getContext('2d');
    cc.drawImage(im, 0, 0, w, h);
    var out;
    try {
      out = hasTransparent(cc, w, h)
        ? cv.toDataURL('image/png')
        : cv.toDataURL('image/jpeg', 0.86);
    } catch (err) {
      cb(im, im.src);
      return;
    }
    var small = new Image();
    small.onload = function () { cb(small, out); };
    small.onerror = function () { cb(im, im.src); };
    small.src = out;
  }

  uploadInput.addEventListener('change', function () {
    var file = uploadInput.files && uploadInput.files[0];
    var slot = pendingSlot;
    pendingSlot = 0;
    uploadInput.value = '';
    if (!file || !slot) return;
    var reader = new FileReader();
    reader.onload = function () {
      var raw = new Image();
      raw.onload = function () {
        prepareUpload(raw, function (im, src) {
          decalAssets['up_' + slot] = im;
          fillUploadSlot(slot, src);
          toast('第 ' + slot + ' 格好了，点它就能摆进盒子');
        });
      };
      raw.onerror = function () { toast('这张图片读不出来，换一张试试'); };
      raw.src = reader.result;
    };
    reader.onerror = function () { toast('图片读取失败，请重试'); };
    reader.readAsDataURL(file);
  });

  /* ---------------- 工具栏 ---------------- */

  function clearAll() {
    if (!state.items.length) return;
    if (!window.confirm('确定清空画布吗？')) return;
    snapshot();
    state.items = [];
    selectedId = null;
    render();
  }

  document.getElementById('btn-clear').addEventListener('click', clearAll);
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-save').addEventListener('click', saveImage);
  document.getElementById('btn-export').addEventListener('click', saveImage);

  /* ---------------- 菜单 ---------------- */

  var menus = document.querySelectorAll('.menu');
  function closeMenus() {
    for (var i = 0; i < menus.length; i++) menus[i].classList.remove('is-open');
  }
  for (var mi = 0; mi < menus.length; mi++) {
    (function (m) {
      m.querySelector('.menu-item').addEventListener('click', function (e) {
        e.stopPropagation();
        var open = m.classList.contains('is-open');
        closeMenus();
        if (!open) m.classList.add('is-open');
      });
      var drops = m.querySelectorAll('.drop-item');
      for (var di = 0; di < drops.length; di++) {
        drops[di].addEventListener('click', function (e) {
          var act = e.currentTarget.getAttribute('data-act');
          closeMenus();
          if (act === 'clear') clearAll();
          else if (act === 'save') saveImage();
          else if (act === 'undo') undo();
          else if (act === 'delete') {
            var it = selected();
            if (it) { snapshot(); removeItem(it.id); syncSlider(); render(); }
            else toast('先点选一个元素');
          } else if (act === 'help') modalHelpEl.hidden = false;
        });
      }
    })(menus[mi]);
  }
  document.addEventListener('click', closeMenus);
  document.getElementById('help-ok').addEventListener('click', function () { modalHelpEl.hidden = true; });

  /* ---------------- 弹窗输入 ---------------- */

  function openInput(title, hint, maxLen, initial, cb) {
    modalTitleEl.textContent = title;
    modalHintEl.textContent = hint;
    modalInputEl.value = initial || '';
    modalInputEl.maxLength = maxLen;
    modalCb = cb;
    modalEl.hidden = false;
    setTimeout(function () { modalInputEl.focus(); }, 60);
  }

  document.getElementById('modal-cancel').addEventListener('click', function () {
    modalEl.hidden = true; modalCb = null;
  });
  document.getElementById('modal-ok').addEventListener('click', function () {
    var v = modalInputEl.value.replace(/^\s+|\s+$/g, '');
    modalEl.hidden = true;
    var cb = modalCb; modalCb = null;
    if (cb) cb(v);
  });

  /* ---------------- 素材行 ---------------- */

  function syncBgSwatches() {
    var sws = materialsEl.querySelectorAll('.mat-bg');
    for (var i = 0; i < sws.length; i++) {
      var isActive = sws[i].getAttribute('data-bg') === state.bg ||
                     (state.bg === 'custom' && sws[i].id === 'bg-upload');
      sws[i].classList.toggle('is-active', isActive);
    }
  }

  materialsEl.addEventListener('click', function (e) {
    var btn = e.target;
    while (btn && btn !== materialsEl && btn.tagName !== 'BUTTON') btn = btn.parentElement;
    if (!btn || btn === materialsEl) return;

    if (btn.id === 'bg-upload') {
      if (customBgImg && state.bg !== 'custom') {
        snapshot(); state.bg = 'custom'; syncBgSwatches(); render();
      } else {
        bgInput.click();
      }
      return;
    }
    var bg = btn.getAttribute('data-bg');
    if (bg) {
      if (bg !== state.bg) { snapshot(); state.bg = bg; syncBgSwatches(); render(); }
      return;
    }
    var up = btn.getAttribute('data-up');
    if (up) { tapUploadSlot(parseInt(up, 10), e.target); return; }
    var add = btn.getAttribute('data-add');
    if (!add) return;

    if (add === 'stStar' || add === 'stHeart' || add === 'stSeal' ||
             add === 'stPetal' || add === 'stBow' || add === 'stKeychain') addItem(add);
    else if (add && add.indexOf('bead_') === 0) addItem('tile', { ch: add.slice(5) });
    else if (add === 'script') {
      openInput('花体标题', '英文花体更有感觉，最多 16 字符', 16, '', function (v) {
        if (v) addItem('script', { text: v, w: measureTextItem('script', v), h: 150 });
      });
    }
    else if (add === 'label') {
      openInput('短句标签', '如 사랑해 / 나도 / Lucky Me!', 16, '', function (v) {
        if (v) addItem('label', { text: v, w: measureTextItem('label', v), h: 68, shape: 'rect' });
      });
    }
    else if (add === 'polaroid' || add === 'strip' || add === 'heart' || add === 'stamp' ||
             add === 'cam1' || add === 'cam2' || add === 'cam3') {
      pendingFrame = add;
      if (add === 'strip') toast('连拍条：请在相册中选择 3 张照片');
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', function () {
    var files = fileInput.files ? Array.prototype.slice.call(fileInput.files) : [];
    var kind = pendingFrame || 'polaroid';
    pendingFrame = null;
    fileInput.value = '';
    if (!files.length) return;
    if (kind === 'strip') {
      if (files.length < 3) {
        toast('连拍条需要选择 3 张照片，请重新选择');
        return;
      }
      var keys = [];
      for (var i = 0; i < 3; i++) {
        var k = 'u' + nextId + '_' + i;
        registerUserImage(k, files[i]);
        keys.push(k);
      }
      addItem('strip', { imgKeys: keys, s: 1.4 });
      return;
    }
    var key = 'u' + nextId;
    registerUserImage(key, files[0]);
    addItem(kind, { imgKey: key, s: 1.4 });
  });

  bgInput.addEventListener('change', function () {
    var file = bgInput.files && bgInput.files[0];
    bgInput.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var im = new Image();
      im.onload = function () {
        customBgImg = im;
        snapshot();
        state.bg = 'custom';
        var cell = document.getElementById('bg-upload');
        var old = cell.getElementsByTagName('img')[0];
        if (old) cell.removeChild(old);
        var thumb = document.createElement('img');
        thumb.src = reader.result;
        thumb.alt = '自定义背景';
        cell.insertBefore(thumb, cell.firstChild);
        syncBgSwatches();
        render();
      };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  /* ---------------- 保存 / 导出 ---------------- */

  function saveImage() {
    var dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch (err) {
      toast('导出失败：画布无法导出');
      return;
    }
    var mt = window.xhs && window.xhs.miniTool;
    if (mt && typeof mt.saveImageToPhotosAlbum === 'function') {
      saveViaContainer(mt, dataUrl);
    } else {
      exportPreviewEl.src = dataUrl;
      modalExportEl.hidden = false;
    }
  }

  function saveViaContainer(mt, dataUrl) {
    var doSave = function (filePath) {
      mt.saveImageToPhotosAlbum({ filePath: filePath }).then(function () {
        toast('已保存到相册');
      }).catch(function (e) {
        toast('保存失败：' + ((e && e.errMsg) || '请重试'));
      });
    };
    if (typeof mt.writeTempFile === 'function') {
      mt.writeTempFile({ data: dataUrl }).then(function (r) {
        doSave((r && r.filePath) || dataUrl);
      }).catch(function () {
        doSave(dataUrl);
      });
    } else {
      doSave(dataUrl);
    }
  }

  document.getElementById('export-close').addEventListener('click', function () {
    modalExportEl.hidden = true;
    exportPreviewEl.removeAttribute('src');
  });

  /* ---------------- 视口高度 ---------------- */

  function updateAppHeight() {
    var h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', h + 'px');
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateAppHeight);
  }
  window.addEventListener('resize', updateAppHeight);
  window.addEventListener('resize', fitStage);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitStage);
  }
  updateAppHeight();

  /* ---------------- 启动 ---------------- */

  (function buildBeadRow() {
    var row = document.getElementById('bead-row');
    for (var i = 0; i < BEADS.length; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mat-btn mat-bead';
      b.setAttribute('data-add', 'bead_' + BEADS[i]);
      var im = document.createElement('img');
      im.src = './assets/tiles/tile_' + BEADS[i] + '.png';
      im.alt = BEADS[i];
      b.appendChild(im);
      row.appendChild(b);
    }
  })();
  (function buildBgRow() {
    var row = document.getElementById('bg-row');
    for (var i = 0; i < BGS.length; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mat-btn mat-bg';
      b.setAttribute('data-bg', BGS[i]);
      b.title = '背景 ' + (i + 1);
      var im = document.createElement('img');
      im.src = './assets/bg/' + BGS[i] + '.jpg';
      im.alt = '背景 ' + (i + 1);
      b.appendChild(im);
      row.appendChild(b);
    }
    var up = document.createElement('button');
    up.type = 'button';
    up.className = 'mat-btn mat-bg mat-bg-upload';
    up.id = 'bg-upload';
    up.title = '上传自定义背景';
    var sp = document.createElement('span');
    sp.textContent = '+上传';
    up.appendChild(sp);
    row.appendChild(up);
    syncBgSwatches();
  })();
  buildUploadRow();
  preloadBgs();
  preloadTiles();
  preloadTins();
  preloadCams();
  preloadDecals();
  preloadObjs();
  undoStack = [];
  selectedId = null;
  syncSlider();
  setZoom(100);
  render();
  modalTinEl.hidden = false;
})();
