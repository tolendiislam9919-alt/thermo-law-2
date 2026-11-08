/* Мұғалім экраны: QR, оқушылар тізімі, ФС бетін телефонға ашу, нәтижелер журналға.
   Ереже: ФС бетінде QR-ды үлкейткенде (жоғарғы сары түйме), слайдтың сол беті барлық телефонға ашылады. */
"use strict";
const PH=(()=>{
  const today=new Date().toISOString().slice(0,10);
  const newRoom=()=>{ const A='ABCDEFGHJKMNPQRSTUVWXYZ'; let s=''; for(let i=0;i<4;i++) s+=A[Math.floor(Math.random()*A.length)]; return s; };
  let D=store.get('ph',null); if(!D||D.date!==today) D={date:today,room:newRoom(),st:{},kick:[],act:null};
  const save=()=>store.set('ph',D);
  const seen={};
  let net=null, linkInfo=null, status=[];
  const online=pid=>Date.now()-(seen[pid]||0)<9000;
  const ids=()=>Object.keys(D.st);
  const isLocal=()=>linkInfo&&linkInfo.local;
  const pageOf=k=>document.querySelector(`.slide[data-phone="${k}"]`);
  const titleOf=k=>{ const s=pageOf(k); return s?s.dataset.title:''; };
  const keyHere=()=>slides[cur].dataset.phone||null;
  const overlayOn=()=>$('phOv').style.display!=='none';
  const gcol=g=>g==null?'#8a8f99':GR[g].c;

  /* ---------- сілтеме және QR ---------- */
  function joinUrl(){ if(isLocal()) return /^127\./.test(linkInfo.host)?'':`http://${linkInfo.host}:${linkInfo.port}/index.html?r=${D.room}`;
    if(location.protocol==='http:'||location.protocol==='https:'){ const p=location.pathname.replace(/[^/]*$/,''); return location.origin+p+'index.html?r='+D.room; }
    const b=store.get('puburl','').trim(); if(b) return b.replace(/\/?(index\.html)?$/,'/')+'index.html?r='+D.room; return ''; }
  function qrSvg(u){ const q=qrcode(0,'M'); q.addData(u); q.make(); return q.createSvgTag({cellSize:6,margin:2,scalable:true}); }
  function paintQR(){ const u=joinUrl(), loc=isLocal(); document.querySelectorAll('[data-qr]').forEach(b=>{ b.innerHTML=u?qrSvg(u):(loc?'<div class="qrno">QR жоқ:<br>компьютерді Wi-Fi-ға қосыңыз</div>':'<div class="qrno">QR жоқ:<br>сілтеме керек</div>'); });
    document.querySelectorAll('[data-url]').forEach(b=>{ b.textContent=u?u.replace(/^https?:\/\//,''):'—'; });
    const w=$('phFile'); if(w) w.style.display=(u||loc)?'none':'block'; const i=$('phPub'); if(i&&!i.value) i.value=store.get('puburl','');
    const f=$('phWifi'); if(f){ f.style.display=(loc&&u)?'block':'none'; f.innerHTML=linkInfo&&linkInfo.ssid?`Алдымен телефонды <b>«${esc(linkInfo.ssid)}»</b> Wi-Fi-ына қос (мобильді интернетті өшір).`:'Алдымен телефонды осы компьютер қосылған Wi-Fi-ға қос.'; } }

  /* ---------- оқушылар ---------- */
  function cleanName(v){ return String(v||'').replace(/[<>&"'`]/g,'').slice(0,24).trim()||'Оқушы'; }
  /* Аттары бірдей оқушылардың бағасы бірігіп кетпеуі үшін: Арнат, Арнат 2 */
  function uniq(name,pid){ let n=name,k=2; while(ids().some(p=>p!==pid&&D.st[p].n===n)) n=name+' '+k++; return n; }
  const okG=g=>g===0||g===1||g===2;
  function reg(pid,raw,g,force){ const name=cleanName(raw); let s=D.st[pid], ch=false; const gg=groupOf(name); if(gg!=null){ g=gg; force=true; }
    if(!s){ s=D.st[pid]={n:uniq(name,pid),raw:name,g:okG(g)?g:null,prog:{}}; SND.clink(); ch=true; }
    else { if((s.raw||s.n)!==name){ s.raw=name; s.n=uniq(name,pid); ch=true; } if(okG(g)&&g!==s.g&&(force||s.g==null)){ s.g=g; ch=true; } }
    if(ch){ save(); paintList(); JR.build(); } return s; }
  function setProg(pid,key,v){ const s=D.st[pid]; if(!s||!v||!FSK.includes(key)) return; const b={sc:+v.sc||0,max:+v.max||FSMAX(key),n:+v.n||0,all:!!v.all};
    if(JSON.stringify(s.prog[key])!==JSON.stringify(b)){ s.prog[key]=b; save(); paintChip(); paintMon(); JR.build(); } }
  /* робот топтарды қайта бөлсе, телефонмен кірген оқушылардың тобы да жаңарады */
  function regroup(){ let ch=false; ids().forEach(pid=>{ const s=D.st[pid], gg=groupOf(s.raw||s.n); if(gg!=null&&gg!==s.g){ s.g=gg; ch=true; tell(pid); } }); if(ch){ save(); paintList(); } }
  function setGroup(pid,g){ const s=D.st[pid]; if(!s) return; s.g=g; save(); paintList(); tell(pid); }

  function stFor(pid){ const s=D.st[pid], o={t:'st',pid,act:D.act,g:s?s.g:null}; if(window.STG) o.tm=STG.forPhone(o.act); if(D.act==='quest'&&window.QUEST) o.qs=QUEST.forPhone(pid); return o; }
  /* Осы беттегі тапсырманы телефондарға ашу */
  function release(key){ if(D.act===key) return; D.act=key; save(); SND.bell(); all(); paintChip(); }
  function tell(pid){ if(net) net.send(pid,stFor(pid)); }
  function all(){ ids().forEach(pid=>{ if(online(pid)) tell(pid); }); }
  function onMsg(m){ const pid=m.pid; if(!pid) return; seen[pid]=Date.now();
    if(m.t==='cls?'){ if(net) net.send(pid,{t:'cls',pid,list:rosterNow()}); return; }   // телефон тізімді сұрайды
    if(D.kick.includes(pid)&&!m.force){ net.send(pid,{t:'kicked',pid}); return; }
    if(m.force) D.kick=D.kick.filter(x=>x!==pid);
    if(m.t==='hello'){ reg(pid,m.name,m.g,true); tell(pid); paintChip(); return; }
    if(!D.st[pid]){ if(m.n) reg(pid,m.n,m.g); else return; }
    if(m.t==='in'||m.t==='ans'||m.t==='drv'||m.t==='key'){ if(window.QUEST) QUEST.onMsg(pid,m,D.st[pid]); return; }
    if(m.t==='ping'){ if(m.n) reg(pid,m.n,m.g); if(m.p) Object.keys(m.p).forEach(k=>setProg(pid,k,m.p[k])); tell(pid); return; }
    if(m.t==='res'){ setProg(pid,m.pack,m.v); return; } }
  function kick(pid){ const s=D.st[pid]; if(!s) return; if(!confirm(s.n+' тізімнен алынсын ба?')) return; delete D.st[pid]; D.kick.push(pid); save(); if(net) net.send(pid,{t:'kicked',pid}); paintList(); JR.build(); }
  function newQR(){ if(!confirm('Жаңа QR жасалады, телефонмен кірген оқушылар тізімі мен олардың ФС нәтижелері тазарады (топтар мен топ ұпайлары сақталады). Жалғастырамыз ба?')) return; store.set('ph',{date:today,room:newRoom(),st:{},kick:[],act:null}); location.reload(); }

  /* ---------- экрандағы тізім ---------- */
  function paintChip(){ const c=$('phChip'); if(!c) return; const n=ids().length, k=keyHere(); let t='📱 QR · '+n, hot=false;
    if(k&&D.act!==k){ t='📱 QR-ды үлкейт · '+n; hot=true; }
    else if(D.act==='quest') t+=' · 🎮 Квест';
    else if(D.act){ const dn=ids().filter(p=>{ const v=D.st[p].prog[D.act]; return v&&v.n; }).length, fin=ids().filter(p=>{ const v=D.st[p].prog[D.act]; return v&&v.all; }).length; t+=` · ${D.act.toUpperCase().replace('FS','ФС-')}: ${fin}/${n} бітті`; }
    c.textContent=t; c.classList.toggle('hot',hot); }
  function paintList(){ paintChip(); const g=$('phNames'); if(g){ $('phCount').textContent=ids().length; $('slJoin').classList.toggle('many',ids().length>12); g.innerHTML=ids().map(p=>{ const s=D.st[p]; return `<span class="nmc" style="background:${gcol(s.g)}" data-k="${p}" title="Алып тастау">${esc(s.n)}</span>`; }).join('')||'<span style="color:var(--muted);font-size:20px">Әзірге ешкім қосылған жоқ…</span>'; } paintMon(); }
  function cell(v){ if(!v) return '<td>–</td>'; return `<td class="${v.all?'ok':''}"><b>${nf(v.sc,1)}</b> / ${v.max}${v.all?' ✔':` <small>(${v.n})</small>`}</td>`; }
  function paintMon(){ const b=$('phMonT'); if(!b||!overlayOn()) return; const now=$('phNow');
    now.innerHTML=D.act?`Телефондарда ашық: <b>${esc(titleOf(D.act))}</b>. Оқушылар шешіп, «Тексеру» басады – ұпайы өзі журналға түседі.`:'Әзірге телефонға бет ашылған жоқ. <b>ФС бетінде</b> QR-ды үлкейткенде, сол бет ашылады.';
    let h='<tr><th>Оқушы</th><th>Топ</th>'+FSK.map(x=>`<th>${x.replace('fs','ФС-')}</th>`).join('')+'<th>Байланыс</th><th></th></tr>';
    ids().forEach(p=>{ const s=D.st[p]; h+=`<tr><td class="l"><b>${esc(s.n)}</b></td><td style="color:${gcol(s.g)};font-weight:700">${s.g==null?'—':GR[s.g].n}</td>`+FSK.map(x=>cell(s.prog[x])).join('')+`<td>${online(p)?'🟢':'⚪'}</td><td><button class="btn" data-x="${p}" style="padding:1px 8px">×</button></td></tr>`; });
    if(!ids().length) h+='<tr><td colspan="7" style="padding:18px;color:var(--muted)">Оқушылар QR-ды сканерлеп кіргенде осында шығады.</td></tr>';
    b.innerHTML=h; }
  function monitor(on){ $('phOv').style.display=on?'flex':'none'; if(on){ const k=keyHere(); if(k) release(k); paintQR(); paintMon(); } }
  function paintNet(){ const ok=status.filter(x=>x.on); document.querySelectorAll('[data-net]').forEach(e=>{ e.textContent=ok.length?'Байланыс бар: '+ok.map(x=>x.name).join(', '):'Байланыс орнатылып жатыр…'; e.style.color=ok.length?'var(--green)':'var(--red)'; }); }

  function init(){ net=NET.openPanel({room:D.room,onMsg,onStatus:l=>{ status=l; paintNet(); },onReady:i=>{ linkInfo=i; paintQR(); paintNet(); }});
    $('phChip').onclick=()=>monitor(!overlayOn());
    $('phClose').onclick=()=>monitor(false);
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&overlayOn()) monitor(false); });
    $('phOv').addEventListener('click',e=>{ const x=e.target.closest('[data-x]'); if(x) kick(x.dataset.x); });
    $('phNames').addEventListener('click',e=>{ const x=e.target.closest('[data-k]'); if(x) kick(x.dataset.k); });
    $('phReset').onclick=newQR;
    $('phPubOk').onclick=()=>{ store.set('puburl',$('phPub').value.trim()); paintQR(); };
    setInterval(()=>{ if(overlayOn()) paintMon(); },2000);
    const og=go; go=function(i){ og(i); paintChip(); };
    paintList(); paintQR(); JR.build(); }
  return {init,get D(){return D;},monitor,all,setGroup,regroup,setAct:release};
})();
window.PH=PH;
