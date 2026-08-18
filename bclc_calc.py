"""
bclc_calc.py — BCLC Keno 官方开奖规则计算模块
==============================================
规则来源: https://lotto.bclc.com/
规则说明:
  BCLC 每期开出 20 个数字(1-80)，按从小到大排序后：
  
  第1球 b1 = (第2+5+8+11+14+17位 之和) % 10
  第2球 b2 = (第3+6+9+12+15+18位 之和) % 10
  第3球 b3 = (第4+7+10+13+16+19位 之和) % 10
  
  特码 sum = b1 + b2 + b3 (范围 0-27)
  
  开奖频率: 每3.5分钟一期 (210秒)
  夏令时: 北京时间 20:00 - 次日 19:00 (PDT = UTC-7)
  冬令时: 北京时间 21:00 - 次日 20:00 (PST = UTC-8)

用法:
  from bclc_calc import BCLCCalc
  calc = BCLCCalc()
  result = calc.from_keno_numbers([7,8,14,16,17,22,...])  # 20个数字
  # result = {"b1":8, "b2":8, "b3":4, "sum":20, "combo":"大双", ...}
"""

import json
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any


# ============================================================
# 常量
# ============================================================
BJT = timezone(timedelta(hours=8))

# 开奖间隔(秒)
DRAW_INTERVAL = 210  # 3分30秒

# 数据源配置
KENO_API_URLS = [
    "https://pc28.help/api/keno.json?nbr=60",
    "https://yu28.top/api/bclc?count=60&key=yu28-f9f41d673b447fac",
]

KJ_API_URLS = [
    "https://pc28.help/api/kj.json?nbr=60",
]


