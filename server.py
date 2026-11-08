# -*- coding: utf-8 -*-
"""
Сабақ слайды — жергілікті сервер (тек Python, қосымша кітапхана керек емес).

Не істейді:
  1) ойынның файлдарын береді (index.html, *.js);
  2) панель мен телефондардың арасында хабар тасиды:
       GET  /relay/ws?box=...      — WebSocket: бір тұрақты арна (негізгі жол).
                                     Клиент {"box": "...", "msg": {...}} жібереді,
                                     сол box-ты тыңдап тұрғандардың бәріне msg жетеді.
                                     Екі жақ та 4 секунд сайын «тірімін» белгісін жібереді,
                                     сондықтан үзілген байланыс тез анықталып, қайта қосылады.
       POST /relay/send, GET /relay/events — ескі жол (SSE), WebSocket жоқ болса ғана
       GET  /relay/ping            — сервер бар ма, компьютердің IP-адресі

Интернет керек емес: компьютер мен телефондар бір Wi-Fi желісінде болса жеткілікті.
Іске қосу: start.bat (немесе:  python server.py)
"""
import base64
import hashlib
import json
import os
import queue
import re
import socket
import struct
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get('PORT', '8000'))
ROOT = os.path.dirname(os.path.abspath(__file__))

boxes = {}                 # box атауы → SSE тыңдаушыларының кезектері
ws_boxes = {}              # box атауы → WebSocket клиенттері
lock = threading.Lock()
WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'


class WSClient:
    """Бір WebSocket байланысы. Жазу бөлек ағында жүреді: бір телефон баяуласа да,
    басқаларға хабар кідірмейді."""

    def __init__(self, sock):
        self.sock = sock
        self.q = queue.Queue(maxsize=300)
        self.alive = True
        self.wlock = threading.Lock()
        threading.Thread(target=self._writer, daemon=True).start()

    def push(self, line):
        try:
            self.q.put_nowait(line)
        except queue.Full:                 # оқымай қалған клиент — жабамыз, өзі қайта қосылады
            self.kill()

    def kill(self):
        if not self.alive:
            return
        self.alive = False
        try:
            self.q.put_nowait(None)
        except queue.Full:
            pass
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

    def frame(self, opcode, data):
        n = len(data)
        if n < 126:
            head = struct.pack('!BB', 0x80 | opcode, n)
        elif n < 65536:
            head = struct.pack('!BBH', 0x80 | opcode, 126, n)
        else:
            head = struct.pack('!BBQ', 0x80 | opcode, 127, n)
        with self.wlock:
            self.sock.sendall(head + data)

    def _writer(self):
        while self.alive:
            try:
                line = self.q.get(timeout=4)
            except queue.Empty:
                line = '{"t":"_hb"}'           # «тірімін» белгісі
            if line is None:
                break
            try:
                self.frame(0x1, line.encode('utf-8'))
            except OSError:
                self.kill()


def deliver(box, line):
    with lock:
        subs = list(boxes.get(box, ()))
        clients = list(ws_boxes.get(box, ()))
    for q in subs:
        q.put(line)
    for c in clients:
        c.push(line)
    return len(subs) + len(clients)


