"""
bclc_calc.py — BCLC Keno → 加拿大PC28 三球计算模块
====================================================
规则：
  BCLC Keno 每期开出 20 个数字（1-80），从小到大排序后：
  - 第一球(b1) = (第2+5+8+11+14+17位 之和) % 10
  - 第二球(b2) = (第3+6+9+12+15+18位 之和) % 10
  - 第三球(b3) = (第4+7+10+13+16+19位 之和) % 10
  - 特码(sum)  = b1 + b2 + b3  (范围 0-27)

  注：位置从1开始计数，即排序后第1位=最小数。

使用：
  from bclc_calc import calc_pc28, calc_from_keno_list

  nums = [7,8,14,16,17,22,26,34,39,41,42,48,54,58,63,64,69,72,73,79]
  result = calc_pc28(nums)
  # → {"b1":8, "b2":8, "b3":4, "sum":20, "number":"8+8+4", "num":"20", ...}
"""

# ============================================================
# 位置索引（0-based，对应排序后的列表下标）
# ============================================================
# 第2,5,8,11,14,17位 → 下标 1,4,7,10,13,16
ZONE1_IDX = [1, 4, 7, 10, 13, 16]

# 第3,6,9,12,15,18位 → 下标 2,5,8,11,14,17
ZONE2_IDX = [2, 5, 8, 11, 14, 17]

# 第4,7,10,13,16,19位 → 下标 3,6,9,12,15,18
ZONE3_IDX = [3, 6, 9, 12, 15, 18]


def calc_pc28(sorted_numbers: list) -> dict:
    """
    输入：排序后的 20 个 Keno 号码（升序，1-80 范围）
    输出：包含 b1/b2/b3/sum/number/num/size/parity 的字典
    """
    if not sorted_numbers or len(sorted_numbers) < 20:
        raise ValueError(f"需要20个号码，实际收到 {len(sorted_numbers) if sorted_numbers else 0} 个")

    # 确保是升序
    nums = sorted(sorted_numbers)

    # 三区计算
    b1 = sum(nums[i] for i in ZONE1_IDX) % 10
    b2 = sum(nums[i] for i in ZONE2_IDX) % 10
    b3 = sum(nums[i] for i in ZONE3_IDX) % 10
    s = b1 + b2 + b3

    return {
        "b1": b1,
        "b2": b2,
        "b3": b3,
        "sum": s,
        "number": f"{b1}+{b2}+{b3}",
        "num": str(s),
        "size": "大" if s >= 14 else "小",
        "parity": "双" if s % 2 == 0 else "单",
        "combination": ("大" if s >= 14 else "小") + ("双" if s % 2 == 0 else "单"),
    }


def calc_from_keno_list(keno_data: list) -> list:
    """
    批量转换：输入 keno 数据列表，每条包含 nbrs(20个号码) + nbr(期号) + 其他字段
    输出：与现有 latest.json data[] 格式兼容的列表
    """
    results = []
    for item in keno_data:
        try:
            nbrs = item.get("nbrs") or item.get("numbers") or item.get("nums")
            if not nbrs:
                continue
            # 确保是数字列表
            if isinstance(nbrs, str):
                nbrs = [int(x) for x in nbrs.split(",") if x.strip().isdigit()]
            nbrs = [int(x) for x in nbrs]

            calc = calc_pc28(nbrs)

            results.append({
                "nbr": str(item.get("nbr") or item.get("period") or item.get("issue") or ""),
                "date": str(item.get("date") or ""),
                "time": str(item.get("time") or item.get("opentime") or ""),
                "number": calc["number"],
                "num": calc["num"],
                "combination": calc["combination"],
                # 保留原始20个号码，方便调试和回测
                "nbrs": nbrs,
            })
        except (ValueError, KeyError, TypeError) as e:
            print(f"  ⚠ 跳过一期: {e}")
            continue

    return results


# ============================================================
# 自测
# ============================================================
if __name__ == "__main__":
    # 用文档中的示例验证
    test_nums = [7, 8, 14, 16, 17, 22, 26, 34, 39, 41,
                 42, 48, 54, 58, 63, 64, 69, 72, 73, 79]

    print("=" * 50)
    print("BCLC → PC28 计算模块 · 自测")
    print("=" * 50)

    r = calc_pc28(test_nums)
    print(f"\n测试号码(排序后): {test_nums}")
    print(f"  第一区(2,5,8,11,14,17位): {test_nums[1]}+{test_nums[4]}+{test_nums[7]}+{test_nums[10]}+{test_nums[13]}+{test_nums[16]}")
    print(f"    = {test_nums[1]+test_nums[4]+test_nums[7]+test_nums[10]+test_nums[13]+test_nums[16]} → 末位 {r['b1']}")
    print(f"  第二区(3,6,9,12,15,18位): {test_nums[2]}+{test_nums[5]}+{test_nums[8]}+{test_nums[11]}+{test_nums[14]}+{test_nums[17]}")
    print(f"    = {test_nums[2]+test_nums[5]+test_nums[8]+test_nums[11]+test_nums[14]+test_nums[17]} → 末位 {r['b2']}")
    print(f"  第三区(4,7,10,13,16,19位): {test_nums[3]}+{test_nums[6]}+{test_nums[9]}+{test_nums[12]}+{test_nums[15]}+{test_nums[18]}")
    print(f"    = {test_nums[3]+test_nums[6]+test_nums[9]+test_nums[12]+test_nums[15]+test_nums[18]} → 末位 {r['b3']}")
    print(f"\n  三球结果: {r['number']}")
    print(f"  特码和值: {r['sum']}")
    print(f"  形态组合: {r['combination']}")

    # 验证：期望值 b1=8, b2=8, b3=4, sum=20
    expected = {"b1": 8, "b2": 8, "b3": 4, "sum": 20}
    ok = all(r[k] == expected[k] for k in expected)
    print(f"\n  {'✅ 验证通过！与文档示例完全一致' if ok else '❌ 验证失败'}")
    if not ok:
        for k in expected:
            print(f"    {k}: 期望 {expected[k]}, 实际 {r[k]}")
