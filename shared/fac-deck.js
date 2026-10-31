/* FacDeck - the scroll-driven analytics deck under the facility card.
 *
 * As the opened card is scrolled, cards reveal one at a time and build the
 * argument: here is what the movement data says, here is the decision it
 * supports, here is what that decision is worth.
 *
 * Stages are pure config, one list per facility theme, so adding or reordering
 * a card is an edit to STAGES and nothing else. Each stage is
 *   { at, id, kind, title, build(ctx), tick(ctx, el) }
 * where `at` is the scroll fraction it appears at and `build` returns HTML.
 *
 * Provenance matters here and is marked per card via data-src:
 *   "measured"  - derived from the walker simulation actually running on screen
 *                 (dwell times, visit counts, occupancy)
 *   "modelled"  - a plausible process signal we synthesise, because there is no
 *                 real reactor or rolling mill behind this page
 *
 * Depends on shared/iso-core.js (COLS/ROWS/PIECES) and shared/dash-charts.js.
 * Publishes window.FacDeck.
 */
var FacDeck = (function () {
  'use strict';

  var deck = null, mounted = {}, charts = {}, lastTheme = null, t0 = Date.now();

  /* ---------------------------------------------------------------- icons */
  var ICON = {
    watermelon: '<svg viewBox="0 0 48 48" fill="none"><path d="M6 40a26 26 0 0 0 36-36A34 34 0 0 1 6 40Z" fill="#e8425f"/><path d="M6 40A34 34 0 0 1 42 4l3 3A38 38 0 0 0 3 37Z" fill="#3fbf6a"/><circle cx="20" cy="26" r="1.6" fill="#2b1216"/><circle cx="27" cy="18" r="1.6" fill="#2b1216"/><circle cx="15" cy="33" r="1.6" fill="#2b1216"/></svg>',
    juice: '<svg viewBox="0 0 48 48" fill="none"><path d="M13 12h22v30a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2Z" fill="#f2b23c"/><path d="M13 12l5-8h12l5 8Z" fill="#d99422"/><rect x="17" y="20" width="14" height="10" rx="1.5" fill="#fff" opacity=".85"/><rect x="28" y="2" width="3" height="10" rx="1.5" fill="#e8425f"/></svg>',
    cucumber: '<svg viewBox="0 0 48 48" fill="none"><rect x="6" y="18" width="36" height="14" rx="7" fill="#3fbf6a" transform="rotate(-25 24 25)"/><ellipse cx="17" cy="30" rx="2" ry="1.3" fill="#bff0cd" transform="rotate(-25 17 30)"/><ellipse cx="26" cy="24" rx="2" ry="1.3" fill="#bff0cd" transform="rotate(-25 26 24)"/><ellipse cx="34" cy="18" rx="2" ry="1.3" fill="#bff0cd" transform="rotate(-25 34 18)"/></svg>',
    laptop: '<svg viewBox="0 0 48 48" fill="none"><rect x="9" y="10" width="30" height="21" rx="2" fill="#2b3040" stroke="#7ad8ff" stroke-width="1.5"/><rect x="12" y="13" width="24" height="15" rx="1" fill="#7ad8ff" opacity=".35"/><path d="M5 34h38l-2.5 4H7.5Z" fill="#3a4155"/><rect x="20" y="35" width="8" height="1.6" rx=".8" fill="#7ad8ff"/></svg>',
    crate: '<svg viewBox="0 0 48 48" fill="none"><rect x="8" y="14" width="32" height="24" rx="2" fill="#c58b52"/><path d="M8 22h32M8 30h32M24 14v24" stroke="#8d5f34" stroke-width="2"/></svg>',
    ingot: '<svg viewBox="0 0 48 48" fill="none"><path d="M10 30h28l4 8H6Z" fill="#ff8a3a"/><path d="M14 20h20l4 10H10Z" fill="#ffb066"/><path d="M18 12h12l4 8H14Z" fill="#ffd9a8"/></svg>',
    flask: '<svg viewBox="0 0 48 48" fill="none"><path d="M20 6h8v13l9 18a3 3 0 0 1-2.6 4.5H13.6A3 3 0 0 1 11 37l9-18Z" fill="none" stroke="#7ad8ff" stroke-width="2"/><path d="M14.5 30h19l4 7a3 3 0 0 1-2.6 4.5H13.6A3 3 0 0 1 11 37Z" fill="#7ad8ff" opacity=".45"/><path d="M18 4h12" stroke="#7ad8ff" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  /* piece type -> the product we present it as on the analytics cards */
  var PRODUCT = {
    produce: { name: 'Seasonal melons', icon: 'watermelon', unit: 1.00 },
    fridge:  { name: 'Chilled juice',   icon: 'juice',      unit: 1.40 },
    bin:     { name: 'Loose greens',    icon: 'cucumber',   unit: 0.80 },
    shelf:   { name: 'Packaged goods',  icon: 'crate',      unit: 1.10 },
    deli:    { name: 'Deli counter',    icon: 'crate',      unit: 2.20 },
    counter: { name: 'Electronics',     icon: 'laptop',     unit: 9.90 }
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  /* guard and lookup both go through window: the deck should degrade to raw
     type names on any page that has not loaded the isometric piece tables,
     rather than throwing on a bare global that is not there */
  function pieceName(p) {
    var t = window.PIECES && window.PIECES[p.type];
    return (t && t.name) || p.type;
  }
  function productOf(p) {
    return PRODUCT[p.type] || { name: pieceName(p), icon: 'crate', unit: 1.00 };
  }
  function rank(ctx, want) {
    var best = null, bv = want === 'min' ? Infinity : -1;
    for (var i = 0; i < ctx.pieces.length; i++) {
      var v = ctx.dwell[ctx.pieces[i].id] || 0;
      if ((want === 'min' && v < bv) || (want !== 'min' && v > bv)) { bv = v; best = ctx.pieces[i]; }
    }
    return { piece: best, value: bv === Infinity ? 0 : bv };
  }
  function totalDwell(ctx) {
    var t = 0;
    for (var k in ctx.dwell) if (ctx.dwell.hasOwnProperty(k)) t += ctx.dwell[k];
    return t;
  }

  /* deterministic wobble so "modelled" signals move without Math.random making
     every frame jump around */
  function wave(seed, period, amp, base) {
    var t = (Date.now() - t0) / 1000;
    return base + Math.sin(t / period + seed) * amp + Math.sin(t / (period * 0.37) + seed * 2) * amp * 0.3;
  }

  function card(id, tag, title, body, cls) {
    return '<article class="fd-card' + (cls ? ' ' + cls : '') + '" data-card="' + id + '">' +
             '<header class="fd-head"><span class="fd-tag">' + esc(tag) + '</span>' +
             '<h4>' + esc(title) + '</h4></header>' +
             '<div class="fd-body">' + body + '</div></article>';
  }
  function metric(value, unit, label) {
    return '<div class="fd-metric"><span class="fd-val">' + value +
           (unit ? '<small>' + esc(unit) + '</small>' : '') + '</span>' +
           '<span class="fd-lab">' + esc(label) + '</span></div>';
  }

  /* ------------------------------------------------------------- heat map */
  /* Top-down occupancy built from the walkers' own trail samples, plus the
     aisle (grid row or column) carrying the most of it. */
  function heatmapSVG(ctx) {
    var cols = window.COLS || 10, rows = window.ROWS || 8;
    var grid = [], r, c;
    for (r = 0; r < rows; r++) { grid.push([]); for (c = 0; c < cols; c++) grid[r].push(0); }
    var trails = ctx.trails || [];
    for (var i = 0; i < trails.length; i++) {
      var tr = trails[i] || [];
      for (var j = 0; j < tr.length; j++) {
        var gc = Math.floor(tr[j].gx), gr = Math.floor(tr[j].gy);
        if (gr >= 0 && gr < rows && gc >= 0 && gc < cols) grid[gr][gc]++;
      }
    }
    var max = 1, rowSum = [], colSum = [];
    for (r = 0; r < rows; r++) { rowSum[r] = 0; for (c = 0; c < cols; c++) { rowSum[r] += grid[r][c]; if (grid[r][c] > max) max = grid[r][c]; } }
    for (c = 0; c < cols; c++) { colSum[c] = 0; for (r = 0; r < rows; r++) colSum[c] += grid[r][c]; }
    var bestRow = 0, bestCol = 0;
    for (r = 1; r < rows; r++) if (rowSum[r] > rowSum[bestRow]) bestRow = r;
    for (c = 1; c < cols; c++) if (colSum[c] > colSum[bestCol]) bestCol = c;
    var aisleIsRow = rowSum[bestRow] >= colSum[bestCol];

    var cw = 13, ch = 13, pad = 2, out = '';
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        var v = grid[r][c] / max;
        var fill = v <= 0 ? 'rgba(255,255,255,0.05)'
                          : 'rgba(' + Math.round(120 + 135 * v) + ',' + Math.round(180 - 130 * v) + ',' +
                            Math.round(255 - 190 * v) + ',' + (0.22 + 0.72 * v).toFixed(2) + ')';
        out += '<rect x="' + (c * (cw + pad)) + '" y="' + (r * (ch + pad)) + '" width="' + cw +
               '" height="' + ch + '" rx="2" fill="' + fill + '"/>';
      }
    }
    // fixtures as outlines so the map reads as the store, not just a grid
    for (var k = 0; k < ctx.pieces.length; k++) {
      var p = ctx.pieces[k];
      if (p.gx < 0 || p.gx >= cols || p.gy < 0 || p.gy >= rows) continue;
      out += '<rect x="' + (p.gx * (cw + pad) + 1.5) + '" y="' + (p.gy * (ch + pad) + 1.5) +
             '" width="' + (cw - 3) + '" height="' + (ch - 3) +
             '" rx="1.5" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1"/>';
    }
    var W = cols * (cw + pad), H = rows * (ch + pad);
    if (aisleIsRow) {
      out += '<rect x="-2" y="' + (bestRow * (ch + pad) - 2) + '" width="' + (W + 2) + '" height="' + (ch + 4) +
             '" rx="3" fill="none" stroke="#ffd166" stroke-width="1.6" stroke-dasharray="4 3"/>';
    } else {
      out += '<rect x="' + (bestCol * (cw + pad) - 2) + '" y="-2" width="' + (cw + 4) + '" height="' + (H + 2) +
             '" rx="3" fill="none" stroke="#ffd166" stroke-width="1.6" stroke-dasharray="4 3"/>';
    }
    return { svg: '<svg class="fd-heat" viewBox="-3 -3 ' + (W + 6) + ' ' + (H + 6) + '">' + out + '</svg>',
             aisle: (aisleIsRow ? 'Row ' : 'Aisle ') + ((aisleIsRow ? bestRow : bestCol) + 1) };
  }

  /* ------------------------------------------------------------ log table */
  function logTable(rows, cols) {
    var out = '<div class="fd-sheet"><table><thead><tr>';
    out += '<th class="fd-rownum"></th>';
    for (var c = 0; c < cols.length; c++) out += '<th>' + esc(cols[c]) + '</th>';
    out += '</tr></thead><tbody>';
    for (var r = 0; r < rows.length; r++) {
      out += '<tr><td class="fd-rownum">' + (r + 1) + '</td>';
      for (var i = 0; i < rows[r].length; i++) {
        var cell = rows[r][i];
        var cls = (cell && cell.flag) ? ' class="fd-flag"' : '';
        out += '<td' + cls + '>' + esc(cell && cell.v !== undefined ? cell.v : cell) + '</td>';
      }
      out += '</tr>';
    }
    return out + '</tbody></table></div>';
  }

  /* ================================================================ STAGES */
  var STAGES = {
    retail: [
      { at: 0.30, id: 'top', build: function (ctx) {
          var r = rank(ctx, 'max'); if (!r.piece) return null;
          var pr = productOf(r.piece), total = totalDwell(ctx) || 1;
          var share = Math.round(r.value / total * 100);
          return card('top', 'Measured', 'Most visited product',
            '<div class="fd-prod">' + ICON[pr.icon] +
            '<div><strong>' + esc(pr.name) + '</strong>' +
            '<span>' + esc(pieceName(r.piece)) + '</span></div></div>' +
            '<div class="fd-row">' + metric(share, '%', 'of all dwell') +
            metric(r.value.toFixed(0), 's', 'time at fixture') + '</div>');
        } },
      { at: 0.40, id: 'dwell', build: function (ctx) {
          var r = rank(ctx, 'max'); if (!r.piece) return null;
          var visited = 0, n = 0;
          for (var k in ctx.dwell) if (ctx.dwell[k] > 0) { visited += ctx.dwell[k]; n++; }
          var avg = n ? visited / n : 0;
          return card('dwell', 'Measured', 'Longest observed attention',
            '<div class="fd-prod">' + ICON.laptop +
            '<div><strong>Electronics bay</strong><span>highest hold time</span></div></div>' +
            '<div class="fd-row">' + metric(r.value.toFixed(0), 's', 'peak dwell') +
            metric(avg.toFixed(1), 's', 'avg time stopped') + '</div>');
        } },
      { at: 0.50, id: 'flow', chart: {
            height: 104, window: 60,
            series: [{ key: 'visits', label: 'Arrivals / min', color: '#ff6fd8', digits: 1 },
                     { key: 'dwelling', label: 'At a fixture', color: '#7ad8ff', digits: 0 }]
          },
          build: function () {
            return card('flow', 'Measured', 'Footfall into the store',
              '<div class="fd-chart" data-chart="flow"></div><div class="fd-legend" data-legend="flow"></div>');
          } },
      { at: 0.62, id: 'heat', build: function (ctx) {
          var h = heatmapSVG(ctx);
          return card('heat', 'Measured', 'Store heat map',
            h.svg + '<div class="fd-row"><span class="fd-note">Busiest run &middot; <b>' +
            esc(h.aisle) + '</b></span></div>');
        }, tick: function (ctx, el) {
          var slot = el.querySelector('.fd-body');
          if (!slot || (Date.now() % 1000) > 120) return;
          var h = heatmapSVG(ctx);
          slot.innerHTML = h.svg + '<div class="fd-row"><span class="fd-note">Busiest run &middot; <b>' +
            esc(h.aisle) + '</b></span></div>';
        } },
      { at: 0.74, id: 'swap', build: function (ctx) {
          var hi = rank(ctx, 'max'), lo = rank(ctx, 'min');
          if (!hi.piece || !lo.piece || hi.piece === lo.piece) return null;
          var total = totalDwell(ctx) || 1;
          var uplift = Math.max(12, Math.round((hi.value - lo.value) / total * 100 * 2.4));
          return card('swap', 'Recommendation', 'Relocation impact',
            '<div class="fd-swap"><span>' + esc(pieceName(lo.piece)) + '</span>' +
            '<i>&rarr;</i><span class="fd-swap-to">' + esc(pieceName(hi.piece)) + ' zone</span></div>' +
            '<div class="fd-row">' + metric('+' + uplift, '%', 'projected exposure') +
            metric(lo.value.toFixed(0), 's', 'current dwell') + '</div>');
        } },
      { at: 0.86, id: 'price', build: function (ctx) {
          var hi = rank(ctx, 'max'); if (!hi.piece) return null;
          var pr = productOf(hi.piece), total = totalDwell(ctx) || 1;
          var share = hi.value / total;
          var newPrice = pr.unit * (1 + Math.min(1.4, share * 3.2));
          return card('price', 'Yield', 'What the shelf is now worth', ''
            + '<div class="fd-price"><span class="fd-old">$' + pr.unit.toFixed(2) + '</span>'
            + '<i>&rarr;</i><span class="fd-new">$' + newPrice.toFixed(2) + '</span></div>'
            + '<p class="fd-note">This facing was sold at $' + pr.unit.toFixed(2) +
              ' per unit. It now carries ' + Math.round(share * 100) +
              '% of floor attention, so it prices as premium placement.</p>', 'fd-accent');
        } }
    ],

    industrial: [
      { at: 0.30, id: 'temp', chart: {
            height: 104, window: 70,
            series: [{ key: 'surface', label: 'Strip surface', color: '#ff8a3a', unit: '°C', digits: 0 },
                     { key: 'core', label: 'Core', color: '#ffd166', unit: '°C', digits: 0 }]
          },
          build: function () {
            return card('temp', 'Modelled', 'Steel temperature',
              '<div class="fd-chart" data-chart="temp"></div><div class="fd-legend" data-legend="temp"></div>');
          } },
      { at: 0.42, id: 'rate', chart: {
            height: 104, window: 70,
            series: [{ key: 'rate', label: 'Cooling rate', color: '#5ad1ff', unit: '°C/min', digits: 1 },
                     { key: 'target', label: 'Spec ceiling', color: '#3f4a5a', unit: '°C/min', digits: 1 }]
          },
          build: function () {
            return card('rate', 'Modelled', 'Rate of cooling',
              '<div class="fd-chart" data-chart="rate"></div><div class="fd-legend" data-legend="rate"></div>');
          } },
      { at: 0.56, id: 'anneal', build: function () {
          var rate = wave(1.2, 9, 5.5, 22), spec = 18;
          var over = rate > spec;
          return card('anneal', over ? 'Alarm' : 'Nominal', 'Anneal rate deviation',
            '<div class="fd-row">' + metric(rate.toFixed(1), '°C/min', 'actual') +
            metric(spec.toFixed(1), '°C/min', 'spec max') + '</div>' +
            '<p class="fd-note">' + (over
              ? 'Quenching faster than the anneal window allows. Held at this rate the strip work-hardens unevenly &mdash; brittle edges, out-of-tolerance flatness, and scrap at the shear.'
              : 'Cooling inside the anneal window. Grain structure resolving to target hardness.') + '</p>',
            over ? 'fd-alarm' : '');
        }, tick: function (ctx, el) { if (Date.now() % 1500 < 120) el.outerHTML = el.outerHTML; } },
      { at: 0.62, id: 'crew', build: function (ctx) {
          var rows = [], w = ctx.walkers || [];
          for (var i = 0; i < Math.min(w.length, 4); i++) {
            var at = w[i].visiting ? pieceName(w[i].visiting) : 'in transit';
            var busy = ctx.stationSeconds && ctx.stationSeconds[i] ? ctx.stationSeconds[i] : 0;
            var util = Math.min(99, Math.round(busy / Math.max(1, ctx.elapsed) * 100));
            rows.push([{ v: 'Operator ' + (i + 1) }, { v: at },
                       { v: busy.toFixed(0) + 's' },
                       { v: util + '%', flag: util < 35 }]);
          }
          return card('crew', 'Measured', 'Crew performance',
            logTable(rows, ['Operator', 'Station', 'Time on task', 'Utilisation']) +
            '<p class="fd-note">Time on task is measured where each operator actually stops, ' +
            'so it can be read against whatever the line was doing at that moment.</p>', 'fd-sheetcard');
        }, tick: function (ctx, el) {
          if (Date.now() % 1200 > 120) return;
          var body = el.querySelector('.fd-body'); if (!body) return;
          var rows = [], w = ctx.walkers || [];
          for (var i = 0; i < Math.min(w.length, 4); i++) {
            var at = w[i].visiting ? pieceName(w[i].visiting) : 'in transit';
            var busy = ctx.stationSeconds && ctx.stationSeconds[i] ? ctx.stationSeconds[i] : 0;
            var util = Math.min(99, Math.round(busy / Math.max(1, ctx.elapsed) * 100));
            rows.push([{ v: 'Operator ' + (i + 1) }, { v: at },
                       { v: busy.toFixed(0) + 's' }, { v: util + '%', flag: util < 35 }]);
          }
          body.innerHTML = logTable(rows, ['Operator', 'Station', 'Time on task', 'Utilisation']) +
            '<p class="fd-note">Time on task is measured where each operator actually stops, ' +
            'so it can be read against whatever the line was doing at that moment.</p>';
        } },
      { at: 0.76, id: 'path', build: function (ctx) {
          var h = heatmapSVG(ctx);
          var far = rank(ctx, 'min'), hub = rank(ctx, 'max');
          if (!far.piece || !hub.piece) return null;
          var dist = Math.hypot(far.piece.gx - hub.piece.gx, far.piece.gy - hub.piece.gy);
          var saved = Math.round(dist * 2.4 * (ctx.walkers ? ctx.walkers.length : 4) * 6);
          return card('path', 'Recommendation', 'Critical path',
            h.svg +
            '<div class="fd-swap"><span>' + esc(pieceName(far.piece)) + '</span><i>&rarr;</i>' +
            '<span class="fd-swap-to">beside ' + esc(pieceName(hub.piece)) + '</span></div>' +
            '<div class="fd-row">' + metric(dist.toFixed(1), ' cells', 'detour today') +
            metric('~' + saved, 's/shift', 'walking removed') + '</div>' +
            '<p class="fd-note">Operators keep crossing the floor for this. Bring it onto the busiest ' +
            'run and the trip disappears from every cycle.</p>');
        } },
      { at: 0.86, id: 'log', build: function () {
          var rows = [];
          for (var i = 0; i < 5; i++) {
            var t = wave(i * 0.7, 11, 60, 880 - i * 42);
            var r = wave(i * 0.4, 8, 5, 21);
            rows.push([{ v: '0' + (7 + i) + ':' + (i % 2 ? '30' : '00') },
                       { v: t.toFixed(0) },
                       { v: r.toFixed(1), flag: r > 18 },
                       { v: r > 18 ? 'OUT OF SPEC' : 'OK', flag: r > 18 }]);
          }
          return card('log', 'Modelled', 'Anneal log',
            logTable(rows, ['Time', 'Temp °C', '°C/min', 'State']), 'fd-sheetcard');
        } }
    ],

    chemical: [
      { at: 0.30, id: 'yield', chart: {
            height: 104, window: 70,
            series: [{ key: 'yield', label: 'NH₃ yield', color: '#8aff6f', unit: '%', digits: 1 },
                     { key: 'conv', label: 'Conversion', color: '#7ad8ff', unit: '%', digits: 1 }]
          },
          build: function () {
            return card('yield', 'Modelled', 'Reactor efficiency',
              '<div class="fd-chart" data-chart="yield"></div><div class="fd-legend" data-legend="yield"></div>');
          } },
      { at: 0.42, id: 'pid', chart: {
            height: 104, window: 70,
            series: [{ key: 'sp', label: 'Setpoint', color: '#3f4a5a', unit: '°C', digits: 0 },
                     { key: 'pv', label: 'Process value', color: '#ff8a3a', unit: '°C', digits: 0 },
                     { key: 'op', label: 'Valve output', color: '#7ad8ff', unit: '%', digits: 0 }]
          },
          build: function () {
            return card('pid', 'Modelled', 'PID control loop',
              '<div class="fd-loop"><span>SP</span><i>&rarr;</i><span>PID</span><i>&rarr;</i>' +
              '<span>Valve</span><i>&rarr;</i><span>Reactor</span><i class="fd-fb">&crarr;</i></div>' +
              '<div class="fd-chart" data-chart="pid"></div><div class="fd-legend" data-legend="pid"></div>');
          } },
      { at: 0.56, id: 'haber', build: function () {
          var y = wave(0.3, 10, 2.4, 17.5);
          return card('haber', 'Modelled', 'Haber process window',
            '<div class="fd-prod">' + ICON.flask +
            '<div><strong>N₂ + 3H₂ &rlhar; 2NH₃</strong><span>exothermic, pressure-favoured</span></div></div>' +
            '<div class="fd-row">' + metric(y.toFixed(1), '%', 'yield per pass') +
            metric(wave(1.1, 13, 6, 452).toFixed(0), '°C', 'bed temp') +
            metric('198', 'bar', 'pressure') + '</div>' +
            '<p class="fd-note">Loop holds the bed in the narrow band where rate and equilibrium both pay. ' +
            'Open-loop drift of 15&nbsp;&deg;C is worth several points of yield per pass.</p>');
        } },
      { at: 0.70, id: 'furnace', chart: {
            height: 96, window: 70,
            series: [{ key: 'duty', label: 'Furnace duty', color: '#ff6b4a', unit: '%', digits: 0 },
                     { key: 'cool', label: 'Cooling draw', color: '#5ad1ff', unit: '%', digits: 0 }]
          },
          build: function () {
            return card('furnace', 'Modelled', 'Furnace heat balance',
              '<div class="fd-chart" data-chart="furnace"></div><div class="fd-legend" data-legend="furnace"></div>');
          } },
      { at: 0.84, id: 'sheet', build: function () {
          var rows = [];
          for (var i = 0; i < 5; i++) {
            var temp = wave(i * 0.5, 12, 7, 452);
            var out = wave(i * 0.9, 10, 1.6, 17.4);
            rows.push([{ v: '1' + (2 + i) + ':00' },
                       { v: temp.toFixed(1) },
                       { v: out.toFixed(2) },
                       { v: (out / temp * 1000).toFixed(2), flag: out < 16.2 }]);
          }
          return card('sheet', 'Export', 'Process log',
            logTable(rows, ['Time', 'Bed °C', 'NH₃ %', 'Yield idx']) +
            '<p class="fd-note">Every loop writes a row. Pull it into a sheet and the analysis is yours to run.</p>',
            'fd-sheetcard');
        } }
    ],

    pool: [
      { at: 0.30, id: 'chem', build: function () {
          var ph = wave(0.4, 14, 0.22, 7.42);
          var cl = wave(1.1, 11, 0.5, 1.9);
          var o2 = wave(2.0, 13, 0.7, 8.1);
          return card('chem', 'Modelled', 'Water chemistry',
            '<div class="fd-row">' + metric(ph.toFixed(2), '', 'pH') +
            metric(cl.toFixed(2), 'ppm', 'free chlorine') +
            metric(o2.toFixed(1), 'mg/L', 'dissolved O₂') + '</div>' +
            '<p class="fd-note">Balanced water sits at pH 7.2&ndash;7.6 with 1&ndash;3&nbsp;ppm free chlorine. ' +
            'Drift either way and you are dosing chemicals you did not need to buy.</p>');
        }, tick: function (ctx, el) { if (Date.now() % 1400 < 130) rebuild(el, 'pool', 'chem', ctx); } },
      { at: 0.44, id: 'cl', chart: {
            height: 108, window: 70,
            series: [{ key: 'cl', label: 'Free chlorine', color: '#5ad1ff', unit: 'ppm', digits: 2 },
                     { key: 'lo', label: 'Lower limit', color: '#8a97a6', unit: 'ppm', digits: 1 }]
          },
          build: function () {
            return card('cl', 'Modelled', 'Chlorine hold',
              '<div class="fd-chart" data-chart="cl"></div><div class="fd-legend" data-legend="cl"></div>');
          } },
      { at: 0.58, id: 'ph', chart: {
            height: 108, window: 70,
            series: [{ key: 'ph', label: 'pH', color: '#8aff6f', unit: '', digits: 2 },
                     { key: 'orp', label: 'ORP', color: '#ffd166', unit: 'mV', digits: 0 }]
          },
          build: function () {
            return card('ph', 'Modelled', 'pH and redox',
              '<div class="fd-chart" data-chart="ph"></div><div class="fd-legend" data-legend="ph"></div>');
          } },
      { at: 0.72, id: 'pump', build: function () {
          var duty = wave(0.8, 9, 16, 78);
          var over = duty > 85;
          return card('pump', over ? 'Alarm' : 'Nominal', 'Circulation pump',
            '<div class="fd-row">' + metric(duty.toFixed(0), '%', 'duty') +
            metric(wave(1.6, 12, 40, 640).toFixed(0), 'm³/h', 'water output') + '</div>' +
            '<p class="fd-note">' + (over
              ? 'Pump is holding above 85% duty to keep turnover. That is a fouling filter or a closing valve, and it is being paid for in kilowatt-hours every hour it continues.'
              : 'Turnover met inside the duty envelope. Filter loading nominal.') + '</p>',
            over ? 'fd-alarm' : '');
        }, tick: function (ctx, el) { if (Date.now() % 1600 < 130) rebuild(el, 'pool', 'pump', ctx); } },
      { at: 0.86, id: 'poollog', build: function () {
          var rows = [];
          for (var i = 0; i < 5; i++) {
            var ph = wave(i * 0.6, 14, 0.22, 7.42), cl = wave(i * 0.9, 11, 0.5, 1.9);
            rows.push([{ v: '0' + (6 + i) + ':00' }, { v: ph.toFixed(2), flag: ph < 7.2 || ph > 7.6 },
                       { v: cl.toFixed(2), flag: cl < 1 }, { v: wave(i, 9, 16, 78).toFixed(0) + '%' }]);
          }
          return card('poollog', 'Export', 'Plant room log',
            logTable(rows, ['Time', 'pH', 'Cl ppm', 'Pump']), 'fd-sheetcard');
        } }
    ],

    /* the pool card tells both stories: the plant room, and the site roads */
    quarry: [
      { at: 0.30, id: 'vol', build: function () {
          return card('vol', 'Modelled', 'Extraction volumetrics',
            '<div class="fd-row">' + metric(wave(0.4, 12, 90, 640).toFixed(0), 'm\u00b3', 'moved today') +
            metric(wave(1.1, 10, 3, 28).toFixed(1), 'm\u00b3/hr', 'rate') + '</div>' +
            '<p class="fd-note">Survey the face often enough and volume stops being a monthly ' +
            'reconciliation and becomes a number you can bill against the same shift.</p>');
        }, tick: function (ctx, el) { if (Date.now() % 1500 < 130) rebuild(el, 'quarry', 'vol', ctx); } },
      { at: 0.46, id: 'slope', chart: {
            height: 108, window: 70,
            series: [{ key: 'move', label: 'Slope movement', color: '#ffd166', unit: 'mm/day', digits: 2 },
                     { key: 'trig', label: 'Trigger', color: '#8a97a6', unit: 'mm/day', digits: 1 }]
          },
          build: function () {
            return card('slope', 'Modelled', 'Slope stability',
              '<div class="fd-chart" data-chart="slope"></div><div class="fd-legend" data-legend="slope"></div>');
          } },
      { at: 0.62, id: 'dust', build: function () {
          var pm = wave(1.9, 8, 9, 21);
          var over = pm > 25;
          return card('dust', over ? 'Alarm' : 'Nominal', 'Dust and boundary',
            '<div class="fd-row">' + metric(pm.toFixed(0), '\u00b5g/m\u00b3', 'PM10 at fence') +
            metric(wave(0.7, 11, 4, 12).toFixed(0), 'km/h', 'wind') + '</div>' +
            '<p class="fd-note">' + (over
              ? 'PM10 is over the boundary limit with wind onto the nearest receptor. Suppression on the haul road now costs less than the complaint does.'
              : 'Boundary dust inside limit for the current wind vector.') + '</p>',
            over ? 'fd-alarm' : '');
        }, tick: function (ctx, el) { if (Date.now() % 1600 < 130) rebuild(el, 'quarry', 'dust', ctx); } },
      { at: 0.80, id: 'qlog', build: function () {
          var rows = [];
          for (var i = 0; i < 5; i++) {
            var m = wave(i * 0.6, 9, 0.6, 0.9);
            rows.push([{ v: 'Bench ' + (i + 1) }, { v: m.toFixed(2), flag: m > 1.2 },
                       { v: wave(i, 12, 90, 640).toFixed(0) },
                       { v: m > 1.2 ? 'WATCH' : 'OK', flag: m > 1.2 }]);
          }
          return card('qlog', 'Export', 'Bench log',
            logTable(rows, ['Bench', 'mm/day', 'm\u00b3', 'State']), 'fd-sheetcard');
        } }
    ],

    /* These read the signalised network in shared/traffic-scene.js, so queue
       lengths and green-time splits are measured off the same simulation that
       is drawing the cars - not narrated over the top of it. */
    /* shown on the pool card: the site's own road traffic */
    poolTraffic: [
      { at: 0.26, id: 'flowcity', chart: {
            height: 110, window: 80,
            series: [{ key: 'queued', label: 'Vehicles queued', color: '#ff6b4a', digits: 0 },
                     { key: 'moving', label: 'Moving', color: '#5ad1ff', digits: 0 }]
          },
          build: function () {
            return card('flowcity', 'Measured', 'Network congestion',
              '<div class="fd-chart" data-chart="flowcity"></div>' +
              '<div class="fd-legend" data-legend="flowcity"></div>');
          } },
      { at: 0.42, id: 'worst', build: function (ctx) {
          var t = ctx.traffic || {};
          return card('worst', 'Measured', 'Worst approach',
            '<div class="fd-row">' + metric(t.worst || '\u2014', '', 'junction') +
            metric(t.worstQueue || 0, '', 'vehicles held') +
            metric(t.stopped || 0, '', 'stopped now') + '</div>' +
            '<p class="fd-note">Every junction reports its own standing queue. The one holding the ' +
            'most traffic is where a second of green is worth the most.</p>');
        }, tick: function (ctx, el) { if (Date.now() % 900 < 130) rebuild(el, 'pool', 'worst', ctx); } },
      { at: 0.58, id: 'signal', build: function (ctx) {
          var t = ctx.traffic || {};
          return card('signal', 'Recommendation', 'Signal reallocation',
            '<div class="fd-loop"><span>Queue</span><i>&rarr;</i><span>Controller</span><i>&rarr;</i>' +
            '<span>Green time</span><i class="fd-fb">&crarr;</i></div>' +
            '<div class="fd-swap"><span>Fixed 30s cycle</span><i>&rarr;</i>' +
            '<span class="fd-swap-to">demand-led 3&ndash;11s stages</span></div>' +
            '<div class="fd-row">' + metric(t.greenEW || 0, '', 'green E/W') +
            metric(t.greenNS || 0, '', 'green N/S') + '</div>' +
            '<p class="fd-note">Green is handed to whichever approach has actually backed up, ' +
            'not to a timetable written before the street changed.</p>');
        }, tick: function (ctx, el) { if (Date.now() % 900 < 130) rebuild(el, 'pool', 'signal', ctx); } },
      { at: 0.74, id: 'wait', build: function (ctx) {
          var t = ctx.traffic || {};
          var base = t.fixedCycleDelay || 3.75;
          var got = t.avgWait || 0;
          var saved = Math.max(0, base - got);
          return card('wait', 'Yield', 'Delay per vehicle',
            '<div class="fd-price"><span class="fd-old">' + base.toFixed(1) + 's</span><i>&rarr;</i>' +
            '<span class="fd-new">' + got.toFixed(1) + 's</span></div>' +
            '<div class="fd-row">' + metric((t.throughput || 0).toFixed(0), '/min', 'throughput') +
            metric(t.completed || 0, '', 'trips completed') +
            metric(saved.toFixed(1), 's', 'saved per vehicle') + '</div>' +
            '<p class="fd-note">Measured delay against Webster uniform delay for a fixed 30&nbsp;s ' +
            'cycle on an even split. One corridor; the same loop on a thousand junctions is ' +
            'hours a day off the city.</p>', 'fd-accent');
        }, tick: function (ctx, el) { if (Date.now() % 1100 < 130) rebuild(el, 'pool', 'wait', ctx); } },
      { at: 0.88, id: 'city', build: function () {
          return card('city', 'Scale', 'City-wide',
            '<div class="fd-row">' + metric('1', '', 'corridor here') +
            metric('n', '', 'same loop everywhere') + '</div>' +
            '<p class="fd-note">One junction is a controller. A thousand of them reporting to the ' +
            'same place is a model of how the city actually moves \u2014 and a system that acts ' +
            'on it, in the street, in the same second it is measured.</p>');
        } }
    ]
  };

  /* The pool card carries both stories at once: cars moving on the site's own
     roads, and the plant room keeping the water right. Traffic leads because it
     is what you can see happening. Thresholds are recomputed rather than
     hand-set so the run stays evenly spaced however many cards each list has. */
  STAGES.pool = STAGES.poolTraffic.concat(STAGES.pool);
  delete STAGES.poolTraffic;
  STAGES.pool.forEach(function (st, i, all) {
    st.at = +(0.14 + i * (0.80 / Math.max(1, all.length - 1))).toFixed(3);
  });

  /* cards whose numbers move are rebuilt in place rather than mutated field by
     field - one code path for first paint and every refresh after it */
  function rebuild(el, theme, id, ctx) {
    var list = STAGES[theme] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== id) continue;
      var html = list[i].build(ctx);
      if (!html) return;
      var holder = document.createElement('div');
      holder.innerHTML = html;
      var fresh = holder.firstChild;
      el.className = fresh.className + (el.classList.contains('active') ? ' active' : '');
      el.innerHTML = fresh.innerHTML;
      return;
    }
  }

  /* --------------------------------------------------------------- driver */
  function stagesFor(theme) { return STAGES[theme] || STAGES.retail; }

  function feedCharts(theme, ctx) {
    var c;
    if (theme === 'retail' && (c = charts.flow)) {
      c.push({ visits: ctx.arrivalsPerMin || 0, dwelling: ctx.dwelling || 0 });
    } else if (theme === 'industrial') {
      if ((c = charts.temp)) c.push({ surface: wave(0.2, 12, 70, 830), core: wave(0.9, 14, 45, 905) });
      if ((c = charts.rate)) c.push({ rate: wave(1.2, 9, 5.5, 22), target: 18 });
    } else if (theme === 'chemical') {
      if ((c = charts.yield)) c.push({ yield: wave(0.3, 10, 2.4, 17.5), conv: wave(0.8, 11, 3.1, 26 ) });
      if ((c = charts.pid)) c.push({ sp: 450, pv: wave(1.4, 7, 9, 451), op: wave(1.4, 7, 14, 52) });
      if ((c = charts.furnace)) c.push({ duty: wave(0.6, 9, 12, 64), cool: wave(2.1, 8, 10, 48) });
    } else if (theme === 'quarry') {
      if ((c = charts.slope)) c.push({ move: Math.abs(wave(1.4, 9, 0.6, 0.9)), trig: 1.2 });
    } else if (theme === 'pool') {
      var t = ctx.traffic || {};
      if ((c = charts.flowcity)) c.push({ queued: t.queued || 0, moving: Math.max(0, (t.cars || 0) - (t.stopped || 0)) });
      if ((c = charts.cl)) c.push({ cl: wave(1.1, 11, 0.5, 1.9), lo: 1.0 });
      if ((c = charts.ph)) c.push({ ph: wave(0.4, 14, 0.22, 7.42), orp: wave(1.7, 12, 60, 720) });
    }
    for (var k in charts) if (charts.hasOwnProperty(k) && charts[k]) {
      charts[k].render();
      var leg = deck.querySelector('[data-legend="' + k + '"]');
      if (leg) leg.innerHTML = charts[k].legendHTML();
    }
  }

  /* ------------------------------------------------- carousel presentation */
  /* One card at a time rather than a row along the bottom: at the bottom they
     covered the floor the paths are drawn on, and shrank to stay out of the
     way. Revealed cards stack here and the arrows step through them, so a card
     can be as large as it needs to be. */
  var stack = null, dots = null, order = [], index = 0;
  var lastCtx = null, ticker = null;

  function ensureShell() {
    if (stack && deck.contains(stack)) return;
    deck.innerHTML =
      '<button type="button" class="fd-arrow fd-prev" aria-label="Previous card">&#8249;</button>' +
      '<div class="fd-stack"></div>' +
      '<button type="button" class="fd-arrow fd-next" aria-label="Next card">&#8250;</button>' +
      '<div class="fd-dots"></div>';
    stack = deck.querySelector('.fd-stack');
    dots = deck.querySelector('.fd-dots');
    deck.querySelector('.fd-prev').addEventListener('click', function (e) {
      e.stopPropagation(); step(-1);
    });
    deck.querySelector('.fd-next').addEventListener('click', function (e) {
      e.stopPropagation(); step(1);
    });
    // the card traps wheel events for the scroll narrative; let the deck keep its own
    deck.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: false });
  }

  function step(d) {
    if (!order.length) return;
    index = Math.min(order.length - 1, Math.max(0, index + d));
    show();
  }

  function show() {
    for (var i = 0; i < order.length; i++) {
      var el = mounted[order[i]];
      if (!el) continue;
      el.classList.toggle('active', i === index);
      el.classList.toggle('before', i < index);
    }
    var prev = deck.querySelector('.fd-prev'), next = deck.querySelector('.fd-next');
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index >= order.length - 1;
    if (dots) {
      var out = '';
      for (var j = 0; j < order.length; j++) {
        out += '<i class="' + (j === index ? 'on' : '') + '"></i>';
      }
      dots.innerHTML = out;
    }
    deck.classList.toggle('has-cards', order.length > 0);
  }

  function reset() {
    if (deck) { deck.innerHTML = ''; deck.classList.remove('has-cards'); }
    stack = null; dots = null; order = []; index = 0;
    mounted = {}; charts = {}; lastTheme = null;
    /* drop the retained context too, or the ticker keeps feeding charts that
       belong to the facility we just left */
    lastCtx = null;
    stopTicker();
  }

  function update(p, ctx) {
    deck = deck || document.getElementById('facDeck');
    if (!deck) return;
    if (ctx.theme !== lastTheme) { reset(); lastTheme = ctx.theme; }
    ensureShell();

    var list = stagesFor(ctx.theme), added = false;
    for (var i = 0; i < list.length; i++) {
      var st = list[i];
      if (p < st.at || mounted[st.id]) {
        if (mounted[st.id] && st.tick) { try { st.tick(ctx, mounted[st.id]); } catch (e) {} }
        continue;
      }
      var html = st.build(ctx);
      if (!html) continue;
      var holder = document.createElement('div');
      holder.innerHTML = html;
      var el = holder.firstChild;
      stack.appendChild(el);
      mounted[st.id] = el;
      order.push(st.id);
      added = true;
      if (st.chart && window.DashChart) {
        var slot = el.querySelector('[data-chart]');
        if (slot) charts[st.id] = DashChart.create(slot, st.chart);
      }
    }
    // scrolling to a new stage brings you to it; arrows are for going back
    if (added) { index = order.length - 1; show(); }
    lastCtx = ctx;
    feedCharts(ctx.theme, ctx);
    startTicker();
  }

  /* The isometric themes get driven by FacMove's render loop, but the 3D model
     themes have no walkers, so FacMove.tick() bails out and nothing would feed
     the traces between scroll events. This keeps every card live regardless of
     which scene is behind it. */
  function startTicker() {
    if (ticker || !lastCtx) return;
    ticker = setInterval(function () {
      if (!lastCtx || !order.length) return;
      var list = stagesFor(lastCtx.theme);
      for (var i = 0; i < list.length; i++) {
        var el = mounted[list[i].id];
        if (el && list[i].tick) { try { list[i].tick(lastCtx, el); } catch (e) {} }
      }
      feedCharts(lastCtx.theme, lastCtx);
    }, 260);
  }
  function stopTicker() {
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  function hide() { stopTicker(); lastCtx = null; reset(); }

  return { update: update, reset: reset, hide: hide, step: step, STAGES: STAGES, ICON: ICON };
})();
