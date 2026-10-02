const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handleTourApi } = require('./tour-api');

const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIR = path.resolve(__dirname, '../../frontend');
const MAX_BODY_SIZE = 100_000;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error('요청 본문이 너무 큽니다.'));
        request.destroy();
      }
    });

    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('JSON 형식이 올바르지 않습니다.'));
      }
    });
    request.on('error', reject);
  });
}

function createReply(message) {
  const normalized = message.toLowerCase();

  if (normalized.includes('일정') || normalized.includes('마감')) {
    return '일정을 확인하고 계시는군요. 마감일, 담당자, 우선순위를 카드로 정리해 보세요.';
  }
  if (normalized.includes('bootstrap') || normalized.includes('반응형')) {
    return 'Bootstrap의 container, row, col 클래스로 먼저 구조를 만들고, 필요한 부분만 CSS로 보완해 보세요.';
  }
  if (normalized.includes('검증') || normalized.includes('폼')) {
    return '폼 제출 시 checkValidity()를 사용하고, 오류 메시지는 각 입력 요소 가까이에 표시하면 좋습니다.';
  }

  return '좋은 질문이에요. 이 데모에서는 키워드 기반 답변을 제공하고 있습니다. 실제 AI API를 연결하려면 backend/src/server.js의 createReply 함수를 교체하세요.';
}

function serveStatic(request, response, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(FRONTEND_DIR, `.${requestedPath}`);

  if (!filePath.startsWith(`${FRONTEND_DIR}${path.sep}`) && filePath !== path.join(FRONTEND_DIR, 'index.html')) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
      return;
    }

    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const { pathname } = url;

  if (await handleTourApi(request, response, url)) return;

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === 'GET' && pathname === '/api/health') {
    sendJson(response, 200, { ok: true, service: 'web-front-pjt-api' });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/chat') {
    try {
      const { message } = await readJson(request);
      const cleanMessage = typeof message === 'string' ? message.trim() : '';

      if (!cleanMessage) {
        sendJson(response, 400, { message: '메시지를 입력해 주세요.' });
        return;
      }

      sendJson(response, 200, { reply: createReply(cleanMessage) });
    } catch (error) {
      sendJson(response, 400, { message: error.message });
    }
    return;
  }

  if (request.method === 'POST' && pathname === '/api/contact') {
    try {
      const { name, email, message } = await readJson(request);
      if (![name, email, message].every((value) => typeof value === 'string' && value.trim())) {
        sendJson(response, 400, { message: '모든 필수 항목을 입력해 주세요.' });
        return;
      }

      // A real application would store this request in a database or send an email.
      console.log(`[contact] ${name} <${email}>: ${message.slice(0, 120)}`);
      sendJson(response, 201, { message: '문의가 접수되었습니다.' });
    } catch (error) {
      sendJson(response, 400, { message: error.message });
    }
    return;
  }

  if (request.method === 'GET') {
    serveStatic(request, response, pathname);
    return;
  }

  sendJson(response, 404, { message: '요청한 API를 찾을 수 없습니다.' });
});

server.listen(PORT, () => {
  console.log(`Web(Front) PJT is running at http://localhost:${PORT}`);
});
