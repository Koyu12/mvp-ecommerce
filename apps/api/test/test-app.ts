import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule, configureApp } from '../src/app.module';
import { Clock } from '../src/infra/clock';
import { MAIL_TRANSPORT, MailService } from '../src/email/mail';
import { Presigner } from '../src/media/presigner';
import { PaymentGateway } from '../src/payments/payment-gateway';
import { CapturingMailTransport, FakeClock, FakePaymentGateway, FakePresigner } from './fakes';

export interface TestApp {
  app: INestApplication;
  clock: FakeClock;
  mailbox: CapturingMailTransport;
  presigner: FakePresigner;
  payments: FakePaymentGateway;
  mail: MailService;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

// Boots the real AppModule against the Testcontainers started in global-setup.ts,
// with only the outer-boundary providers (clock, mail transport, storage presigner, payment gateway) swapped for fakes.
export async function createTestApp(): Promise<TestApp> {
  const clock = new FakeClock();
  const mailbox = new CapturingMailTransport();
  const presigner = new FakePresigner();
  const payments = new FakePaymentGateway();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(mailbox)
    .overrideProvider(Presigner)
    .useValue(presigner)
    .overrideProvider(PaymentGateway)
    .useValue(payments)
    .compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  return {
    app,
    clock,
    mailbox,
    presigner,
    payments,
    mail: app.get(MailService),
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}
