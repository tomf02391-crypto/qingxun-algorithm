/**
 * bclc_calc.js — BCLC Keno → 加拿大PC28 三球计算模块（浏览器/Node通用）
 * ==========================================================================
 * 规则：
 *   BCLC Keno 每期开出 20 个数字（1-80），从小到大排序后：
 *   - 第一球(b1) = (第2+5+8+11+14+17位 之和) % 10
 *   - 第二球(b2) = (第3+6+9+12+15+18位 之和) % 10
 *   - 第三球(b3) = (第4+7+10+13+16+19位 之和) % 10
 *   - 特码(sum)  = b1 + b2 + b3  (范围 0-27)
 *
 * 用法（浏览器全局）：
 *   const r = BCLCCalc.calc([7,8,14,16,17,22,26,34,39,41,42,48,54,58,63,64,69,72,73,79]);
 *   console.log(r.number); // "8+8+4"
 *   console.log(r.sum);    // 20
 *   console.log(r.combo);  // "大双"
 *
 * 用法（Node.js）：
 *   const { calc } = require('./bclc_calc.js');
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();          // Node
    } else {
        root.BCLCCalc = factory();         // 浏览器全局
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // 位置索引（0-based，对应排序后的列表下标）
    var ZONE1 = [1, 4, 7, 10, 13, 16];   // 第2,5,8,11,14,17位
    var ZONE2 = [2, 5, 8, 11, 14, 17];   // 第3,6,9,12,15,18位
    var ZONE3 = [3, 6, 9, 12, 15, 18];   // 第4,7,10,13,16,19位

    function sumAt(nums, idxList) {
        var s = 0;
        for (var i = 0; i < idxList.length; i++) s += nums[idxList[i]];
        return s;
    }

    /**
     * 计算单期三球
     * @param {number[]} sortedNumbers - 排序后的20个Keno号码（升序）
     * @returns {{b1:number,b2:number,b3:number,sum:number,number:string,num:string,size:string,parity:string,combo:string}}
     */
    function calc(sortedNumbers) {
        if (!sortedNumbers || sortedNumbers.length < 20) {
            throw new Error('需要20个号码，实际收到 ' + (sortedNumbers ? sortedNumbers.length : 0) + ' 个');
        }
        // 确保升序 & 数字
        var nums = sortedNumbers.slice().sort(function (a, b) { return a - b; });

        var b1 = sumAt(nums, ZONE1) % 10;
        var b2 = sumAt(nums, ZONE2) % 10;
        var b3 = sumAt(nums, ZONE3) % 10;
        var s = b1 + b2 + b3;

        var size = s >= 14 ? '大' : '小';
        var parity = s % 2 === 0 ? '双' : '单';

        return {
            b1: b1, b2: b2, b3: b3,
            sum: s,
            number: b1 + '+' + b2 + '+' + b3,
            num: String(s),
            size: size,
            parity: parity,
            combination: size + parity
        };
    }

    /**
     * 批量转换 keno 数据列表
     * @param {Array} kenoList - [{nbr, nbrs:[...20个号码...], date, time}, ...]
     * @returns {Array} 与 latest.json data[] 格式兼容
     */
    function calcList(kenoList) {
        var out = [];
        for (var i = 0; i < kenoList.length; i++) {
            try {
                var item = kenoList[i];
                var nbrs = item.nbrs || item.numbers || item.nums;
                if (!nbrs) continue;
                if (typeof nbrs === 'string') {
                    nbrs = nbrs.split(/[,+]/).map(Number).filter(function (n) { return !isNaN(n); });
                }
                var r = calc(nbrs);
                out.push({
                    nbr: String(item.nbr || item.period || item.issue || ''),
                    date: String(item.date || ''),
                    time: String(item.time || item.opentime || ''),
                    number: r.number,
                    num: r.num,
                    combination: r.combo || r.combination,
                    nbrs: nbrs.slice().sort(function (a, b) { return a - b; })
                });
            } catch (e) {
                console.warn('[BCLCCalc] 跳过一期:', e.message);
            }
        }
        return out;
    }

    return { calc: calc, calcList: calcList, VERSION: '1.0.0' };
}));

// 自测（Node 环境直接运行）
if (typeof require !== 'undefined' && require.main === module) {
    var mod = require('./bclc_calc.js');
    var testNums = [7,8,14,16,17,22,26,34,39,41,42,48,54,58,63,64,69,72,73,79];
    var r = mod.calc(testNums);
    console.log('测试号码:', testNums);
    console.log('三球结果:', r.number, '和值:', r.sum, '形态:', r.combination);
    var expected = '8+8+4';
    console.log(r.number === expected ? '✅ 验证通过' : '❌ 期望 ' + expected + ' 实际 ' + r.number);
}
