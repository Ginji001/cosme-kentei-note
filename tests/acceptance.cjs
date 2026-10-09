// Run: PLAYWRIGHT_MODULE_PATH=/path/to/playwright node tests/acceptance.cjs
// Uses an isolated browser profile and a local-only HTTP server; no user records are touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const servedRoot=process.env.TEST_DIST?path.join(root,'dist'):root;
const originalVersion = fs.readFileSync(path.join(root, 'sw.js'), 'utf8').match(/VERSION='([^']+)'/)[1];
let swVersion = originalVersion;
const mime = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = http.createServer((req,res)=>{
 const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const filename = path.resolve(servedRoot, '.' + (pathname==='/'?'/index.html':pathname));
 if(!filename.startsWith(servedRoot+path.sep)){res.writeHead(403);res.end();return;}
 try { let bytes = fs.readFileSync(filename);if(pathname==='/sw.js')bytes=Buffer.from(bytes.toString().replace(`VERSION='${originalVersion}'`,`VERSION='${swVersion}'`));res.writeHead(200, {'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}
 catch {res.writeHead(404);res.end();}
});
const routes=['home','plan','problems','summary','chapters','comparisons','other','mistakes','analysis','mocks','memorize','exam','settings','help'];
const report=[];
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('dialog',d=>d.accept());
 async function go(route){await page.goto(base+'/#'+route);await page.waitForSelector('h1');}
 async function saved(){await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('保存')||document.querySelector('#status')?.textContent.includes('記録'));}
 async function state(){return page.evaluate(async()=>{const store=await import('./js/store.js');return (await store.snapshot()).tables;});}
 async function waitRecord(table,predicate){await page.waitForFunction(async({table,predicate})=>{const store=await import('./js/store.js');return Function('rows','return '+predicate)(await store.all(table));},{table,predicate});}
 async function width(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);}
 await go('home');await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 assert.deepEqual((await page.evaluate(()=>indexedDB.databases())).map(d=>d.name),['public-cosme-study-notebook']);
 assert((await page.locator('main').innerText()).includes('非公式の学習ツール'));assert((await page.locator('main').innerText()).includes('サーバーには送信されません'));
 // First launch uses the isolated public storage key.
 assert(Object.values(await state()).every(rows=>rows.length===0));
 assert.equal(await page.locator('main .card h2').first().innerText(),'使い始める日を決めましょう');
 const defaultStart=await page.evaluate(()=>{const d=new Date();const today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return today<'2026-11-29'?today:'2026-10-11';});
 assert.equal(await page.locator('#home-study-start').inputValue(),defaultStart);
 await page.getByRole('link',{name:'使い方を見る',exact:true}).click();await page.waitForURL('**/#help');await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='使い方');
 await go('plan/W1');await page.locator('[data-check="W1:session:0"]').check();
 await waitRecord('checks',"rows.some(r=>r.id==='W1:session:0'&&r.checked)");
 const beforeStart=await state();
 await go('home');assert.equal(await page.locator('[data-home-study-start]').count(),1);
 await page.locator('#home-study-start').fill('2026-11-01');
 await page.getByRole('button',{name:'この日から始める'}).click();
 await page.waitForFunction(()=>!document.querySelector('main')?.textContent.includes('使い始める日を決めましょう'));
 await waitRecord('notes',"rows.some(r=>r.id==='settings:studyStart'&&r.text==='2026-11-01')");
 assert((await page.locator('.hero').innerText()).includes('開始日 2026-11-01'));
 const afterStart=await state();afterStart.notes=afterStart.notes.filter(r=>r.id!=='settings:studyStart');assert.deepEqual(afterStart,beforeStart);
 await go('plan/W1');assert((await page.locator('main').innerText()).includes('2026-11-01 〜'));
 assert(await page.locator('[data-check="W1:session:0"]').isChecked());
 await go('home');assert.equal(await page.getByRole('heading',{name:'使い始める日を決めましょう'}).count(),0);
 assert(await page.locator('#home-study-editor').isHidden());
 await page.getByRole('button',{name:'変更',exact:true}).click();assert(await page.locator('#home-study-editor').isVisible());
 assert.equal(await page.locator('#home-study-start').inputValue(),'2026-11-01');
 for(const invalid of ['','2026-11-29','2026-11-30','2026-11-18']){
  await page.locator('#home-study-start').fill(invalid);
  assert(await page.locator('#home-study-start').evaluate(e=>!e.validity.valid));
  await page.locator('[data-home-study-start] button[type=submit]').click();
  assert.equal((await state()).notes.find(r=>r.id==='settings:studyStart').text,'2026-11-01');
 }
 await page.locator('#home-study-start').fill('2026-11-05');
 assert((await page.locator('#home-study-start-message').innerText()).includes('期間が短いため'));
 await page.locator('[data-home-study-start] button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#home-study-editor')?.hidden);
 await go('plan/W1');assert((await page.locator('main').innerText()).includes('2026-11-05 〜'));
 await go('settings');assert.equal(await page.locator('#study-start').inputValue(),'2026-11-05');await page.locator('#weekly-hours').fill('7.5');await page.locator('#weekly-hours').dispatchEvent('change');await waitRecord('notes',"rows.some(r=>r.id==='settings:weeklyHours'&&r.text==='7.5')");assert.equal(await page.locator('#weekly-hours').inputValue(),'7.5');await go('home');assert((await page.locator('.hero').innerText()).includes('週7.5時間'));
 await go('settings');await page.locator('#study-start').fill('2026-09-27');await page.locator('#study-start').dispatchEvent('change');
 await waitRecord('notes',"rows.some(r=>r.id==='settings:studyStart'&&r.text==='2026-09-27')");
 await go('home');assert((await page.locator('.hero').innerText()).includes('開始日 2026-09-27'));
 await page.getByRole('button',{name:'変更',exact:true}).click();assert.equal(await page.locator('#home-study-start').inputValue(),'2026-09-27');
 await page.locator('#home-study-start').fill('2026-11-01');await page.getByRole('button',{name:'キャンセル'}).click();
 assert(await page.locator('#home-study-editor').isHidden());assert.equal((await state()).notes.find(r=>r.id==='settings:studyStart').text,'2026-09-27');
 await page.getByRole('button',{name:'変更',exact:true}).click();assert.equal(await page.locator('#home-study-start').inputValue(),'2026-09-27');
 await page.reload();await page.waitForSelector('h1');assert.equal(await page.getByRole('heading',{name:'使い始める日を決めましょう'}).count(),0);
 report.push('初回カード→開始日決定→即再計画・カード非表示、ホーム変更と設定の双方向同期、警告・無効日拒否・キャンセル・既存チェック保持');
 // Before/on/after exam day, without a saved start. These are separate isolated stores.
 const fresh=await browser.newContext({viewport:{width:390,height:844}});const fp=await fresh.newPage();
 fp.on('pageerror',e=>errors.push(e.message));fp.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await fp.goto(base);await fp.waitForSelector('h1');
 for(const date of ['2026-10-11','2026-11-28','2026-11-29','2026-11-30']){
  await fp.evaluate(async date=>{const store=await import('./js/store.js');await store.put('notes',{id:'settings:testDate',text:date});},date);
  await fp.reload();await fp.waitForSelector('#home-study-start');
  assert.equal(await fp.locator('#home-study-start').inputValue(),date<'2026-11-29'?date:'2026-10-11');
  const expectedRemaining=Math.abs(Math.round((Date.parse('2026-11-29T00:00:00Z')-Date.parse(date+'T00:00:00Z'))/86400000));assert.equal(Number((await fp.locator('.hero .days').innerText()).match(/\d+/)[0]),expectedRemaining);
  if(date==='2026-11-29')assert((await fp.locator('main').innerText()).includes('試験当日'));if(date==='2026-11-28')assert((await fp.locator('main').innerText()).includes('直前暗記リスト 2周目'));if(date==='2026-10-11')assert((await fp.locator('main').innerText()).includes('今日のタスク'));
 }
 const planData=JSON.parse(fs.readFileSync(path.join(root,'data/schedule.json')));let cursor='2026-10-11';
 for(;cursor<='2026-11-29';){
  await fp.goto(base+'/#settings');await fp.waitForSelector('#test-date');await fp.locator('#test-date').fill(cursor);await fp.locator('#test-date').dispatchEvent('change');
  await fp.waitForFunction(async date=>(await (await import('./js/store.js')).all('notes')).some(r=>r.id==='settings:testDate'&&r.text===date),cursor);
  await fp.goto(base+'/#home');await fp.waitForSelector('.hero .eyebrow');const mainText=await fp.locator('main').innerText();
  assert((await fp.locator('.hero .eyebrow').innerText()).includes(cursor));const left=Math.round((Date.parse('2026-11-29T00:00:00Z')-Date.parse(cursor+'T00:00:00Z'))/86400000);assert.equal(Number((await fp.locator('.hero .days').innerText()).match(/\d+/)[0]),left);
  const active=[...planData.weeks,...planData.blocks].filter(x=>x.start<=cursor&&cursor<=x.end).concat(planData.days.filter(x=>x.date===cursor));assert(active.length>0);for(const item of active)assert(mainText.includes(item.title||item.task));
  const next=new Date(Date.parse(cursor+'T00:00:00Z')+86400000);cursor=next.toISOString().slice(0,10);
 }
 await fresh.close();report.push('試験期間50日すべてで設定日・残り日数・該当タスクを確認');
 // Both entry points and every help link must reach the named screen.
 await go('home');await page.getByRole('link',{name:'使い方',exact:true}).click();await page.waitForURL('**/#help');await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='使い方');
 await go('other');await page.locator('.card').filter({has:page.getByRole('heading',{name:'使い方',exact:true})}).getByRole('link',{name:'開く'}).click();await page.waitForURL('**/#help');await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='使い方');
 const helpLinks=await page.locator('main a').evaluateAll(links=>links.map(a=>({href:a.getAttribute('href'),label:a.textContent})));
 for(const {href,label} of helpLinks){
  await go('help');assert.equal(await page.locator('nav [aria-current=page]').innerText(),'その他');
  await page.locator(`main a[href="${href}"]`).first().click();await page.waitForURL('**/'+href);await page.waitForFunction(label=>document.querySelector('h1')?.textContent===label,label);
  assert.equal(await page.locator('h1').innerText(),label);
 }
 await go('help');const helpText=await page.locator('main').innerText();const rules=JSON.parse(fs.readFileSync(path.join(root,'data/rules.json')));
 for(const item of rules.symbols)assert(helpText.includes(item.meaning));
 for(const item of rules.miss_types){assert(helpText.includes(item.label));assert(helpText.includes(item.action));}
 report.push(`使い方へのホーム下部・その他の導線と全${helpLinks.length}リンク、rules.jsonの記号・ミス分類を確認`);
 for(const route of routes){await go(route);await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));await width();assert(await page.locator('h1').innerText());}
 assert.deepEqual(errors,[]);report.push('全14画面（詳細展開含む）、390px横スクロールなし、コンソールエラーなし');
 // Start-date persistence, invalid input, warning and unchanged ID checks.
 await go('plan/W1');await page.locator('[data-check="plan:W1"]').check();
 await waitRecord('checks',"rows.some(r=>r.id==='plan:W1'&&r.checked)");
 await go('plan');await page.locator('[data-check="plan:R2"]').check();
 await waitRecord('checks',"rows.some(r=>r.id==='plan:R2'&&r.checked)");
 for(const start of ['2026-09-27','2026-11-01','2026-11-05']){
  await go('settings');await page.locator('#study-start').fill(start);await page.locator('#study-start').dispatchEvent('change');
  await waitRecord('notes',`rows.some(r=>r.id==='settings:studyStart'&&r.text==='${start}')`);
  if(start==='2026-11-05')assert((await page.locator('#study-start-message').innerText()).includes('期間が短いため'));
  await page.reload();await page.waitForSelector('#study-start');assert.equal(await page.locator('#study-start').inputValue(),start);
  await go('home');assert((await page.locator('main').innerText()).includes('開始日 '+start));
  await go('plan');assert(await page.locator('[data-check="plan:W1"]').isChecked());assert(await page.locator('[data-check="plan:R2"]').isChecked());
 }
 await go('settings');for(const invalid of ['2026-11-29','2026-11-30','2026-11-18']){
  await page.locator('#study-start').fill(invalid);await page.locator('#study-start').dispatchEvent('change');
  assert(await page.locator('#study-start').evaluate(e=>!e.validity.valid));
  assert.equal((await state()).notes.find(r=>r.id==='settings:studyStart').text,'2026-11-05');
 }
 await page.locator('[data-study-reset]').click();await waitRecord('notes',"rows.some(r=>r.id==='settings:studyStart'&&r.text==='2026-10-11')");
 report.push('開始日の即保存・再起動・ホーム反映・初期値復元・短期間警告・無効日の保存拒否・週とブロックのチェック保持');
 for(const width of [390,412]){
  await page.setViewportSize({width,height:915});
  for(const route of routes){await go(route);await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);}
 }
 await page.setViewportSize({width:390,height:844});
 report.push('Chromeの390px・412pxで全14画面と詳細展開、横スクロールなし');
 for(const [width,userAgent] of [[390,'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'],[412,'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36']]){
  const mobile=await browser.newContext({viewport:{width,height:915},isMobile:true,hasTouch:true,userAgent});
  const mp=await mobile.newPage();mp.on('pageerror',e=>errors.push(e.message));mp.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  for(const route of routes){await mp.goto(base+'/#'+route);await mp.waitForSelector('h1');await mp.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth),width);}
  await mobile.close();
 }
 report.push('iPhone UA 390px・Android UA 412pxのタッチ/モバイル設定でも全画面表示・横スクロールなし');

 // Calendar arithmetic and visible home task coverage for every study date.
 const schedule=JSON.parse(fs.readFileSync(path.join(root,'data/schedule.json')));
 const days=[];for(let time=Date.parse('2026-10-11');time<=Date.parse('2026-11-29');time+=86400000)days.push(new Date(time).toISOString().slice(0,10));
 for(const date of days){await go('settings');await page.locator('#test-date').fill(date);await page.locator('#test-date').dispatchEvent('change');await waitRecord('notes',`rows.some(r=>r.id==='settings:testDate'&&r.text==='${date}')`);await go('home');const expected=Math.round((Date.parse('2026-11-29')-Date.parse(date))/86400000);assert.equal(await page.locator('.days').innerText(),expected+'日');const active=[...schedule.weeks,...schedule.blocks].filter(x=>x.start<=date&&date<=x.end).concat(schedule.days.filter(x=>x.date===date));assert(active.length);const text=await page.locator('main').innerText();for(const x of active)assert(text.includes(x.title||x.task),date);}
 report.push(`学習期間${days.length}日すべてで今日のタスク・残り日数が正しい`);
 await go('settings');await page.locator('#test-date').fill('2026-10-11');await page.locator('#test-date').dispatchEvent('change');await waitRecord('notes',"rows.some(r=>r.id==='settings:testDate'&&r.text==='2026-10-11')");
 await go('home');await page.locator('[data-check="apply"]').click();await page.waitForFunction(()=>!document.querySelector('[data-check="apply"]'));await page.locator('[data-check="W1:session:0"]').check();await waitRecord('checks',"rows.some(r=>r.id==='W1:session:0'&&r.checked)");await page.reload();await page.waitForSelector('[data-check="W1:session:0"]');assert(await page.locator('[data-check="W1:session:0"]').isChecked());assert.equal(await page.locator('[data-check="apply"]').count(),0);
 // Week table and text persistence.
 await go('plan/W2');await page.locator('[data-note="W2:explain"]').fill('成分の配合目的を説明');await page.locator('[data-note="W2:hours"]').fill('2.5');await page.locator('[data-sheet]').first().fill('グリセリン');await waitRecord('worksheets',"rows.some(r=>r.cells['0:0']==='グリセリン')");await waitRecord('notes',"rows.some(r=>r.id==='W2:explain'&&r.text==='成分の配合目的を説明')");await page.reload();await page.waitForSelector('[data-sheet]');assert.equal(await page.locator('[data-sheet]').first().inputValue(),'グリセリン');
 // The core problem workflow: repeated attempts, !, latest filter, rates, edit, retry.
 await go('problems');const f=page.locator('#problem-form');await f.locator('[name=problemNo]').fill('P.12 No.3');
 for(const [date,result,miss] of [['2026-10-11','x','A'],['2026-10-12','x','B'],['2026-11-03','t','C'],['2026-11-24','o','']]){await f.locator('[name=date]').fill(date);await f.locator('[name=result]').selectOption(result);if(miss)await f.locator('[name=miss]').selectOption(miss);await f.getByRole('button',{name:'記録する',exact:true}).click();await waitRecord('problems',`rows[0]?.attempts.length===${result==='x'?(date.endsWith('11')?1:2):result==='t'?3:4}`);}
 assert((await page.locator('.history').innerText()).includes('10/11 ×（A） → 10/12 ×（B） → 11/03 △（C） → 11/24 ○'));assert((await page.locator('#problem-list .badge').innerText()).includes('！'));assert((await page.locator('#problem-stats').innerText()).includes('50％'));await page.locator('#problem-filter').selectOption('weak');assert.equal(await page.locator('#problem-list article').count(),0);await page.locator('#problem-filter').selectOption('important');assert.equal(await page.locator('#problem-list article').count(),1);await page.reload();await page.waitForSelector('.history');assert((await state()).problems[0].attempts.length===4);
 // Editing a failed attempt recalculates the automatic importance badge.
 await page.locator('#problem-list details summary').click();
 let editAttempt=page.locator('[data-attempt][data-index="1"]');
 await editAttempt.locator('[name=result]').selectOption('o');
 await editAttempt.getByRole('button',{name:'修正を保存'}).click();
 await waitRecord('problems',"rows[0]?.attempts[1].result==='o'");
 assert.equal(await page.locator('#problem-list .badge').count(),0);
 await page.locator('#problem-list details summary').click();
 editAttempt=page.locator('[data-attempt][data-index="1"]');
 await editAttempt.locator('[name=result]').selectOption('x');
 await editAttempt.locator('[name=miss]').selectOption('B');
 await editAttempt.getByRole('button',{name:'修正を保存'}).click();
 await waitRecord('problems',"rows[0]?.attempts[1].result==='x'");
 assert.equal(await page.locator('#problem-list .badge').count(),1);
 await page.getByRole('button',{name:'再挑戦を記録'}).click();
 assert.equal(await page.locator('#problem-form [name=problemNo]').inputValue(),'P.12 No.3');

 await page.getByRole('button',{name:'間違いノートを作る'}).click();await page.waitForURL('**/#mistakes');await page.locator('[name=point]').fill('成分の分類を混同');await page.locator('[name=correct]').fill('公式テキストで確認した分類');await page.getByRole('button',{name:'保存',exact:true}).click();await waitRecord('mistakes',"rows[0]?.correct==='公式テキストで確認した分類'");await page.getByRole('button',{name:'直前暗記へ送る'}).click();await waitRecord('memorize',"rows.length===1");
 report.push('問題履歴・！付与・絞り込み・正答率・間違いノート・暗記への転送を確認');
 // Chapter row, photo compression, explanatory text, dated check.
 await go('chapters');const chapter=page.locator('details.card').first();await chapter.locator('summary').first().click();await chapter.getByRole('button',{name:'キーワード行を追加'}).click();await chapter.locator('[name=keyword]').fill('表皮');await chapter.locator('[name=meaning]').fill('皮膚の外側');await chapter.locator('[name=confusion]').fill('真皮との違い');await chapter.locator('[name=explain]').fill('30秒で説明する');await chapter.getByRole('button',{name:'章まとめを保存'}).click();await chapter.locator('[data-photo]').setInputFiles(path.join(root,'icons/icon-512.png'));await waitRecord('edits',"rows.some(r=>r.id==='chapter:K01'&&r.value.photo?.startsWith('data:image/jpeg'))");await chapter.locator('[data-check="K01:30s"]').check();await waitRecord('checks',"rows.some(r=>r.id==='K01:30s'&&r.date==='2026-10-11')");await page.reload();await page.waitForSelector('[data-chapter]',{state:'attached'});await chapter.locator('summary').first().click();assert.equal(await chapter.locator('[name=keyword]').inputValue(),'表皮');assert(await chapter.locator('img').evaluate(i=>i.complete&&i.naturalWidth===512));
 // Comparison and related problem link.
 await go('comparisons');const comp=page.locator('details.card').first();await comp.locator('summary').first().click();await comp.locator('[name="0:a"]').fill('表皮の分類');await comp.locator('[name="0:b"]').fill('真皮の分類');await comp.locator('[name=related_problems]').fill('P.12 No.3');await comp.locator('[name=explain]').fill('2つの違い');await comp.getByRole('button',{name:'比較を保存'}).click();await waitRecord('edits',"rows.some(r=>r.id==='compare:C01'&&r.value['0:a']==='表皮の分類')");await comp.getByRole('link',{name:'P.12 No.3'}).click();await page.waitForURL('**/#problems/P.12%20No.3');assert.equal(await page.locator('#problem-form [name=problemNo]').inputValue(),'P.12 No.3');
 // User-created analysis starts blank and saves without copied product content.
 await go('analysis');await page.getByRole('button',{name:'分析を新規作成'}).click();await waitRecord('analyses',"rows.length===1");let analysis=page.locator('form[data-analysis]');await analysis.locator('[name=product_name]').fill('自分のローション');await analysis.getByRole('button',{name:'主要成分を追加'}).click();await analysis.locator('[name=ingredient]').last().fill('テスト成分');await analysis.getByRole('button',{name:'分析を保存'}).click();await waitRecord('analyses',"rows[0]?.product_name==='自分のローション'&&rows[0]?.major.length===2");await page.locator('[data-note="analysis:rule:0"]').fill('基本の順序の回答');await waitRecord('notes',"rows.some(r=>r.id==='analysis:rule:0')");
 // Mock rate and accessible chart.
 await go('mocks');const mock=page.locator('form[data-mock=""]');await mock.locator('..').locator('summary').click();await mock.locator('[name=round]').fill('演習1');await mock.locator('[name=score]').fill('48');assert.equal(await mock.locator('[data-mock-rate]').innerText(),'80％');await mock.locator('[name=weakness]').fill('数字');await mock.getByRole('button',{name:'模試記録を保存'}).click();await waitRecord('mocks',"rows.length===1&&rows[0].score===48");assert((await page.locator('svg').getAttribute('aria-label')).includes('80％'));
 // Flashcards and both dated checks.
 await go('memorize');await page.locator('[data-flash=flip]').click();assert((await page.locator('.flash').innerText()).includes('公式テキスト'));await page.locator('[data-memorize-check][data-date="2026-11-27"]').check();await page.locator('[data-memorize-check][data-date="2026-11-28"]').check();await waitRecord('memorize',"rows[0]?.checks.length===2");
 report.push('週表・章の行編集・圧縮写真・比較リンク・成分分析・模試グラフ・暗記2周チェックが保存される');
 // Export actual downloaded file, alter storage, import via file input, assert exact tables including photo.
 await go('settings');await page.locator('#study-start').fill('2026-11-01');await page.locator('#study-start').dispatchEvent('change');await waitRecord('notes',"rows.some(r=>r.id==='settings:studyStart'&&r.text==='2026-11-01')");const before=await state();const downloadPromise=page.waitForEvent('download');await page.locator('[data-export]').click();const download=await downloadPromise;const downloadPath=await download.path();const exported=JSON.parse(fs.readFileSync(downloadPath));assert.deepEqual(exported.tables,before);
 await page.evaluate(async()=>{const store=await import('./js/store.js');await store.clear();});await page.reload();await page.waitForSelector('#import-file');await page.locator('#import-file').setInputFiles(downloadPath);await waitRecord('problems',"rows.length===1&&rows[0].attempts.length===4");assert.deepEqual(await state(),before);
 // Invalid imports are rejected before any store transaction can erase records.
 const validation=await page.evaluate(async()=>{const store=await import('./js/store.js');const original=await store.snapshot();const bad=structuredClone(original);bad.tables.problems[0].attempts[0].result='bad';try{await store.restore(bad);return false;}catch{return JSON.stringify((await store.snapshot()).tables)===JSON.stringify(original.tables);}});assert(validation);
 const invalidCases=await page.evaluate(async()=>{
 const store=await import('./js/store.js');const original=await store.snapshot();
 const changes=[
  b=>b.tables.edits.find(r=>r.id==='chapter:K01').value.rows='invalid',
  b=>b.tables.checks.push(b.tables.checks[0]),
  b=>{b.tables.memorize=Array.from({length:51},(_,i)=>({id:String(i),q:'質問',a:'答え',checks:[]}));}
 ];
 return changes.every(change=>{const bad=structuredClone(original);change(bad);try{store.validateBackup(bad);return false;}catch{return true;}});
});assert(invalidCases);
 report.push('実際にJSONをダウンロード→記録削除→ファイル読み込みで写真を含む全データが完全一致。不正データは変更前に拒否');
 // Genuine browser network blocking, cached reload, every screen, and persistence while offline.
 await context.setOffline(true);for(const route of routes){await go(route);await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));await width();assert(await page.locator('h1').innerText());}
 await go('plan/W2');await page.locator('[data-note="W2:explain"]').fill('オフラインで保存');await waitRecord('notes',"rows.some(r=>r.id==='W2:explain'&&r.text==='オフラインで保存')");await page.reload();await page.waitForSelector('[data-note="W2:explain"]');assert.equal(await page.locator('[data-note="W2:explain"]').inputValue(),'オフラインで保存');await context.setOffline(false);report.push('通信遮断中の再起動・全画面表示・入力保存・再読み込みを確認');
 // Upgrade served worker without changing repository files. Opening the app triggers automatic reload.
 await go('home');const appInfo=await page.evaluate(async()=>({cache:(await caches.keys()),assets:await (await caches.open((await caches.keys()).find(n=>n.startsWith('public-cosme-notebook-v')))).keys().then(r=>r.map(x=>new URL(x.url).pathname))}));assert(appInfo.cache.every(n=>n.startsWith('public-')));assert(appInfo.assets.includes('/data/schedule.json')); await page.evaluate(()=>window.updateTestMarker='old-page');swVersion='test-upgrade';await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});await page.waitForFunction(async()=>!window.updateTestMarker&&(await caches.keys()).includes('public-cosme-notebook-vtest-upgrade'));await page.waitForFunction(async(version)=>!(await caches.keys()).includes('public-cosme-notebook-v'+version),originalVersion);await page.waitForSelector('h1');assert((await state()).problems.length===1);report.push('新しいService Workerの自動切り替え・再読み込み・旧キャッシュ削除・記録保持を確認');
 await go('home');await page.screenshot({path:path.join(root,'tests/home-390.png'),fullPage:true});await go('plan/W2');await page.screenshot({path:path.join(root,'tests/plan-390.png'),fullPage:true});await go('problems');await page.screenshot({path:path.join(root,'tests/problems-390.png'),fullPage:true});
 await page.setViewportSize({width:1280,height:900});for(const route of routes){await go(route);assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=1280);}report.push('Mac相当の1280pxでも全画面表示を確認');assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(root,'tests/results.json'),JSON.stringify({verifiedAt:new Date().toISOString(),browser:'Chromium',viewport:'390×844 / 412×915 / 1280×900',checks:report,consoleErrors:errors},null,2)+'\n');console.log(report.join('\n'));console.log('PASS');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
