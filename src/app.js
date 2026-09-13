import { createEngine, CELLS, distance } from './engine.js';
import { chooseBotAction } from './bot.js';
import { SAVE_KEY, MAX_SAVE_BYTES, encodeSave, decodeSave } from './saves.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let cards,factions,engine,state,raceFilter='all',selectedId=null,targetId=null,selectedLoc=0,toastTimer;
let mode='ai',botTimer=null,botPaused=false,matchEpoch=0,storageAvailable=true;
const perspective=()=>mode==='ai'?0:state.active;
const humanTurn=()=>state&&state.winner===null&&(mode==='hotseat'||state.active===0);
const types={unit:'Боевой юнит',support:'Поддержка',building:'Сооружение',tactic:'Способность',upgrade:'Исследование'};
const shortRules={
 'terran-marine':'Универсальная пехота. Атакует землю и воздух. Может использовать стимулятор.',
 'terran-marauder':'+2 урона по бронированным целям. Тяжёлая пехота прорыва.',
 'terran-siege-tank':'Осада: дальность 2, +2 урона и урон по площади. Неподвижен в осаде.',
 'terran-battlecruiser':'Воздушная крепость. Атакует землю и воздух.',
 'zerg-zergling':'Два зерглинга на одной карте. Скорость 2. Стремительная атака.',
 'zerg-hydralisk':'Атакует землю и воздух. Восстанавливает здоровье каждый цикл.',
 'zerg-mutalisk':'Воздушный. Скорость 2. Удар рикошетом по второй цели в секторе.',
 'zerg-ultralisk':'Массивный. 2 урона остальным наземным юнитам в секторе.',
 'protoss-zealot':'Воин ближнего боя. Восстанавливает щит после цикла без урона.',
 'protoss-stalker':'Атакует землю и воздух. Скачок через два сектора.',
 'protoss-immortal':'+3 урона по бронированным целям. Атакует только землю.',
 'protoss-carrier':'Воздушный. Перехватчики атакуют землю и воздух.'
};
export function cardHTML(c,interactive=true){
 const ix=cards.findIndex(x=>x.id===c.id)+1,tag=interactive?'button':'div';
 const rule=shortRules[c.id]||c.text;
 return `<${tag} class="game-card ${c.faction}" ${interactive?`data-card="${c.id}" aria-label="${esc(c.name)}: открыть карту"`:''}><img class="card-art" src="assets/art/${c.art}.webp" alt="${esc(c.name)}" loading="lazy"><div class="card-shade"></div><div class="card-top"><span>${c.faction.toUpperCase()} / ${c.type==='unit'?'UNIT':c.type.toUpperCase()}</span><span class="card-emblem"><span>${{terran:'T',zerg:'Z',protoss:'P'}[c.faction]}</span></span></div><div class="card-body"><p class="card-type">${types[c.type]}${c.flying?' · воздух':''}</p><h3 class="card-name">${esc(c.name)}</h3><div class="card-cost"><span class="mineral">◆ ${c.mineral}</span><span class="gas">⬡ ${c.gas}</span><span>◷ ${c.time}</span>${c.energy?`<span>ϟ ${c.energy}</span>`:''}</div><p class="card-rule ${rule.length>130?'long':''}">${esc(rule)}</p><div class="card-stats">${c.hp?`<span><b>${c.attack||'—'}</b>АТАКА</span><span><b>${c.hp}${c.shield?`+${c.shield}`:''}</b>HP${c.shield?' + ЩИТ':''}</span><span><b>${c.armor}</b>БРОНЯ</span><span><b>${c.supply||c.capacity||'—'}</b>${c.capacity?'ЛИМИТ':'СНАБЖ.'}</span>`:`<span><b>${c.type==='upgrade'?'II':'I'}</b>${c.type==='upgrade'?'ИССЛЕДОВАНИЕ':'ПРИКАЗ'}</span><span><b>${c.energy||'—'}</b>ЭНЕРГИЯ</span>`}</div><div class="card-serial">KOPRULU: FRONTLINE / ${String(ix).padStart(3,'0')} / ALPHA 0.1</div></div></${tag}>`;
}
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4300);}
function view(name){for(const n of ['arsenal','battle','doctrine']){$(`#${n}-view`).classList.toggle('hidden',n!==name);document.querySelectorAll(`.nav[data-view="${n}"]`).forEach(b=>b.classList.toggle('active',n===name));}if(name==='battle')renderBattle();window.scrollTo({top:0,behavior:'smooth'});}
function renderCatalog(){const type=$('#type-filter').value,search=$('#search').value.trim().toLocaleLowerCase('ru');const filtered=cards.filter(c=>(raceFilter==='all'||c.faction===raceFilter)&&(type==='all'||c.type===type)&&`${c.name} ${c.text}`.toLocaleLowerCase('ru').includes(search));$('#card-count').textContent=`${filtered.length} карт`;$('#catalog').innerHTML=filtered.length?filtered.map(c=>cardHTML(c)).join(''):'<div class="empty">Карты не найдены. Попробуйте другой фильтр.</div>';}
function openCard(id){const c=engine.byId[id];$('#card-dialog-content').innerHTML=`<div class="dialog-layout">${cardHTML(c,false)}<div class="dialog-copy"><p class="eyebrow">${factions[c.faction].name.toUpperCase()} / ${types[c.type].toUpperCase()}</p><h2>${esc(c.name)}</h2><p>${esc(c.text)}</p><p><b>Требования:</b> ${c.requires.map(id=>esc(engine.byId[id].name)).join(' → ')||'Доступна со старта'}</p><p><b>Стоимость:</b> ${c.mineral} минералов, ${c.gas} газа${c.energy?`, ${c.energy} энергии`:''}.<br><b>Время:</b> ${c.time} циклов.</p><p>${c.type==='unit'?`Дальность: ${c.range}. Цели: ${c.targets==='both'?'земля и воздух':'земля'}.<br>`:''}Параметры карточной адаптации 0.1.</p><a class="outline-link" href="assets/cards/${c.id}.svg" target="_blank">Открыть карту в SVG ↗</a></div></div>`;$('#card-dialog').showModal();}
function selected(){return state.entities.find(e=>e.id===selectedId&&e.owner===perspective());}
function resetSelection(){selectedId=state.entities.find(e=>e.owner===perspective()&&engine.card(e).headquarters)?.id||state.entities.find(e=>e.owner===perspective())?.id||null;targetId=null;selectedLoc=selected()?.loc??(perspective()===0?0:8);}
function reconcileSelection(){
 if(!selected())resetSelection();
 if(!state.entities.some(e=>e.id===targetId&&engine.visible(state,perspective(),e)))targetId=null;
}
function persist(){
 try{localStorage.setItem(SAVE_KEY,encodeSave(state,mode,$('#fog').checked));storageAvailable=true;}
 catch{storageAvailable=false;}
}
function winnerText(){return state.winner==='draw'?'Ничья':mode==='ai'?(state.winner===0?'Победа!':'Победил компьютер'):`Победа игрока ${state.winner+1}`;}
function acceptAction(action){
 const previous=perspective();state=engine.act(state,action);
 if(previous!==perspective())resetSelection();else reconcileSelection();
 persist();renderBattle();
 if(state.winner!==null)toast(winnerText());
 scheduleBot();
}
function issue(a){if(!humanTurn())return;try{acceptAction(a);}catch(error){toast(error.message);}}
function scheduleBot(){
 clearTimeout(botTimer);
 if(mode!=='ai'||state.active!==1||state.winner!==null||botPaused)return;
 const epoch=matchEpoch;
 botTimer=setTimeout(()=>{
  if(epoch!==matchEpoch||mode!=='ai'||state.active!==1||state.winner!==null)return;
  try{acceptAction(chooseBotAction(engine,state));}
  catch(error){botPaused=true;renderBattle();toast('Не удалось завершить ход компьютера: '+error.message);}
 },500);
}
function replaceMatch(next,nextMode,fog){
 clearTimeout(botTimer);matchEpoch++;botPaused=false;state=next;mode=nextMode;
 $('#opponent').value=mode;$('#race-a').value=state.players[0].faction;$('#race-b').value=state.players[1].faction;$('#fog').checked=fog;
 resetSelection();persist();renderBattle();scheduleBot();
}
function renderBattle(){
 const p=perspective(),pl=state.players[p],fog=$('#fog').checked,see=engine.visibleCells(state,p),e=selected();
 $('#battle-hud').innerHTML=`<div class="hud"><div class="hud-title">${state.winner!==null?`<span class="winner">${winnerText()}</span>`:`${mode==='ai'?'Ваша армия':`Игрок ${p+1}`} · ${factions[pl.faction].name}`}<small>Цикл ${state.round} · Осталось ${state.remaining[p]} из 3 приказов</small></div><div class="resources"><span><b class="mineral">${pl.minerals}</b>МИНЕРАЛЫ</span><span><b class="gas">${pl.gas}</b>ВЕСПЕН</span><span><b>${engine.used(state,p)}/${engine.cap(state,p)}</b>СНАБЖЕНИЕ</span><span><b>${pl.energy}/8</b>ЭНЕРГИЯ</span><span><b>${pl.workers}</b>РАБОЧИЕ</span></div><button class="primary" data-action="pass" ${!humanTurn()?'disabled':''}>Пропустить приказ →</button></div>`;
 $('#map').innerHTML=CELLS.map((name,loc)=>`<div class="cell ${selectedLoc===loc?'selected':''} ${fog&&!see.includes(loc)?'fogged':''} ${pl.creep.includes(loc)?'creep':''}" role="button" tabindex="0" data-cell="${loc}" aria-label="Сектор ${loc+1}: ${name}"><h4>${name}<span>0${loc+1}</span></h4>${state.entities.filter(x=>x.loc===loc&&(!fog||engine.visible(state,p,x))).map(x=>`<button data-entity="${x.id}" class="entity ${x.owner!==p?'enemy':''} ${selectedId===x.id?'selected':''} ${targetId===x.id?'target':''}">${x.owner===p?'▸':'◂'} ${esc(engine.card(x).name)}${!x.complete?' ◷':''}<small>♥ ${x.hp}${x.shield?` / ◈ ${x.shield}`:''} ${x.acted?'· действовал':''}${x.burrowed?' · под землёй':''}${x.sieged?' · осада':''}</small></button>`).join('')}${fog&&!see.includes(loc)?'<span class="fog-label">НЕТ ДАННЫХ</span>':''}</div>`).join('');
 const target=state.entities.find(x=>x.id===targetId);
 $('#selection').innerHTML=`<h3>${e?esc(engine.card(e).name):'Выберите свою единицу'}</h3><p>Сектор приказа: <b>${CELLS[selectedLoc]}</b>${target?` · Цель: <b>${esc(engine.card(target).name)}</b>`:''}</p>${e?`<p>${esc(engine.card(e).text)}</p><div class="action-buttons">${['unit','support'].includes(engine.card(e).type)?`<button data-action="move">Переместить</button><button data-action="attack">Атаковать цель</button><button data-action="raid">Налёт на рабочих</button>${e.cardId==='terran-siege-tank'?'<button data-action="siege">Сменить режим</button>':''}`:''}<button data-details="${e.cardId}">Подробнее о карте</button></div>`:''}`;
 $('#economy').innerHTML=`<h3>Экономика</h3><div class="economy-row"><span>На минералах / свободно</span><b>${Math.max(0,engine.freeWorkers(state,p))}</b></div><div class="economy-row"><span>На газе</span><b>${pl.gasWorkers}</b></div><div class="action-buttons"><button data-action="worker">+ Рабочий · 2 ◆</button><button data-action="gas-up">На газ +1</button><button data-action="gas-down">С газа −1</button>${pl.faction==='terran'?'<button data-action="macro">МУЛ · 2 ϟ → 4 ◆</button>':''}</div>${pl.faction==='zerg'?`<p>Личинки: ${state.entities.filter(x=>x.owner===p&&engine.card(x).headquarters&&x.complete).map(x=>x.larva).join(' / ')||'нет базы'}</p>`:''}<p>Улучшения: ${pl.upgrades.map(id=>engine.byId[id].name).join(', ')||'нет'}</p><p>${storageAvailable?'Партия автоматически сохраняется в этом браузере.':'Автосохранение недоступно. Используйте «Сохранить в файл».'}</p>`;
 $('#queues').innerHTML=`<h3>Производственные очереди</h3>${state.queues.filter(q=>q.owner===p).map(q=>`<div class="queue-item"><span>${q.cardId==='worker'?factions[pl.faction].worker:engine.byId[q.cardId].name}<br><small>${q.remaining} цикл. ${q.producerId&&!engine.powered(state,state.entities.find(x=>x.id===q.producerId))?'· НЕТ ПИТАНИЯ':''}</small></span><button data-cancel="${q.id}">Отмена</button>${pl.faction==='protoss'&&q.producerId?`<button data-chrono="${q.id}">Хроноускорение · 2 ϟ</button>`:''}</div>`).join('')||'<p>Нет активных заказов.</p>'}`;
 $('#journal').innerHTML=`<h3>Журнал операций</h3>${fog?'<p>Подробный журнал доступен при отключённом тумане войны, чтобы не раскрывать приказы противника.</p>':state.log.slice(0,12).map(x=>`<p>${esc(x)}</p>`).join('')}`;
 $('#production').innerHTML=cards.filter(c=>c.faction===pl.faction).map(c=>{const unlocked=engine.requirements(state,p,c),bought=pl.upgrades.includes(c.id);return `<div class="order-card ${!unlocked?'locked':''}"><h4>${esc(c.name)}</h4><small>◆ ${c.mineral} · ⬡ ${c.gas} · ◷ ${c.time}${c.energy?` · ϟ ${c.energy}`:''}</small><p>${esc(c.text)}</p>${!unlocked?`<small>Требуется: ${c.requires.filter(id=>!state.entities.some(e=>e.owner===p&&e.complete&&e.cardId===id)).map(id=>esc(engine.byId[id].name)).join(', ')}</small>`:''}<button data-order="${c.id}" ${!unlocked||bought||state.winner!==null?'disabled':''}>${bought?'Изучено':c.type==='building'?'Строить в секторе':c.type==='unit'||c.type==='support'?'Заказать':c.type==='upgrade'?'Исследовать':'Применить'}</button></div>`;}).join('');
 $('#match-status').innerHTML=state.winner!==null?winnerText():mode==='ai'?(state.active===0?'Ваш ход · Компьютер управляет армией Омега.':botPaused?'Ход компьютера приостановлен. <button id="retry-bot" class="text-link">Повторить ход</button>':'<span class="signal"></span> Компьютер отдаёт приказ…'):`Ход игрока ${state.active+1} · Передайте управление сопернику.`;
 document.querySelectorAll('[data-action],[data-cancel],[data-chrono]').forEach(b=>b.disabled=!humanTurn());
 if(!humanTurn())document.querySelectorAll('[data-order]').forEach(b=>b.disabled=true);
}
function order(id){const c=engine.byId[id];if(c.type==='building')return issue({type:'build',cardId:id,loc:selectedLoc});if(['unit','support'].includes(c.type))return issue({type:'train',cardId:id});if(c.type==='upgrade')return issue({type:'upgrade',cardId:id});const queue=state.queues.find(q=>q.owner===state.active&&q.producerId);issue({type:'tactic',cardId:id,unitId:selectedId,targetId,loc:selectedLoc,queueId:queue?.id});}
document.addEventListener('click',event=>{
 if(!state||!engine)return;
 if(event.target.closest('#retry-bot')){botPaused=false;scheduleBot();renderBattle();return;}
 const b=event.target.closest('[data-view],[data-card],[data-race],[data-entity],[data-cell],[data-action],[data-order],[data-cancel],[data-chrono],[data-details]');if(!b)return;
 if(b.dataset.view){event.preventDefault();view(b.dataset.view);}
 if(b.dataset.card)openCard(b.dataset.card);
 if(b.dataset.details)openCard(b.dataset.details);
 if(b.dataset.race){raceFilter=b.dataset.race;document.querySelectorAll('[data-race]').forEach(x=>x.classList.toggle('active',x===b));renderCatalog();}
 if(b.dataset.entity){const e=state.entities.find(x=>x.id===b.dataset.entity);if(!e)return;if(e.owner===perspective()){selectedId=e.id;selectedLoc=e.loc;targetId=null;}else{targetId=e.id;selectedLoc=e.loc;}renderBattle();}
 else if(b.dataset.cell){selectedLoc=Number(b.dataset.cell);renderBattle();}
 if(b.dataset.order)order(b.dataset.order);
 if(b.dataset.cancel)issue({type:'cancel',queueId:b.dataset.cancel});
 if(b.dataset.chrono)issue({type:'tactic',cardId:'protoss-chrono',queueId:b.dataset.chrono});
 if(b.dataset.action){const type=b.dataset.action;if(type==='gas-up'||type==='gas-down')issue({type:'allocate',count:state.players[state.active].gasWorkers+(type==='gas-up'?1:-1)});else issue({type,unitId:selectedId,targetId,loc:selectedLoc});}
});
document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-cell]')){event.preventDefault();event.target.click();}});
$('.close-dialog').addEventListener('click',()=>$('#card-dialog').close());
$('#card-dialog').addEventListener('click',e=>{if(e.target===$('#card-dialog'))$('#card-dialog').close();});
$('#type-filter').addEventListener('change',()=>renderCatalog());$('#search').addEventListener('input',()=>renderCatalog());$('#fog').addEventListener('change',()=>{if(state){persist();renderBattle();}});
$('#new-match').addEventListener('click',()=>{
 if(!engine)return;
 if(state.log.length>1&&!window.confirm('Начать новую партию? Текущее автосохранение будет заменено.'))return;
 replaceMatch(engine.createGame([$('#race-a').value,$('#race-b').value]),$('#opponent').value,$('#fog').checked);
 toast('Новая операция началась.');
});
$('#save-game').addEventListener('click',()=>{
 if(!state)return;
 const url=URL.createObjectURL(new Blob([encodeSave(state,mode,$('#fog').checked)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='koprulu-round-'+state.round+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('#load-game').addEventListener('click',()=>{if(engine)$('#load-file').click();});
$('#load-file').addEventListener('change',async event=>{
 const file=event.target.files[0];event.target.value='';if(!file)return;
 try{
  if(file.size>MAX_SAVE_BYTES)throw new Error('Файл партии слишком большой (максимум 2 МБ).');
  const saved=decodeSave(await file.text(),cards);
  if(state.log.length>1&&!window.confirm('Загрузить партию из файла? Текущая партия будет заменена.'))return;
  replaceMatch(saved.state,saved.mode,saved.fog);view('battle');toast('Партия загружена.');
 }catch(error){toast(error.message);}
});
$('#fullscreen').classList.toggle('hidden',!document.fullscreenEnabled);
$('#fullscreen').addEventListener('click',async()=>{
 try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
 catch{toast('Полноэкранный режим недоступен. Используйте меню браузера.');}
});
document.addEventListener('fullscreenchange',()=>{$('#fullscreen').textContent=document.fullscreenElement?'Выйти из полного экрана ⛶':'Полный экран ⛶';});
async function init(){
 const bundled=globalThis.KOPRULU_DATA;
 const results=bundled?[bundled.cards,bundled.factions]:await Promise.all(['cards','factions'].map(async name=>{const r=await fetch(`data/${name}.json`);if(!r.ok)throw new Error('Не удалось загрузить '+name);return r.json();}));
 [cards,factions]=results;engine=createEngine(cards);state=engine.createGame();
 let loadMessage='';
 try{
  const raw=localStorage.getItem(SAVE_KEY)||localStorage.getItem('koprulu-match-v1');
  if(raw){const saved=decodeSave(raw,cards);state=saved.state;mode=saved.mode;$('#fog').checked=saved.fog;}
 }catch(error){loadMessage='Автосохранение недоступно или повреждено. Начата новая партия; можно загрузить файл сохранения.';}
 $('#opponent').value=mode;$('#race-a').value=state.players[0].faction;$('#race-b').value=state.players[1].faction;
 resetSelection();persist();$('#hero-cards').innerHTML=['zerg-hydralisk','terran-marine','protoss-zealot'].map(id=>cardHTML(engine.byId[id])).join('');renderCatalog();renderBattle();
 if(bundled)view('battle');
 if(loadMessage)toast(loadMessage);
 scheduleBot();
}
init().catch(error=>{
 const notice=$('#startup-error');notice.classList.remove('hidden');notice.textContent='Не удалось запустить игру. Откройте Play.html из полностью распакованной папки проекта в современном браузере. '+error.message;
 toast(error.message);
});