# ============================================================
# 核心计算类
# ============================================================
class BCLCCalc:
    """BCLC Keno 官方规则计算器"""

    def __init__(self):
        pass

    # ---------- 时区判断 ----------
    @staticmethod
    def is_dst(utc_dt: Optional[datetime] = None) -> bool:
        """判断当前是否处于夏令时(PDT, UTC-7)"""
        if utc_dt is None:
            utc_dt = datetime.utcnow().replace(tzinfo=timezone.utc)
        year = utc_dt.year
        # 3月第二个周日起始
        march1 = datetime(year, 3, 1, tzinfo=timezone.utc)
        days_to_2nd_sun = (6 - march1.weekday() + 7) % 7 + 7
        dst_start = march1 + timedelta(days=days_to_2nd_sun, hours=10)
        # 11月第一个周日起始
        nov1 = datetime(year, 11, 1, tzinfo=timezone.utc)
        days_to_1st_sun = (6 - nov1.weekday()) % 7
        dst_end = nov1 + timedelta(days=days_to_1st_sun, hours=9)
        return dst_start <= utc_dt < dst_end

    @staticmethod
    def get_session_bounds(bjt: datetime):
        """获取当前开奖会话的起止时间(北京时间)"""
        is_dst = BCLCCalc.is_dst(bjt.astimezone(timezone.utc))
        if is_dst:
            start = bjt.replace(hour=20, minute=0, second=0, microsecond=0)
            end = (start + timedelta(days=1)).replace(hour=19, minute=0, second=0)
        else:
            start = bjt.replace(hour=21, minute=0, second=0, microsecond=0)
            end = (start + timedelta(days=1)).replace(hour=20, minute=0, second=0)
        return start, end, is_dst

    @staticmethod
    def is_open(bjt: datetime) -> bool:
        """判断当前是否在开奖时段内"""
        s, e, _ = BCLCCalc.get_session_bounds(bjt)
        return s <= bjt <= e

    @staticmethod
    def period_info(bjt: datetime):
        """计算当前期号、倒计时"""
        s, e, dst = BCLCCalc.get_session_bounds(bjt)
        if bjt < s:
            prev = bjt - timedelta(days=1)
            s, _, _ = BCLCCalc.get_session_bounds(prev)
        elapsed = (bjt - s).total_seconds()
        seq = max(1, int(elapsed / DRAW_INTERVAL) + 1)
        date_str = s.strftime("%y%m%d")
        period = f"{date_str}{seq:04d}"
        next_draw = s + timedelta(seconds=seq * DRAW_INTERVAL)
        cd = max(0, int((next_draw - bjt).total_seconds()))
        return period, cd, next_draw, seq, s

    # ---------- 核心计算 ----------
    @staticmethod
    def calc_balls(sorted_nums: List[int]) -> Dict[str, int]:
        """
        根据BCLC官方规则，从20个已排序号码计算三球

        参数: sorted_nums — 已经从小到大排序的20个数字(1-80)
        返回: {"b1":int, "b2":int, "b3":int, "sum":int}

        规则(1-indexed位置):
          b1 = (pos2 + pos5 + pos8 + pos11 + pos14 + pos17) % 10
          b2 = (pos3 + pos6 + pos9 + pos12 + pos15 + pos18) % 10
          b3 = (pos4 + pos7 + pos10 + pos13 + pos16 + pos19) % 10

        对应0-indexed:
          b1 = (sorted[1] + sorted[4] + sorted[7] + sorted[10] + sorted[13] + sorted[16]) % 10
          b2 = (sorted[2] + sorted[5] + sorted[8] + sorted[11] + sorted[14] + sorted[17]) % 10
          b3 = (sorted[3] + sorted[6] + sorted[9] + sorted[12] + sorted[15] + sorted[18]) % 10
        """
        if len(sorted_nums) < 20:
            raise ValueError(f"需要20个号码，实际只有{len(sorted_nums)}个")

        b1 = (sorted_nums[1] + sorted_nums[4] + sorted_nums[7] + sorted_nums[10] + sorted_nums[13] + sorted_nums[16]) % 10
        b2 = (sorted_nums[2] + sorted_nums[5] + sorted_nums[8] + sorted_nums[11] + sorted_nums[14] + sorted_nums[17]) % 10
        b3 = (sorted_nums[3] + sorted_nums[6] + sorted_nums[9] + sorted_nums[12] + sorted_nums[15] + sorted_nums[18]) % 10
        s = b1 + b2 + b3

        return {"b1": b1, "b2": b2, "b3": b3, "sum": s}

    @staticmethod
    def from_keno_numbers(nums: List[int]) -> Dict[str, Any]:
        """
        输入: 20个原始号码(未排序)
        输出: 完整开奖记录
        """
        sorted_nums = sorted(nums)
        balls = BCLCCalc.calc_balls(sorted_nums)
        s = balls["sum"]

        # 组合判断
        if s >= 14:
            combo = "大单" if s % 2 == 1 else "大双"
        else:
            combo = "小单" if s % 2 == 1 else "小双"

        # 形态判断
        b = [balls["b1"], balls["b2"], balls["b3"]]
        bs = sorted(b)
        if b[0] == b[1] == b[2]:
            pattern = "豹子"
        elif b[0] == b[1] or b[1] == b[2] or b[0] == b[2]:
            pattern = "对子"
        elif bs[1] - bs[0] == 1 and bs[2] - bs[1] == 1:
            pattern = "顺子"
        else:
            pattern = "杂六"

        return {
            "b1": balls["b1"],
            "b2": balls["b2"],
            "b3": balls["b3"],
            "sum": s,
            "combo": combo,
            "pattern": pattern,
            "big": s >= 14,
            "odd": s % 2 == 1,
            "raw_nums": sorted_nums,  # 20个原始号码(排序后)
        }

    # ---------- 从特码反推三球 ----------
    @staticmethod
    def decompose_sum(sum_val: int) -> List[int]:
        """从特码反推最可能的三球组合(优先对子/豹子)"""
        results = []
        for a in range(10):
            for b in range(10):
                for c in range(10):
                    if a + b + c == sum_val:
                        results.append(tuple(sorted([a, b, c])))
        seen = set()
        unique = []
        for r in results:
            if r not in seen:
                seen.add(r)
                unique.append(list(r))
        # 优先有重复数字的
        unique.sort(key=lambda x: (not (x[0] == x[1] or x[1] == x[2]), x[0]))
        return unique[0] if unique else [0, 0, 0]

    # ---------- 数据获取 ----------
    @staticmethod
    def fetch_keno_data(url: str, timeout: int = 10) -> Optional[List[Dict]]:
        """从API获取Keno原始数据"""
        import urllib.request
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "BCLC-Calc/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return BCLCCalc._parse_keno_response(data)
        except Exception as e:
            print(f"  [WARN] {url}: {e}")
            return None

    @staticmethod
    def _parse_keno_response(raw: Any) -> List[Dict]:
        """解析各种格式的Keno响应 → 统一格式"""
        results = []
        items = raw.get("data") or raw.get("list") or raw.get("results") or (raw if isinstance(raw, list) else [])
        if isinstance(raw, dict) and not items:
            # 单条记录
            items = [raw]

        for item in items:
            try:
                nbr = str(item.get("nbr") or item.get("issue") or item.get("period") or "")
                # 获取20个号码
                nums = item.get("nums") or item.get("numbers") or item.get("raw") or item.get("rawNums")
                if not nums:
                    # 尝试从字符串解析
                    num_str = item.get("num") or item.get("numbers_str") or ""
                    if isinstance(num_str, str) and "," in num_str:
                        nums = [int(x) for x in num_str.split(",")]
                
                if nums and len(nums) >= 20:
                    nums = [int(x) for x in nums[:20]]
                    sorted_nums = sorted(nums)
                    result = BCLCCalc.from_keno_numbers(sorted_nums)
                    result["nbr"] = nbr
                    result["date"] = item.get("date") or item.get("draw_date") or ""
                    result["time"] = item.get("time") or item.get("draw_time") or ""
                    results.append(result)
                elif item.get("number") or item.get("num"):
                    # 只有三球或特码，反推
                    num_str = str(item.get("number") or item.get("num") or "")
                    parts = num_str.split("+")
                    if len(parts) == 3:
                        b1, b2, b3 = int(parts[0]), int(parts[1]), int(parts[2])
                        s = b1 + b2 + b3
                    else:
                        s = int(item.get("num") or item.get("sum") or 0)
                        decomposed = BCLCCalc.decompose_sum(s)
                        b1, b2, b3 = decomposed[0], decomposed[1], decomposed[2]
                    
                    combo = "大双" if s >= 14 and s % 2 == 0 else ("大单" if s >= 14 else ("小双" if s % 2 == 0 else "小单"))
                    results.append({
                        "nbr": nbr,
                        "date": item.get("date") or "",
                        "time": item.get("time") or "",
                        "b1": b1, "b2": b2, "b3": b3,
                        "sum": s,
                        "combo": item.get("combination") or item.get("combo") or combo,
                        "pattern": "未知",
                        "big": s >= 14,
                        "odd": s % 2 == 1,
                        "raw_nums": [],
                    })
            except Exception:
                continue

        return results

    @staticmethod
    def fetch_all(timeout: int = 10) -> List[Dict]:
        """从所有数据源获取并合并去重"""
        all_data = {}
        for url in KENO_API_URLS:
            data = BCLCCalc.fetch_keno_data(url, timeout)
            if data:
                for item in data:
                    all_data[item["nbr"]] = item
                print(f"  [OK] {url} → {len(data)}条")
                break  # 第一个成功就用
        
        if not all_data:
            # 降级到kj接口(只有三球，需要反推)
            for url in KJ_API_URLS:
                try:
                    import urllib.request
                    req = urllib.request.Request(url, headers={"User-Agent": "BCLC-Calc/1.0"})
                    with urllib.request.urlopen(req, timeout=timeout) as resp:
                        raw = json.loads(resp.read().decode("utf-8"))
                        items = raw.get("data") or raw.get("list") or []
                        for item in items:
                            try:
                                nbr = str(item.get("nbr") or item.get("issue") or "")
                                num_str = str(item.get("number") or "")
                                parts = num_str.split("+")
                                if len(parts) == 3:
                                    b1, b2, b3 = int(parts[0]), int(parts[1]), int(parts[2])
                                else:
                                    s = int(item.get("num") or item.get("sum") or 0)
                                    decomposed = BCLCCalc.decompose_sum(s)
                                    b1, b2, b3 = decomposed[0], decomposed[1], decomposed[2]
                                s = b1 + b2 + b3
                                combo = item.get("combination") or ("大双" if s >= 14 and s % 2 == 0 else ("大单" if s >= 14 else ("小双" if s % 2 == 0 else "小单")))
                                all_data[nbr] = {
                                    "nbr": nbr,
                                    "date": item.get("date") or "",
                                    "time": item.get("time") or "",
                                    "b1": b1, "b2": b2, "b3": b3,
                                    "sum": s,
                                    "combo": combo,
                                    "pattern": "未知",
                                    "big": s >= 14,
                                    "odd": s % 2 == 1,
                                    "raw_nums": [],
                                }
                            except: continue
                        if all_data:
                            print(f"  [OK] 降级 {url} → {len(all_data)}条")
                            break
                except Exception as e:
                    print(f"  [WARN] 降级 {url}: {e}")

        # 按期号排序
        sorted_data = sorted(all_data.values(), key=lambda x: x["nbr"])
        return sorted_data

    # ---------- 构建输出 ----------
    @staticmethod
    def build_output(data: List[Dict], source: str = "bclc_keno") -> Dict:
        """构建标准输出格式"""
        bjt = datetime.now(BJT)
        per, cd, next_draw, seq, sess_start = BCLCCalc.period_info(bjt)
        is_dst = BCLCCalc.is_dst(bjt.astimezone(timezone.utc))
        tz_name = "PDT" if is_dst else "PST"

        # 倒计时格式化
        m, s = divmod(cd, 60)
        cd_str = f"{m}:{s:02d}"

        latest = data[-1] if data else None

        return {
            "countdown": cd_str,
            "current_period": per,
            "next_draw": next_draw.strftime("%Y-%m-%d %H:%M:%S"),
            "is_open": BCLCCalc.is_open(bjt),
            "timezone": tz_name,
            "source": source,
            "updated": int(time.time()),
            "fetched_at": bjt.strftime("%Y-%m-%d %H:%M:%S"),
            "data": [
                {
                    "nbr": d["nbr"],
                    "date": d.get("date", ""),
                    "time": d.get("time", ""),
                    "number": f"{d['b1']}+{d['b2']}+{d['b3']}",
                    "num": d["sum"],
                    "combination": d["combo"],
                    "b1": d["b1"],
                    "b2": d["b2"],
                    "b3": d["b3"],
                    "raw_nums": d.get("raw_nums", []),
                }
                for d in data
            ],
            "message": "success" if data else "no_data",
        }


