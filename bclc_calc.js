/**
 * bclc_calc.js — BCLC Keno 官方开奖规则计算模块（前端版）
 * ============================================================
 * 规则来源: https://lotto.bclc.com/
 * 
 * 20个号码从小到大排序后(0-indexed):
 *   b1 = (sorted[1] + sorted[4] + sorted[7] + sorted[10] + sorted[13] + sorted[16]) % 10
 *   b2 = (sorted[2] + sorted[5] + sorted[8] + sorted[11] + sorted[14] + sorted[17]) % 10
 *   b3 = (sorted[3] + sorted[6] + sorted[9] + sorted[12] + sorted[15] + sorted[18]) % 10
 *   sum = b1 + b2 + b3 (范围 0-27)
 *
 * 用法:
 *   const result = BCLCCalc.fromKenoNumbers([7,8,14,16,...]);
 *   // result = {b1:8, b2:8, b3:4, sum:20, combo:"大双", pattern:"对子", rawNums:[...]}
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

  // 从特码反推最可能的三球（优先对子/豹子）
  function decomposeSum(sum) {
    const combos = [];
    for (let a = 0; a <= 9; a++) {
      for (let b = 0; b <= 9; b++) {
        for (let c = 0; c <= 9; c++) {
          if (a + b + c === sum) {
            combos.push([a, b, c].sort((x, y) => x - y));
          }
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
    if (sortedNums.length < 20) {
      throw new Error(`需要20个号码，实际只有${sortedNums.length}个`);
    }
    const b1 = (sortedNums[1] + sortedNums[4] + sortedNums[7] + sortedNums[10] + sortedNums[13] + sortedNums[16]) % 10;
    const b2 = (sortedNums[2] + sortedNums[5] + sortedNums[8] + sortedNums[11] + sortedNums[14] + sortedNums[17]) % 10;
    const b3 = (sortedNums[3] + sortedNums[6] + sortedNums[9] + sortedNums[12] + sortedNums[15] + sortedNums[18]) % 10;
    return { b1, b2, b3, sum: b1 + b2 + b3 };
  }

  function fromKenoNumbers(nums) {
    const sorted = [...nums].map(Number).sort((a, b) => a - b);
    const balls = calcBalls(sorted);
    const c = comboOf(balls.sum);
    const pattern = detectPattern(balls.b1, balls.b2, balls.b3);
    return {
      b1: balls.b1,
      b2: balls.b2,
      b3: balls.b3,
      sum: balls.sum,
      combo: c,
      pattern: pattern,
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
    // 3月第二个周日
    const march1 = new Date(Date.UTC(year, 2, 1));
    const daysTo2ndSun = (6 - march1.getUTCDay() + 7) % 7 + 7;
    const dstStart = new Date(march1.getTime() + daysTo2ndSun * 86400000 + 10 * 3600000);
    // 11月第一个周日
    const nov1 = new Date(Date.UTC(year, 10, 1));
    const daysTo1stSun = (6 - nov1.getUTCDay()) % 7;
    const dstEnd = new Date(nov1.getTime() + daysTo1stSun * 86400000 + 9 * 3600000);
    return dstStart <= d && d < dstEnd;
  }

  function getSessionBounds(bjt) {
    const utc = new Date(bjt.getTime() - 8 * 3600000); // 近似UTC
    const dst = isDST(utc);
    const start = new Date(bjt);
    const end = new Date(bjt);
    if (dst) {
      start.setHours(20, 0, 0, 0);
      end.setHours(19, 0, 0, 0);
      end.setDate(end.getDate() + 1);
    } else {
      start.setHours(21, 0, 0, 0);
      end.setHours(20, 0, 0, 0);
      end.setDate(end.getDate() + 1);
    }
    if (start > bjt) {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    }
    return { start, end, dst };
  }

  function periodInfo(bjt) {
    const { start, end, dst } = getSessionBounds(bjt);
    const elapsed = (bjt - start) / 1000;
    const seq = Math.max(1, Math.floor(elapsed / 210) + 1);
    const dateStr = start.getFullYear().toString().slice(-2) +
      String(start.getMonth() + 1).padStart(2, '0') +
      String(start.getDate()).padStart(2, '0');
    const period = dateStr + String(seq).padStart(4, '0');
    const nextDraw = new Date(start.getTime() + seq * 210 * 1000);
    const cd = Math.max(0, Math.floor((nextDraw - bjt) / 1000));
    return { period, countdown: cd, nextDraw, seq, start, dst };
  }

  // ============================================================
  // 数据解析（从各种API格式 → 统一格式）
  // ============================================================
  function parseKenoResponse(raw) {
    const results = [];
    let items = [];
    if (raw && raw.data) items = raw.data;
    else if (raw && raw.list) items = raw.list;
    else if (raw && raw.results) items = raw.results;
    else if (Array.isArray(raw)) items = raw;

    for (const item of items) {
      try {
        const nbr = String(item.nbr || item.issue || item.period || '');
        if (!nbr) continue;

        // 尝试获取20个号码
        let nums = item.nums || item.numbers || item.raw || item.rawNums || item.nbrs;
        if (!nums) {
          const numStr = item.num || item.numbers_str || '';
          if (typeof numStr === 'string' && numStr.includes(',')) {
            nums = numStr.split(',').map(Number);
          }
        }

        if (nums && nums.length >= 20) {
          const result = fromKenoNumbers(nums.slice(0, 20));
          result.nbr = nbr;
          result.date = item.date || item.draw_date || '';
          result.time = item.time || item.draw_time || '';
          results.push(result);
        } else if (item.number || item.num) {
          // 只有三球或特码
          const numStr = String(item.number || item.num || '');
          const parts = numStr.split('+');
          let b1, b2, b3, s;
          if (parts.length === 3) {
            b1 = parseInt(parts[0]); b2 = parseInt(parts[1]); b3 = parseInt(parts[2]);
            s = b1 + b2 + b3;
          } else {
            s = parseInt(item.num || item.sum || '0');
            const decomp = decomposeSum(s);
            b1 = decomp[0]; b2 = decomp[1]; b3 = decomp[2];
          }
          results.push({
            nbr,
            date: item.date || '',
            time: item.time || '',
            b1, b2, b3,
            sum: s,
            combo: item.combination || comboOf(s),
            pattern: '未知',
            big: s >= 14,
            odd: s % 2 === 1,
            rawNums: [],
          });
        }
      } catch (e) { continue; }
    }

    results.sort((a, b) => a.nbr.localeCompare(b.nbr));
    return results;
  }

  // ============================================================
  // 数据源获取（多源降级）
  // ============================================================
  const KENO_SOURCES = [
    'https://pc28.help/api/keno.json?nbr=60',
    'https://yu28.top/api/bclc?count=60&key=yu28-f9f41d673b447fac',
  ];

  async function fetchFromAllSources() {
    const errors = [];
    for (const url of KENO_SOURCES) {
      try {
        const resp = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store',
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        if (text.trim().startsWith('<')) throw new Error('HTML响应(被拦截)');
        const json = JSON.parse(text);
        if (json.status === 403) throw new Error(`拦截: ${json.title || json.detail}`);
        const data = parseKenoResponse(json);
        if (data.length > 0) {
          return { data, source: `BCLC官方规则(${url.split('/')[2]})` };
        }
      } catch (e) {
        errors.push(`${url}: ${e.message}`);
        console.warn(`[BCLC] ${url} 失败: ${e.message}`);
      }
    }

    // 全部失败 → 尝试从 Liquid-Glass-Profil 数据仓库读取
    try {
      const resp = await fetch('https://tomf02391-crypto.github.io/Liquid-Glass-Profil/data/latest.json?t=' + Date.now());
      if (resp.ok) {
        const json = await resp.json();
        if (json.data && json.data.length > 0) {
          const data = json.data.map(d => ({
            nbr: d.nbr,
            date: d.date || '',
            time: d.time || '',
            b1: d.b1 || 0,
            b2: d.b2 || 0,
            b3: d.b3 || 0,
            sum: d.num || d.sum || (d.b1 + d.b2 + d.b3),
            combo: d.combination || comboOf(d.num || d.sum || 0),
            pattern: '未知',
            big: (d.num || d.sum || 0) >= 14,
            odd: (d.num || d.sum || 0) % 2 === 1,
            rawNums: d.raw_nums || [],
          }));
          return { data, source: 'Liquid-Glass-Profil数据仓库(GitHub Pages)' };
        }
      }
    } catch (e) {
      errors.push(`LGP数据仓库: ${e.message}`);
    }

    throw new Error('所有BCLC数据源均失败: ' + errors.join(' | '));
  }

  // ============================================================
  // 公共API
  // ============================================================
  const BCLCCalc = {
    // 核心
    fromKenoNumbers,
    calcBalls,
    decomposeSum,
    comboOf,
    detectPattern,

    // 时区
    isDST,
    periodInfo,

    // 数据获取
    fetchFromAllSources,
    parseKenoResponse,

    // 便捷方法
    calc: function (nums) {
      const r = fromKenoNumbers(nums);
      return { b1: r.b1, b2: r.b2, b3: r.b3, sum: r.sum, combo: r.combo };
    },
  };

  // 兼容全局变量
  global.BCLCCalc = BCLCCalc;

  // 同时挂载到 window.pc28 保持向后兼容
  if (global.window) {
    global.window.BCLCCalc = BCLCCalc;
    // 包装成 pc28 兼容接口
    global.window.pc28 = {
      getLatest: async () => {
        const { data } = await fetchFromAllSources();
        const latest = data[data.length - 1];
        return {
          period: latest.nbr,
          b1: latest.b1, b2: latest.b2, b3: latest.b3,
          sum: latest.sum, combo: latest.combo,
          source: 'bclc_official',
        };
      },
      getHistory: async (n) => {
        const { data } = await fetchFromAllSources();
        return data.slice(-(n || 60)).map(d => ({
          period: d.nbr, b1: d.b1, b2: d.b2, b3: d.b3,
          sum: d.sum, combo: d.combo, time: d.time,
        }));
      },
      getKillGroup: async () => ({ data: [] }),
      getDoubleGroup: async () => ({ data: [] }),
      calcFromKeno: fromKenoNumbers,
    };
  }

  console.log('%c[BCLC] 官方开奖规则模块已加载 ✅', 'color:#00d4ff;font-weight:bold;');
  console.log('%c  规则: b1=(pos2+5+8+11+14+17)%10, b2=(pos3+6+9+12+15+18)%10, b3=(pos4+7+10+13+16+19)%10', 'color:#8899aa;font-size:11px');

})(typeof window !== 'undefined' ? window : this);
