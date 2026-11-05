import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSavedBank } from '../src/banking';

test('bank detection preserves leading zeros and requires an exact saved match',()=>{
 const employees=[{account_number:'00001234',bank_name:'Test bank A'}];
 assert.equal(detectSavedBank('00001234',employees),'Test bank A');
 assert.equal(detectSavedBank('1234',employees),'');
 assert.equal(detectSavedBank('00001235',employees),'');
 assert.equal(detectSavedBank('',employees),'');
});
test('conflicting or missing bank details do not produce a detection',()=>{
 const employees=[{account_number:'00001234',bank_name:'Test bank A'},{account_number:'00001234',bank_name:'Test bank B'}];
 assert.equal(detectSavedBank('00001234',employees),'');
 assert.equal(detectSavedBank('00001234',[{account_number:'00001234'}]),'');
 assert.equal(detectSavedBank('00001234',[]),'');
 assert.equal(detectSavedBank('invalid',[{account_number:'invalid',bank_name:'Test bank A'}]),'');
});
