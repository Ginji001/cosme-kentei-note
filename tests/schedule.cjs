const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const domain=await import('data:text/javascript;base64,'+fs.readFileSync('js/domain.js').toString('base64'));
 const schedule=JSON.parse(fs.readFileSync('data/schedule.json')),exam=JSON.parse(fs.readFileSync('data/exam.json'));
 const original=JSON.stringify(schedule);
 for(const start of [exam.study_start,domain.addDays(exam.study_start,-14),domain.addDays(exam.study_start,21)]){
  const result=domain.reschedule(schedule,exam,start);
  const groups=[...result.weeks,result.blocks[0]];
  assert.equal(groups[0].start,start);
  for(let i=0;i<groups.length;i++){
   assert(groups[i].start<=groups[i].end);
   assert.equal(domain.addDays(groups[i].end,1),groups[i+1]?.start||result.days[0].date);
   if(groups[i].sessions){const old=schedule.weeks[i];assert.equal(groups[i].sessions,Math.max(1,Math.min(7,Math.round(old.sessions*(domain.daysUntil(groups[i].start,groups[i].end)+1)/(domain.daysUntil(old.start,old.end)+1)))));}
  }
  assert.equal(result.blocks[0].start,result.blocks[1].start);assert.equal(result.blocks[0].end,result.blocks[1].end);
  result.days.forEach((d,i)=>assert.equal(domain.daysUntil(d.date,exam.exam_date),domain.daysUntil(schedule.days[i].date,exam.exam_date)));
  assert.deepEqual(result.weeks.map(w=>w.id),schedule.weeks.map(w=>w.id));
  if(start===exam.study_start)assert.deepEqual(result.weeks,schedule.weeks);
  assert.equal(result.progress_chart_targets[0].date,result.blocks[0].start);
  for(let d=start;d<=exam.exam_date;d=domain.addDays(d,1))assert(domain.activeSchedule(result,d).length);
 }
 assert.equal(JSON.stringify(schedule),original);
 for(const d of ['2026-11-29','2026-11-30','2026-02-30',''])assert(domain.startDateStatus(d,exam,schedule).error);
 assert(domain.startDateStatus('2026-11-05',exam,schedule).warning);
 assert(!domain.startDateStatus('2026-11-04',exam,schedule).warning);
 assert(domain.startDateStatus('2026-11-18',exam,schedule).error);
 console.log('PASS: 3開始日、連続期間、並行ブロック、固定日別、sessions、日付入力・警告・元JSON保持');
})().catch(e=>{console.error(e);process.exitCode=1;});
