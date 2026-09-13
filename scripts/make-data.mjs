import fs from 'node:fs';
const all=[];
const factions = {
 terran:{name:'Терраны',subtitle:'Сталь. Дисциплина. Огневая мощь.',color:'#70c7ff',art:'terran-base',macro:'МУЛ',worker:'КСМ'},
 zerg:{name:'Зерги',subtitle:'Адаптация. Численность. Рой.',color:'#d69bff',art:'zerg-base',macro:'Инъекция личинок',worker:'Рабочий'},
 protoss:{name:'Протоссы',subtitle:'Псионика. Технологии. Наследие.',color:'#f0ce80',art:'protoss-base',macro:'Хроноускорение',worker:'Зонд'}
};
function add(r,id,name,type,m,g,t,requires,text,extra={}){
 all.push({id:r+'-'+id,faction:r,name,type,mineral:m,gas:g,time:t,requires:requires.map(x=>r+'-'+x),text,art:extra.art||factions[r].art,hp:0,shield:0,armor:0,attack:0,range:0,supply:0,targets:'ground',tags:[],...extra});
}
const b=(r,id,n,m,g,t,req,txt,x={})=>add(r,id,n,'building',m,g,t,req,txt,{hp:12,armor:1,tags:['armored','mechanical'],...x});
const u=(r,id,n,m,g,t,req,txt,x={})=>add(r,id,n,'unit',m,g,t,req,txt,x);
const a=(r,id,n,m,g,e,req,txt,x={})=>add(r,id,n,'tactic',m,g,0,req,txt,{energy:e,...x});
const up=(r,id,n,m,g,req,txt)=>add(r,id,n,'upgrade',m,g,2,req,txt);
b('terran','hq','Командный центр',16,0,3,[],'База: +10 лимита и 8 мест добычи минералов. Обучает КСМ. В прототипе также даёт способность МУЛ.',{hp:36,capacity:10,headquarters:true});
b('terran','supply','Хранилище',4,0,1,['hq'],'После завершения: +8 лимита снабжения.',{hp:10,capacity:8});
b('terran','gas','Перерабатывающий завод',3,0,1,['hq'],'Открывает 3 рабочих места на газе; назначьте рабочих кнопкой «На газ».',{hp:10,refinery:true});
b('terran','barracks','Казармы',6,0,1,['hq'],'Одна производственная очередь: морпехи и мародёры.',{production:true});
b('terran','factory','Завод',6,4,2,['barracks'],'Одна очередь осадных танков. КСМ занят до завершения здания.',{production:true});
b('terran','starport','Космопорт',6,4,2,['factory'],'Одна очередь крейсеров. В базовом наборе технический модуль заменяет ядро синтеза.',{production:true});
b('terran','techlab','Технический модуль',2,1,1,['barracks'],'Открывает мародёров и крейсеры. В прототипе требование глобальное; прикрепление к зданию — модуль полной игры.',{hp:8});
u('terran','marine','Морпех',2,0,1,['barracks'],'Наземные и воздушные цели. Стимулятор: 1 урон себе, повторная активация один раз за цикл.',{art:'marine',hp:4,attack:2,range:1,supply:1,targets:'both',tags:['light','biological'],producer:'terran-barracks'});
u('terran','marauder','Мародёр',4,1,1,['barracks','techlab'],'+2 урона по бронированным целям. Не атакует воздух.',{art:'marauder',hp:8,armor:1,attack:3,range:1,supply:2,bonus:2,bonusTag:'armored',tags:['armored','biological'],producer:'terran-barracks'});
u('terran','siege-tank','Осадный танк',6,5,2,['factory'],'Особый приказ: осадный режим. В осаде: дальность 2, +2 урона, 1 урон остальным наземным юнитам сектора; движение запрещено.',{art:'siege-tank',hp:10,armor:1,attack:4,range:1,supply:3,tags:['armored','mechanical'],producer:'terran-factory'});
u('terran','battlecruiser','Боевой крейсер',16,12,3,['starport','techlab'],'Воздушный. Атакует землю и воздух. Ямато и тактический прыжок входят в расширение.',{art:'battlecruiser',hp:22,armor:2,attack:6,range:1,supply:6,targets:'both',flying:true,tags:['armored','mechanical','massive'],producer:'terran-starport'});
a('terran','stim','Стимулятор',0,0,0,['barracks'],'Выбранный морпех или мародёр получает 1 урон и новую активацию. Не чаще раза за цикл на юнита.',{art:'marine'});
a('terran','scan','Сканирование',0,0,2,['hq'],'Выбранный сектор и его соседи видимы до конца цикла. Обнаруживает закопанных юнитов.');
a('terran','repair','Полевой ремонт',2,0,0,['hq'],'Восстановите 4 здоровья своей механической единице или зданию. Нужен свободный КСМ.',{art:'siege-tank'});
up('terran','weapons','Оружие +1',4,4,['techlab'],'Постоянно: +1 урона всем вашим боевым юнитам. Один уровень в базовом наборе.');
up('terran','armor','Броня +1',4,4,['techlab'],'Постоянно: +1 брони всем вашим боевым юнитам. Не зданиям.');
b('zerg','hq','Инкубатор',12,0,3,[],'База: +10 лимита, 8 мест добычи. Источник слизи. Создаёт 1 личинку за цикл до естественного лимита 3.',{hp:34,capacity:10,headquarters:true,tags:['armored','biological']});
add('zerg','supply','Надзиратель','support',4,0,1,['hq'],'Воздушный разведчик. +8 лимита. Обучается из личинки. Детекции нет.',{hp:8,capacity:8,flying:true,tags:['armored','biological'],producer:'zerg-hq'});
b('zerg','gas','Экстрактор',1,0,1,['hq'],'3 рабочих места на газе. Рабочий превращается в здание.',{hp:10,refinery:true,tags:['armored','biological']});
b('zerg','pool','Омут рождения',8,0,1,['hq'],'Открывает зерглингов. Здания зергов требуют слизь; рабочий расходуется.',{tags:['armored','biological']});
b('zerg','den','Логово гидралисков',4,4,2,['pool'],'Открывает гидралисков. Логово/улей как отдельные стадии появятся в расширении.',{tags:['armored','biological']});
b('zerg','spire','Шпиль',8,8,2,['den'],'Открывает муталисков.',{tags:['armored','biological']});
b('zerg','cavern','Пещера ультралисков',6,8,2,['spire'],'Открывает ультралисков. Улей в базовом дереве свёрнут в это требование.',{tags:['armored','biological']});
u('zerg','zergling','Пара зерглингов',2,0,1,['pool'],'Карта представляет двух зерглингов. Скорость 2 сектора. Один общий запас здоровья.',{art:'zergling',hp:4,attack:3,range:0,supply:1,speed:2,tags:['light','biological'],producer:'zerg-hq'});
u('zerg','hydralisk','Гидралиск',4,2,1,['den'],'Атакует землю и воздух. Восстанавливает 1 здоровье в начале цикла.',{art:'hydralisk',hp:7,attack:4,range:1,supply:2,targets:'both',tags:['light','biological'],producer:'zerg-hq'});
u('zerg','mutalisk','Муталиск',4,4,2,['spire'],'Воздушный, скорость 2. После попадания: 1 урон другому врагу в том же секторе.',{art:'mutalisk',hp:8,attack:3,range:1,supply:2,targets:'both',flying:true,speed:2,bounce:1,tags:['light','biological'],producer:'zerg-hq'});
u('zerg','ultralisk','Ультралиск',11,8,3,['cavern'],'Массивный. После атаки: 2 урона остальным наземным юнитам в секторе, включая своих.',{art:'ultralisk',hp:24,armor:3,attack:7,range:0,supply:6,splash:2,tags:['armored','biological','massive'],producer:'zerg-hq'});
a('zerg','inject','Инъекция личинок',0,0,2,['hq'],'Выбранный инкубатор получит 3 личинки в начале следующего цикла. Не складывается на одной базе.');
a('zerg','creep','Опухоль слизи',0,0,0,['hq'],'Покройте слизью видимый сектор рядом со своей слизью, если там нет врага.');
a('zerg','burrow','Закапывание',0,0,0,['pool'],'Наземный юнит закапывается или выкапывается. Под землёй он не двигается и не атакует; нужен детектор для прямой атаки.',{art:'zergling'});
up('zerg','weapons','Атакующие мутации',4,4,['den'],'Постоянно: +1 урона всем вашим боевым юнитам. Объединённая ветка базового набора.');
up('zerg','armor','Панцирь +1',4,4,['den'],'Постоянно: +1 брони всем вашим боевым юнитам. Не зданиям.');
b('protoss','hq','Нексус',16,0,3,[],'База: +10 лимита и 8 мест добычи минералов. Обучает зонды. Источник хроноускорения.',{hp:20,shield:16,capacity:10,headquarters:true});
b('protoss','supply','Пилон',4,0,1,['hq'],'+8 лимита. Питает свой и соседние секторы. Без питания очереди большинства зданий остановлены.',{hp:6,shield:6,capacity:8});
b('protoss','gas','Ассимилятор',3,0,1,['hq'],'3 рабочих места на газе. Питание не требуется.',{hp:7,shield:5,refinery:true});
b('protoss','gateway','Врата',6,0,1,['hq'],'Одна очередь зилотов и сталкеров. Требует питания пилона.',{hp:8,shield:8,production:true});
b('protoss','core','Кибернетическое ядро',6,0,1,['gateway'],'Открывает сталкеров, робототехнику, флот и улучшения.',{hp:8,shield:8});
b('protoss','robotics','Завод робототехники',6,4,2,['core'],'Одна очередь бессмертных. Зонд свободен сразу после запуска строительства.',{hp:8,shield:8,production:true});
b('protoss','stargate','Звёздные врата',6,6,2,['core'],'Одна очередь авианосцев. Маяк флотилии свёрнут в это требование базового набора.',{hp:8,shield:8,production:true});
u('protoss','zealot','Зилот',4,0,1,['gateway'],'Ближний бой. Щит восстанавливается на 2 в начале цикла, если в прошлом цикле не было урона.',{art:'zealot',hp:8,shield:4,armor:1,attack:4,range:0,supply:2,tags:['light','biological'],producer:'protoss-gateway'});
u('protoss','stalker','Сталкер',5,2,1,['gateway','core'],'Наземные и воздушные цели. Скачок позволяет переместиться на 2 сектора.',{art:'stalker',hp:7,shield:7,armor:1,attack:3,range:1,supply:2,targets:'both',tags:['armored','mechanical'],producer:'protoss-gateway'});
u('protoss','immortal','Бессмертный',11,4,2,['robotics'],'+3 урона по бронированным целям. Не атакует воздух. Барьер — модуль полной версии.',{art:'immortal',hp:12,shield:8,armor:1,attack:4,range:1,supply:4,bonus:3,bonusTag:'armored',tags:['armored','mechanical'],producer:'protoss-robotics'});
u('protoss','carrier','Авианосец',14,10,3,['stargate'],'Воздушный. Перехватчики включены в показатель атаки базового набора.',{art:'carrier',hp:18,shield:14,armor:2,attack:6,range:1,supply:6,targets:'both',flying:true,tags:['armored','mechanical','massive'],producer:'protoss-stargate'});
a('protoss','chrono','Хроноускорение',0,0,2,['hq'],'Уменьшите на 1 таймер выбранной активной очереди. Нельзя ускорить обесточенное производство.');
a('protoss','blink','Скачок',0,0,0,['core'],'Выбранный сталкер перемещается на 1–2 сектора в видимую точку. Расходует его активацию.',{art:'stalker'});
a('protoss','storm','Псионный шторм',0,2,3,['core'],'Видимый сектор: 3 урона всем юнитам обеих сторон, игнорируя броню. В прототипе это общая поддержка; в полной игре нужен высший тамплиер.',{art:'zealot'});
up('protoss','weapons','Вооружение +1',4,4,['core'],'Постоянно: +1 урона всем вашим боевым юнитам. Объединённая ветка базового набора.');
up('protoss','armor','Броня +1',4,4,['core'],'Постоянно: +1 брони всем вашим боевым юнитам. Щиты остаются отдельным запасом.');
fs.writeFileSync(new URL('../data/cards.json',import.meta.url),JSON.stringify(all,null,2)+'\n');
fs.writeFileSync(new URL('../data/factions.json',import.meta.url),JSON.stringify(factions,null,2)+'\n');
console.log(`${all.length} cards generated`);
