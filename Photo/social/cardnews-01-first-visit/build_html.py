#!/usr/bin/env python3
"""canvas/*.dc.html 8장을 html.to.design 용 단독 HTML(cardnews.html) 로 합친다. 이미지는 base64 내장."""
import base64, re, os
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
def b64(p): return base64.b64encode(open(p,'rb').read()).decode()
imgs={}
for n in ['01','02','03','04','05','06','07','08']:
    im=Image.open(f'img/{n}.jpg').convert('RGB'); W,H=1080,810; r=max(W/im.width,H/im.height)
    im=im.resize((round(im.width*r),round(im.height*r))); x=(im.width-W)//2; y=(im.height-H)//2
    tmp=f'/tmp/claude-501/c{n}.jpg'; im.crop((x,y,x+W,y+H)).save(tmp,quality=82,optimize=True)
    imgs[f'{n}.jpg']='data:image/jpeg;base64,'+b64(tmp)
imgs['icon.png']='data:image/png;base64,'+b64('canvas/icon.png')
names=['Main','Card02','Card03','Card04','Card05','Card06','Card07','Card08']
bodies=[]
for i,n in enumerate(names,1):
    s=open(f'canvas/{n}.dc.html',encoding='utf-8').read()
    body=re.search(r'</helmet>\s*(.*?)\s*</x-dc>', s, re.S).group(1)
    for k,v in imgs.items(): body=body.replace(f'src="{k}"', f'src="{v}"')
    bodies.append(f'<section id="card-{i:02d}" style="width: 1080px; height: 1350px; flex: none;">{body}</section>')
html='''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>하비데이 카드뉴스 01 — 첫 방문 체크리스트</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;700;900&display=swap">
<style>
  body { margin: 0; background: #e9ecef; font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #191f28; }
  main { display: flex; flex-direction: column; gap: 40px; padding: 40px; width: 1080px; }
</style>
</head>
<body>
<main>
'''+'\n'.join(bodies)+'''
</main>
</body>
</html>
'''
open('cardnews.html','w',encoding='utf-8').write(html)
print('cardnews.html', os.path.getsize('cardnews.html')//1024,'KB')
