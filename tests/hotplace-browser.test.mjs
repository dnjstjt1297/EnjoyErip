// Wonseok HotPlace UX on Mir's canonical local storage. No live keys or API traffic.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const base = process.env.HOTPLACE_BASE_URL || 'http://127.0.0.1:4178';
const server = process.env.HOTPLACE_BASE_URL ? null : spawn('python3', ['-m','http.server','4178','--bind','127.0.0.1'], {stdio:'ignore'});
const results=[], runtimeErrors=[], consoleErrors=[], failedRequests=[], requests=[];
const fixture = Array.from({length:13},(_,i)=>({ contentid:String(800+i),title:`선택할 공원 ${i+1}`,addr1:'서울특별시 종로구 검증 주소',contenttypeid:'12',lDongRegnCd:'11',lDongSignguCd:'110',mapx:'126.98',mapy:'37.57',firstimage:'' }));
const envelope=(items,total=items.length)=>({response:{header:{resultCode:'0000'},body:{items:{item:items},totalCount:total}}});
let browser,page, tourDelay=0;
const records=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('enjoytrip_hotplaces')||'[]'));
async function check(name,action){try{await action();results.push({name,status:'passed'});console.log(`PASS ${name}`);}catch(error){results.push({name,status:'failed',message:error.message});throw error;}}
async function close(id){await page.locator(`#${id} .btn-close`).click();await page.locator(`#${id}`).waitFor({state:'hidden'});await page.waitForFunction(()=>!document.querySelector('.modal-backdrop'));}
async function open(){await page.click('#newHotplace');await page.locator('#hotplaceModal.show').waitFor();await page.waitForFunction(()=>window.__mapTest.maps.some(map=>map.container.id==='pickMap'));}
async function login(id,create=false){await page.evaluate(async({id,create})=>{const a=await import('./js/services/auth-service.js');if(create)await a.registerUser({id,name:id,email:`${id}@example.com`,password:'integration123',passwordConfirm:'integration123'});await a.login(id,'integration123');},{id,create});}
try{
 await mkdir('test-results',{recursive:true});
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await delay(50);}
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'ko-KR'});
 await context.route('**/js/config.js',route=>route.fulfill({contentType:'text/javascript',body:'export const CONFIG={TOUR_API_SERVICE_KEY:"test-key",KAKAO_JAVASCRIPT_KEY:"test-map"};'}));
 await context.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'text/css',body:''}));
 const sdk=await readFile('tests/fixtures/kakao-sdk.js','utf8');
 await context.route('https://dapi.kakao.com/**',route=>route.fulfill({contentType:'text/javascript',body:sdk}));
 await context.route('https://apis.data.go.kr/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname.split('/').pop(),params=Object.fromEntries(url.searchParams);delete params.serviceKey;requests.push({path,params});
  let data;
  if(path==='ldongCode2')data=envelope([{code:'11',name:'서울특별시'},{code:'26',name:'부산광역시'}]);
  else if(path==='detailCommon2')data=envelope([{...fixture[0],overview:'실제 데이터가 아닌 검증용 응답'}]);
  else{if(tourDelay)await delay(tourDelay);const start=(Number(params.pageNo||1)-1)*Number(params.numOfRows||6);data=envelope(fixture.slice(start,start+Number(params.numOfRows||6)),fixture.length);}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await context.route('**/broken-image-test.jpg',route=>route.fulfill({contentType:'image/jpeg',body:'not an image'}));
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>runtimeErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')failedRequests.push(new URL(r.url()).pathname);});page.on('dialog',d=>d.accept());
 await check('01 로그인 보호·목록 중심 HotPlace·독립 위치 선택 지도',async()=>{
  await page.goto(`${base}/hotplace.html`);await page.click('#newHotplace');await page.locator('#loginModal.show').waitFor();await close('loginModal');
  await login('porttraveler',true);await open();
  assert.equal(await page.evaluate(()=>window.__mapTest.maps.length),2);
  assert.deepEqual(await records(),[]);
 });
 await check('02 관광지 키워드·지역·유형 검색·페이지 이동·선택 자동 입력',async()=>{
  await page.selectOption('#hotTourArea','11');await page.selectOption('#hotTourType','12');await page.fill('#hotTourKeyword','공원');await page.click('#hotTourSearch');
  await page.locator('[data-tour-select]').first().waitFor();assert.equal(await page.locator('[data-tour-select]').count(),6);
  const query=requests.filter(r=>r.path==='searchKeyword2').at(-1);assert.equal(query.params.keyword,'공원');assert.equal(query.params.lDongRegnCd,'11');assert.equal(query.params.contentTypeId,'12');
  await page.click('#hotTourNext');await page.waitForFunction(()=>document.querySelector('#hotTourPage').textContent==='2 / 3');
  await page.locator('[data-tour-select]').first().click();assert.equal(await page.inputValue('#placeName'),fixture[6].title);assert.equal(await page.inputValue('#placeAddress'),fixture[6].addr1);assert.equal(Number(await page.inputValue('#placeLat')),37.57);
  assert.match(await page.locator('#hotTourSelectedLabel').innerText(),/선택할 공원 7/);
 });
 await check('03 업로드 압축·사진 미리보기·등록·canonical 저장·새로고침',async()=>{
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1600;c.height=1200;const ctx=c.getContext('2d');ctx.fillStyle='#8ad8cf';ctx.fillRect(0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1];}),'base64');
  await page.setInputFiles('#placePhoto',{name:'memory.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>!document.querySelector('#savePlaceBtn').disabled);
  await page.locator('#imagePreview').scrollIntoViewIfNeeded();await page.locator('#imagePreview img').waitFor();assert.match(await page.locator('#imagePreview img').getAttribute('src'),/^data:image\/jpeg;base64,/);
  await page.waitForFunction(()=>document.querySelector('#imagePreview img')?.naturalWidth===1000);
  await page.fill('#visitDate','2026-01-15');await page.fill('#placeDescription','나만의 발견과 사진 기록');await page.click('#savePlaceBtn');await page.locator('#hotplaceModal').waitFor({state:'hidden'});
  const saved=(await records())[0];assert.equal(saved.ownerId,'porttraveler');assert.equal(saved.date,'2026-01-15');assert.equal(saved.touristPlace.contentid,'806');assert.equal(saved.touristPlace.lDongRegnCd,'11');assert.match(saved.photo,/^data:image\/jpeg/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('enjoytrip.db.v1')),null);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('enjoytrip_visits')||'[]').length),0);
  await page.reload();await page.locator('.hotplace-card img').waitFor();
 });
 await check('04 상세 이야기·지도 핀·수정 진입·방문 모달 중첩 방지',async()=>{
  await page.locator('.hotplace-card [data-action="detail"]').click();await page.locator('#hotplaceDetailModal.show').waitFor();assert.match(await page.locator('#hotDetail').innerText(),/나만의 발견과 사진 기록/);
  await page.locator('#hotDetail .js-visit').click();await page.locator('#hotplaceDetailModal').waitFor({state:'hidden'});await page.locator('#visitModal.show').waitFor();assert.equal(await page.inputValue('#visitRegion'),'11');await close('visitModal');
  await page.locator('.hotplace-card [data-action="map"]').click();assert.equal(await page.locator('.hotplace-card.is-selected').count(),1);
  await page.locator('.hotplace-card [data-action="edit"]').click();await page.locator('#hotplaceModal.show').waitFor();
 });
 await check('05 사진 삭제·URL 실패 fallback·높이 유지·이미지 없는 수정',async()=>{
  // The opening dialog scales from .97 to 1. Measure the settled preview,
  // not an intermediate transformed rectangle during Bootstrap's transition.
  await page.locator('#hotplaceModal .modal-dialog').evaluate(async dialog=>{
    await Promise.all(dialog.getAnimations().map(animation=>animation.finished.catch(()=>{})));
  });
  const before=await page.locator('#imagePreview').evaluate(e=>e.getBoundingClientRect().height);await page.click('#clearPlacePhoto');
  await page.fill('#placeImage',`${base}/broken-image-test.jpg`);await page.locator('#placeImage').blur();await page.locator('#imagePreview .image-placeholder').waitFor();
  assert.equal(await page.locator('#imagePreview').evaluate(e=>e.getBoundingClientRect().height),before);
  await page.fill('#placeImage','');await page.fill('#placeName','수정한 공원 기록');await page.click('#savePlaceBtn');await page.locator('#hotplaceModal').waitFor({state:'hidden'});
  assert.equal((await records())[0].photo,'');assert.equal((await records())[0].imageUrl,'');await page.locator('.hotplace-card .image-placeholder').waitFor();
 });
 await check('06 주소 검색·지도 클릭·직접 입력 장소·데이터 출처 필터',async()=>{
  await open();await page.fill('#placeName','직접 찾은 카페');await page.fill('#placeAddress','서울 주소 변환 성공');await page.click('#findAddress');await page.waitForFunction(()=>document.querySelector('#placeLat').value==='37.5810000');
  await page.evaluate(()=>kakao.maps.event.trigger(window.__mapTest.maps.find(m=>m.container.id==='pickMap'),'click',{latLng:new kakao.maps.LatLng(37.572,126.982)}));assert.equal(Number(await page.inputValue('#placeLat')),37.572);
  await page.selectOption('#placeType','카페');await page.fill('#placeDescription','주소와 지도 클릭으로 만든 기록');await page.click('#savePlaceBtn');await page.locator('#hotplaceModal').waitFor({state:'hidden'});
  assert.equal((await records()).length,2);await page.selectOption('#hotFilter','manual');assert.equal(await page.locator('.hotplace-card').count(),1);assert.match(await page.locator('.hotplace-card').innerText(),/직접 찾은 카페/);await page.selectOption('#hotFilter','all');
 });
 await check('07 늦은 관광지/주소 응답 무시·모달 재진입·계정 변경 보호',async()=>{
  await open();tourDelay=500;await page.fill('#hotTourKeyword','늦은 검색');await page.click('#hotTourSearch');await close('hotplaceModal');tourDelay=0;await open();await delay(600);assert.equal(await page.locator('[data-tour-select]').count(),0);
  await page.evaluate(()=>window.__mapTest.geoDelay=600);await page.fill('#placeAddress','서울 주소 변환 성공');await page.click('#findAddress');await close('hotplaceModal');await open();await delay(700);
  assert.equal(await page.inputValue('#placeLat'),'');assert.equal(await page.locator('#findAddress').isDisabled(),false);
  await page.fill('#placeName','다른 계정으로 넘기면 안 됨');await login('otherport',true);await page.locator('#hotplaceModal').waitFor({state:'hidden'});assert.equal(await page.locator('.hotplace-card').count(),0);assert.equal((await records()).length,2);await login('porttraveler');
  // Reload first: no editor ownership state may be needed to protect a story.
  await page.reload();await page.locator('.hotplace-card').first().waitFor();
  const clearedWhileOpening=await page.evaluate(async()=>{
    const auth=await import('./js/services/auth-service.js');
    const modal=document.getElementById('hotplaceDetailModal');
    window.__detailTransitionAudit={shown:false,closed:false};
    modal.addEventListener('shown.bs.modal',()=>{window.__detailTransitionAudit.shown=true;},{once:true});
    modal.addEventListener('hidden.bs.modal',()=>{window.__detailTransitionAudit.closed=true;},{once:true});
    let switchAccount;
    modal.addEventListener('show.bs.modal',()=>{switchAccount=auth.login('otherport','integration123');},{once:true});
    document.querySelector('.hotplace-card [data-action="detail"]').click();
    await switchAccount;
    return document.getElementById('hotDetail').childElementCount===0;
  });
  assert.ok(clearedWhileOpening,'account switch clears the previous member story immediately');
  await page.waitForFunction(()=>window.__detailTransitionAudit.closed);
  assert.ok(await page.evaluate(()=>window.__detailTransitionAudit.shown),'account switch occurred during the opening transition');
  assert.equal(await page.locator('#hotDetail').innerHTML(),'');
  assert.equal(await page.locator('.hotplace-card').count(),0);assert.equal((await records()).length,2);
  await login('porttraveler');
  await page.locator('.hotplace-card [data-action="detail"]').first().click();
  await page.locator('#hotplaceDetailModal.show').waitFor();
  await page.locator('#hotplaceDetailModal .modal-dialog').evaluate(async dialog=>{
    await Promise.all(dialog.getAnimations().map(animation=>animation.finished.catch(()=>{})));
  });
  // A visit action waits for the story to fade out. A different account must
  // never inherit the captured previous member's place when that fade ends.
  await page.evaluate(async()=>{
    const auth=await import('./js/services/auth-service.js');
    const modal=document.getElementById('hotplaceDetailModal');
    window.__detailVisitAudit={closed:false,visitOpened:false};
    document.getElementById('visitModal').addEventListener('show.bs.modal',()=>{window.__detailVisitAudit.visitOpened=true;},{once:true});
    modal.addEventListener('hidden.bs.modal',()=>{window.__detailVisitAudit.closed=true;},{once:true});
    let switchAccount;
    modal.addEventListener('hide.bs.modal',()=>{switchAccount=auth.login('otherport','integration123');},{once:true});
    document.querySelector('#hotDetail .js-visit').click();
    await switchAccount;
  });
  await page.waitForFunction(()=>window.__detailVisitAudit.closed);
  assert.equal(await page.evaluate(()=>window.__detailVisitAudit.visitOpened),false,'fading story cannot open a visit modal for a different account');
  assert.ok(await page.locator('#visitModal').isHidden());
  assert.equal(await page.locator('#hotDetail').innerHTML(),'');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('enjoytrip_visits')||'[]').length),0);
  await login('porttraveler');
 });
 await check('08 관광지 상세의 HotPlace 딥링크·안전한 사진 형식 제한',async()=>{
  await page.goto(`${base}/hotplace.html?contentId=800`);await page.locator('#hotplaceModal.show').waitFor();await page.waitForFunction(()=>document.querySelector('#placeName').value==='선택할 공원 1');assert.equal(Number(await page.inputValue('#placeLng')),126.98);
  await page.setInputFiles('#placePhoto',{name:'unsafe.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')});await page.waitForFunction(()=>!document.querySelector('#savePlaceBtn').disabled);assert.match(await page.locator('#photoStatus').innerText(),/JPEG|PNG|WebP/);await close('hotplaceModal');
 });
 await check('09 마이페이지 실제 통계·현재 회원 데이터 백업·비밀번호 미포함',async()=>{
  await page.goto(`${base}/mypage.html`);await page.locator('#accountStats').waitFor();assert.match(await page.locator('#accountStats').innerText(),/HotPlace|핫플레이스/);
  const pending=page.waitForEvent('download');await page.click('#exportData');const download=await pending;const data=JSON.parse(await readFile(await download.path(),'utf8'));
  const serialized=JSON.stringify(data);assert.ok(serialized.includes('수정한 공원 기록'));assert.ok(!serialized.includes('otherport'));assert.doesNotMatch(serialized,/passwordHash|passwordSalt|integration123/);
 });
 await check('10 모바일 등록창·전체 페이지 1440/1024/768/390px·삭제 유지',async()=>{
  for(const width of [1440,1024,768,390]){await page.setViewportSize({width,height:900});await page.goto(`${base}/hotplace.html`);await page.locator('.hotplace-card').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await open();assert.ok(await page.locator('#hotplaceModal').evaluate(el=>el.scrollWidth<=innerWidth));await close('hotplaceModal');}
  await page.setViewportSize({width:1440,height:1000});while(await page.locator('.hotplace-card').count())await page.locator('.hotplace-card [data-action="delete"]').first().click();await page.reload();assert.equal((await records()).length,0);
 });
 await check('11 런타임·콘솔·네트워크 오류 0',async()=>{assert.deepEqual(runtimeErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(failedRequests,[]);});
}catch(error){console.error(error.message);process.exitCode=1;await page?.screenshot({path:'test-results/hotplace-failure.png',fullPage:true}).catch(()=>{});}
finally{await writeFile('test-results/hotplace-results.json',JSON.stringify({results,runtimeErrors,consoleErrors,failedRequests},null,2));await browser?.close();server?.kill();}
