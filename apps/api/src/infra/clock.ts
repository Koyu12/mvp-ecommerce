import { Injectable } from '@nestjs/common';

// Inject Clock instead of calling `new Date()` so tests can move time.
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
