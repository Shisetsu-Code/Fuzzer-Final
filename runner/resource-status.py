"""Publish numeric runner health only. Never read/upload browser evidence or secrets."""
import json,os,sys,time,urllib.request,psutil
pid=int(sys.argv[1]);previous={};last=time.monotonic();last_post=0;check_id=None
base='https://api.github.com/repos/'+os.environ['GITHUB_REPOSITORY']+'/check-runs'
def send(url,data,method='POST'):
 request=urllib.request.Request(url,data=json.dumps(data).encode(),method=method,headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'})
 with urllib.request.urlopen(request,timeout=10) as response:return json.load(response)
try:
 check_id=send(base,{'name':'MCP runner resources','head_sha':os.environ['GITHUB_SHA'],'status':'in_progress','external_id':os.environ['GITHUB_RUN_ID'],'output':{'title':'Starting browser worker','summary':'Resource telemetry only; no session payloads.'}})['id']
 while psutil.pid_exists(pid):
  now=time.monotonic();current={};cpu=0;rss=0;renderers=0
  try:processes=[psutil.Process(pid)]+psutil.Process(pid).children(recursive=True)
  except psutil.Error:break
  for process in processes:
   try:
    rss+=process.memory_info().rss;t=process.cpu_times();used=t.user+t.system;current[process.pid]=used
    if process.pid in previous:cpu+=max(0,used-previous[process.pid])
    if '--type=renderer' in process.cmdline():renderers+=1
   except psutil.Error:pass
  sample={'runId':os.environ['GITHUB_RUN_ID'],'at':int(time.time()*1000),'cpuPct':round(cpu/max(.001,now-last)/psutil.cpu_count()*100,2),'rssMiB':round(rss/2**20,1),'availableMiB':round(psutil.virtual_memory().available/2**20,1),'rendererProcesses':renderers,'slotLimit':8,'frameSettings':'unchanged'}
  if previous and now-last_post>=15:
   send(base+'/'+str(check_id),{'output':{'title':'Browser worker resources','summary':'```json\n'+json.dumps(sample)+'\n```'}},'PATCH');last_post=now
  previous=current;last=now;time.sleep(1)
except Exception as error:print('Resource telemetry unavailable: '+type(error).__name__,flush=True)
finally:
 if check_id:
  try:send(base+'/'+str(check_id),{'status':'completed','conclusion':'neutral','output':{'title':'Resource sampling stopped','summary':'The worker stopped or the sampling connection ended. Check workflow status before assuming availability.'}},'PATCH')
  except Exception:pass
