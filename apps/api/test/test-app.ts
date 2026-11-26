import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule, configureApp } from '../src/app.module';
import { Clock } from '../src/infra/clock';
import { MAIL_TRANSPORT, MailService } from '../src/email/mail';
import { Presigner } from '../src/media/presigner';
import { CapturingMailTransport, FakeClock, FakePresigner } from './fakes';

export interface TestApp {
  app: INestApplication;
  clock: FakeClock;
  mailbox: CapturingMailTransport;
  presigner: FakePresigner;
  mail: MailService;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

// Boots the real AppModule against the Testcontainers started in global-setup.ts,
// with only the outer-boundary providers (clock, mail transport, storage presigner) swapped for fakes.
export async function createTestApp(): Promise<TestApp> {
  const clock = new FakeClock();
  const mailbox = new CapturingMailTransport();
  const presigner = new FakePresigner();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(mailbox)
    .overrideProvider(Presigner)
    .useValue(presigner)
    .compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  return {
    app,
    clock,
    mailbox,
    presigner,
    mail: app.get(MailService),
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}
