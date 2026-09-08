#!/usr/bin/env python3
"""카카오 로컬 API로 암장 200곳의 운영 여부 · 주소 · 좌표를 검증한다.

  python3 scripts/kakao_verify.py

입력: scripts/gyms_source.json  (엑셀에서 추출한 200곳)
출력: scripts/kakao_result.json (원본 + kakao 매칭 결과)
      표준출력에 판정 요약

판정
  matched   카카오맵에서 이름·주소가 일치하는 장소를 찾음 → 운영 중
  moved     이름은 찾았으나 등록 주소와 다름 → 이전했거나 시트 주소가 틀림
  missing   카카오맵에 없음 → 폐업 후보 (구글 Places로 교차검증 필요)
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = "https://dapi.kakao.com/v2/local/search/keyword.json"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def load_key():
    key = os.environ.get("KAKAO_REST_API_KEY")
    if key:
        return key
    path = os.path.join(ROOT, ".env.gyms.local")
    try:
        for line in open(path, encoding="utf-8"):
            k, _, v = line.strip().partition("=")
            if k == "KAKAO_REST_API_KEY" and v:
                return v
    except OSError:
        pass
    sys.exit(f"KAKAO_REST_API_KEY 없음 — {path} 를 확인하세요")


def search(key, query, size=15):
    url = f"{API}?{urllib.parse.urlencode({'query': query, 'size': size})}"
    req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {key}"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.load(resp).get("documents", [])
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            if e.code == 429:  # 쿼터/속도 제한
                time.sleep(2 * (attempt + 1))
                continue
            sys.exit(f"카카오 API 오류 {e.code}: {body}")
        except OSError:
            time.sleep(1 + attempt)
    return []


# 주소 비교용 정규화 — 시/도 접두어, 공백, 층/호 등 상세주소를 털어낸다
PREFIX = re.compile(r"^(서울특별시|서울시|서울|경기도|경기)\s*")
DETAIL = re.compile(r"\s*(지하\s*)?\d+\s*(층|호|동)\b.*$")


def norm_addr(a):
    if not a:
        return ""
    a = PREFIX.sub("", a.strip())
    a = DETAIL.sub("", a)
    return re.sub(r"\s+", "", a)


# 공백으로 시작하는 토큰 안에서만 도로명을 찾는다. 이렇게 해야
# '화성시 효행구 효행로 287'과 '화성시 효행로 287'이 같은 키가 된다.
# (2026년 화성시 구 신설·부천시 구 부활처럼 카카오만 자치구를 붙이는 경우 대응)
ROAD = re.compile(r"(?:^|\s)([가-힣A-Za-z0-9]+(?:번?길|로))\s*(\d+(?:-\d+)?)")


def road_key(a):
    """도로명 + 건물번호만 뽑는다: '서울 강남구 학동로2길 56' → '학동로2길56'"""
    if not a:
        return ""
    a = DETAIL.sub("", re.sub(r"\s+", " ", a.strip()))
    m = ROAD.search(a)
    return (m.group(1) + m.group(2)) if m else ""


def norm_name(n):
    return re.sub(r"[\s·\-_]", "", (n or "")).lower()


# 클라이밍 업종인지 — 매칭 후보는 여기 걸리는 장소로만 한정한다.
# 이걸 안 걸면 '무중력클라이밍' 주소에 들어선 하나은행이 매칭돼 폐업을 놓친다.
CLIMB = re.compile(r"클라이밍|암벽|볼더|클라임|climb|boulder", re.I)


def is_climb(doc):
    return bool(CLIMB.search((doc.get("category_name") or "") + " " + (doc.get("place_name") or "")))


def score(gym, doc):
    """0~3점. 주소 일치가 2점, 이름 포함이 1점. 클라이밍 업종이 아니면 후보에서 제외."""
    if not is_climb(doc):
        return 0
    s = 0
    rk_gym = road_key(gym["address"])
    rk_doc = road_key(doc.get("road_address_name") or doc.get("address_name"))
    if rk_gym and rk_gym == rk_doc:
        s += 2
    ng, nd = norm_name(gym["name"]), norm_name(doc.get("place_name"))
    if ng and (ng in nd or nd in ng):
        s += 1
    return s


def queries(gym):
    """가장 좁은 질의부터 순서대로 시도한다."""
    name, addr, dist = gym["name"], gym["address"] or "", gym["city_district"] or ""
    out = [f"{name} {addr}", f"{dist} {name}", name]
    for alias in (gym.get("aliases") or "").split("·"):
        alias = alias.strip()
        if alias:
            out.append(f"{dist} {alias}")
    if addr:
        out.append(addr)  # 주소만으로 그 자리에 뭐가 들어섰는지 확인
    seen, uniq = set(), []
    for q in out:
        q = q.strip()
        if q and q not in seen:
            seen.add(q)
            uniq.append(q)
    return uniq


def geocode(key, address):
    """주소 → 좌표. 상세주소(층/호)가 붙으면 실패하므로 털어내고 요청한다."""
    q = DETAIL.sub("", re.sub(r"\s+", " ", (address or "").strip()))
    if not q:
        return None
    url = "https://dapi.kakao.com/v2/local/search/address.json?" + urllib.parse.urlencode(
        {"query": q, "size": 1}
    )
    req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {key}"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            docs = json.load(resp).get("documents", [])
        return (docs[0]["x"], docs[0]["y"]) if docs else None
    except OSError:
        return None


def nearby(key, xy, radius=200):
    url = "https://dapi.kakao.com/v2/local/search/keyword.json?" + urllib.parse.urlencode(
        {"query": "클라이밍", "x": xy[0], "y": xy[1], "radius": radius, "size": 15}
    )
    req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {key}"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.load(resp).get("documents", [])
    except OSError:
        return []


def verify(key, gym):
    best, best_score, best_q = None, 0, None
    occupant = None  # 등록 주소에 있는 클라이밍장 아닌 업소 = 폐업 정황
    rk_gym = road_key(gym["address"])
    for q in queries(gym):
        for doc in search(key, q):
            sc = score(gym, doc)
            if sc > best_score:
                best, best_score, best_q = doc, sc, q
            if (occupant is None and not is_climb(doc) and rk_gym
                    and rk_gym == road_key(doc.get("road_address_name") or doc.get("address_name"))):
                occupant = doc
        if best_score >= 3:
            break  # 이름·주소 모두 일치하면 더 볼 것 없음
        time.sleep(0.05)

    renamed_as = None
    if best_score < 2:
        # 키워드 검색으로 못 찾았을 때: 등록 주소 좌표 반경에 클라이밍장이 있는지 본다.
        # '알레 클라이밍 강동' → '알레클라임'처럼 표기만 다른 경우가 여기서 잡힌다.
        xy = geocode(key, gym["address"])
        if xy:
            cands = [d for d in nearby(key, xy)
                     if is_climb(d) and int(d["distance"]) <= 100]
            if cands:
                near = min(cands, key=lambda d: int(d["distance"]))
                if near is not best:
                    renamed_as = near["place_name"]
                best, best_score, best_q = near, 2, f"[반경] {gym['address']}"

    if best_score >= 2:
        verdict = "matched"  # 주소 일치 (이름 표기가 달라도 같은 자리)
    elif best_score == 1:
        verdict = "moved"    # 이름 일치 · 주소 불일치
    else:
        verdict = "missing"

    return {
        "verdict": verdict,
        "renamed_as": renamed_as,
        "occupant_name": occupant.get("place_name") if occupant else None,
        "occupant_category": occupant.get("category_name") if occupant else None,
        "score": best_score,
        "matched_query": best_q,
        "kakao_place_id": best.get("id") if best else None,
        "kakao_name": best.get("place_name") if best else None,
        "kakao_road_address": best.get("road_address_name") if best else None,
        "kakao_phone": best.get("phone") if best else None,
        "kakao_category": best.get("category_name") if best else None,
        "kakao_url": best.get("place_url") if best else None,
        "lat": float(best["y"]) if best and best.get("y") else None,
        "lng": float(best["x"]) if best and best.get("x") else None,
    }


def main():
    key = load_key()
    path = os.path.join(HERE, "kakao_result.json")
    requeue = "--requeue" in sys.argv  # 이전 결과에서 matched 아닌 곳만 다시 검증

    if requeue:
        out = json.load(open(path, encoding="utf-8"))
        targets = [g for g in out if g.get("verdict") != "matched"]
        print(f"재검증 대상 {len(targets)}곳")
        for i, gym in enumerate(targets, 1):
            res = verify(key, gym)
            gym.update(res)
            print(f"[{i:3}/{len(targets)}] {res['verdict']:8} {gym['name']}", flush=True)
        counts = {v: sum(1 for g in out if g["verdict"] == v)
                  for v in ("matched", "moved", "missing")}
    else:
        gyms = json.load(open(os.path.join(HERE, "gyms_source.json"), encoding="utf-8"))
        out, counts = [], {"matched": 0, "moved": 0, "missing": 0}
        for i, gym in enumerate(gyms, 1):
            res = verify(key, gym)
            counts[res["verdict"]] += 1
            out.append({**gym, **res})
            print(f"[{i:3}/{len(gyms)}] {res['verdict']:8} {gym['name']}", flush=True)

    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"\n운영 확인 {counts['matched']} · 주소불일치 {counts['moved']} · 미발견 {counts['missing']}")
    for label, key_ in (("주소 불일치", "moved"), ("카카오맵 미발견 (폐업 후보)", "missing")):
        rows = [g for g in out if g["verdict"] == key_]
        if rows:
            print(f"\n== {label} {len(rows)}곳 ==")
            for g in rows:
                print(f"  {g['gym_code']} {g['name']} — 시트: {g['address']}")
                if g["kakao_name"]:
                    print(f"      카카오: {g['kakao_name']} / {g['kakao_road_address']}")
    print(f"\n결과 저장: {path}")


if __name__ == "__main__":
    main()
