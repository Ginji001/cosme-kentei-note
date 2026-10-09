export function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
export function localDate(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function daysUntil(today,exam){return Math.round((Date.parse(exam+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);}
export function activeSchedule(schedule,today){return [...schedule.weeks,...schedule.blocks].filter(x=>x.start<=today&&today<=x.end).concat(schedule.days.filter(x=>x.date===today));}
export function important(p){return p.attempts.filter(a=>a.result==='x').length>=2;}
export function ordered(p){return p.attempts.map((a,i)=>({...a,round:i+1})).sort((a,b)=>a.date.localeCompare(b.date)||a.round-b.round);}
export function stats(attempts){const n=attempts.length,o=attempts.filter(a=>a.result==='o').length,t=attempts.filter(a=>a.result==='t').length;return {n,o,t,x:n-o-t,accuracy:n?(o+t)/n:null,clearRate:n?o/n:null};}

export function addDays(date, count) {
 return new Date(Date.parse(date+'T00:00:00Z')+count*86400000).toISOString().slice(0,10);
}
function periodGroups(schedule) {
 const groups=[];
 for(const item of [...schedule.weeks,...schedule.blocks]) {
  let group=groups.find(g=>g.start===item.start&&g.end===item.end);
  if(!group){group={start:item.start,end:item.end,items:[]};groups.push(group);}
  group.items.push(item);
 }
 return groups;
}
export function startDateStatus(start, exam, schedule) {
 if(!validDate(start))return {error:'正しい学習開始日を入力してください。'};
 if(start>=exam.exam_date)return {error:'学習開始日は試験日より前にしてください。'};
 const firstDay=schedule.days.map(d=>d.date).sort()[0];
 if(daysUntil(start,firstDay)<periodGroups(schedule).length)return {error:'各期間を最低1日確保するため、学習開始日は'+addDays(firstDay,-periodGroups(schedule).length)+'以前にしてください。'};
 return {warning:daysUntil(start,exam.exam_date)<daysUntil(exam.study_start,exam.exam_date)*.5?'期間が短いため1日あたりの量が増えます':''};
}
export function reschedule(schedule, exam, start) {
 const status=startDateStatus(start,exam,schedule);
 if(status.error)throw Error(status.error);
 const result=JSON.parse(JSON.stringify(schedule));
 // Daily tasks keep their distance from exam day. The exam itself is immutable.
 result.days=schedule.days.map(d=>({...d,date:addDays(exam.exam_date,-daysUntil(d.date,exam.exam_date))}));
 const groups=periodGroups(schedule),available=daysUntil(start,result.days.map(d=>d.date).sort()[0]);
 const weights=groups.map(g=>daysUntil(g.start,g.end)+1),total=weights.reduce((a,b)=>a+b,0);
 let remaining=available,cursor=start;
 groups.forEach((group,i)=>{
  // Floor earlier shares; carry all fractional days toward the final periods.
  const length=i===groups.length-1?remaining:Math.max(1,Math.min(Math.floor(available*weights[i]/total),remaining-(groups.length-i-1)));
  const end=addDays(cursor,length-1);
  for(const item of group.items){const copy=[...result.weeks,...result.blocks].find(x=>x.id===item.id);copy.start=cursor;copy.end=end;if(item.sessions!==undefined)copy.sessions=Math.max(1,Math.min(7,Math.round(item.sessions*length/weights[i])));}
  cursor=addDays(end,1);remaining-=length;
 });
 const dates=[result.blocks.find(x=>x.id==='R2')?.start,result.blocks.find(x=>x.id==='M1')?.start,result.days.find(x=>x.target_rate)?.date];
 result.progress_chart_targets=result.progress_chart_targets.map((t,i)=>({...t,date:dates[i]}));
 return result;
}
