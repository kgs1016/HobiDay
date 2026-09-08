#!/usr/bin/env python3
"""카카오맵 장소 페이지의 대표사진(og:image)을 받아 암장 대표사진으로 쓴다.

  python3 scripts/kakao_place_photos.py            # 받기만 → GYMS/photos_kakao/
  python3 scripts/kakao_place_photos.py --promote  # GYMS/photos/ 와 photos_manifest.json 에 반영

왜 og:image 인가 — 장소 페이지가 공유 미리보기용으로 내놓는 값이라 일반 HTTP
요청 한 번으로 받아진다. 내부 API 를 뒤지거나 봇 탐지를 우회하지 않는다.

사진 종류는 URL 경로로 갈린다 (2026-09 확인):
  business  t1.kakaocdn.net/mystore/…      업주가 매장관리로 직접 올린 사진
  visitor   postfiles.pstatic.net/… 등      방문객 후기·블로그 사진
업주 사진은 홍보용으로 올린 것이라 쓰는 데 부담이 적다. 방문객 사진은 찍은 사람의
저작권이 남는다 — 사업주가 아니라 그 사람 것이다. 그래서 --promote 규칙이 다르다.

--promote 규칙
  business  → 기존 사진이 있어도 교체 (더 최신이고 권리가 깨끗하다)
  logo      → 업주 사진이지만 실내 사진이 아니라 로고인 것. 빈 자리만 채운다
              (실내 사진을 로고로 바꾸진 않는다). --no-logo 면 아예 안 쓴다
  visitor   → 사진이 아예 없는 암장만 채운다 (기존 블로그 사진은 그대로)
  GYMS/ 는 git 이 추적하므로 교체는 언제든 되돌릴 수 있다.

로고 판별 — 64×64 로 줄여 16단계로 양자화한 뒤, 최빈색이 40% 를 넘거나
(색이 60종 미만이면서 30% 를 넘으면) 로고로 본다. 더클라임 전 지점·트리클·
키클 같은 흰 바탕 로고가 여기 걸리고, 오프더월처럼 어두운 실내 사진은 통과한다.

썸네일은 img1.kakaocdn.net/cthumb/local/C800x800.q80 — 원본은 네이버 블로그 쪽이
핫링크를 403 으로 막고, C800x800 은 양쪽 다 800×800 정사각으로 내려준다.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GYMS_DIR = os.path.join(ROOT, "GYMS")
OUT_DIR = os.path.join(GYMS_DIR, "photos_kakao")
MANIFEST = os.path.join(GYMS_DIR, "photos_manifest.json")
KAKAO_MANIFEST = os.path.join(ROOT, "scripts", "kakao_photos_manifest.json")
LIVE = os.path.join(ROOT, "scripts", "gyms_final.json")  # 2026-09-04 검증 통과 164곳

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
OG = re.compile(r'property="og:image"\s+content="([^"]+)"')
THUMB = "https://img1.kakaocdn.net/cthumb/local/C800x800.q80/?fname="


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://place.map.kakao.com/"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                data = r.read()
                return data if binary else data.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return None
            time.sleep(1 + attempt)
        except OSError:
            time.sleep(1 + attempt)
    return None


CT = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def image_ext(data):
    """cthumb 은 원본 형식을 따라 JPEG 도, PNG 도, WebP 도 내려준다. 매직 바이트로 판별."""
    if not data:
        return None
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def classify(fname):
    if "kakaocdn.net/mystore/" in fname:
        return "business"
    # kakaomapPhoto/review = 카카오맵 후기 사진, postfiles.pstatic = 네이버 블로그 사진
    if "pstatic.net" in fname or "daumcdn" in fname or "kakaocdn" in fname or "tistory" in fname:
        return "visitor"
    return "unknown"


def fetch_all(live, prev=None):
    """prev 가 있으면 download_failed 였던 곳만 다시 받고 나머지는 그대로 둔다."""
    os.makedirs(OUT_DIR, exist_ok=True)
    results = []
    keep = {r["gym_code"]: r for r in (prev or []) if r["kind"] != "download_failed"}
    for i, g in enumerate(live, 1):
        if g["gym_code"] in keep:
            results.append(keep[g["gym_code"]])
            continue
        pid = g["kakao_place_id"]
        page_url = f"https://place.map.kakao.com/{pid}"
        html = get(page_url)
        rec = {"gym_code": g["gym_code"], "name": g["name"], "kakao_place_id": pid,
               "place_url": page_url, "kind": "none", "fname": None, "file": None, "bytes": 0}
        m = OG.search(html or "")
        if m and "fname=" in m.group(1):
            fname = urllib.parse.unquote(m.group(1).split("fname=", 1)[1])
            rec["fname"] = fname
            rec["kind"] = classify(fname)
            data = get(THUMB + urllib.parse.quote(fname, safe=""), binary=True)
            ext = image_ext(data)
            if ext:
                path = os.path.join(OUT_DIR, f"{g['gym_code']}{ext}")
                with open(path, "wb") as f:
                    f.write(data)
                rec["file"] = f"{g['gym_code']}{ext}"
                rec["bytes"] = len(data)
                rec["content_type"] = CT[ext]
            else:
                rec["kind"] = "download_failed"
        results.append(rec)
        print(f"[{i:3}/{len(live)}] {rec['kind']:16} {g['name']}", flush=True)
        time.sleep(0.3)
    json.dump(results, open(KAKAO_MANIFEST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return results


def is_logo(path):
    from PIL import Image  # 판별에만 쓴다 — 받기 단계는 PIL 없이도 돈다
    im = Image.open(path).convert("RGB").resize((64, 64))
    q = [(p[0] // 16, p[1] // 16, p[2] // 16) for p in im.getdata()]
    uniq = len(set(q))
    top = max(q.count(c) for c in set(q)) / len(q)
    return top > 0.4 or (uniq < 60 and top > 0.3)


def promote(results, live, use_logo=True):
    man = json.load(open(MANIFEST, encoding="utf-8"))
    items = {it["gym_code"]: it for it in man["items"]}
    meta = {g["gym_code"]: g for g in live}
    photos_dir = os.path.join(GYMS_DIR, "photos")
    replaced, filled, kept, logos = [], [], [], []

    for r in results:
        if not r["file"]:
            continue
        if r["kind"] == "business" and is_logo(os.path.join(OUT_DIR, r["file"])):
            r["kind"] = "logo"
            logos.append(r["gym_code"])
        it = items.get(r["gym_code"])
        if it is None:
            # 8월 매니페스트는 143곳까지만 담겼다. 없는 암장은 여기서 항목을 만든다.
            g = meta[r["gym_code"]]
            it = {"gym_code": g["gym_code"], "import_key": g.get("import_key"), "name": g["name"],
                  "photo_status": None, "photo_url": None, "source_page_url": None, "notes": None,
                  "domain": None, "url_expires": None, "status": "fail", "file": None,
                  "bytes": 0, "content_type": None}
            man["items"].append(it)
            items[r["gym_code"]] = it
        has_photo = it.get("status") == "ok" and os.path.exists(os.path.join(photos_dir, it.get("file") or "x"))
        if r["kind"] == "business":
            action = "replace" if has_photo else "fill"
        elif r["kind"] in ("visitor", "logo") and not has_photo and (use_logo or r["kind"] != "logo"):
            action = "fill"
        else:
            kept.append(r["gym_code"])
            continue

        # 확장자가 다른 옛 파일이 남아 있으면 지운다 (HBD-GYM-0009.png → .jpg)
        old = it.get("file")
        if old and old != r["file"]:
            try:
                os.remove(os.path.join(photos_dir, old))
            except FileNotFoundError:
                pass
        src = os.path.join(OUT_DIR, r["file"])
        dst = os.path.join(photos_dir, r["file"])
        with open(src, "rb") as s, open(dst, "wb") as d:
            d.write(s.read())

        it.update({
            "photo_url": THUMB + urllib.parse.quote(r["fname"], safe=""),
            "source_page_url": r["place_url"],
            "domain": "place.map.kakao.com",
            "url_expires": None,
            "status": "ok",
            "file": r["file"],
            "bytes": r["bytes"],
            "content_type": r.get("content_type", "image/jpeg"),
            "photo_kind": r["kind"],
            "notes": {"business": "카카오맵 업주 등록 사진(mystore) · 2026-09-08",
                      "logo": "카카오맵 업주 등록 이미지 — 로고 · 2026-09-08",
                      "visitor": "카카오맵 방문객 사진(후기/블로그) · 저작권은 촬영자 · 2026-09-08"}[r["kind"]],
        })
        (replaced if action == "replace" else filled).append(r["gym_code"])

    man["ok"] = sum(1 for it in man["items"] if it.get("status") == "ok")
    man["fail"] = sum(1 for it in man["items"] if it.get("status") == "fail")
    man["kakao_promoted_at"] = "2026-09-08"
    json.dump(man, open(MANIFEST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(results, open(KAKAO_MANIFEST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n교체(업주 실내사진) {len(replaced)} · 신규 채움 {len(filled)} · 유지 {len(kept)} · 로고 판정 {len(logos)}")
    return replaced, filled


def main():
    live = json.load(open(LIVE, encoding="utf-8"))
    prev = json.load(open(KAKAO_MANIFEST, encoding="utf-8")) if os.path.exists(KAKAO_MANIFEST) else None
    if "--retry-failed" in sys.argv:
        results = fetch_all(live, prev)
    elif "--promote" in sys.argv and prev:
        results = prev
    else:
        results = fetch_all(live)
    kinds = {}
    for r in results:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    print("\n종류별:", kinds)
    if "--promote" in sys.argv:
        promote(results, live, use_logo="--no-logo" not in sys.argv)


if __name__ == "__main__":
    main()
