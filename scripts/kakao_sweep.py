#!/usr/bin/env python3
"""서울·경기 전 구/시군을 '클라이밍' 키워드로 훑어 카카오맵에 등록된 클라이밍장 전체를 모은다.
출력: scripts/kakao_sweep.json  (id 기준 중복 제거)
"""
import json, os, re, sys, time, urllib.parse, urllib.request
KEY = next(l.split('=',1)[1].strip() for l in open('.env.gyms.local') if l.startswith('KAKAO_REST_API_KEY='))
SEOUL = "강남구 강동구 강북구 강서구 관악구 광진구 구로구 금천구 노원구 도봉구 동대문구 동작구 마포구 서대문구 서초구 성동구 성북구 송파구 양천구 영등포구 용산구 은평구 종로구 중구 중랑구".split()
GG = "수원시 성남시 고양시 용인시 부천시 안산시 안양시 남양주시 화성시 평택시 의정부시 시흥시 파주시 김포시 광명시 광주시 군포시 하남시 오산시 이천시 양주시 구리시 안성시 포천시 의왕시 여주시 양평군 동두천시 과천시 가평군 연천군".split()
CLIMB = re.compile(r"클라이밍|암벽|볼더|클라임|climb|boulder", re.I)

def q(params):
    url = "https://dapi.kakao.com/v2/local/search/keyword.json?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {KEY}"})
    for a in range(3):
        try:
            with urllib.request.urlopen(req, timeout=10) as r: return json.load(r)
        except Exception as e:
            time.sleep(1+a)
    return {}

found = {}
for region, areas in (("서울", SEOUL), ("경기", GG)):
    for area in areas:
        for kw in ("클라이밍", "볼더링", "암벽"):
            for page in range(1, 4):
                d = q({"query": f"{region} {area} {kw}", "size": 15, "page": page})
                docs = d.get("documents", [])
                for x in docs:
                    addr = x.get("road_address_name") or x.get("address_name") or ""
                    if not addr.startswith(region): continue
                    if not CLIMB.search(x.get("category_name","") + " " + x["place_name"]): continue
                    found[x["id"]] = {"id": x["id"], "name": x["place_name"], "region": region, "area": area,
                                      "address": addr, "category": x.get("category_name"), "phone": x.get("phone"),
                                      "lat": float(x["y"]), "lng": float(x["x"]), "url": x.get("place_url")}
                if d.get("meta", {}).get("is_end", True): break
                time.sleep(0.03)
        print(f"{region} {area}: 누적 {len(found)}", file=sys.stderr)
json.dump(list(found.values()), open("scripts/kakao_sweep.json","w"), ensure_ascii=False, indent=1)
print("총", len(found))
