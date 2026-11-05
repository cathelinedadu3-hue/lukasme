import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canViewPage, canEditResource, canPostTransaction } from '../src/permissions';

test('missing and unknown memberships grant no screen or mutation access', () => {
  for (const role of [undefined, '', 'admin']) {
    assert.equal(canViewPage(role, 'dashboard'), false);
    assert.equal(canEditResource(role, 'contacts'), false);
    assert.equal(canPostTransaction(role, 'sale'), false);
  }
});
test('staff see sales and registers without finance, payroll or owner tools', () => {
  for (const page of ['sales','inventory','customers','suppliers','settings']) assert.equal(canViewPage('staff', page), true);
  for (const page of ['dashboard','reports','tax','employees','team','activity','backups','cashbook']) assert.equal(canViewPage('staff', page), false);
  for (const kind of ['sale','receipt']) assert.equal(canPostTransaction('staff', kind), true);
  for (const kind of ['purchase','expense','payroll','capital','transfer','payment']) assert.equal(canPostTransaction('staff', kind), false);
  assert.equal(canEditResource('staff','contacts'), true);
  assert.equal(canEditResource('staff','products'), false);
});
test('viewers retain read access without editing or posting controls', () => {
  assert.equal(canViewPage('viewer','reports'), true);
  for (const resource of ['contacts','products','employees','transactions','reminders','members','business','tax_rules','backups']) assert.equal(canEditResource('viewer', resource), false);
  assert.equal(canPostTransaction('viewer','sale'), false);
});
test('team and backup screens and rule/profile changes belong to owners', () => {
  for (const role of ['accountant','viewer','staff']) {
    for (const page of ['team','backups']) assert.equal(canViewPage(role, page), false);
    for (const resource of ['members','business','tax_rules','backups']) assert.equal(canEditResource(role, resource), false);
  }
  for (const page of ['team','backups']) assert.equal(canViewPage('owner', page), true);
  for (const resource of ['members','business','tax_rules','backups']) assert.equal(canEditResource('owner', resource), true);
  assert.equal(canPostTransaction('accountant','payroll'), true);
});
