import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';

test('session idle sends directory and nested model metadata using synthetic local files',async()=>{
 const {OpenCodeSyncPlugin}=await import('../dist/index.js');
 const root=join(homedir(),'.local','share','opencode','storage');
 const files=new Map([
  [join(homedir(),'.opensync','credentials.json'),JSON.stringify({convexUrl:'https://fixture.convex.cloud',apiKey:'test-only'})],
  [join(root,'session','project','fixture-session.json'),JSON.stringify({title:'Fixture',directory:'/fixture/project'})],
  [join(root,'message','fixture-session','message.json'),JSON.stringify({model:{modelID:'nested-model',providerID:'nested-provider'},tokens:{input:20,output:5}})],
 ]);
 const exists=mock.method(fs,'existsSync',(path:unknown)=>files.has(String(path))||String(path)===join(root,'session')||String(path)===join(root,'message','fixture-session'));
 const read=mock.method(fs,'readFileSync',(path:unknown)=>{const value=files.get(String(path));if(value===undefined)throw new Error('Unexpected file read');return value;});
 const dirs=mock.method(fs,'readdirSync',(path:unknown)=>String(path)===join(root,'session')?[{name:'project',isDirectory:()=>true}]:['message.json']);
 const fetchMock=mock.method(globalThis,'fetch',async()=>new Response('{}'));
 mock.timers.enable({apis:['setTimeout']});syncBuiltinESMExports();
 try{
  const hooks=await OpenCodeSyncPlugin({} as never);
  await hooks.event!({event:{type:'session.idle',properties:{id:'fixture-session'}}} as never);
  mock.timers.tick(1000);
  assert.equal(fetchMock.mock.calls.length,1);
  const call=fetchMock.mock.calls[0].arguments as unknown as [string,RequestInit];
  assert.equal(call[0],'https://fixture.convex.site/sync/session');
  const body=JSON.parse(String(call[1].body));
  assert.equal(body.projectPath,'/fixture/project');assert.equal(body.model,'nested-model');assert.equal(body.provider,'nested-provider');assert.equal(body.title,'Fixture');
 }finally{exists.mock.restore();read.mock.restore();dirs.mock.restore();fetchMock.mock.restore();mock.timers.reset();syncBuiltinESMExports();}
});
