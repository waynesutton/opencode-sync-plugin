import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasSyncPlugin, messageIdentity} from '../src/compatibility.ts';

test('verifies JSONC with URLs, comments, trailing commas and a versioned plugin',()=>{
 assert.equal(hasSyncPlugin(`{
  "$schema":"https://opencode.ai/config.json", // keep the URL
  "plugin":["unrelated", "opencode-sync-plugin@latest",],
 }`),true);
});
test('accepts plain, pinned and tagged packages without matching unrelated names',()=>{
 for(const plugin of ['opencode-sync-plugin','opencode-sync-plugin@0.3.7','opencode-sync-plugin@next']) assert.equal(hasSyncPlugin(JSON.stringify({plugin:[plugin]})),true);
 for(const plugin of ['not-opencode-sync-plugin','opencode-sync-plugin-extra','opencode-sync-plugin@',null,42]) assert.equal(hasSyncPlugin(JSON.stringify({plugin:[plugin]})),false);
});
test('does not treat commented registrations or malformed JSONC as installed',()=>{
 for(const source of ['{/* "plugin":["opencode-sync-plugin"] */}', '{"plugin": "opencode-sync-plugin"}', '{"plugin":["opencode-sync-plugin"],broken}', 'null']) assert.equal(hasSyncPlugin(source),false);
});
test('reads nested metadata and preserves legacy flat fallbacks',()=>{
 assert.deepEqual(messageIdentity({model:{modelID:'claude',providerID:'anthropic'}}),{model:'claude',provider:'anthropic'});
 assert.deepEqual(messageIdentity({modelID:'legacy',providerID:'oauth'}),{model:'legacy',provider:'oauth'});
 assert.deepEqual(messageIdentity({model:{modelID:'nested'},modelID:'old',providerID:'fallback'}),{model:'nested',provider:'fallback'});
 assert.deepEqual(messageIdentity({model:{modelID:42},modelID:'valid'}),{model:'valid',provider:undefined});
 assert.deepEqual(messageIdentity(null),{model:undefined,provider:undefined});
});
