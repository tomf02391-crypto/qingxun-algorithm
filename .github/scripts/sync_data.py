"""
从 Liquid-Glass-Profil 数据仓库同步 data/latest.json 到本仓库
放在各仓库的 .github/workflows/sync-data.yml 中由 Actions 运行
"""
import json, urllib.request, os, sys

SRC = "https://raw.githubusercontent.com/tomf02391-crypto/Liquid-Glass-Profil/main/data/latest.json"
HEADERS = {"User-Agent":"Mozilla/5.0","Accept":"application/json","Cache-Control":"no-cache"}
OUT = "data/latest.json"

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode()

print(f"拉取: {SRC}")
raw = fetch(SRC)
data = json.loads(raw)
items = data.get("data") or []
print(f"数据仓库返回: {len(items)} 条, 最新期号={items[-1].get('nbr')}, 时间={items[-1].get('time')}")

# 校验：必须有 b1/b2/b3/num/nbrs
required = {"nbr","b1","b2","b3","num","nbrs"}
sample = items[0]
missing = required - set(sample.keys())
if missing:
    print(f"⚠️ 数据缺少字段: {missing}, 可用字段: {list(sample.keys())}")
    # 尝试兼容：number 字段拆成 b1/b2/b3
    if "number" in sample and missing & {"b1","b2","b3"}:
        for it in items:
            if "number" in it and not {"b1","b2","b3"}.issubset(it):
                parts = str(it["number"]).replace("=","").split("+")
                if len(parts) == 3:
                    it["b1"], it["b2"], it["b3"] = int(parts[0]), int(parts[1]), int(parts[2])
                    if "num" not in it:
                        it["num"] = it["b1"]+it["b2"]+it["b3"]
        print("✅ 已从 number 字段补全 b1/b2/b3")
        # 重新序列化
        data["data"] = items
        raw = json.dumps(data, ensure_ascii=False, indent=2)
else:
    print("✅ 字段完整")

os.makedirs("data", exist_ok=True)
with open(OUT,"w",encoding="utf-8") as f:
    f.write(raw if isinstance(raw,str) else json.dumps(data, ensure_ascii=False, indent=2))

print(f"写入: {OUT} ({os.path.getsize(OUT)} 字节)")
print("✅ 同步完成")
