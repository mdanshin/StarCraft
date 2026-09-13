// Deterministic local rules engine. Costs/statistics belong to the card adaptation.
export const CELLS = ['База Альфа','Натурал Альфа','Северное плато','Западный проход','Башня зел-нага','Восточный проход','Южное плато','Натурал Омега','База Омега'];
export const distance=(a,b)=>Math.abs(a%3-b%3)+Math.abs(Math.floor(a/3)-Math.floor(b/3));
export const neighbors=n=>Array.from({length:9},(_,i)=>i).filter(i=>distance(i,n)===1);
export class RuleError extends Error {}
const need=(ok,message)=>{if(!ok)throw new RuleError(message);};
export function createEngine(cards){
 const byId=Object.fromEntries(cards.map(c=>[c.id,c]));
 const card=e=>byId[e.cardId];
 const friendly=(s,p)=>s.entities.filter(e=>e.owner===p);
 const bases=(s,p)=>friendly(s,p).filter(e=>e.complete&&card(e).headquarters);
 const exists=(s,p,id)=>friendly(s,p).some(e=>e.complete&&e.cardId===id);
 const entity=(s,id)=>s.entities.find(e=>e.id===id);
 const own=(s,id)=>{const e=entity(s,id);need(e&&e.owner===s.active,'Выберите свою единицу.');return e;};
 function makeEntity(s,owner,cardId,loc,complete=true){
  const c=byId[cardId];const e={id:'e'+s.nextId++,owner,cardId,loc,hp:c.hp,shield:c.shield,complete,acted:false,damagedRound:-2,burrowed:false,sieged:false,larva:c.headquarters?3:0,mineralLeft:c.headquarters?80:0,gasLeft:c.headquarters?60:0};s.entities.push(e);return e;
 }
 const note=(s,t)=>{s.log.unshift(`Цикл ${s.round} · ${t}`);s.log=s.log.slice(0,100);};
 function createGame(races=['terran','zerg']){
  need(races.length===2&&races.every(r=>['terran','zerg','protoss'].includes(r)),'Неизвестная раса.');
  const s={version:1,round:1,active:0,initiative:0,remaining:[3,3],nextId:1,winner:null,entities:[],queues:[],scans:[[],[]],log:[],players:races.map((faction,p)=>({faction,minerals:8,gas:0,workers:6,gasWorkers:0,energy:2,upgrades:[],creep:faction==='zerg'?[p===0?0:8]:[]}))};
  races.forEach((r,p)=>makeEntity(s,p,r+'-hq',p===0?0:8));note(s,'Начало операции. Уничтожьте все здания противника.');return s;
 }
 const powered=(s,e)=>s.players[e.owner].faction!=='protoss'||['protoss-hq','protoss-supply','protoss-gas'].includes(e.cardId)||friendly(s,e.owner).some(p=>p.complete&&p.cardId==='protoss-supply'&&distance(p.loc,e.loc)<=1);
 const cap=(s,p)=>Math.min(80,friendly(s,p).filter(e=>e.complete).reduce((n,e)=>n+(card(e).capacity||0),0));
 const used=(s,p)=>s.players[p].workers+friendly(s,p).reduce((n,e)=>n+(card(e).supply||0),0)+s.queues.filter(q=>q.owner===p&&['unit','worker'].includes(q.kind)).reduce((n,q)=>n+(q.kind==='worker'?1:byId[q.cardId].supply),0);
 const busy=(s,p)=>s.queues.filter(q=>q.owner===p&&q.workerBusy).length;
 const freeWorkers=(s,p)=>s.players[p].workers-s.players[p].gasWorkers-busy(s,p);
 const requirements=(s,p,c)=>c.requires.every(id=>exists(s,p,id));
 function visibleCells(s,p){
  const cells=new Set(s.scans[p]);
  for(const e of friendly(s,p)){if(e.burrowed)continue;cells.add(e.loc);for(const n of neighbors(e.loc))cells.add(n);if(e.loc===4&&['unit','support'].includes(card(e).type))for(let n=0;n<9;n++)if(distance(n,4)<=2)cells.add(n);}
  return [...cells];
 }
 const visible=(s,p,e)=>e.owner===p||(visibleCells(s,p).includes(e.loc)&&(!e.burrowed||s.scans[p].includes(e.loc)));
 function pay(s,c){const p=s.players[s.active];need(p.minerals>=c.mineral&&p.gas>=c.gas,'Недостаточно минералов или газа.');need(p.energy>=(c.energy||0),'Недостаточно энергии.');p.minerals-=c.mineral;p.gas-=c.gas;p.energy-=c.energy||0;}
 const checkCard=(s,id,type)=>{const c=byId[id];need(c&&c.faction===s.players[s.active].faction,'Карта другой расы.');need(!type||type.includes(c.type),'Неподходящий тип карты.');need(requirements(s,s.active,c),'Сначала завершите необходимые здания.');return c;};
 const location=loc=>need(Number.isInteger(loc)&&loc>=0&&loc<9,'Выберите сектор карты.');
 const enemyAt=(s,p,loc)=>s.entities.some(e=>e.owner!==p&&e.loc===loc&&!e.burrowed);
 function queue(s,c,kind,loc,producerId=null,entityId=null,workerBusy=false){const q={id:'q'+s.nextId++,owner:s.active,cardId:c.id,kind,loc,producerId,entityId,workerBusy,remaining:c.time,mineral:c.mineral,gas:c.gas};s.queues.push(q);return q;}
 function canPath(s,e,to,steps){
  let frontier=[e.loc],seen=new Set(frontier);
  for(let n=0;n<steps;n++){const next=[];for(const loc of frontier)for(const dest of neighbors(loc)){if(dest===to)return true;if(seen.has(dest))continue;seen.add(dest);if(card(e).flying||!enemyAt(s,e.owner,dest))next.push(dest);}frontier=next;}return false;
 }
 function damage(s,e,raw,ignoreArmor=false){
  if(raw<=0)return;const c=card(e),p=s.players[e.owner];
  const shield=Math.min(e.shield,raw);e.shield-=shield;raw-=shield;
  if(raw>0)e.hp-=ignoreArmor?raw:Math.max(1,raw-c.armor-(c.type==='unit'&&p.upgrades.includes(p.faction+'-armor')?1:0));
  e.damagedRound=s.round;
 }
 function cleanup(s){
  const dead=s.entities.filter(e=>e.hp<=0);for(const e of dead)note(s,`${card(e).name} уничтожен.`);
  s.entities=s.entities.filter(e=>e.hp>0);
  s.queues=s.queues.filter(q=>(!q.entityId||entity(s,q.entityId))&&(!q.producerId||entity(s,q.producerId)));
  const alive=[0,1].map(p=>friendly(s,p).some(e=>card(e).type==='building'));
  if(!alive[0]&&!alive[1])s.winner='draw';else if(!alive[0])s.winner=1;else if(!alive[1])s.winner=0;
  for(let p=0;p<2;p++){const player=s.players[p];player.gasWorkers=Math.min(player.gasWorkers,player.workers);}
 }
 function finishQueue(s,q){
  const c=q.cardId==='worker'?null:byId[q.cardId];
  if(q.kind==='building'){const e=entity(s,q.entityId);if(e){e.complete=true;if(c.headquarters&&s.players[q.owner].faction==='zerg'&&!s.players[q.owner].creep.includes(e.loc))s.players[q.owner].creep.push(e.loc);}}
  else if(q.kind==='worker')s.players[q.owner].workers++;
  else if(q.kind==='upgrade')s.players[q.owner].upgrades.push(q.cardId);
  else makeEntity(s,q.owner,q.cardId,entity(s,q.producerId)?.loc??q.loc);
  note(s,`${c?.name||'Рабочий'}: готово.`);
 }
 function income(s,p){
  const pl=s.players[p],bs=bases(s,p),gasSlots=friendly(s,p).filter(e=>e.complete&&card(e).refinery).length*3;
  pl.gasWorkers=Math.min(pl.gasWorkers,gasSlots,pl.workers);
  let m=Math.min(Math.max(0,freeWorkers(s,p)),bs.length*8),g=Math.min(pl.gasWorkers,gasSlots,bs.length*3),mi=0,gi=0;
  for(const b of bs){let v=Math.min(m,8,b.mineralLeft);b.mineralLeft-=v;m-=v;mi+=v;v=Math.min(g,3,b.gasLeft);b.gasLeft-=v;g-=v;gi+=v;}
  pl.minerals+=mi;pl.gas+=gi;if(bs.length)pl.energy=Math.min(8,pl.energy+1);
 }
 function advance(s){
  const previous=s.round;s.round++;s.scans=[[],[]];
  // Income uses workers that were occupied during the previous cycle.
  [0,1].forEach(p=>income(s,p));
  for(const q of [...s.queues]){if(q.entityId&&!entity(s,q.entityId))continue;const producer=entity(s,q.producerId);if(producer&&!powered(s,producer))continue;q.remaining--;if(q.remaining<=0){finishQueue(s,q);s.queues=s.queues.filter(x=>x.id!==q.id);}}
  for(const e of s.entities){e.acted=false;const c=card(e);if(!e.complete)continue;if(c.faction==='zerg'){e.hp=Math.min(c.hp,e.hp+1);if(c.headquarters){e.larva=Math.max(e.larva,Math.min(3,e.larva+1));if(e.injectAt&&e.injectAt<=s.round){e.larva=Math.min(19,e.larva+3);delete e.injectAt;}}}if(c.faction==='protoss'&&e.damagedRound<previous)e.shield=Math.min(c.shield,e.shield+2);}
  s.initiative=1-s.initiative;s.active=s.initiative;s.remaining=[3,3];note(s,'Добыча, строительство и восстановление завершены.');
 }
 function spendOrder(s){s.remaining[s.active]--;cleanup(s);if(s.winner!==null)return;if(s.remaining.every(n=>n===0))advance(s);else if(s.remaining[1-s.active]>0)s.active=1-s.active;}
 function act(source,a){
  const s=structuredClone(source);need(s.winner===null,'Матч окончен. Начните новую партию.');const p=s.active,pl=s.players[p];need(s.remaining[p]>0,'Приказы закончились.');
  if(a.type==='pass'){note(s,`Игрок ${p+1}: пропуск.`);}
  else if(a.type==='allocate'){
   const gasSlots=friendly(s,p).filter(e=>e.complete&&card(e).refinery).length*3;
   need(Number.isInteger(a.count)&&a.count>=0&&a.count<=Math.min(gasSlots,pl.workers-busy(s,p)),'Недоступное число рабочих на газе.');pl.gasWorkers=a.count;note(s,`${a.count} рабочих назначено на газ.`);
  }
  else if(a.type==='worker'){
   const base=a.producerId?own(s,a.producerId):bases(s,p)[0];need(base&&base.complete&&card(base).headquarters,'Нужна завершённая база.');need(used(s,p)+1<=cap(s,p),'Не хватает лимита снабжения.');
   if(pl.faction==='zerg')need(base.larva>0,'Нет личинок.');else need(!s.queues.some(q=>q.producerId===base.id),'Очередь базы занята.');
   pay(s,{mineral:2,gas:0});if(pl.faction==='zerg')base.larva--;queue(s,{id:'worker',time:1,mineral:2,gas:0},'worker',base.loc,base.id);note(s,'Рабочий поставлен в очередь.');
  }
  else if(a.type==='build'){
   const c=checkCard(s,a.cardId,['building']);location(a.loc);need(visibleCells(s,p).includes(a.loc),'Сектор не разведан.');need(!enemyAt(s,p,a.loc),'Сектор занят противником.');need(freeWorkers(s,p)>0,'Нет свободного рабочего на минералах.');
   need(friendly(s,p).some(e=>e.loc===a.loc)||(bases(s,p).some(e=>distance(e.loc,a.loc)===1)),'Нужен свой юнит в секторе или соседняя база.');
   if(pl.faction==='zerg'&&!c.headquarters&&!c.refinery)need(pl.creep.includes(a.loc),'Строительство требует слизи.');
   if(pl.faction==='protoss'&&!c.headquarters&&!c.refinery&&c.id!=='protoss-supply')need(powered(s,{owner:p,cardId:c.id,loc:a.loc}),'Нужен пилон рядом.');
   if(c.headquarters)need(!s.entities.some(e=>e.loc===a.loc&&card(e).headquarters),'В секторе уже есть база.');
   pay(s,c);if(pl.faction==='zerg')pl.workers--;const e=makeEntity(s,p,c.id,a.loc,false);queue(s,c,'building',a.loc,null,e.id,pl.faction==='terran');note(s,`Строительство: ${c.name}.`);
  }
  else if(a.type==='train'){
   const c=checkCard(s,a.cardId,['unit','support']);const prod=a.producerId?own(s,a.producerId):friendly(s,p).find(e=>e.complete&&e.cardId===c.producer&&(pl.faction==='zerg'?e.larva>0:!s.queues.some(q=>q.producerId===e.id)));
   need(prod&&prod.complete&&prod.cardId===c.producer,'Нет свободного производящего здания.');need(powered(s,prod),'Производство обесточено.');need(c.supply===0||used(s,p)+c.supply<=cap(s,p),'Не хватает лимита снабжения.');
   if(pl.faction==='zerg')need(prod.larva>0,'Нет личинок.');else need(!s.queues.some(q=>q.producerId===prod.id),'Производственная очередь занята.');
   pay(s,c);if(pl.faction==='zerg')prod.larva--;queue(s,c,'unit',prod.loc,prod.id);note(s,`Заказ: ${c.name}.`);
  }
  else if(a.type==='upgrade'){
   const c=checkCard(s,a.cardId,['upgrade']);need(!pl.upgrades.includes(c.id)&&!s.queues.some(q=>q.owner===p&&q.cardId===c.id),'Улучшение уже изучено или изучается.');const prod=friendly(s,p).find(e=>e.complete&&e.cardId===c.requires.at(-1));need(prod&&powered(s,prod),'Исследовательское здание недоступно.');need(!s.queues.some(q=>q.producerId===prod.id),'Очередь исследования занята.');pay(s,c);queue(s,c,'upgrade',prod.loc,prod.id);note(s,`Исследование: ${c.name}.`);
  }
  else if(a.type==='cancel'){
   const q=s.queues.find(q=>q.id===a.queueId&&q.owner===p);need(q,'Выберите свою очередь.');pl.minerals+=Math.floor(q.mineral*.75);pl.gas+=Math.floor(q.gas*.75);s.queues=s.queues.filter(x=>x.id!==q.id);if(q.entityId){s.entities=s.entities.filter(e=>e.id!==q.entityId);if(pl.faction==='zerg')pl.workers++;}note(s,'Заказ отменён, возвращено 75% стоимости с округлением вниз.');
  }
  else if(['move','attack','siege','raid'].includes(a.type)){
   const e=own(s,a.unitId),c=card(e);need(e.complete&&['unit','support'].includes(c.type),'Выберите готового юнита.');need(!e.acted,'Юнит уже действовал в этом цикле.');need(!e.burrowed,'Сначала выкопайте юнита.');
   if(a.type==='move'){location(a.loc);need(!e.sieged,'Сначала сверните осадный режим.');const speed=(c.speed||1)+(pl.faction==='zerg'&&!c.flying&&pl.creep.includes(e.loc)?1:0);need(a.loc!==e.loc&&canPath(s,e,a.loc,speed),'Сектор слишком далеко или путь заблокирован.');e.loc=a.loc;note(s,`${c.name}: ${CELLS[a.loc]}.`);}
   if(a.type==='siege'){need(c.id==='terran-siege-tank','Осадный режим доступен танку.');e.sieged=!e.sieged;note(s,e.sieged?'Танк занял осадную позицию.':'Танк перешёл в походный режим.');}
   if(a.type==='raid'){need(c.attack>0,'Юнит не может атаковать.');need(bases(s,1-p).some(b=>b.loc===e.loc),'Налёт требует входа в сектор вражеской базы.');const opponent=s.players[1-p];need(opponent.workers>0,'Рабочих не осталось.');const kills=Math.min(2,opponent.workers);opponent.workers-=kills;opponent.gasWorkers=Math.min(opponent.gasWorkers,opponent.workers);note(s,`Налёт: потеряно ${kills} рабочих.`);}
   if(a.type==='attack'){
    const target=entity(s,a.targetId);need(target&&target.owner!==p&&visible(s,p,target),'Цель не видна или недоступна.');need(c.attack>0,'Юнит не может атаковать.');need(!card(target).flying||c.targets==='both','Это оружие не атакует воздух.');const range=e.sieged?2:c.range;need(distance(e.loc,target.loc)<=range,'Цель вне дальности.');if(e.sieged)need(distance(e.loc,target.loc)>0,'В осаде нельзя стрелять по своему сектору.');
    let raw=c.attack+(pl.upgrades.includes(pl.faction+'-weapons')?1:0)+(c.bonusTag&&card(target).tags.includes(c.bonusTag)?c.bonus:0)+(e.sieged?2:0);if([2,6].includes(target.loc)&&![2,6].includes(e.loc)&&!c.flying)raw=Math.max(1,raw-1);
    damage(s,target,raw);s.scans[1-p]=[...new Set([...s.scans[1-p],e.loc])];const splash=e.sieged?1:(c.splash||0);if(splash)for(const x of s.entities.filter(x=>x.id!==target.id&&x.loc===target.loc&&['unit','support'].includes(card(x).type)&&!card(x).flying))damage(s,x,splash);
    if(c.bounce){const x=s.entities.find(x=>x.id!==target.id&&x.owner!==p&&x.loc===target.loc&&['unit','support'].includes(card(x).type));if(x)damage(s,x,c.bounce);}
    note(s,`${c.name} атакует: ${card(target).name}, сила ${raw}.`);
   }e.acted=true;
  }
  else if(a.type==='macro'){
   need(pl.faction==='terran','Используйте карту расовой способности.');need(bases(s,p).length,'Нужен командный центр.');pay(s,{mineral:0,gas:0,energy:2});pl.minerals+=4;note(s,'МУЛ добыл 4 минерала.');
  }
  else if(a.type==='tactic'){
   const c=checkCard(s,a.cardId,['tactic']);const id=c.id;
   if(id==='terran-stim'){const e=own(s,a.unitId);need(['terran-marine','terran-marauder'].includes(e.cardId)&&e.complete,'Нужен морпех или мародёр.');need(e.hp>1,'Не хватает здоровья.');need(e.stimRound!==s.round,'Стимулятор уже применён в этом цикле.');e.hp--;e.damagedRound=s.round;e.acted=false;e.stimRound=s.round;}
   if(id==='terran-scan'){location(a.loc);s.scans[p]=[...new Set([...s.scans[p],a.loc,...neighbors(a.loc)])];}
   if(id==='terran-repair'){const e=own(s,a.unitId);need(freeWorkers(s,p)>0,'Нужен свободный КСМ.');need(card(e).tags.includes('mechanical')||card(e).type==='building','Цель нельзя ремонтировать.');e.hp=Math.min(card(e).hp,e.hp+4);}
   if(id==='zerg-inject'){const e=own(s,a.unitId);need(e.complete&&card(e).headquarters,'Выберите инкубатор.');need(!e.injectAt,'Инъекция уже действует.');e.injectAt=s.round+1;}
   if(id==='zerg-creep'){location(a.loc);need(visibleCells(s,p).includes(a.loc)&&pl.creep.some(n=>distance(n,a.loc)===1),'Нужен видимый сектор рядом со слизью.');need(!pl.creep.includes(a.loc)&&!enemyAt(s,p,a.loc),'Сектор уже покрыт слизью или занят врагом.');pl.creep.push(a.loc);}
   if(id==='zerg-burrow'){const e=own(s,a.unitId);need(e.complete&&card(e).type==='unit'&&!card(e).flying,'Нужен наземный юнит.');need(!e.acted,'Юнит уже действовал.');e.burrowed=!e.burrowed;e.acted=true;}
   if(id==='protoss-chrono'){const q=s.queues.find(q=>q.id===a.queueId&&q.owner===p);need(q&&q.producerId,'Выберите производство или исследование.');need(powered(s,entity(s,q.producerId)),'Очередь обесточена.');q.remaining--;if(q.remaining<=0){finishQueue(s,q);s.queues=s.queues.filter(x=>x.id!==q.id);}}
   if(id==='protoss-blink'){const e=own(s,a.unitId);location(a.loc);need(e.complete&&e.cardId==='protoss-stalker'&&!e.acted,'Нужен неактивированный сталкер.');need(distance(e.loc,a.loc)>0&&distance(e.loc,a.loc)<=2&&visibleCells(s,p).includes(a.loc),'Скачок: видимый сектор в пределах 2.');e.loc=a.loc;e.acted=true;}
   if(id==='protoss-storm'){location(a.loc);need(visibleCells(s,p).includes(a.loc),'Цель шторма не видна.');for(const e of s.entities.filter(e=>e.loc===a.loc&&['unit','support'].includes(card(e).type)))damage(s,e,3,true);}
   pay(s,c);note(s,`Способность: ${c.name}.`);
  }
  else throw new RuleError('Неизвестный приказ.');
  spendOrder(s);return s;
 }
 return {cards,byId,createGame,act,cap,used,powered,visible,visibleCells,requirements,card,freeWorkers};
}
