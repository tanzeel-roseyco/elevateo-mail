import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { atCompletion, fillInvitationPassword, parseInvitation, privateInvitationMetadata } from './invitation.js';

const fixture = { version: 1, link: 'http://app.test/auth/accept?type=invite&token=synthetic-private',
  password: 'synthetic-private-password', actor_id: '00000000-0000-4000-8000-000000000001',
  organization_id: '00000000-0000-4000-8000-000000000002', mailbox_id: '00000000-0000-4000-8000-000000000003' };
test('exact invitation contract accepts only bounded private invite at configured authority', () => {
  assert.deepEqual(parseInvitation(fixture), fixture);
  for (const input of [null, { ...fixture, extra: true }, { ...fixture, version: 2 },
    { ...fixture, actor_id: 'invalid' }, { ...fixture, password: 'short' },
    { ...fixture, link: 'x'.repeat(4097) }])
    assert.throws(() => parseInvitation(input), { message: 'Acceptance invitation unavailable or invalid' });
});
test('malformed foreign userinfo path recovery duplicate type and fragment links fail without secret errors', () => {
  for (const link of ['malformed', 'http://foreign.test/auth/accept?type=invite',
    'http://private@app.test/auth/accept?type=invite', 'https://app.test/auth/accept?type=invite',
    'http://app.test/other?type=invite', 'http://app.test/auth/accept?type=recovery',
    fixture.link + '&type=invite', fixture.link + '&redirect_to=http://foreign.test/',
    'http://app.test/auth/accept?type=invite', fixture.link + '&token=duplicate', fixture.link + '#synthetic-private'])
    assert.throws(() => parseInvitation({ ...fixture, link }),
      { message: 'Acceptance invitation unavailable or invalid' });
});
test('completion checks reveal only boolean and reject query hash foreign and malformed destinations', () => {
  assert.equal(atCompletion('http://app.test/auth/complete'), true);
  for (const url of ['malformed', 'http://foreign.test/auth/complete',
    'http://app.test/auth/complete?private=value', 'http://app.test/auth/complete#private'])
    assert.equal(atCompletion(url), false);
});
test('private metadata rejects foreign owner public reads and group writes', () => {
  assert.equal(privateInvitationMetadata({ uid: 0, mode: 0o440 }, 1000), true);
  assert.equal(privateInvitationMetadata({ uid: 1000, mode: 0o600 }, 1000), true);
  for (const metadata of [{ uid: 1001, mode: 0o600 }, { uid: 0, mode: 0o444 }, { uid: 0, mode: 0o460 }])
    assert.equal(privateInvitationMetadata(metadata, 1000), false);
});
test('password fills actual labels and scrubs browser errors and redirected second destination', async () => {
  const labels: string[] = [];
  let destination = 'http://app.test/auth/complete';
  const page = { url: () => destination, getByLabel: (label: string) => ({ fill: async () => {
    labels.push(label);
  } }) };
  await fillInvitationPassword(page, fixture.password);
  assert.deepEqual(labels, ['New password', 'Confirm password']);
  labels.length = 0;
  const redirected = { ...page, getByLabel: (label: string) => ({ fill: async () => {
    labels.push(label); destination = 'http://foreign.test/';
  } }) };
  await assert.rejects(fillInvitationPassword(redirected, fixture.password), { message: 'Invitation password entry failed' });
  assert.deepEqual(labels, ['New password']);
  destination = 'http://app.test/auth/complete';
  await assert.rejects(fillInvitationPassword({ ...page, getByLabel: () => ({ fill: async () => {
    throw new Error(fixture.password);
  } }) }, fixture.password), { message: 'Invitation password entry failed' });
});
