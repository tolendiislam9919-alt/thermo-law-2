/* Панель мен телефондар арасындағы байланыс. Екі жол бар:

   1) ЖЕРГІЛІКТІ СЕРВЕР (server.py, start.bat арқылы) — ойын компьютерден ашылса.
      Интернет керек емес, телефондар сол Wi-Fi желісінде болса болды.
      Хабар жіберу: POST /relay/send, тыңдау: /relay/events (Server-Sent Events).

   2) ИНТЕРНЕТ (Netlify сияқты хостингте) — өз сервері жоқ, сондықтан тегін ашық
      MQTT-серверлер қолданылады. Панель БАРЛЫҒЫНА бірден қосылады; телефон қайсысына
      қосыла алса, сол арқылы сөйлеседі. Бірінші тұрған shiftr.io — 443-порт.

   Қайсысы екенін ойын өзі анықтайды: алдымен /relay/ping сұрайды. */
(function () {
  const BROKERS = [
    { name: 'shiftr.io', url: 'wss://public.cloud.shiftr.io:443', user: 'public', pass: 'public' },
    { name: 'emqx.io', url: 'wss://broker.emqx.io:8084/mqtt' },
    { name: 'mosquitto', url: 'wss://test.mosquitto.org:8081/mqtt' },
    { name: 'hivemq', url: 'wss://broker.hivemq.com:8884/mqtt' }
  ];
  const ROOT = 'fizsynyp/t2zan8/';
  const parse = t => { try { return JSON.parse(t); } catch (e) { return null; } };

  /* ---------- жергілікті сервер бар ма? ---------- */
  let localCheck = null;
  const isPrivateHost = h => h === 'localhost' || /^(127|10)\./.test(h) || /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || /\.local$/.test(h);
  function pingOnce(ms) {
    const ctl = window.AbortController ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), ms);
    return fetch('/relay/ping', { cache: 'no-store', signal: ctl && ctl.signal })
      .then(r => r.ok ? r.json() : null)
      .then(j => { clearTimeout(t); return j && j.relay ? j : null; },
            e => { clearTimeout(t); throw e; });
  }
  /* Бет компьютердің жергілікті адресінен ашылса, сервер сол жерде: баяу Wi-Fi-да жауап
     кешіксе де интернет жолына ауыспаймыз (панель онда тыңдамайды), қайта сұраймыз. */
  function detectLocal() {
    if (localCheck) return localCheck;
    if (location.protocol === 'file:') return (localCheck = Promise.resolve(null));
    const priv = isPrivateHost(location.hostname), tries = priv ? 4 : 1;
    const attempt = i => pingOnce(priv ? 5000 : 2500).catch(() => {
      if (i + 1 < tries) return new Promise(r => setTimeout(r, 800)).then(() => attempt(i + 1));
      return priv ? { relay: true, ws: true, host: location.hostname, port: location.port } : null;
    });
    return (localCheck = attempt(0));
  }

  /* жергілікті: бір «жәшікті» тыңдау + жіберу */
  function localListen(box, onMsg, onState) {
    const es = new EventSource('/relay/events?box=' + encodeURIComponent(box));
    es.onopen = () => onState(true);
    es.onerror = () => onState(false);          // EventSource өзі қайта қосылады
    es.onmessage = e => { const m = parse(e.data); if (m) onMsg(m); };
    return es;
  }
  function localSend(box, msg) {
    return fetch('/relay/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ box, msg }), keepalive: true
    }).catch(() => {});
  }

  /* жергілікті, негізгі жол: бір тұрақты WebSocket.
     Сервер 4 с сайын «тірімін» белгісін жібереді, біз де жібереміз. 11 с ештеңе келмесе —
     байланыс өлі деп есептеп, бірден қайта қосыламыз. Экран қайта жанғанда, Wi-Fi оралғанда
     да дереу қосыламыз. Маңызды хабарлар (әрекет, код...) байланыс оралғанша сақталады. */
  function wsLink(box, onMsg, onState) {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/relay/ws?box=' + encodeURIComponent(box);
    let ws = null, last = 0, started = 0, wait = 0, timer = 0, up = false, pend = [];
    const state = on => { if (on !== up) { up = on; onState(on); } };
    function connect() {
      clearTimeout(timer); timer = 0;
      if (ws) { const o = ws; ws = null; o.onopen = o.onclose = o.onmessage = o.onerror = null; try { o.close(); } catch (e) {} }
      let s;
      try { s = new WebSocket(url); } catch (e) { later(); return; }
      ws = s; started = Date.now();
      s.onopen = () => { wait = 0; last = Date.now(); state(true); const q = pend; pend = []; q.forEach(t => s.send(t)); };
      s.onmessage = e => { last = Date.now(); const m = parse(e.data); if (m && m.t !== '_hb') onMsg(m); };
      s.onclose = () => { if (ws !== s) return; ws = null; state(false); later(); };
      s.onerror = () => {};
    }
    function later() { if (timer) return; wait = Math.min(wait ? wait * 1.7 : 300, 3000); timer = setTimeout(connect, wait); }
    function check() {
      if (!ws) { if (!timer) connect(); return; }
      if (ws.readyState === 1 && Date.now() - last > 11000) { state(false); connect(); }
      else if (ws.readyState === 0 && Date.now() - started > 6000) connect();
    }
    connect();
    setInterval(() => { if (ws && ws.readyState === 1) ws.send('{"box":""}'); check(); }, 4000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (!ws || ws.readyState !== 1 || Date.now() - last > 5000) connect(); } });
    addEventListener('online', connect);
    return {
      send(to, msg, keep) {
        const t = JSON.stringify({ box: to, msg });
        if (ws && ws.readyState === 1) ws.send(t);
        else if (keep) { pend.push(t); if (pend.length > 30) pend.shift(); }
      }
    };
  }

  /* интернет: MQTT */
  function mqttConnect(b, onState) {
    const opt = { clientId: 'qk_' + Math.random().toString(16).slice(2, 12), clean: true, keepalive: 10, connectTimeout: 6000, reconnectPeriod: 1000 };
    if (b.user) { opt.username = b.user; opt.password = b.pass; }
    const c = mqtt.connect(b.url, opt);
    c.on('connect', () => onState(true));
    c.on('close', () => onState(false));
    c.on('offline', () => onState(false));
    c.on('error', () => {});
    return c;
  }

  /* ====================== ПАНЕЛЬ ======================
     opts {room, onMsg(m), onStatus(list), onReady(info)}
     info: {local: true, host, port} немесе {local: false} */
  function openPanel(opts) {
    const base = ROOT + opts.room + '/';
    let impl = null;
    const api = { send(pid, m) { impl && impl.send(pid, m); }, info: null };

    detectLocal().then(loc => {
      if (loc) {
        const st = [{ name: 'компьютердегі сервер (' + loc.host + ')', on: false }];
        const onState = on => { st[0].on = on; opts.onStatus && opts.onStatus(st); };
        if (loc.ws) {
          const link = wsLink(base + 'up', m => { if (m && m.pid) opts.onMsg(m); }, onState);
          impl = { send: (pid, m) => link.send(base + 'dn/' + pid, m, m.t !== 'st') };   // күй хабары жиі қайталанады — сақтамаймыз
        } else {
          localListen(base + 'up', m => { if (m && m.pid) opts.onMsg(m); }, onState);
          impl = { send: (pid, m) => localSend(base + 'dn/' + pid, m) };
        }
        api.info = { local: true, host: loc.host, port: loc.port, ssid: loc.ssid || '' };
        opts.onStatus && opts.onStatus(st);
        /* компьютер басқа желіге ауысса (хот-спот кейін қосылса), QR жаңа адреске ауысады */
        setInterval(() => {
          pingOnce(3000).then(j => {
            if (!j || (j.host === api.info.host && (j.ssid || '') === api.info.ssid)) return;
            api.info = { local: true, host: j.host, port: j.port, ssid: j.ssid || '' };
            st[0].name = 'компьютердегі сервер (' + j.host + ')';
            opts.onStatus && opts.onStatus(st);
            opts.onReady && opts.onReady(api.info);
          }).catch(() => {});
        }, 5000);
      } else {
        const route = {};                        // pid → қай сервер арқылы келді
        const st = BROKERS.map(b => ({ name: b.name, on: false }));
        const report = () => opts.onStatus && opts.onStatus(st);
        const clients = BROKERS.map((b, i) => {
          const c = mqttConnect(b, on => { st[i].on = on; if (on) c.subscribe(base + 'up'); report(); });
          c.on('message', (t, buf) => { const m = parse(buf.toString()); if (!m || !m.pid) return; route[m.pid] = i; opts.onMsg(m); });
          return c;
        });
        impl = { send(pid, m) { const c = clients[route[pid]]; if (c && c.connected) c.publish(base + 'dn/' + pid, JSON.stringify(m)); } };
        api.info = { local: false };
        report();
      }
      opts.onReady && opts.onReady(api.info);
    });
    return api;
  }

  /* ====================== ТЕЛЕФОН ======================
     opts {room, pid, onMsg(m), onStatus('on'|'off'|'try', name)} */
  function openPad(opts) {
    const base = ROOT + opts.room + '/';
    let online = false, name = '', send = () => {}, next = () => {};
    const api = {
      send(m) { send(Object.assign({ pid: opts.pid }, m)); },
      get online() { return online; },
      get name() { return name; },
      next() { next(); }
    };
    const status = (s, n) => opts.onStatus && opts.onStatus(s, n);

    detectLocal().then(loc => {
      if (loc) {
        name = 'компьютердегі сервер';
        status('try', name);
        const onState = on => { online = on; status(on ? 'on' : 'off', name); };
        if (loc.ws) {
          const link = wsLink(base + 'dn/' + opts.pid, opts.onMsg, onState);
          send = m => link.send(base + 'up', m, m.t !== 'in' && m.t !== 'ping');   // қозғалыс пен ping-ті сақтамаймыз
        } else {
          localListen(base + 'dn/' + opts.pid, opts.onMsg, onState);
          send = m => localSend(base + 'up', m);
        }
        return;
      }
      /* интернет: серверлерді кезекпен байқаймыз */
      /* Бүкіл сынып бір серверге жиналмасын: телефон кездейсоқ серверден бастайды (shiftr, emqx, hivemq) */
      let cur = null, idx = [-1, 0, 2][Math.floor(Math.random() * 3)], alive = false;
      send = m => { if (cur && cur.connected) cur.publish(base + 'up', JSON.stringify(m)); };
      next = function tryNext() {
        if (cur) { try { cur.end(true); } catch (e) {} }
        idx = (idx + 1) % BROKERS.length; alive = false; online = false;
        const b = BROKERS[idx], myIdx = idx; name = b.name;
        status('try', b.name);
        const c = mqttConnect(b, on => {
          if (cur !== c) return;
          online = on;
          if (on) { alive = true; c.subscribe(base + 'dn/' + opts.pid); status('on', b.name); }
          else status('off', b.name);
        });
        c.on('message', (t, buf) => { const m = parse(buf.toString()); if (m) opts.onMsg(m); });
        cur = c;
        setTimeout(() => { if (cur === c && !alive && myIdx === idx) tryNext(); }, 8000);
      };
      next();
      /* экран қайта жанғанда не интернет оралғанда — күтпей бірден қайта қосыламыз */
      const wake = () => { if (cur && !cur.connected && !document.hidden) { try { cur.reconnect(); } catch (e) {} } };
      document.addEventListener('visibilitychange', wake);
      addEventListener('online', wake);
    });
    return api;
  }

  window.NET = { openPanel, openPad, BROKERS, detectLocal };
})();
