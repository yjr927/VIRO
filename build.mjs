import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
const target=path.resolve('dist');
rmSync(target,{recursive:true,force:true}); mkdirSync(target,{recursive:true});
for(const name of readdirSync('website')) {
  if(name.startsWith('.') || name.startsWith('__') || name.endsWith('.md')) continue;
  cpSync(path.join('website',name),path.join(target,name),{recursive:true});
}
if(!existsSync(path.join(target,'index.html'))) throw new Error('Missing homepage');
console.log('Viral static site built successfully.');