def lan_ip():
    """Компьютердің жергілікті желідегі адресі (телефон осыған кіреді)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))       # ешнәрсе жібермейді, тек бағытты анықтайды
        ip = s.getsockname()[0]
        s.close()
        if not ip.startswith(('127.', '169.254.')):
            return ip
    except OSError:
        pass
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not ip.startswith(('127.', '169.254.')):      # 169.254 — желіге қосылмаған адаптер
                return ip
    except OSError:
        pass
    return '127.0.0.1'


wifi_cache = {'at': 0.0, 'name': ''}


def wifi_name():
    """Компьютер қосылған Wi-Fi атауы: оқушыға қай желіге қосылу керегін экранда жазамыз."""
    if sys.platform != 'win32':
        return ''
    if time.time() - wifi_cache['at'] < 5:
        return wifi_cache['name']
    name = ''
    try:
        raw = subprocess.run(['netsh', 'wlan', 'show', 'interfaces'], capture_output=True, timeout=3,
                             creationflags=subprocess.CREATE_NO_WINDOW).stdout
        try:
            text = raw.decode('utf-8')
        except UnicodeDecodeError:
            text = raw.decode('mbcs', 'replace')
        m = re.search(r'^\s*SSID\s*:\s*(.+?)\s*$', text, re.M)
        if m:
            name = m.group(1)
    except Exception:
        pass
    wifi_cache.update(at=time.time(), name=name)
    return name


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'          # байланыс қайта қолданылады — жылдамырақ

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):     # әр сұрауды экранға шығармаймыз
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == '/relay/ping':
            return self._json({'relay': True, 'ws': True, 'host': lan_ip(), 'port': PORT, 'ssid': wifi_name()})
        if u.path == '/relay/ws':
            box = (parse_qs(u.query).get('box') or [''])[0]
            return self._ws(box)
        if u.path == '/relay/events':
            box = (parse_qs(u.query).get('box') or [''])[0]
            return self._events(box)
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != '/relay/send':
            return self._json({'error': 'not found'}, 404)
        try:
            n = int(self.headers.get('Content-Length') or 0)
            data = json.loads(self.rfile.read(n).decode('utf-8'))
            box, msg = str(data['box']), data['msg']
        except Exception:
            return self._json({'error': 'bad request'}, 400)
        n = deliver(box, json.dumps(msg, ensure_ascii=False))
        return self._json({'ok': True, 'to': n})

    # ---------- WebSocket ----------
    def _rx(self, n):
        b = self.rfile.read(n)
        if not b or len(b) < n:
            raise EOFError
        return b

    def _ws_read(self):
        h = self._rx(2)
        fin, op, n = h[0] & 0x80, h[0] & 0x0F, h[1] & 0x7F
        if n == 126:
            n = struct.unpack('!H', self._rx(2))[0]
        elif n == 127:
            n = struct.unpack('!Q', self._rx(8))[0]
        if n > (1 << 20):
            raise EOFError
        mask = self._rx(4) if h[1] & 0x80 else None
        data = self._rx(n) if n else b''
        if mask:
            data = bytes(b ^ mask[i & 3] for i, b in enumerate(data))
        return fin, op, data

    def _ws(self, box):
        key = self.headers.get('Sec-WebSocket-Key')
        if not key or 'websocket' not in (self.headers.get('Upgrade') or '').lower():
            return self._json({'error': 'websocket керек'}, 400)
        accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
        self.send_response(101)
        self.send_header('Upgrade', 'websocket')
        self.send_header('Connection', 'Upgrade')
        self.send_header('Sec-WebSocket-Accept', accept)
        self.end_headers()
        self.wfile.flush()
        sock = self.connection
        try:
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)   # кідіріссіз жіберу
        except OSError:
            pass
        sock.settimeout(30)                 # клиент 4 с сайын белгі береді; 30 с үнсіз — өлі
        cl = WSClient(sock)
        with lock:
            ws_boxes.setdefault(box, set()).add(cl)
        buf = b''
        try:
            while cl.alive:
                fin, op, data = self._ws_read()
                if op == 0x8:                                   # жабу
                    break
                if op == 0x9:                                   # ping → pong
                    cl.frame(0xA, data)
                    continue
                if op not in (0x0, 0x1):
                    continue
                buf = data if op == 0x1 else buf + data
                if not fin:
                    continue
                try:
                    m = json.loads(buf.decode('utf-8'))
                except Exception:
                    continue
                if isinstance(m, dict) and m.get('box') and 'msg' in m:
                    deliver(str(m['box']), json.dumps(m['msg'], ensure_ascii=False))
        except (EOFError, OSError):
            pass
        finally:
            cl.kill()
            with lock:
                st = ws_boxes.get(box)
                if st:
                    st.discard(cl)
                    if not st:
                        ws_boxes.pop(box, None)
            self.close_connection = True

    def _events(self, box):
        q = queue.Queue()
        with lock:
            boxes.setdefault(box, set()).add(q)
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(b': ok\n\n')
            self.wfile.flush()
            while True:
                try:
                    line = q.get(timeout=15)
                    out = ('data: ' + line + '\n\n').encode('utf-8')
                except queue.Empty:
                    out = b': ping\n\n'            # байланыстың тірі екенін тексереміз
                self.wfile.write(out)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        finally:
            with lock:
                s = boxes.get(box)
                if s:
                    s.discard(q)
                    if not s:
                        boxes.pop(box, None)
            self.close_connection = True


def main():
    # Windows консолі қазақ әріптерін (Қ, Ұ, ...) шығара алмай құламасын
    for st in (sys.stdout, sys.stderr):
        try:
            st.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass
    global PORT
    if os.name == 'nt':                    # Windows-та бұл белгі бос емес портқа да қабаттасып қосады
        ThreadingHTTPServer.allow_reuse_address = False
    srv = None
    for p in range(PORT, PORT + 11):       # порт бос болмаса (басқа ойын ашық қалса), келесісін аламыз
        try:
            srv = ThreadingHTTPServer(('0.0.0.0', p), Handler)
            PORT = p
            break
        except OSError:
            pass
    if srv is None:
        print(f'\n  {PORT}–{PORT + 10} порттары бос емес. Ашық тұрған сервер терезелерін жабыңыз.')
        input('  Enter басыңыз...')
        sys.exit(1)
    srv.daemon_threads = True
    url = f'http://127.0.0.1:{PORT}/'      # панель осы адрестен ашылады: желі ауысса да істей береді
    ip, ssid = lan_ip(), wifi_name()
    print()
    print('  ===============================================')
    print('   ФИЗИКА САБАҒЫ — сервер іске қосылды')
    print('  ===============================================')
    print(f'   Панельде:   {url}')
    print(f'   Телефонда:  http://{ip}:{PORT}/index.html?r=...  (QR осыған апарады)')
    print(f'   Телефондар компьютермен БІР Wi-Fi желісінде болсын{": " + ssid if ssid else ""}.')
    print('   Тоқтату үшін осы терезені жабыңыз (немесе Ctrl+C).')
    print()
    if ip == '127.0.0.1':
        print('   ЕСКЕРТУ: компьютер әзірге желіге қосылмаған. Wi-Fi-ға қосылсаңыз, QR өзі жаңарады.')
    if '--no-browser' not in sys.argv:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
