#!/usr/bin/env python3
"""Scan verified plugin PHARs for the ten virions investigated in the recovery follow-up.

Reads files without executing target PHP or deserializing PHAR metadata. Downloads
only from the archive's GitHub assets; preserves embedded bytes without unshading.
"""
import argparse
import concurrent.futures
import hashlib
import re
import threading
from urllib.error import HTTPError

from recover_virion_sources import ROOT, read, download as fetch
from recover_phar_sources import recover_files
from publish_artifacts import write_json as save

OUT = ROOT / "archive/virion-recovery"

def download(url, path, expected_sha, expected_size):
    return fetch(url, path, {"sha256": expected_sha, "bytes": expected_size})

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--limit', type=int, default=0)
parser.add_argument('--php', default='php')
parser.add_argument('--workers', type=int, choices=range(1,9), default=4)
parser.add_argument('--snapshot', default=read(ROOT/'data/api/v1/current.json')['snapshot_id'])
args=parser.parse_args()
if args.limit < 0:
    parser.error('--limit must be nonnegative')
PHP=args.php
SNAP=ROOT/'data/snapshots'/args.snapshot
folder=OUT/'embedded' if args.snapshot=='2026-10-14T20-07-25Z' else OUT/'embedded'/args.snapshot;folder.mkdir(parents=True,exist_ok=True)
state_path=folder/'scan.json';states=read(state_path) if state_path.exists() else {}
rows=read(SNAP/'releases.json');downloads=read(SNAP/'downloads-plugins.json');halt=threading.Event()
needles={
 'singletontrait':[b'blugin\\traits\\singleton',b'blugin\\lib\\traits\\singleton'],
 'stringutils':[b'blugin\\utils\\string',b'blugin\\utils\\stringutils'],
 'arrayutils':[b'blugin\\utils\\arrays',b'blugin\\utils\\array'],
 'vosaka':[b'venndev\\vosaka',b'vosaka-php/vosaka'],
 'map':[b'zetnex\\map',b'zetnex/map'],
 'telegrambotapi':[b'xeonch\\telegramapi',b'jasson44/telegrambotapi'],
 'commandarguments':[b'tobias14\\commandarguments',b'tobias-2006/commandarguments'],
 'replaylib':[b'exnthr\\replaylib',b'kenzeve/replaylib'],
 'pmforms':[b'dktapps\\pmforms',b'stephen-mc-pl/pmforms-pm4'],
 'krul':[b'inkohx\\krul',b'inkohx/krul'],
}
preferred=['blugin/','presentkim','jasson44','tobias','venndev','kenzeve','inkohx','stephen']
rows.sort(key=lambda r:(not any(t in r['repo_name'].lower() for t in preferred),r['name'], -int(r['id'])))
todo=[r for r in rows if states.get(str(r['id']), {}).get('status') != 'scanned']
if args.limit:todo=todo[:args.limit]

def scan(row):
 key=str(row['id']);state=downloads[key]
 if halt.is_set():return key,None
 path=OUT/'plugin-phars'/(key+'.phar')
 try:
  if state.get('status') != 'uploaded' or not state['remote_url'].startswith('https://github.com/poggit-archive/artifacts/releases/download/'):
   raise ValueError('Requires a verified archive asset')
  download(state['remote_url'],path,state['sha256'],state['bytes'])
  files=recover_files(path,PHP)
 except HTTPError as e:
  if e.code in [403,429]:halt.set();raise RuntimeError('CDN access/rate limit; scan stopped') from e
  return key,{'status':'error','http_status':e.code}
 matches={};metadata=[]
 for name,data in files:
  text=(name.encode()+b'\n'+data).lower().replace(b'\\\\',b'\\').replace(b'/',b'\\')
  targets=[target for target,patterns in needles.items() if any(n.replace(b'/',b'\\') in text for n in patterns)]
  if targets:
   namespaces=[x.decode('utf8','replace') for x in re.findall(rb'\bnamespace\s+([^;{]+)',data)][:5]
   target_path=folder/'matches'/key/name;target_path.parent.mkdir(parents=True,exist_ok=True);target_path.write_bytes(data)
   for target in targets:matches.setdefault(target,[]).append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'namespaces':namespaces})
  if name.lower().endswith(('.poggit','virions.json','virion.yml','composer.lock','composer.json')) or 'virion' in name.lower() and name.endswith(('.json','.yml')):
   metadata.append({'path':name,'content':data.decode('utf8','replace')[:30000]})
 return key,{'status':'scanned','name':row['name'],'version':row['version'],'repo_name':row['repo_name'],'original_phar_url':state['remote_url'],'original_phar_sha256':state['sha256'],'original_phar_bytes':state['bytes'],'file_count':len(files),'matches':matches,'metadata':metadata if matches else []}

completed=0
with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
 pending={};iterator=iter(todo)
 for _ in range(min(args.workers,len(todo))):
  row=next(iterator);pending[pool.submit(scan,row)]=row
 while pending:
  done,_=concurrent.futures.wait(pending,return_when=concurrent.futures.FIRST_COMPLETED)
  for future in done:
   row=pending.pop(future)
   try:key,result=future.result()
   except Exception:
    halt.set();save(state_path,states);raise
   if result:
    states[key]=result;completed+=1
    if result.get('matches'):print('MATCH',key,row['name'],','.join(result['matches']),flush=True)
    if completed%25==0:save(state_path,states);print('SCANNED',len(states),'/',len(rows),flush=True)
   if not halt.is_set():
    next_row=next(iterator,None)
    if next_row:pending[pool.submit(scan,next_row)]=next_row
save(state_path,states);print('FINISHED',len(states),flush=True)
