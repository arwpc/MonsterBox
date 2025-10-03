import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

function listJs(dir){
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJs(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function isTestOrTool(p){
  return /tests\/|scripts\/self-improvement\//.test(p);
}

describe('ESM hygiene: avoid require() in ESM modules', function(){
  it('No require() calls in files that use ESM import', function(){
    const offenders = [];
    for (const file of listJs(ROOT)){
      if (isTestOrTool(file)) continue;
      const src = fs.readFileSync(file, 'utf8');
      const stripped = src.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, ''); // remove string literals
      if (/\bimport\s+[^;]+from\s+['"][^'"]+['"];?/.test(stripped)){
        if (stripped.match(/\brequire\s*\(/) && !stripped.includes('createRequire(')){
          offenders.push(file);
        }
      }
    }
    assert.deepEqual(offenders, [], `Found require() in ESM modules: ${offenders.join(', ')}`);
  });
});