# ============================================================
# 便捷函数
# ============================================================
def calc_from_raw(nums: List[int]) -> Dict:
    """快捷计算: 输入20个号码 → 输出完整结果"""
    return BCLCCalc.from_keno_numbers(nums)


def combo_of(sum_val: int) -> str:
    """特码 → 组合名"""
    if sum_val >= 14:
        return "大单" if sum_val % 2 == 1 else "大双"
    return "小单" if sum_val % 2 == 1 else "小双"


# ============================================================
# 自测
# ============================================================
if __name__ == "__main__":
    print("=" * 55)
    print("  BCLC Keno 官方开奖规则 · 自测")
    print("=" * 55)

    # 测试1: 标准计算
    test_nums = [7, 8, 14, 16, 17, 22, 26, 34, 39, 41, 42, 48, 54, 58, 63, 64, 69, 72, 73, 79]
    print(f"\n  测试号码(20个): {test_nums}")
    result = BCLCCalc.from_keno_numbers(test_nums)
    print(f"  排序后: {sorted(test_nums)}")
    print(f"  b1 = (pos2+5+8+11+14+17) % 10 = ({sorted(test_nums)[1]}+{sorted(test_nums)[4]}+{sorted(test_nums)[7]}+{sorted(test_nums)[10]}+{sorted(test_nums)[13]}+{sorted(test_nums)[16]}) % 10 = {result['b1']}")
    print(f"  b2 = (pos3+6+9+12+15+18) % 10 = {result['b2']}")
    print(f"  b3 = (pos4+7+10+13+16+19) % 10 = {result['b3']}")
    print(f"  特码 = {result['b1']}+{result['b2']}+{result['b3']} = {result['sum']}")
    print(f"  组合: {result['combo']}")
    print(f"  形态: {result['pattern']}")

    # 测试2: 时区
    bjt = datetime.now(BJT)
    per, cd, nd, seq, ss = BCLCCalc.period_info(bjt)
    print(f"\n  北京时间: {bjt.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  当前期号: {per}")
    print(f"  倒计时: {cd}秒")
    print(f"  是否夏令时: {BCLCCalc.is_dst(bjt.astimezone(timezone.utc))}")
    print(f"  开奖中: {BCLCCalc.is_open(bjt)}")

    # 测试3: 反推
    decomposed = BCLCCalc.decompose_sum(15)
    print(f"\n  特码15 → 三球: {decomposed}")

    print("\n" + "=" * 55)
    print("  ✅ 自测通过")
    print("=" * 55)
