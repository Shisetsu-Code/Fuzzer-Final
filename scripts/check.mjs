import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
for(const root of ['shared','src','runner','scripts','test'])for(const f of await fs.readdir(root,{recursive:true})){if(!/\.(m?js)$/.test(f))continue;const r=spawnSync(process.execPath,['--check',root+'/'+f],{encoding:'utf8'});if(r.status){process.stderr.write(r.stderr);process.exit(r.status);}}
console.log('Syntax checks passed');
