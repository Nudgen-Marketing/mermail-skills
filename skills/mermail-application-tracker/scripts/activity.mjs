// Offline timestamp arithmetic only; no mailbox, calendar, persistence or effects.
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value))
    throw new Error('An explicit ISO timestamp with offset is required.');
  const [year,month,day]=value.slice(0,10).split('-').map(Number);
  const date=new Date(0);date.setUTCFullYear(year,month-1,day);date.setUTCHours(0,0,0,0);
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||!Number.isFinite(Date.parse(value)))
    throw new Error('Invalid calendar timestamp.');
  return Date.parse(value);
}

export function activityWindow({timestamps,now,quietDays=14,mode='calendar_days'}) {
  if(!Array.isArray(timestamps)||!timestamps.length||timestamps.length>20)
    throw new Error('Require one to twenty selected source timestamps.');
  if(!Number.isSafeInteger(quietDays)||quietDays<1||quietDays>3650||!['calendar_days','business_days'].includes(mode))
    throw new Error('Require a finite owner-selected quiet window.');
  const current=instant(now),times=timestamps.map(instant);
  if(times.some(t=>t>current))throw new Error('Future activity needs review.');
  const latest=Math.max(...times),elapsedWholeDays=Math.floor((current-latest)/86400000);
  return {latestAt:new Date(latest).toISOString(),elapsedWholeDays,quietDays,mode,
    windowElapsed:mode==='calendar_days'?elapsedWholeDays>=quietDays:null,
    state:mode==='business_days'?'needs_business_calendar':'arithmetic_only',
    authorizesEffect:false};
}
