/**
 * bclc_calc.js — BCLC Keno 官方开奖规则计算模块（前端版）
 * 修复版：统一解析逻辑，修掉 NaN 根因
 *   - 不再过滤 sum===0 的合法开奖
 *   - 单条解析失败仅跳过该条，不污染整批
 *   - 与 Liquid-Glass-Profil 使用同一 yu28.top 接口
 */
(function (global) {
  'use strict';

  // ============================================================
  // 工具函数
  // ============================================================
  function comboOf(sum) {
    if (sum >= 14) return sum % 2 === 1 ? "大单" : "大双";
    return sum % 2 === 1 ? "小单" : "小双";
  }

  function detectPattern(b1, b2, b3) {
    const s = [b1, b2, b3].sort((a, b) => a - b);
    if (b1 === b2 && b2 === b3) return "豹子";
    if (b1 === b2 || b2 === b3 || b1 === b3) return "对子";
    if (s[1] - s[0] === 1 && s[2] - s[1] === 1) return "顺子";
    return "杂六";
  }

  function decomposeSum(sum) {
    const combos = [];
    for (let a = 0; a <= 9; a++) {
      for (let b = 0; b <= 9; b++) {
        for (let c = 0; c <= 9; c++) {
          if (a + b + c === sum) combos.push([a, b, c].sort((x, y) => x - y));
        }
      }
    }
    const seen = new Set();
    const unique = [];
    for (const c of combos) {
      const key = c.join(',');
      if (!seen.has(key)) { seen.add(key); unique.push(c); }
    }
    unique.sort((a, b) => {
      const aDup = a[0] === a[1] || a[1] === a[2] ? 1 : 0;
      const bDup = b[0] === b[1] || b[1] === b[2] ? 1 : 0;
      return bDup - aDup;
    });
    return unique[0] || [0, 0, 0];
  }

  // ============================================================
  // 核心计算
  // ============================================================
  function calcBalls(sortedNums) {
    if (sortedNums.length < 20) throw new Error('需要20个号码，实际只有' + sortedNums.length + '个');
    const b1 = (sortedNums[1] + sortedNums[4] + sortedNums[7] + sortedNums[10] + sortedNums[13] + sortedNums[16]) % 10;
    const b2 = (sortedNums[2] + sortedNums[5] + sortedNums[8] + sortedNums[11] + sortedNums[14] + sortedNums[17]) % 10;
    const b3 = (sortedNums[3] + sortedNums[6] + sortedNums[9] + sortedNums[12] + sortedNums[15] + sortedNums[18]) % 10;
    return { b1, b2, b3, sum: b1 + b2 + b3 };
  }

  function fromKenoNumbers(nums) {
    const sorted = [...nums].map(Number).sort((a, b) => a - b);
    const balls = calcBalls(sorted);
    return {
      b1: balls.b1, b2: balls.b2, b3: balls.b3,
      sum: balls.sum,
      combo: comboOf(balls.sum),
      pattern: detectPattern(balls.b1, balls.b2, balls.b3),
      big: balls.sum >= 14,
      odd: balls.sum % 2 === 1,
      rawNums: sorted,
    };
  }

  // ============================================================
  // 时区判断（BCLC 太平洋时区）
  // ============================================================
  function isDST(utcDate) {
    const d = utcDate || new Date();
    const year = d.getUTCFullYear();
    const march1 = new Date(Date.UTC(year, 2, 1));
    const daysTo2ndSun = (6 - march1.getUTCDay() + 7) % 7 + 7;
    const dstStart = new Date(march1.getTime() + daysTo2ndSun * 86400000 + 10 * 3600000);
    const nov1 = new Date(Date.UTC(year, 10, 1));
    const daysTo1stSun = (6 - nov1.getUTCDay()) % 7;
    const dstEnd = new Date(nov1.getTime() + daysTo1stSun * 86400000 + 9 * 3600000);
    return dstStart <= d && d < dstEnd;
  }

  function getSessionBounds(bjt) {
    const utc = new Date(bjt.getTime() - 8 * 3600000);
    const dst = isDST(utc);
    const start = new Date(bjt);
    const end = new Date(bjt);
    if (dst) { start.setHours(20,0,0,0); end.setHours(19,0,0,0); end.setDate(end.getDate()+1); }
    else      { start.setHours(21,0,0,0); end.setHours(20,0,0,0); end.setDate(end.getDate()+1); }
    if (start > bjt) { start.setDate(start.getDate()-1); end.setDate(end.getDate()-1); }
    return { start, end, dst };
  }

  function periodInfo(bjt) {
    const { start } = getSessionBounds(bjt);
    const elapsed = (bjt - start) / 1000;
    const seq = Math.max(1, Math.floor(elapsed / 210) + 1);
    const dateStr = start.getFullYear().toString().slice(-2) +
      String(start.getMonth()+1).padStart(2,'0') + String(start.getDate()).padStart(2,'0');
    const period = dateStr + String(seq).padStart(4,'0');
    const nextDraw = new Date(start.getTime() + seq * 210 * 1000);
    const cd = Math.max(0, Math.floor((nextDraw - bjt) / 1000));
    return { period, countdown: cd, nextDraw, seq, start, dst: isDST(new Date(bjt.getTime()-8*3600000)) };
  }

  // ============================================================
  // 统一数据解析（修掉 NaN 的核心）
  // ============================================================
  // 字段名兼容：nbr/issue/period、number/num、combination/combo、time/datetime
  // 数值格式兼容："4+7+6=17" / "4,7,6" / 纯数字 / 已有 b1,b2,b3
  function parseItem(d) {
    const nbr = String(d.nbr || d.issue || d.period || '');
    if (!nbr) return null;

    let b1 = 0, b2 = 0, b3 = 0, s = 0;

    // 优先：已有三球
    if (typeof d.b1 === 'number' && typeof d.b2 === 'number' && typeof d.b3 === 'number') {
      b1 = d.b1; b2 = d.b2; b3 = d.b3;
      s = d.sum || d.num || (b1 + b2 + b3);
    } else {
      // 次优先：number/num 字符串 "4+7+6=17"
      const numStr = String(d.number || d.num || '');
      if (numStr) {
        const body = numStr.split('=')[0];
        const parts = body.split(/[+,]/).map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
        if (parts.length >= 3) { b1 = parts[0]; b2 = parts[1]; b3 = parts[2]; s = b1 + b2 + b3; }
        else if (parts.length === 1) { s = parts[0]; const dc = decomposeSum(s); b1 = dc[0]; b2 = dc[1]; b3 = dc[2]; }
        else return null; // 格式完全无法解析，跳过该条
      }
    }

    // 兜底：从 rawNums/nums 现场算
    if (s === 0 && !b1 && !b2 && !b3) {
      const nums = d.nums || d.numbers || d.raw || d.rawNums || d.nbrs;
      if (nums && nums.length >= 20) {
        const r = fromKenoNumbers(nums.slice(0, 20));
        b1 = r.b1; b2 = r.b2; b3 = r.b3; s = r.sum;
      }
    }

    return {
      nbr,
      date: d.date || (d.time || d.datetime || '').split(' ')[0] || '',
      time: d.time || d.datetime || '',
      b1, b2, b3,
      sum: s,
      combo: d.combination || d.combo || comboOf(s),
      pattern: detectPattern(b1, b2, b3),
      big: s >= 14,
      odd: s % 2 === 1,
      rawNums: d.rawNums || d.raw_nums || [],
    };
  }

  function parseResponse(raw) {
    const results = [];
    const items = raw && (raw.data || raw.list || raw.results) || (Array.isArray(raw) ? raw : []);
    for (const item of items) {
      try {
        const r = parseItem(item);
        if (r) results.push(r);
      } catch (e) { /* 单条失败不影响其他 */ }
    }
    results.sort((a, b) => a.nbr.localeCompare(b.nbr));
    return results;
  }

  // ============================================================
  // 数据源获取（多源降级）— 与 Liquid-Glass-Profil 统一
  // ============================================================
  const YU28_API = 'https://yu28.top/api/kj.json?nbr=60';
  const YU28_KEY = 'yu28_f9f41d673b447fac';

  function getFallbackUrls() {
    return [
      YU28_API,
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(YU28_API),
      'https://proxy.cors.sh/' + YU28_API,
    ];
  }

  async function fetchFromAllSources() {
    const errors = [];

    // ① yu28.top 三级降级
    for (let i = 0; i < getFallbackUrls().length; i++) {
      const url = getFallbackUrls()[i];
      try {
        const isDirect = (i === 0);
        const headers = isDirect
          ? { 'Accept': 'application/json', 'X-Api-Key': YU28_KEY }
          : { 'Accept': 'application/json' };
        const resp = await fetch(url, { headers, cache: 'no-store' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const text = await resp.text();
        if (text.trim().startsWith('<')) throw new Error('HTML响应(被拦截)');
        const json = JSON.parse(text);
        if (json.status === 403) throw new Error('拦截: ' + (json.title || json.detail));
        const data = parseResponse(json);
        if (data.length > 0) {
          const tag = isDirect ? 'yu28.top(直连)' : (i === 1 ? 'yu28(allorigins)' : 'yu28(cors.sh)');
          return { data, source: tag };
        }
      } catch (e) { errors.push(url.split('/').slice(0,3).join('/') + ': ' + e.message); }
    }

    // ② pc28.help 降级
    try {
      const resp = await fetch('https://pc28.help/api/keno.json?nbr=60', { headers:{'Accept':'application/json'}, cache:'no-store' });
      if (resp.ok) {
        const data = parseResponse(await resp.json());
        if (data.length > 0) return { data, source: 'pc28.help(降级)' };
      }
    } catch (e) { errors.push('pc28.help: ' + e.message); }

    // ③ Liquid-Glass-Profil 数据仓库（GitHub Pages 静态文件）
    try {
      const resp = await fetch('https://tomf02391-crypto.github.io/Liquid-Glass-Profil/data/latest.json?t=' + Date.now());
      if (resp.ok) {
        const data = parseResponse(await resp.json());
        if (data.length > 0) return { data, source: 'Liquid-Glass-Profil数据仓库' };
      }
    } catch (e) { errors.push('LGP: ' + e.message); }

    throw new Error('所有BCLC数据源均失败: ' + errors.join(' | '));
  }

  // ============================================================
  // 公共 API
  // ============================================================
  const BCLCCalc = {
    fromKenoNumbers, calcBalls, decomposeSum, comboOf, detectPattern,
    isDST, periodInfo,
    fetchFromAllSources, parseResponse, parseItem,
    calc: nums => { const r = fromKenoNumbers(nums); return { b1:r.b1, b2:r.b2, b3:r.b3, sum:r.sum, combo:r.combo }; },
  };
  global.BCLCCalc = BCLCCalc;
  if (global.window) {
    global.window.BCLCCalc = BCLCCalc;
    global.window.pc28 = {
      getLatest: async () => { const { data } = await fetchFromAllSources(); const l = data[data.length-1]; return { period:l.nbr, b1:l.b1, b2:l.b2, b3:l.b3, sum:l.sum, combo:l.combo, source:'bclc_official' }; },
      getHistory: async n => { const { data } = await fetchFromAllSources(); return data.slice(-(n||60)).map(d=>({period:d.nbr,b1:d.b1,b2:d.b2,b3:d.b3,sum:d.sum,combo:d.combo,time:d.time})); },
      getKillGroup: async () => ({ data:[] }),
      getDoubleGroup: async () => ({ data:[] }),
      calcFromKeno: fromKenoNumbers,
    };
  }

  console.log('%c[BCLC] 官方开奖规则模块(修复版)已加载 ✅', 'color:#00d4ff;font-weight:bold;');
})(typeof window !== 'undefined' ? window : this);
