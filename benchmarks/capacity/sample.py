import json,sys,time,psutil,statistics
from pathlib import Path
pid=int(sys.argv[1]);rows=[];previous={};last=time.monotonic();root=Path('capacity-results');root.mkdir(exist_ok=True)
while psutil.pid_exists(pid):
 now=time.monotonic();current={};cpu=0;rss=0
 try:processes=[psutil.Process(pid)]+psutil.Process(pid).children(recursive=True)
 except psutil.Error:break
 for process in processes:
  try:
   rss+=process.memory_info().rss;t=process.cpu_times();used=t.user+t.system;current[process.pid]=used
   if process.pid in previous:cpu+=max(0,used-previous[process.pid])
  except psutil.Error:pass
 rows.append({'at':time.time()*1000,'cpuMachinePct':cpu/max(.001,now-last)/psutil.cpu_count()*100 if previous else None,'rssMiB':rss/2**20,'availableMiB':psutil.virtual_memory().available/2**20})
 previous=current;last=now;time.sleep(1)
(root/'resources.json').write_text(json.dumps(rows))
report=json.loads((root/'summary.json').read_text())
for profile in report['profiles']:
 for stage in profile['stages']:
  samples=[r for r in rows if stage.get('steadyStartedAt',float('inf'))<=r['at']<=stage['finishedAt'] and r['cpuMachinePct'] is not None]
  if not samples:continue
  stage['resourceSummary']={'cpuMeanPct':round(statistics.mean(r['cpuMachinePct'] for r in samples),2),'cpuPeakPct':round(max(r['cpuMachinePct'] for r in samples),2),'rssPeakMiB':round(max(r['rssMiB'] for r in samples),2),'availableMinMiB':round(min(r['availableMiB'] for r in samples),2)}
  stage['comfortable']=bool(stage.get('functional') and stage['resourceSummary']['cpuMeanPct']<=85 and stage['resourceSummary']['availableMinMiB']>=1024)
report['criteria']='Functional: 2 acknowledged spins per session, canonical cost/win/balance consistent and complete spin traces. Comfortable: functional plus mean CPU <=85%, >=1 GiB available RAM. Screenshot review remains manual.'
(root/'summary.json').write_text(json.dumps(report,indent=2))
print(json.dumps([{'fps':p['fps'],'stages':[{'sessions':s['sessions'],'functional':s.get('functional'),'comfortable':s.get('comfortable'),'resources':s.get('resourceSummary')} for s in p['stages']]} for p in report['profiles']]))
