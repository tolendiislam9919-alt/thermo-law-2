/* Оқушының телефоны: аты мен тобын сұрайды, күтеді, мұғалім ашқан ФС бетін көрсетеді.
   Бет – слайдтың өзі, сондықтан «Тексеру» дәл слайдтағыдай жұмыс істейді, ұпай мұғалімнің журналына кетеді. */
"use strict";
const OQ=(()=>{
  const NKEY='t2_oq_name'+OQTAG, GKEY='t2_oq_g'+OQTAG;
  const buzz=n=>{ try{ navigator.vibrate&&navigator.vibrate(n); }catch(e){} };
  let PID=store.get('pid',null); if(!PID){ PID=Math.random().toString(36).slice(2,10); store.set('pid',PID); }
  let CLS=store.get('cls',[]), started=false;
  let NAME='', G=null; try{ NAME=localStorage.getItem(NKEY)||''; const v=localStorage.getItem(GKEY); G=v==null||v===''?null:+v; }catch(e){}
  let net=null, joined=false, kicked=false, lastSeen=0, ST={act:null,g:null}, shown=null, screen='', waitSig='';
  const sent={};
  let top,app,sc;
  const pageOf=k=>document.querySelector(`.slide[data-phone="${k}"]`);
  const saveG=()=>{ try{ localStorage.setItem(GKEY,G==null?'':String(G)); }catch(e){} };

  function setTop(){ top.querySelector('.nm').textContent=(NAME||'Сабаққа қосылу')+(shown?' · '+pageOf(shown).dataset.title:'');
    const e=top.querySelector('.oqgp'), g=GR[G]; if(g&&NAME){ e.hidden=false; e.textContent=g.n; e.style.background=g.c; } else e.hidden=true;
    if(shown){ const s=FS.summary(shown); sc.hidden=false; sc.innerHTML=`Ұпайың: <b>${nf(s.sc,1)} / ${s.max}</b>`+(s.all?' · аяқталды ✔ · ұпай мұғалімге жіберілді':''); } else sc.hidden=true; }
  function cover(on){ app.style.display=on?'block':'none'; window.oqPaused=on; if(on){ shown=null; } }

  /* Оқушы тізімнен өз атын таңдайды: тобын мұғалімнің компьютері (ЖИ-бот бөлген топтар) өзі анықтайды.
     Тізімде жоқ болса ғана атын жазып, түсін өзі таңдайды. */
  const clsList=()=>CLS.length?CLS:CLASS8;
  function vName(){ screen='name'; cover(true); let pick=G; const L=clsList(), inList=L.includes(NAME);
    app.innerHTML=`<div class="box"><h1>Сабаққа қосылу</h1><p class="mut">Тізімнен өз атыңды таңда. Тобың өзі анықталады.</p>
      <select id="oqSel" style="width:100%;font:600 19px 'Segoe UI';padding:12px;border:2px solid var(--line);border-radius:9px;background:#fff"><option value="">${L.length?'— Атыңды таңда —':'Тізім жүктелуде…'}</option>${L.map(n=>`<option${n===NAME?' selected':''}>${esc(n)}</option>`).join('')}<option value="__"${NAME&&!inList?' selected':''}>Тізімде жоқпын…</option></select>
      <div id="oqOther" style="display:${NAME&&!inList?'block':'none'};margin-top:12px"><input id="oqNm" maxlength="24" autocomplete="off" placeholder="Атың мен тегің" value="${inList?'':esc(NAME)}">
      <p style="font:700 17px 'Segoe UI';margin:6px 0">Тобың:</p>
      <div class="gpick" id="oqGp">${GR.map((g,i)=>`<button data-g="${i}" style="background:${g.c}" class="${pick===i?'on':''}">${g.n}</button>`).join('')}</div></div>
      <button class="go" id="oqGo">Кіру</button></div>`;
    $('oqSel').onchange=()=>{ $('oqOther').style.display=$('oqSel').value==='__'?'block':'none'; };
    $('oqGp').onclick=e=>{ const b=e.target.closest('[data-g]'); if(!b) return; pick=+b.dataset.g; [...$('oqGp').children].forEach(x=>x.classList.toggle('on',x===b)); };
    const ok=()=>{ const sv=$('oqSel').value; let v;
      if(!sv){ toast('Тізімнен атыңды таңда'); return; }
      if(sv==='__'){ v=$('oqNm').value.replace(/[<>&"'`]/g,'').trim().replace(/\s+/g,' '); if(v.length<2){ $('oqNm').focus(); toast('Атыңды жаз'); return; } if(pick==null){ toast('Тобыңның түсін таңда'); return; } G=pick; }
      else { v=sv; if(v!==NAME) G=null; }
      NAME=v; try{ localStorage.setItem(NKEY,v); }catch(e){} saveG(); store.set('in',true); start(); };
    $('oqGo').onclick=ok; }
  function vWait(){ screen='wait'; cover(true); const g=GR[G];
    app.innerHTML=`<div class="box" style="text-align:center;padding-top:34px"><div style="font-size:54px">${!joined?'📡':'⏳'}</div><h1>${joined?'Сен қосылдың, '+esc(NAME.split(' ')[1]||NAME)+'!':'Қосылып жатырмын…'}</h1>${g?`<p>Сенің тобың: <b style="color:${g.c}">${g.n}</b></p>`:(joined?'<p class="mut">Тобың әлі анықталмаған: мұғалім топқа бөлген соң өзі шығады.</p>':'')}<p class="mut">${!joined?'Бір сәт күт. Ұзаққа созылса, интернетті немесе Wi-Fi-ды тексер.':'Атың экранда шықты. Мұғалім ФС тапсырмасын ашқанда, ол осы жерде шығады.'}</p>${joined?'<p class="mut" style="margin-top:26px">Атың не тобың қате ме? <a href="#" id="oqFix">Өзгерту</a></p>':''}</div>`;
    const f=$('oqFix'); if(f) f.onclick=e=>{ e.preventDefault(); vName(); }; }

  function showPage(key){ if(shown===key&&screen==='page') return; const i=slides.indexOf(pageOf(key)); if(i<0) return; screen='page'; go(i); cover(false); shown=key; FS.paint(key); setTop(); scrollTo(0,0); buzz(120); report(); }

  /* ---------- нәтижені мұғалімге жіберу ---------- */
  const summ=()=>{ const p={}; FSK.forEach(k=>{ const s=FS.summary(k); if(s.n) p[k]=s; }); return p; };
  function report(){ if(!net) return; FSK.forEach(k=>{ const v=FS.summary(k); if(!v.n) return; const j=JSON.stringify(v); if(sent[k]!==j){ sent[k]=j; net.send({t:'res',pack:k,v}); } }); if(shown) setTop(); }
  window.OQ_HOOK=()=>{ report(); };

  /* ---------- мұғалімнің кезең таймері ---------- */
  let TM=null, tmRang='';
  const tmLeft=()=>TM?Math.max(0,TM.run?TM.l-(Date.now()-TM.at)/1000:TM.l):0;
  function setTm(t){ if(!t){ TM=null; paintTm(); return; } const same=TM&&TM.n===t.n&&TM.run===t.run; if(!same||Math.abs(tmLeft()-t.l)>2) TM={n:t.n,l:t.l,run:t.run,at:Date.now()}; paintTm(); }
  function paintTm(){ const e=top&&top.querySelector('.oqtm'); if(!e) return; if(!TM||!shown){ e.hidden=true; return; } const s=Math.ceil(tmLeft()); e.hidden=false; e.textContent='⏱ '+String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); e.className='oqtm'+(s<=0?' end':s<=30?' low':'');
    if(s<=0&&tmRang!==TM.n){ tmRang=TM.n; buzz([300,150,300]); } else if(s>0&&tmRang===TM.n) tmRang=''; }


  /* ---------- 3D квест: телефон – джойстик ---------- */
  let qSig='', qAt=0, joyOn=false, joyV={x:0,y:0,lx:0,ly:0}, joyA=[false,false], joyZero=0, joySent=0, awake=false;
  /* телефон экраны сөнбесін: Wake Lock (https), болмаса үнсіз кішкентай видео айналып тұрады */
  function keepAwake(){ if(awake) return; awake=true;
    if(navigator.wakeLock&&navigator.wakeLock.request){ const req=()=>navigator.wakeLock.request('screen').catch(()=>{}); req(); document.addEventListener('visibilitychange',()=>{ if(!document.hidden) req(); }); return; }
    try{ const c=document.createElement('canvas'); c.width=c.height=16; const g=c.getContext('2d'); const stm=c.captureStream(5), rec=new MediaRecorder(stm), ch=[]; let n=0;
      const iv=setInterval(()=>{ g.fillStyle=n++%2?'#000':'#111'; g.fillRect(0,0,16,16); },200);
      rec.ondataavailable=e=>ch.push(e.data);
      rec.onstop=()=>{ clearInterval(iv); const v=document.createElement('video'); v.muted=true; v.loop=true; v.playsInline=true; v.setAttribute('playsinline',''); v.style.cssText='position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none';
        v.src=URL.createObjectURL(new Blob(ch,{type:rec.mimeType||'video/webm'})); document.body.appendChild(v); const pl=()=>v.play().catch(()=>{}); pl(); document.addEventListener('visibilitychange',()=>{ if(!document.hidden) pl(); }); document.addEventListener('pointerdown',pl); };
      rec.start(); setTimeout(()=>{ try{ rec.stop(); }catch(e){} },1200); }catch(e){} }
  document.addEventListener('pointerdown',keepAwake,{once:true});
  const qLeft=()=>{ const q=ST.qs; if(!q) return 0; const run=q.ph==='play'||q.ph==='q'||q.ph==='qok'; return Math.max(0,q.left-(run?(Date.now()-qAt)/1000:0)); };
  const qfmt=s=>{ s=Math.ceil(s); return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); };
  setInterval(()=>{ if(screen==='quest'){ const e=$('qpT'); if(e) e.textContent=qfmt(qLeft()); }
    if(net&&joyOn) joySend(); else if(net&&joyZero>0){ joyZero--; net.send({t:'in',x:0,y:0,lx:0,ly:0}); } },110);
  const joySend=()=>net.send({t:'in',x:+joyV.x.toFixed(2),y:+joyV.y.toFixed(2),lx:+joyV.lx.toFixed(2),ly:+joyV.ly.toFixed(2)});
  function vQuest(){ const q=ST.qs||{g:-1}; if(screen!=='quest'){ qSig=''; cover(true); } screen='quest'; shown=null; setTop();
    const rm=QROOMS[q.g], mine=!!rm&&q.g===G, drv=q.drv===PID;
    const sig=[q.g,mine,q.ph,drv,q.drv||'',q.dn||'',q.q?q.q.i+':'+q.q.bad+':'+q.q.sel.join(',')+':'+q.q.ok+':'+q.q.m:'',q.code?q.code.n+':'+q.code.m:'',(q.dig||[]).join(',')].join('|');
    if(sig!==qSig){ qSig=sig; joyOn=false; joyA=[false,false]; joyV={x:0,y:0,lx:0,ly:0};
      let h='';
      if(!rm) h=`<div class="box" style="text-align:center;padding-top:30px"><div style="font-size:54px">🎮</div><h1>Квест жақында басталады</h1><p class="mut">Мұғалім бөлмені ашқанда, тобыңның кезегі келсе, осы жерде джойстик шығады.</p></div>`;
      else { h=`<div class="qp"><div class="qph" style="border-left:8px solid ${rm.c}"><span style="color:${rm.c}">${q.g+1}-бөлме · ${GR[q.g].n} топ</span><span>⏱ <b id="qpT">${qfmt(qLeft())}</b></span><span>⭐ <b>${q.sc}</b></span></div>`+(mine?`<p style="font:700 18px 'Segoe UI';margin:8px 0 0">🔐 Код: <b style="font:800 24px Consolas,monospace">${(q.dig||[]).map(d=>d==null?'_':d).join(' ')}</b></p>`:'');
        if(!mine) h+=`<div style="font-size:54px;margin-top:20px">👀</div><h1>Қазір ${GR[q.g].n} топ ойнап жатыр</h1><p class="mut">«${rm.n}». Тақтаға қараңдар! Сенің тобыңның кезегі келгенде, осы жерде джойстик шығады.</p>`;
        else if(q.ph==='ready') h+=`<h1>Физботты тыңда! 🤖</h1><p class="mut">Біреуің жүргізуші болады, қалғандарың сұраққа жауап беруге көмектесесіңдер.</p>`+(drv?'<h1 style="color:var(--green)">✔ Сен – жүргізушісің!</h1><p class="mut">Уақыт басталғанда джойстик шығады.</p>':`${q.drv?`<p>Жүргізуші: <b>${esc(q.dn)}</b></p>`:''}<button class="drv" id="qpDrv" style="background:${rm.c}">🎮 ${q.drv?'Мен жүргізейін':'Мен жүргіземін'}</button>`);
        else if(q.ph==='done') h+=`<div style="font-size:54px;margin-top:16px">🏁</div><h1>Бөлмедегі тапсырма аяқталды!</h1><p>Тобыңның ұпайы: <b style="font-size:28px">${q.sc}</b></p>`;
        else if(q.code) h+=`<h1 style="font-size:21px;margin-top:10px">🔐 Есіктің кодын теріңдер</h1><div class="codebox">${[0,1,2].map(k=>`<span>${k<q.code.n?'✱':'•'}</span>`).join('')}</div><div class="kpad">${[1,2,3,4,5,6,7,8,9,'⌫',0,'✕'].map(v=>`<button data-k="${v==='⌫'?'del':v==='✕'?'back':v}">${v}</button>`).join('')}</div><p style="font:700 17px 'Segoe UI'">${esc(q.code.m||'Станциялардағы цифрлар: 1 → 2 → 3')}</p>`;
        else if(q.q) h+=`<h1 style="font-size:20px;margin-top:10px">Станция ${q.q.i+1}</h1><p style="font:700 20px/1.45 'Segoe UI'">${esc(q.q.t)}</p>`+(q.q.f?`<div class="fhint">Кеңес: ${esc(q.q.f)}</div>`:'')+
          (q.q.k==='num'?`<div class="kpad n10">${[1,2,3,4,5,6,7,8,9,0].map(v=>`<button data-v="${v}"${q.q.ok?' disabled':''}>${v}</button>`).join('')}</div>`:`<div class="qpo">${q.q.items.map((o,j)=>`<button data-v="${j}"${q.q.ok||q.q.sel.includes(j)?' disabled':''}>${q.q.sel.includes(j)&&q.q.k==='order'?'<b>'+(q.q.sel.indexOf(j)+1)+'.</b> ':''}${esc(o)}</button>`).join('')}</div>`)+
          `<p style="font:700 17px 'Segoe UI'">${esc(q.q.m||'Тобыңмен бірге есептеп, жауапты бас!')}</p>`;
        else if(drv) h+=`<p class="mut" style="margin:10px 0 0">Сен – <b>жүргізушісің</b>. Тақтаға қарап жүргіз: <b>сол жақпен – жүр</b>, <b>оң жақпен – жан-жаққа қара</b>. Станцияларға (1, 2, 3) бар, сосын <b>есікке</b>!</p><div class="joys"><div><div class="joy" id="qpJM"><div class="knob" id="qpKM" style="background:${rm.c}"></div></div><p>🚶 Жүру</p></div><div><div class="joy" id="qpJL"><div class="knob" id="qpKL" style="background:#1d2430"></div></div><p>👀 Қарау</p></div></div><p class="mut">Станция: ${q.dc}/3</p>`;
        else h+=`<div style="font-size:48px;margin-top:14px">🎮</div><h1 style="font-size:21px">${q.drv?'Жүргізуші: '+esc(q.dn):'Әзірге жүргізуші жоқ!'}</h1><p class="mut">Станцияға жеткенде сұрақ осы жерде шығады – бірге жауап беріңдер!</p><button class="drv" id="qpDrv" style="background:${rm.c}">🎮 ${q.drv?'Мен жүргізейін':'Мен жүргіземін'}</button>`;
        h+='</div>'; }
      app.innerHTML=h;
      const d=$('qpDrv'); if(d) d.onclick=()=>{ net.send({t:'drv'}); d.disabled=true; d.textContent='…'; buzz(60); };
      app.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{ net.send({t:'ans',i:q.q.i,v:b.dataset.v}); buzz(40); });
      app.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{ net.send({t:'key',v:b.dataset.k}); buzz(40); });
      /* екі джойстик: әрқайсысы өз саусағын ұстайды (multi-touch) */
      [['qpJM','qpKM',0],['qpJL','qpKL',1]].forEach(([jid,kid,w])=>{ const J=$(jid); if(!J) return; const K=$(kid); let pidT=null;
        const mv=e=>{ const r=J.getBoundingClientRect(), R=r.width/2, dx=e.clientX-(r.left+R), dy=e.clientY-(r.top+R), L=Math.hypot(dx,dy), k=L>R*.85?R*.85/L:1;
          K.style.transform=`translate(${dx*k}px,${dy*k}px)`; const n=Math.min(1,L/(R*.85)), vx=L?dx/L*n:0, vy=L?dy/L*n:0;
          if(w===0){ joyV.x=vx; joyV.y=vy; } else { joyV.lx=vx; joyV.ly=vy; }
          if(Date.now()-joySent>55&&net){ joySent=Date.now(); joySend(); } };
        J.addEventListener('pointerdown',e=>{ pidT=e.pointerId; try{ J.setPointerCapture(e.pointerId); }catch(x){} joyA[w]=true; joyOn=true; mv(e); e.preventDefault(); });
        J.addEventListener('pointermove',e=>{ if(joyA[w]&&e.pointerId===pidT) mv(e); });
        const up=e=>{ if(e&&pidT!=null&&e.pointerId!==pidT) return; joyA[w]=false; pidT=null; if(w===0){ joyV.x=0; joyV.y=0; } else { joyV.lx=0; joyV.ly=0; } K.style.transform='';
          joyOn=joyA[0]||joyA[1]; if(net) joySend(); if(!joyOn) joyZero=3; };
        J.addEventListener('pointerup',up); J.addEventListener('pointercancel',up); }); }
    else { const e=$('qpT'); if(e) e.textContent=qfmt(qLeft()); } }

  function render(){ setTop(); if(kicked||screen==='name') return; if(joined&&ST.act==='quest'){ vQuest(); return; } if(joined&&ST.act){ showPage(ST.act); return; } const sig=joined+'|'+G; if(screen!=='wait'||waitSig!==sig){ waitSig=sig; vWait(); } }
  function onMsg(m){ if(m.pid&&m.pid!==PID) return; lastSeen=Date.now();
    if(m.t==='kicked'){ kicked=true; joined=false; screen=''; cover(true); app.innerHTML=`<div class="box" style="text-align:center;padding-top:40px"><h1>Мұғалім тізімнен алып тастады</h1><button class="go" id="oqRe">Қайта кіру</button></div>`; $('oqRe').onclick=()=>{ kicked=false; net.send({t:'hello',name:NAME,g:G,force:true}); vWait(); }; return; }
    if(m.t==='cls'){ const l=(Array.isArray(m.list)?m.list:[]).filter(x=>typeof x==='string').slice(0,60); if(JSON.stringify(l)!==JSON.stringify(CLS)){ CLS=l; store.set('cls',CLS); const sel=$('oqSel'); if(screen==='name'&&(!sel||!sel.value)) vName(); } return; }
    if(m.t==='st'){ joined=true; if(m.g!=null&&m.g!==G){ G=m.g; saveG(); } ST.act=m.act||null; ST.qs=m.qs||null; qAt=Date.now(); setTm(m.tm||null); render(); } }

  function hello(){ if(net) net.send({t:'hello',name:NAME,g:G}); }
  /* байланыс бірден ашылады: кірмей тұрып та сынып тізімін мұғалімнің компьютерінен сұрайды */
  function openNet(){ if(net) return;
    net=NET.openPad({room:OQROOM,pid:PID,onMsg,onStatus:s=>{ top.querySelector('.oqdot').className='oqdot '+(s==='on'?'on':s==='off'?'off':''); if(s==='on'){ lastSeen=Date.now(); if(started) hello(); else net.send({t:'cls?'}); } }});
    setTimeout(()=>{ if(!started) net.send({t:'cls?'}); },700);
    setInterval(()=>{ if(!net||!net.online) return; if(!started){ net.send({t:'cls?'}); } else if(!joined) hello(); else net.send({t:'ping',n:NAME,g:G,p:summ()});
      /* мұғалім бұл серверде естімесе, келесі серверге өтеміз */
      if(lastSeen&&Date.now()-lastSeen>(joined?14000:8000)&&!document.hidden){ lastSeen=Date.now(); net.next(); } },2500);
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&net&&net.online&&started) net.send({t:'ping',n:NAME,g:G,p:summ()}); }); }
  function start(){ started=true; top.hidden=false; setTop(); waitSig=''; vWait(); openNet(); hello(); setTimeout(hello,700); }

  function init(){ document.title='Физика: сабаққа қосылу';
    top=document.createElement('div'); top.className='oqtop'; top.innerHTML='<span class="oqdot"></span><span class="nm"></span><span class="oqtm" hidden></span><span class="oqgp" hidden></span>'; document.body.appendChild(top); setInterval(paintTm,500);
    app=document.createElement('div'); app.className='oqapp'; document.body.appendChild(app);
    sc=document.createElement('div'); sc.className='oqsc'; sc.hidden=true; document.body.appendChild(sc);
    top.hidden=false; openNet(); if(store.get('in',false)&&NAME) start(); else vName(); }
  return {init,report,get ST(){return ST;},PID,get shown(){return shown;}};
})();
window.__oq=OQ;
