#!/usr/bin/env python3
"""Rebuild vector cards and home-print PDFs. pip install reportlab pillow matplotlib"""
import io,json,math,html
from pathlib import Path
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor,Color
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
import matplotlib

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'print';OUT.mkdir(exist_ok=True)
CARDS=json.loads((ROOT/'data/cards.json').read_text())
FACTIONS=json.loads((ROOT/'data/factions.json').read_text())
FONTS=Path(matplotlib.get_data_path())/'fonts/ttf'
pdfmetrics.registerFont(TTFont('Body',str(FONTS/'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('Bold',str(FONTS/'DejaVuSans-Bold.ttf')))
for name in ['cards','backs','previews']:(ROOT/'assets'/name).mkdir(exist_ok=True)
TYPES={'unit':'БОЕВОЙ ЮНИТ','building':'СООРУЖЕНИЕ','support':'ПОДДЕРЖКА','tactic':'СПОСОБНОСТЬ','upgrade':'ИССЛЕДОВАНИЕ'}
SHORT={
 'terran-hq':'База: +10 лимита, 8 мест на минералах. Обучает КСМ. МУЛ: 2 энергии и приказ дают 4 минерала.',
 'terran-starport':'Одна очередь крейсеров. Требования базового набора упрощены.',
 'terran-techlab':'Открывает мародёров и крейсеры. В базовом наборе требование действует глобально.',
 'terran-siege-tank':'Осада: дальность 2, +2 урона, 1 урон другим наземным юнитам сектора. Не двигается и не стреляет в свой сектор. Смена режима: активация.',
 'terran-battlecruiser':'Воздушный. Атакует землю и воздух. Ямато и прыжок входят в расширение.',
 'zerg-hq':'База: +10 лимита, 8 мест на минералах. Источник слизи. +1 личинка за цикл, если их меньше 3.',
 'zerg-den':'Открывает гидралисков. Дерево логово/улей в базовом наборе упрощено.',
 'zerg-cavern':'Открывает ультралисков. Улей в базовом наборе свёрнут в технологическое требование.',
 'zerg-burrow':'Наземный юнит закапывается или выкапывается за активацию. Под землёй не движется и не атакует. Для прямой атаки по нему нужен скан.',
 'protoss-hq':'База: +10 лимита, 8 мест на минералах. Обучает зонды. Даёт хроноускорение.',
 'protoss-zealot':'Ближний бой. Щит: +2 в начале цикла, если весь предыдущий цикл не было урона.',
 'protoss-stargate':'Одна очередь авианосцев. Маяк флотилии свёрнут в требования базового набора.',
 'protoss-storm':'Видимый сектор: 3 урона всем юнитам обеих сторон, без учёта брони. В 0.1 это общая поддержка; в полной игре нужен высший тамплиер.'
}
def lines(text,width,size,font='Body'):
 result=[];line=''
 for word in text.split():
  trial=(line+' '+word).strip()
  if pdfmetrics.stringWidth(trial,font,size)<=width:line=trial
  else:
   if line:result.append(line)
   line=word
 if line:result.append(line)
 return result

class CardDraw:
 """One design definition writes both native PDF and editable SVG."""
 def __init__(self,pdf=None):self.pdf=pdf;self.svg=[]
 def rect(self,x,y,w,h,color,alpha=1,stroke=None,r=0):
  self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{color}" fill-opacity="{alpha}"'+(f' stroke="{stroke}" stroke-width="2"' if stroke else '')+'/>')
  if self.pdf:
   c=self.pdf;c.saveState();c.setFillColor(HexColor(color));c.setFillAlpha(alpha)
   if stroke:c.setStrokeColor(HexColor(stroke));c.setLineWidth(2)
   c.roundRect(x,880-y-h,w,h,r,fill=1,stroke=int(bool(stroke)));c.restoreState()
 def text(self,text,x,y,size,color='#ffffff',bold=False,anchor='start'):
  self.svg.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="DejaVu Sans,Arial,sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" text-anchor="{anchor}">{html.escape(str(text))}</text>')
  if self.pdf:
   c=self.pdf;c.setFillColor(HexColor(color));c.setFont('Bold' if bold else 'Body',size)
   {'start':c.drawString,'middle':c.drawCentredString,'end':c.drawRightString}[anchor](x,880-y,str(text))
 def art(self,art):
  self.svg.append(f'<image href="../art/{art}.webp" x="0" y="0" width="630" height="880" preserveAspectRatio="xMidYMid slice"/>')
  if self.pdf:
   image=Image.open(ROOT/f'assets/art/{art}.webp');w,h=image.size;scale=max(630/w,880/h)
   # Conversion only; original image dimensions and appearance are preserved.
   image.thumbnail((800,1200),Image.Resampling.LANCZOS)
   buf=io.BytesIO();image.convert('RGB').save(buf,'JPEG',quality=86);buf.seek(0)
   self.pdf.drawImage(ImageReader(buf),(630-w*scale)/2,(880-h*scale)/2,width=w*scale,height=h*scale)
 def shade(self):
  self.svg.append('<defs><linearGradient id="shade" x1="0" x2="0" y1="0" y2="1"><stop offset="0.3977" stop-color="#070f1c" stop-opacity="0"/><stop offset="0.71" stop-color="#070f1c" stop-opacity="0.98"/><stop offset="1" stop-color="#070f1c" stop-opacity="0.98"/></linearGradient></defs><rect width="630" height="880" fill="url(#shade)"/>')
  if self.pdf:
   gradient=Image.new('RGBA',(2,880));gradient.putdata([(7,15,28,round(min(.98,max(0,(y-350)/275)*.98)*255)) for y in range(880) for _ in range(2)])
   self.pdf.drawImage(ImageReader(gradient),0,0,width=630,height=880,mask='auto')

def draw_card(card,pdf=None):
 d=CardDraw(pdf);r=card['faction'];accent=FACTIONS[r]['color'];d.art(card['art'])
 d.rect(0,0,630,100,'#07111e',.58)
 d.shade()
 d.rect(8,8,614,864,'#000000',0,accent,12);d.rect(18,18,594,844,'#000000',0,'#536073',7)
 d.text(r.upper()+' / FRONTLINE',39,57,19,'#f3f5f8',True)
 d.rect(542,30,50,50,'#0e182a',.9,accent,5);d.text(r[0].upper(),567,65,28,accent,True,'middle')
 if card['type']=='unit':
  tags={'armored':'БРОНИРОВАННЫЙ','light':'ЛЁГКИЙ','biological':'БИОЛОГИЧЕСКИЙ','mechanical':'МЕХАНИЧЕСКИЙ','massive':'МАССИВНЫЙ'}
  d.text(' / '.join(tags[t] for t in card['tags']),39,445,14,accent,True)
 d.text(TYPES[card['type']]+(' / ВОЗДУХ' if card.get('flying') else ''),39,478,17,accent,True)
 title=card['name'];size=42
 while pdfmetrics.stringWidth(title,'Bold',size)>550 and size>25:size-=1
 d.text(title,39,528,size,'#ffffff',True)
 d.text('M '+str(card['mineral']),40,572,23,'#8dd4ff',True);d.text('G '+str(card['gas']),165,572,23,'#afe49c',True);d.text('T '+str(card['time']),290,572,23,'#d6deea',True)
 if card.get('energy'):d.text('E '+str(card['energy']),415,572,23,accent,True)
 elif card['type']=='unit':d.text('R '+str(card['range']),415,572,23,accent,True)
 rule=SHORT.get(card['id'],card['text']);size=22;wrapped=lines(rule,550,size)
 while len(wrapped)>5:size-=1;wrapped=lines(rule,550,size)
 for i,line in enumerate(wrapped):d.text(line,40,612+i*27,size,'#dce3ed')
 d.rect(40,746,550,1,accent,.5)
 stats=([('АТАКА',card['attack'] or '-'),('HP / ЩИТ',str(card['hp'])+('/'+str(card['shield']) if card['shield'] else '')),('БРОНЯ',card['armor']),('ЛИМИТ' if card.get('capacity') else 'СНАБЖ.',card.get('capacity') or card['supply'] or '-')] if card['hp'] else [('ПРИКАЗЫ','1'),('ЭНЕРГИЯ',card.get('energy',0)),('ТАЙМЕР',card['time']),('ТИП','TECH' if card['type']=='upgrade' else 'ACT')])
 for i,(label,value) in enumerate(stats):x=99+i*144;d.text(value,x,789,29,'#ffffff',True,'middle');d.text(label,x,813,14,'#9dacbf',False,'middle')
 idx=CARDS.index(card)+1;d.text(f'KOPRULU: FRONTLINE / {idx:03d} / ALPHA 0.1',40,845,12,'#9aabc0')
 svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 630 880" width="630" height="880"><defs><clipPath id="clip"><rect width="630" height="880" rx="14"/></clipPath></defs><g clip-path="url(#clip)">'+''.join(d.svg)+'</g></svg>'
 return svg

def draw_back(r,pdf=None):
 d=CardDraw(pdf);accent=FACTIONS[r]['color'];d.art(r+'-base');d.rect(0,0,630,880,'#07111e',.74)
 d.rect(15,15,600,850,'#000000',0,accent,10);d.rect(30,30,570,820,'#000000',0,'#68758b',6)
 for y in [200,650]:d.rect(90,y,450,1,accent,.7)
 d.text('KOPRULU',315,350,61,'#ffffff',True,'middle');d.text('F R O N T L I N E',315,398,24,accent,True,'middle')
 d.rect(263,465,104,104,'#0e1621',.75,accent,12);d.text(r[0].upper(),315,540,66,accent,True,'middle')
 d.text(FACTIONS[r]['name'].upper(),315,704,25,accent,True,'middle');d.text('FAN CARD STRATEGY / 0.1',315,748,15,'#aebacd',False,'middle')
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 630 880" width="630" height="880">'+''.join(d.svg)+'</svg>'

def header(c,title,subtitle,page):
 w,h=A4;c.setFillColor(HexColor('#111b29'));c.setFont('Bold',14);c.drawString(12*mm,h-14*mm,title);c.setFont('Body',7);c.setFillColor(HexColor('#52647a'));c.drawString(12*mm,h-20*mm,subtitle);c.drawRightString(w-12*mm,8*mm,str(page))
def textblock(c,text,x,y,width,size=10,leading=15,color='#273950'):
 c.setFillColor(HexColor(color));c.setFont('Body',size)
 for line in lines(text,width,size):c.drawString(x,y,line);y-=leading
 return y
def clipped_card(c,card,x,y,width=63*mm,height=88*mm,back=None):
 c.saveState();c.translate(x,y);c.scale(width/630,height/880);p=c.beginPath();p.roundRect(0,0,630,880,14);c.clipPath(p,stroke=0);draw_back(back,c) if back else draw_card(card,c);c.restoreState()

def main():
 for card in CARDS:(ROOT/f'assets/cards/{card["id"]}.svg').write_text(draw_card(card),encoding='utf8')
 for r in FACTIONS:(ROOT/f'assets/backs/{r}.svg').write_text(draw_back(r),encoding='utf8')
 c=canvas.Canvas(str(OUT/'cards.pdf'),pagesize=A4,pageCompression=1);c.setTitle('KOPRULU: FRONTLINE - 48 карт');page=0
 # 3 x 3 cards, with 2 mm gaps, exactly 63 x 88 mm.
 for r in FACTIONS:
  faction_cards=[x for x in CARDS if x['faction']==r]
  for start in [0,9]:
   page+=1
   for i,card in enumerate(faction_cards[start:start+9]):clipped_card(c,card,(8.5+(i%3)*65)*mm,(15+(2-i//3)*90)*mm)
   c.setFont('Body',5.6);c.setFillColor(HexColor('#516077'));c.drawString(8.5*mm,8*mm,f'{FACTIONS[r]["name"]} / {page:02d}  |  63 x 88 mm  |  100%  |  M: минералы  G: газ  T: циклы  E: энергия  R: дальность')
   c.showPage()
 c.save()
 c=canvas.Canvas(str(OUT/'board-and-tokens.pdf'),pagesize=A4,pageCompression=1);c.setTitle('KOPRULU: FRONTLINE - поле, жетоны и памятка')
 header(c,'ОПЕРАЦИЯ «РАЗЛОМ»','Поле 3 x 3. Переходы только по стороне. Базы начинают в секторах 1 и 9.',1)
 names=['База Альфа','Натурал Альфа','Северное плато','Западный проход','Башня зел-нага','Восточный проход','Южное плато','Натурал Омега','База Омега']
 for n,name in enumerate(names):
  x=(12+n%3*62)*mm;y=(65+(2-n//3)*62)*mm;c.setFillColor(HexColor('#142239' if n not in [2,6] else '#243546'));c.setStrokeColor(HexColor('#6c819b'));c.roundRect(x,y,60*mm,60*mm,4*mm,fill=1)
  c.setFillColor(HexColor('#e5c792'));c.setFont('Bold',24);c.drawString(x+5*mm,y+43*mm,f'{n+1:02}');c.setFont('Bold',8);c.setFillColor(HexColor('#ffffff'));c.drawString(x+5*mm,y+35*mm,name)
  c.setFont('Body',6);desc='Высота: -1 к атаке снизу' if n in [2,6] else 'Контроль: обзор всего поля' if n==4 else 'Старт игрока '+str(1 if n==0 else 2) if n in [0,8] else 'Маршрут / возможная экспансия';c.drawString(x+5*mm,y+29*mm,desc)
 textblock(c,'Кладите номерные жетоны единиц в сектора. Карты типов держите рядом с полем. Записывайте здоровье и состояние каждой единицы по её номеру.',12*mm,52*mm,180*mm,9,14)
 textblock(c,'Победа: уничтожить все здания противника, включая строящиеся. Максимум снабжения 80. Приказы и активации обновляются после завершения цикла.',12*mm,34*mm,180*mm,9,14);c.showPage()
 header(c,'ЖЕТОНЫ И СОСТОЯНИЯ','Вырежьте по контуру. При необходимости распечатайте дополнительные листы.',2)
 tokens=[(f'A{i:02}','#537ea8') for i in range(1,25)]+[(f'B{i:02}','#985779') for i in range(1,25)]+[(x,'#6c7c68') for x in ['M1','M5','M10','G1','G5','G10','E1','E2','T1','T2','T3','СЛИЗЬ','ОСАДА','СКРЫТ','СКАН','ГОТОВ','ПРИКАЗ','ПРИКАЗ','ПРИКАЗ','УРОН','ЩИТ','ЛИЧ.','ЛИЧ.','ЛИЧ.']]
 for n,(label,color) in enumerate(tokens):
  x=(14+n%8*23)*mm;y=(239-n//8*23)*mm;c.setFillColor(HexColor(color));c.setStrokeColor(HexColor('#293646'));c.circle(x+10*mm,y+10*mm,10*mm,fill=1);c.setFillColor(HexColor('#ffffff'));c.setFont('Bold',7 if len(label)>4 else 11);c.drawCentredString(x+10*mm,y+8.5*mm,label)
 textblock(c,'A/B обозначают владельца, число - конкретную единицу. Для сверхлимитного количества экземпляров используйте собственные номера. Отмечайте активацию поворотом жетона.',12*mm,35*mm,180*mm,9,14);c.showPage()
 # Three copies of each faction back; use opaque sleeves rather than automatic duplex.
 for i,r in enumerate(['terran','zerg','protoss']*3):clipped_card(c,None,(8.5+(i%3)*65)*mm,(15+(2-i//3)*90)*mm,back=r)
 c.setFont('Body',6);c.setFillColor(HexColor('#516077'));c.drawString(8.5*mm,8*mm,'Рубашки / 3  |  Односторонняя печать, 100%. Вложите вместе с лицом в протектор.');c.showPage()
 header(c,'РЕЕСТР КОМАНДИРА','Игрок: ________  Раса: __________  Цикл: _____  M: _____  G: _____  E: _____',4)
 columns=[12,29,65,81,98,117,142,198]
 labels=['ID','Карта','Сектор','HP','Щит','Активация','Состояние']
 y=260*mm;c.setFillColor(HexColor('#16283e'));c.rect(12*mm,y-8*mm,186*mm,9*mm,fill=1,stroke=0);c.setFillColor(HexColor('#ffffff'));c.setFont('Bold',7)
 for x,label in zip(columns,labels):c.drawString((x+2)*mm,y-5*mm,label)
 c.setStrokeColor(HexColor('#b7c1ce'));c.setLineWidth(.4)
 for row in range(21):yy=y-(8+row*9)*mm;c.line(12*mm,yy,198*mm,yy)
 for x in columns:c.line(x*mm,y-8*mm,x*mm,y-188*mm)
 textblock(c,'Рабочие: всего ____ / газ ____ / заняты ____ . Лимит: занято ____ / доступно ____ . Очереди: ID / производитель / осталось / цена / резерв лимита.',12*mm,55*mm,182*mm,9,15)
 textblock(c,'Для очередей и крупных армий копируйте лист. Одна карта типа может представлять любое число отдельных экземпляров в реестре.',12*mm,35*mm,182*mm,9,15);c.showPage()
 header(c,'ПЕРВАЯ ОПЕРАЦИЯ','Памятка базового режима. Полные правила: docs/RULES.md',5)
 sections=[('01 / ПОДГОТОВКА','Каждому: база в секторе 1 или 9, 6 рабочих, 8 минералов, 0 газа и 2 энергии. Инкубатор: 3 личинки и слизь в своём секторе. Карты не перемешивать.'),('02 / ПРИКАЗЫ','По очереди потратьте по три приказа: стройте, заказывайте юнитов, назначайте рабочих, двигайтесь, атакуйте или применяйте способность. Пропуск тоже расходует приказ.'),('03 / ПЕРЕХОД ЦИКЛА','Доход с учётом занятых рабочих. Затем -1 к таймерам. Завершение заказов. Восстановление HP/щитов, личинки и инъекции. Обновите активации. Инициатива меняет сторону.'),('04 / ЭКОНОМИКА','Один рабочий даёт 1 ресурс. Максимум на базу: 8 минералов и 3 газа за цикл. Газу нужно добывающее здание и назначенные рабочие. Лимит резервируется при заказе.'),('05 / БОЙ','Один юнит: одна активация в цикл. Земля не атакует воздух без соответствующего оружия. Дальность 0 - свой сектор, 1 - соседний. Сначала щит, затем HP с бронёй; минимум 1, если выстрел дошёл до HP.'),('06 / ПОБЕДА','Уничтожьте все здания противника, включая незавершённые. Надзиратель не считается зданием. Для первой бумажной партии держите всё поле открытым.')]
 y=253*mm
 for title,body in sections:c.setFillColor(HexColor('#1e354f'));c.setFont('Bold',11);c.drawString(12*mm,y,title);y=textblock(c,body,12*mm,y-18,180*mm,9.5,15)-23
 c.save()
 # Vector resource icons, native assets instead of generated numeric graphics.
 for name,path,color in [('mineral','M32 3 53 20 44 56 17 53 9 23Z','#8ad3ff'),('gas','M32 5 55 18V46L32 59 9 46V18Z','#a5df91'),('energy','M36 3 13 36H29L24 61 52 25H35Z','#edce87'),('shield','M10 9 32 3 54 9V31Q52 50 32 61Q12 50 10 31Z','#7fbdea')]:
  (ROOT/f'assets/icons/{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="{path}" fill="{color}" stroke="#0b1420" stroke-width="2"/></svg>')
 print('Generated 48 SVG cards, 3 SVG backs, icons and 2 PDFs.')

if __name__=='__main__':main()
