/* DashChart - small, dependency-free time-series charts for the facility cards.
 *
 * Deliberately instrument-panel rather than business-deck: hairline grid,
 * corner brackets, mono tick labels, a glow pass under each trace and a live
 * head dot on the newest sample. Everything is plain SVG rebuilt on a tick, so
 * it drops into the existing cards with no build step and no library.
 *
 * Publishes window.DashChart.
 *
 *   var c = DashChart.create(el, {
 *     height: 118,
 *     window: 90,                       // samples retained
 *     series: [{key:'in', label:'IN STORE', color:'#EC4899', unit:''}]
 *   });
 *   c.push({in: 4});                    // one sample per key
 *   c.render();
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function fmt(v, digits) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return (Math.round(v * Math.pow(10, digits)) / Math.pow(10, digits)).toFixed(digits);
  }

  function Chart(mount, opts) {
    this.mount = mount;
    this.opts = opts || {};
    this.height = this.opts.height || 120;
    this.window = this.opts.window || 90;
    this.series = (this.opts.series || []).map(function (s) {
      return { key: s.key, label: s.label || s.key, color: s.color || '#7dd3fc',
               unit: s.unit || '', digits: s.digits === undefined ? 0 : s.digits,
               data: [] };
    });
    this.uid = 'dc' + Math.random().toString(36).slice(2, 8);
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', this.height);
    this.svg.style.display = 'block';
    this.svg.style.overflow = 'visible';
    mount.appendChild(this.svg);
  }

  Chart.prototype.push = function (sample) {
    for (var i = 0; i < this.series.length; i++) {
      var s = this.series[i];
      var v = sample[s.key];
      s.data.push(typeof v === 'number' && isFinite(v) ? v : 0);
      if (s.data.length > this.window) s.data.shift();
    }
  };

  Chart.prototype.latest = function (key) {
    for (var i = 0; i < this.series.length; i++) {
      if (this.series[i].key === key) {
        var d = this.series[i].data;
        return d.length ? d[d.length - 1] : null;
      }
    }
    return null;
  };

  /* Shared vertical scale across every trace, so the lines can be read against
     each other instead of each silently rescaling to its own maximum. */
  Chart.prototype.bounds = function () {
    var hi = -Infinity, lo = 0;
    for (var i = 0; i < this.series.length; i++) {
      var d = this.series[i].data;
      for (var j = 0; j < d.length; j++) if (d[j] > hi) hi = d[j];
    }
    if (!isFinite(hi) || hi <= 0) hi = 1;
    return { lo: lo, hi: hi * 1.18 + 0.001 };
  };

  Chart.prototype.render = function () {
    var w = this.mount.clientWidth || 320;
    var h = this.height;
    var padL = 30, padR = 10, padT = 12, padB = 16;
    var iw = Math.max(10, w - padL - padR);
    var ih = Math.max(10, h - padT - padB);
    var b = this.bounds();
    var uid = this.uid;
    var out = '';

    var defs = '';
    for (var i = 0; i < this.series.length; i++) {
      var s = this.series[i];
      defs += '<linearGradient id="' + uid + 'g' + i + '" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0%" stop-color="' + s.color + '" stop-opacity="0.28"/>' +
              '<stop offset="100%" stop-color="' + s.color + '" stop-opacity="0"/>' +
              '</linearGradient>';
    }
    out += '<defs>' + defs + '</defs>';

    // grid: four horizontal rules, dashed, plus the value at each
    for (var g = 0; g <= 3; g++) {
      var gy = padT + (ih * g / 3);
      var gv = b.hi - (b.hi - b.lo) * g / 3;
      out += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (padL + iw) +
             '" y2="' + gy.toFixed(1) + '" stroke="currentColor" stroke-opacity="0.13" ' +
             'stroke-width="1" stroke-dasharray="2 4"/>';
      out += '<text x="' + (padL - 6) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end" ' +
             'font-family=Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" font-size="7" fill="currentColor" ' +
             'fill-opacity="0.42">' + fmt(gv, gv < 10 ? 1 : 0) + '</text>';
    }

    // corner brackets - the "instrument" cue
    var bl = 9;
    [[padL, padT, 1, 1], [padL + iw, padT, -1, 1],
     [padL, padT + ih, 1, -1], [padL + iw, padT + ih, -1, -1]].forEach(function (c) {
      out += '<path d="M' + (c[0] + c[2] * bl) + ' ' + c[1] + ' H' + c[0] + ' V' + (c[1] + c[3] * bl) +
             '" fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="1"/>';
    });

    var self = this;
    var toXY = function (idx, n, val) {
      var x = padL + (n <= 1 ? iw : iw * idx / (self.window - 1));
      var y = padT + ih - ih * ((val - b.lo) / (b.hi - b.lo));
      return [x, y];
    };

    for (var k = 0; k < this.series.length; k++) {
      var sr = this.series[k], d = sr.data;
      if (d.length < 2) continue;
      var pts = [], p;
      for (var m = 0; m < d.length; m++) {
        p = toXY(m, d.length, d[m]);
        pts.push(p[0].toFixed(1) + ',' + p[1].toFixed(1));
      }
      var poly = pts.join(' ');
      var last = toXY(d.length - 1, d.length, d[d.length - 1]);
      var first = toXY(0, d.length, d[0]);

      // filled area, then a soft wide pass for glow, then the crisp trace
      out += '<polygon points="' + first[0].toFixed(1) + ',' + (padT + ih) + ' ' + poly + ' ' +
             last[0].toFixed(1) + ',' + (padT + ih) + '" fill="url(#' + uid + 'g' + k + ')"/>';
      out += '<polyline points="' + poly + '" fill="none" stroke="' + sr.color +
             '" stroke-width="4" stroke-opacity="0.16" stroke-linejoin="round" stroke-linecap="round"/>';
      out += '<polyline points="' + poly + '" fill="none" stroke="' + sr.color +
             '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>';
      out += '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) +
             '" r="4.5" fill="' + sr.color + '" opacity="0.22"/>';
      out += '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) +
             '" r="2" fill="' + sr.color + '"/>';
    }

    out += '<text x="' + padL + '" y="' + (h - 4) + '" font-family=Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" ' +
           'font-size="7" fill="currentColor" fill-opacity="0.38">-' + this.window + 'S</text>';
    out += '<text x="' + (padL + iw) + '" y="' + (h - 4) + '" text-anchor="end" ' +
           'font-family=Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" font-size="7" fill="currentColor" ' +
           'fill-opacity="0.38">NOW</text>';

    this.svg.innerHTML = out;
  };

  Chart.prototype.legendHTML = function () {
    var out = '';
    for (var i = 0; i < this.series.length; i++) {
      var s = this.series[i];
      var v = s.data.length ? s.data[s.data.length - 1] : null;
      out += '<div class="dc-leg">' +
             '<span class="dc-swatch" style="background:' + s.color + '"></span>' +
             '<span class="dc-leg-k">' + esc(s.label) + '</span>' +
             '<span class="dc-leg-v" style="color:' + s.color + '">' + fmt(v, s.digits) +
             (s.unit ? '<small>' + esc(s.unit) + '</small>' : '') + '</span>' +
             '</div>';
    }
    return out;
  };

  Chart.prototype.destroy = function () {
    if (this.svg && this.svg.parentNode) this.svg.parentNode.removeChild(this.svg);
    this.svg = null;
  };

  window.DashChart = {
    create: function (mount, opts) { return new Chart(mount, opts); }
  };
})();
