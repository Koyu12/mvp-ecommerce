import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TestApp } from './test-app';

describe('MailService', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('sends mail through the capturing transport in tests', async () => {
    await t.mail.send({ to: 'customer@example.com', subject: 'Hello', text: 'Hi there' });

    expect(t.mailbox.sent).toEqual([
      expect.objectContaining({ to: 'customer@example.com', subject: 'Hello', text: 'Hi there' }),
    ]);
  });
});
