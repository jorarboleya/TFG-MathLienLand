const https = require('https');
const fs = require('fs');
const path = require('path');

const OID = '0da9435de56e5a7e8865848e4be2d744fb6b46907c94d66925c5a069186d0dbb';
const SIZE = 115648544;
const PCK_PATH = path.join(__dirname, '..', 'game', 'index.pck');

// Skip if already a real file (not a pointer)
if (fs.existsSync(PCK_PATH) && fs.statSync(PCK_PATH).size > 1024 * 1024) {
  console.log('[pck] index.pck already present, skipping download');
  process.exit(0);
}

function post(url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const get = (u) => https.get(u, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) return get(res.headers.location);
      const file = fs.createWriteStream(dest);
      let downloaded = 0;
      res.on('data', chunk => {
        downloaded += chunk.length;
        process.stdout.write(`\r[pck] ${Math.round(downloaded / 1024 / 1024)} MB`);
      });
      res.pipe(file);
      file.on('finish', () => { process.stdout.write('\n'); file.close(resolve); });
    }).on('error', reject);
    get(url);
  });
}

async function main() {
  console.log('[pck] Calling GitHub LFS batch API...');
  const body = JSON.stringify({
    operation: 'download',
    transfers: ['basic'],
    objects: [{ oid: OID, size: SIZE }]
  });

  const headers = {
    'Content-Type': 'application/vnd.git-lfs+json',
    'Accept': 'application/vnd.git-lfs+json',
    'Content-Length': Buffer.byteLength(body)
  };
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;

  const data = await post(
    'https://github.com/jorarboleya/TFG-MathLienLand.git/info/lfs/objects/batch',
    headers,
    body
  );

  const downloadUrl = data.objects[0].actions.download.href;
  console.log('[pck] Downloading index.pck (116 MB)...');
  await download(downloadUrl, PCK_PATH);

  const mb = Math.round(fs.statSync(PCK_PATH).size / 1024 / 1024);
  console.log(`[pck] index.pck downloaded OK (${mb} MB)`);
}

main().catch(err => {
  console.error('[pck] Download failed:', err.message);
  process.exit(1);
});
