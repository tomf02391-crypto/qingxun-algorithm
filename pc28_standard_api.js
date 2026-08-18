/**
 * PC28 统一数据接口模块（标准版）
 * =====================================
 * 数据源优先级：pc28.help → pgsoft.one → 28api.com → byw.bet
 * 功能：多源降级、3秒缓存、超时重试、统一输出格式
 * 
 * 使用：<script src="pc28_standard_api.js"></script>
 *       全局变量 PC28API 自动可用
 */

(function (global) {
    'use strict';

    const CONFIG = {
        primary: 'https://pc28.help/api',
        backup1: 'http://api.pgsoft.one/api/28',
        backup2: 'http://www.28api.com/api/v1',
        backup3: 'https://api.byw.bet/api',
        timeout: 8000,
        cacheTTL: 3000,
    };

    // ---------- 工具函数 ----------
    function timeoutFetch(url, ms) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), ms || CONFIG.timeout);
        return fetch(url, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } })
            .finally(() => clearTimeout(timer));
    }

    async function fetchWithFallback(urlList) {
        const errors = [];
        for (const item of urlList) {
            const url = typeof item === 'string' ? item : item.url;
            const name = typeof item === 'string' ? url : (item.name || url);
            try {
                const res = await timeoutFetch(url);
                if (res.ok) {
                    const data = await res.json();
                    if (data) {
                        data._source = name;
                        return data;
                    }
                }
                errors.push(name + ' → HTTP ' + res.status);
            } catch (e) {
                errors.push(name + ' → ' + (e.name === 'AbortError' ? 'timeout' : e.message));
            }
        }
        throw new Error('所有数据源不可用:\n' + errors.join('\n'));
    }

    // 统一输出格式转换
    function normalize(raw) {
        if (!raw) return null;
        // pc28.help 格式
        if (raw.period || raw.issue) {
            const nums = raw.numbers || raw.opencode || [];
            const b1 = parseInt(nums[0] || raw.num1 || 0);
            const b2 = parseInt(nums[1] || raw.num2 || 0);
            const b3 = parseInt(nums[2] || raw.num3 || 0);
            return {
                nbr: raw.period || raw.issue || '',
                b1, b2, b3,
                sum: parseInt(raw.sum || (b1 + b2 + b3)),
                combo: raw.combo || raw.combination || '',
                size: raw.size || (b1+b2+b3 >= 14 ? '大' : '小'),
                parity: raw.parity || ((b1+b2+b3) % 2 === 0 ? '双' : '单'),
                countdown: raw.countdown || 0,
                source: raw._source || '',
            };
        }
        // pgsoft 格式（数组）
        if (Array.isArray(raw)) {
            const item = raw[0] || {};
            const nums = item.numbers || item.opencode || [];
            const b1 = parseInt(nums[0] || 0);
            const b2 = parseInt(nums[1] || 0);
            const b3 = parseInt(nums[2] || 0);
            return {
                nbr: item.period || item.issue || item.nbr || '',
                b1, b2, b3,
                sum: parseInt(item.sum || (b1 + b2 + b3)),
                combo: '', size: '', parity: '',
                countdown: 0, source: 'pgsoft',
            };
        }
        return null;
    }

    // ---------- 主类 ----------
    class PC28API {
        constructor() {
            this.cache = new Map();
        }

        _cached(key, fetcher) {
            const now = Date.now();
            const hit = this.cache.get(key);
            if (hit && now - hit.t < CONFIG.cacheTTL) return Promise.resolve(hit.data);
            return fetcher().then(data => {
                this.cache.set(key, { data, t: now });
                return data;
            });
        }

        // 实时开奖
        getLatest() {
            return this._cached('latest', () =>
                fetchWithFallback([
                    { name: 'pc28.help', url: CONFIG.primary + '/kj.json' },
                    { name: 'pgsoft', url: CONFIG.backup1 + '/latest?type=canada28&limit=1' },
                ]).then(normalize)
            );
        }

        // Keno 原始数据
        getKeno() {
            return this._cached('keno', () =>
                timeoutFetch(CONFIG.primary + '/keno.json').then(r => r.json())
            );
        }

        // 聚合预览（一次拿全）
        getPreview() {
            return this._cached('preview', () =>
                timeoutFetch(CONFIG.primary + '/preview.json').then(r => r.json())
            );
        }

        // 历史开奖
        getHistory(page, limit) {
            page = page || 1;
            limit = limit || 50;
            return this._cached('hist_' + page + '_' + limit, () =>
                fetchWithFallback([
                    { name: 'pgsoft_history', url: CONFIG.backup1 + '/history?type=canada28&page=' + page + '&limit=' + limit },
                    { name: 'pc28_preview', url: CONFIG.primary + '/preview.json' },
                ])
            );
        }

        // 双组预测
        getDoubleGroup() {
            return this._cached('sz', () =>
                timeoutFetch(CONFIG.primary + '/sz.json').then(r => r.json())
            );
        }

        // 杀组预测
        getKillGroup() {
            return this._cached('sha', () =>
                timeoutFetch(CONFIG.primary + '/sha.json').then(r => r.json())
            );
        }

        // 单双预测
        getDS() {
            return this._cached('ds', () =>
                timeoutFetch(CONFIG.primary + '/ds.json').then(r => r.json())
            );
        }

        // 大小预测
        getDX() {
            return this._cached('dx', () =>
                timeoutFetch(CONFIG.primary + '/dx.json').then(r => r.json())
            );
        }

        // 遗漏统计
        getMissStats() {
            return this._cached('yl', () =>
                timeoutFetch(CONFIG.primary + '/yl.json').then(r => r.json())
            );
        }

        // 今日已开
        getTodayCount() {
            return this._cached('yk', () =>
                timeoutFetch(CONFIG.primary + '/yk.json').then(r => r.json())
            );
        }

        // 长龙监控（全部）
        getDragons() {
            return Promise.all([
                timeoutFetch(CONFIG.primary + '/xh.json').then(r => r.json()).catch(() => null),
                timeoutFetch(CONFIG.primary + '/jt.json').then(r => r.json()).catch(() => null),
                timeoutFetch(CONFIG.primary + '/abb.json').then(r => r.json()).catch(() => null),
                timeoutFetch(CONFIG.primary + '/pl.json').then(r => r.json()).catch(() => null),
            ]).then(([xh, jt, abb, pl]) => ({ xh, jt, abb, pl }));
        }

        // 一键拉取全部核心数据
        async fetchAll() {
            const [latest, sz, sha, ds, dx, yl, dragons] = await Promise.all([
                this.getLatest().catch(() => null),
                this.getDoubleGroup().catch(() => null),
                this.getKillGroup().catch(() => null),
                this.getDS().catch(() => null),
                this.getDX().catch(() => null),
                this.getMissStats().catch(() => null),
                this.getDragons().catch(() => null),
            ]);
            return { latest, prediction: { sz, sha, ds, dx }, miss: yl, dragons };
        }

        // 轮询（新期自动回调）
        startPolling(onNewPeriod, interval) {
            interval = interval || 5000;
            let lastPeriod = null;
            const tick = async () => {
                try {
                    const data = await this.getLatest();
                    const cur = data && (data.nbr || data.period || data.issue);
                    if (cur && cur !== lastPeriod) {
                        if (lastPeriod !== null) onNewPeriod && onNewPeriod(data);
                        lastPeriod = cur;
                    }
                } catch (e) {
                    console.warn('[PC28] 轮询失败:', e.message);
                }
            };
            tick();
            return setInterval(tick, interval);
        }
    }

    // 导出
    const instance = new PC28API();
    global.PC28API = PC28API;
    global.pc28 = instance;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PC28API, pc28: instance };
    }

    console.log('%c[PC28] 统一接口模块已加载 ✅', 'color:#34d399;font-weight:bold');
})(typeof window !== 'undefined' ? window : globalThis);
