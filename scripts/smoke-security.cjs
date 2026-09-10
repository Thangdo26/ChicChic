// Chạy bản Next production qua HTTP thật. Chỉ nhận DB local dành riêng cho test/restore.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID, randomBytes, scryptSync } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const raw = process.env.CC_SECURITY_SMOKE_DATABASE_URL;
if (!raw) throw new Error('Cần CC_SECURITY_SMOKE_DATABASE_URL; không dùng DATABASE_URL production.');
const url = new URL(raw);
if (!['127.0.0.1','localhost'].includes(url.hostname) || !/^\/(cc_b01_test|cc_security_restore_[0-9]+)$/.test(url.pathname)) throw new Error('Sai DB smoke.');
const db = new PrismaClient({ datasources: { db: { url: raw } } });
const port = 3112;
const base = `http://127.0.0.1:${port}`;
const adminAuth = 'Basic ' + Buffer.from('admin:smoke-admin-test').toString('base64');
const records = [];
const sessionIds = [];
const manifests = JSON.parse(fs.readFileSync('.next/server/server-reference-manifest.json', 'utf8'));
function actionId(name) {
  const pair = Object.entries(manifests.node).find(([, item]) => item.exportedName === name);
  if (!pair) throw new Error(`Không tìm thấy action trong build: ${name}`);
  return pair[0];
}
let server;
let serverOutput = '';
function check(ok, label) {
  if (!ok) throw new Error(`SMOKE_FAILED: ${label}`);
  records.push(label); console.log(`PASS ${label}`);
}
async function read(route, token, redirectTo, extra = {}) {
  const response = await fetch(base + route, { redirect: 'manual', headers: { ...(token ? { Cookie: `chic_session=${token}` } : {}), ...extra } });
  const body = await response.text();
  const redirect = response.headers.get('location') || (body.includes('NEXT_REDIRECT') ? body : '');
  check(!/digest[^0-9]{0,8}[0-9]{5,}/.test(body) && !body.includes('Có gì đó trục trặc'), `runtime ${route}`);
  if (redirectTo) check(redirect.includes(redirectTo), `redirect ${route}`);
  else check(response.status === 200 && !redirect, `HTTP 200 ${route}`);
  return { response, body };
}
async function action(name, input, token, route, origin = base) {
  const response = await fetch(base + route, {
    method: 'POST', redirect: 'manual', headers: {
      ...(route.startsWith('/admin') ? { Authorization: adminAuth } : {}),
      Cookie: `chic_session=${token}`, Origin: origin, 'Next-Action': actionId(name), 'Content-Type': 'text/plain;charset=UTF-8',
    }, body: JSON.stringify(Array.isArray(input) ? input : [input]),
  });
  const text = await response.text();
  let result;
  for (const line of text.split('\n')) {
    try { const object = JSON.parse(line.slice(line.indexOf(':') + 1)); if (typeof object?.ok === 'boolean') result = object; } catch {}
  }
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith('chic_session='));
  return { result, status: response.status, token: cookie ? cookie.slice('chic_session='.length).split(';')[0] : token };
}
async function session(userId) {
  const row = await db.session.create({ data: { userId, token: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 900_000) } });
  sessionIds.push(row.id); return row;
}
async function main() {
  await require('./check-lifecycle-schema.cjs').assertLifecycleSchema(db);
  await require('./check-session-schema.cjs').assertSessionSchema(db);
  await require('./check-catalog-schema.cjs').assertCatalogSchema(db);
  // Fixture tổng hợp chỉ ghi trên DB test local; không dùng tài khoản/cookie production.
  const key = randomUUID(); const password = 'Smoke-password-2026'; const salt = randomBytes(16).toString('hex');
  const owner = await db.user.create({ data: { email: `${key}@example.invalid`, name: 'Parent smoke', passwordHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}` } });
  const farmer = await db.user.create({ data: { email: `w-${key}@example.invalid`, role: 'WORKER' } });
  const farm = await db.farm.create({ data: { name: 'Smoke test', address: 'Test' } });
  const zone = await db.zone.create({ data: { farmId: farm.id, name: 'Test' } });
  const worker = await db.farmWorker.create({ data: { userId: farmer.id, farmId: farm.id, name: 'Test', area: 'Test' } });
  const barn = await db.barn.create({ data: { slug: `smoke-${key}`, label: 'Smoke barn', ownerId: owner.id, workerId: worker.id, zoneId: zone.id } });
  const breed = await db.breed.create({ data: { slug: key, name: 'Test' } });
  const feed = await db.feedingPlan.create({ data: { slug: key, name: 'Test', ratio: 'Test' } });
  const flock = await db.flock.create({ data: { barnId: barn.id, breedId: breed.id, feedingPlanId: feed.id, productLine: 'LAYER', size: 2, stage: 'LAYING', lifecyclePolicy: 'STANDARD' } });
  await db.bird.createMany({ data: [1,2].map((n) => ({ flockId: flock.id, tagCode: `SM-${n}` })) });
  let enrollment;
  const child = await db.childProfile.create({ data: { parentId: owner.id, nickname: 'Bé test', ageBand: 'AGE_5_6', avatarKey: 'ga', status: 'ACTIVE' } });
  const parent = await session(owner.id); const workerSession = await session(farmer.id);
  const adminUser = await db.user.create({ data: { email: `admin-${key}@example.invalid`, role: "ADMIN" } });
  const adminSession = await session(adminUser.id);
  await db.notification.create({ data: { userId: owner.id, kind: 'TASK_NEW', title: 'Thông báo riêng của parent', body: 'Dữ liệu không được trả cho CHILD' } });
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
    windowsHide: true, stdio: ['ignore','pipe','pipe'], env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: raw, DIRECT_URL: raw,
      FAMILY_LEARNING_ENABLED: 'true', LIFECYCLE_WRITES_DISABLED: '1', ADMIN_PASSWORD: 'smoke-admin-test', ADMIN_USER: 'admin' },
  });
  server.stdout.on('data', (v) => { serverOutput += v; }); server.stderr.on('data', (v) => { serverOutput += v; });
  let ready = false;
  for (let n = 0; n < 60; n++) {
    if (server.exitCode !== null) throw new Error('Next dừng trước khi sẵn sàng.');
    try { if ((await fetch(base + '/dang-nhap')).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Next chưa sẵn sàng.');
  const barnPath = `/chuong/${barn.slug}`; const childPath = `/be/${child.id}`;
  const home = await read(barnPath, parent.token);
  check(home.response.headers.get('x-content-type-options') === 'nosniff', 'security header nosniff');
  check(home.response.headers.get('x-frame-options') === 'SAMEORIGIN', 'security header frame');
  await read(`${barnPath}/thu-hoach`, parent.token);
  await read(`/nong-trai/chuong/${barn.slug}`, workerSession.token);
  await read(barnPath, null, '/dang-nhap');
  await read('/gia-dinh', parent.token);
  const joined = await action('nhanLoiMoiGiaDinh', { barnSlug: barn.slug, childId: child.id, xacNhan: true }, parent.token, '/gia-dinh');
  check(joined.result?.ok, 'HTTP Family self-service without admin invitation');
  enrollment = await db.familyEnrollment.findUniqueOrThrow({ where: { barnLiveKey: barn.id } });
  check(enrollment.status === 'ACTIVE' && (await db.flock.findUniqueOrThrow({ where: { id: flock.id } })).lifecyclePolicy === 'FAMILY_RETIRE_ONLY', 'Family enrollment and policy committed');
  const again = await action('nhanLoiMoiGiaDinh', { barnSlug: barn.slug, childId: child.id, xacNhan: true }, parent.token, '/gia-dinh');
  check(again.result?.ok && await db.domainEvent.count({ where: { barnId: barn.id, type: 'FAMILY_ENROLLED' } }) === 1, 'HTTP Family replay does not duplicate event');
  await read(barnPath + '/dan-ga', parent.token);
  await read(barnPath + '/trang-tri', parent.token);
  await read('/nong-trai', workerSession.token);
  await read('/admin', adminSession.token, undefined, { Authorization: adminAuth });
  const catalog = { slug: 'holiday-' + key, name: 'Đèn Tết smoke', svgKey: 'tet-lantern', priceVnd: 45000, stockQty: 2, active: false };
  const added = await action('saveDecorCatalog', catalog, adminSession.token, '/admin');
  check(added.result?.ok, 'HTTP admin creates inactive seasonal item');
  const bird = await db.bird.findFirstOrThrow({ where: { flockId: flock.id } });
  const renamed = await action('renameBird', [barn.slug, bird.id, 'Mơ 🌻'], parent.token, barnPath + '/dan-ga');
  check(renamed.result?.ok && (await db.bird.findUniqueOrThrow({ where: { id: bird.id } })).name === 'Mơ 🌻', 'HTTP owner names correct bird with Unicode');
  await read(childPath, parent.token, '/gia-dinh');
  const invalidOrigin = await action('vaoKhuCuaBe', { childId: child.id }, parent.token, '/gia-dinh', 'https://untrusted.example.invalid');
  check(!invalidOrigin.result?.ok && (await db.session.findUniqueOrThrow({ where: { id: parent.id } })).scope === 'ADULT', 'CSRF origin rejected without scope write');
  const entered = await action('vaoKhuCuaBe', { childId: child.id }, parent.token, '/gia-dinh');
  check(entered.result?.ok && entered.token !== parent.token, 'HTTP enter CHILD rotates cookie');
  const childHome = await read(childPath, entered.token);
  check(!childHome.body.includes('Chợ nông trại'), 'child HTML has no adult navigation');
  check(childHome.body.includes('Góc ngắm gà') && childHome.body.includes('coop-wander') && childHome.body.includes('Dừng một chút'), 'child scene and motion controls render');
  const forbiddenCatalog = await action('saveDecorCatalog', { ...catalog, name: 'Không được đổi', expectedVersion: 0 }, entered.token, '/admin');
  check(forbiddenCatalog.status < 500 && forbiddenCatalog.result?.ok !== true && (await db.decorItem.findUniqueOrThrow({ where: { slug: catalog.slug } })).name === catalog.name, 'CHILD cannot mutate catalog');
  for (const route of ['/cho','/tai-khoan',barnPath,'/gia-dinh/de-xuat']) await read(route, entered.token, childPath,
    { 'x-chic-request-path': childPath, 'x-chic-khu-be': '1' });
  for (const route of ['/api/notifications', '/api/thanh-toan?code=SMOKE']) {
    const response = await fetch(base + route, { headers: { Cookie: `chic_session=${entered.token}` } });
    if (route === '/api/notifications') check(response.status === 200 && (await response.json()).list.length === 0, 'child notifications redacted');
    else check(response.status === 401, `child API denied ${route}`);
  }
  const suggestion = await db.childSuggestion.create({ data: { childId: child.id, parentId: owner.id, enrollmentId: enrollment.id, kind: 'CARE_WISH', optionKey: 'CHO_AN_RAU', expiresAt: new Date(Date.now() + 900_000) } });
  const denied = await action('nhoCoChuLam', { id: suggestion.id }, entered.token, '/gia-dinh/de-xuat');
  check(denied.result?.ok === false && await db.barnTask.count({ where: { barnId: barn.id } }) === 0, 'crafted adult action denied in CHILD');
  const wrong = await action('moCuaRaNgoai', { password: 'wrong' }, entered.token, childPath);
  check(wrong.result?.ok === false, 'wrong exit password denied');
  const exited = await action('moCuaRaNgoai', { password }, entered.token, childPath);
  check(exited.result?.ok && exited.token !== entered.token, 'HTTP exit ADULT rotates cookie');
  await read('/gia-dinh', exited.token);
  check((await db.session.findUniqueOrThrow({ where: { id: parent.id } })).reauthAt === null, 'exit does not grant sensitive reauth');
  const replay = await action('nhoCoChuLam', { id: suggestion.id }, entered.token, '/gia-dinh/de-xuat');
  check(replay.result?.ok === false, 'old CHILD cookie cannot reuse adult scope');
  check(await db.sessionScopeEvent.count({ where: { sessionId: parent.id } }) === 2, 'exactly two scope audit events');
  console.log(JSON.stringify({ passed: true, checks: records.length }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (sessionIds.length) await db.session.deleteMany({ where: { id: { in: sessionIds } } });
  await db.$disconnect();
  if (server) server.kill();
  // Không in raw HTTP/cookie/log runtime. Fixture DB local được giữ cho việc chẩn đoán.
  if (process.env.CC_SECURITY_SMOKE_REPORT) fs.writeFileSync(path.resolve(process.env.CC_SECURITY_SMOKE_REPORT), JSON.stringify({ passed: !process.exitCode, checks: records, runtimeHadError: serverOutput.includes('Error:') }, null, 2));
});
