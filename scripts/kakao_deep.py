#!/usr/bin/env python3
"""미발견(폐업 후보) 암장을 카카오 로컬 API로 한 번 더 샅샅이 훑는다.

기본 검증(kakao_verify.py)이 놓칠 수 있는 경우를 노린다.
  - 등록명이 크게 달라 키워드가 안 걸리는 경우
  - 지번 주소로만 등록된 경우
  - 200m 밖(같은 건물 다른 출입구 등)에 좌표가 찍힌 경우
  - '클라이밍' 대신 '암벽/볼더'로만 표기된 경우

출력: scripts/deep_result.json + 표준출력 요약
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kakao_verify import DETAIL, is_climb, load_key, road_key, search  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


def local(key, path, **params):
    url = f"https://dapi.kakao.com/v2/local/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {key}"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 * (attempt + 1))
                continue
            return {}
        except OSError:
            time.sleep(1 + attempt)
    return {}


def name_variants(gym):
    """'훅클라이밍 성수점' → 훅클라이밍 / 훅 / 성수 훅클라이밍 …"""
    n = gym["name"]
    out = {n, n.replace(" ", "")}
    base = re.sub(r"\s*(\S+점|센터|짐|클럽|GYM|gym)$", "", n).strip()
    if base and base != n:
        out.add(base)
    brand = gym.get("brand")
    branch = gym.get("branch_name")
    if brand:
        out.add(brand)
        if branch:
            out.add(f"{brand} {branch}")
    # '클라이밍'을 뺀 고유명 (예: '치즈 클라이밍' → '치즈')
    stem = re.sub(r"(클라이밍|클라임|볼더링|실내암벽장?|암벽)", "", n).strip()
    if len(stem) >= 2:
        out.add(stem)
    if gym.get("city_district"):
        out.add(f"{gym['city_district']} {n}")
    return [x for x in out if len(x) >= 2]


def deep_check(key, gym):
    """찾으면 그 장소를, 못 찾으면 None을 돌려준다."""
    rk = road_key(gym["address"])

    # 1) 이름 변형 전수 검색
    for q in name_variants(gym):
        for d in search(key, q):
            if not is_climb(d):
                continue
            same_addr = rk and rk == road_key(d.get("road_address_name") or d.get("address_name"))
            if same_addr:
                return {"hit": d, "how": f"이름변형 '{q}' + 주소일치"}
        time.sleep(0.05)

    # 2) 주소 → 좌표 → 반경 500m 안의 클라이밍장 전수
    addr = DETAIL.sub("", re.sub(r"\s+", " ", (gym["address"] or "").strip()))
    docs = local(key, "search/address.json", query=addr, size=1).get("documents") or []
    if docs:
        x, y = docs[0]["x"], docs[0]["y"]
        for kw in ("클라이밍", "암벽", "볼더"):
            for d in local(key, "search/keyword.json",
                           query=kw, x=x, y=y, radius=500, size=15).get("documents") or []:
                if not is_climb(d):
                    continue
                if rk and rk == road_key(d.get("road_address_name") or d.get("address_name")):
                    return {"hit": d, "how": f"반경검색 '{kw}' + 주소일치"}
                if int(d["distance"]) <= 60:
                    return {"hit": d, "how": f"반경검색 '{kw}' {d['distance']}m"}
            time.sleep(0.05)
    return None


def main():
    key = load_key()
    rows = json.load(open(os.path.join(HERE, "kakao_result.json"), encoding="utf-8"))
    targets = [g for g in rows if g["verdict"] == "missing"]
    found, still = [], []

    for i, gym in enumerate(targets, 1):
        res = deep_check(key, gym)
        if res:
            found.append({**gym, "deep_hit": res["hit"]["place_name"],
                          "deep_addr": res["hit"].get("road_address_name"),
                          "deep_id": res["hit"]["id"], "deep_how": res["how"]})
            print(f"[{i:2}/{len(targets)}] 발견   {gym['name']} → {res['hit']['place_name']} ({res['how']})", flush=True)
        else:
            still.append(gym)
            print(f"[{i:2}/{len(targets)}] 없음   {gym['name']}", flush=True)

    json.dump({"found": found, "still_missing": still},
              open(os.path.join(HERE, "deep_result.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"\n재발견 {len(found)} · 여전히 미발견 {len(still)}")


if __name__ == "__main__":
    main()
