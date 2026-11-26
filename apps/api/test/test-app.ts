import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule, configureApp } from '../src/app.module';
import { Clock } from '../src/infra/clock';
import { MAIL_TRANSPORT, MailService } from '../src/email/mail';
import { CapturingMailTransport, FakeClock } from './fakes';

export interface TestApp {
  app: INestApplication;
  clock: FakeClock;
  mailbox: CapturingMailTransport;
  mail: MailService;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

// Boots the real AppModule against the Testcontainers started in global-setup.ts,
// with only the outer-boundary providers (clock, mail transport) swapped for fakes.
export async function createTestApp(): Promise<TestApp> {
  const clock = new FakeClock();
  const mailbox = new CapturingMailTransport();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(mailbox)
    .compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  return {
    app,
    clock,
    mailbox,
    mail: app.get(MailService),
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}
