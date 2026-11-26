import { ArgumentsHost, Catch, ConflictException, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

// Turns a unique-constraint clash (such as a duplicate SKU) into 409 and a missing record into 404.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaErrorFilter extends BaseExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const fields = [error.meta?.target].flat().join(', ');
    if (error.code === 'P2002') return super.catch(new ConflictException(`${fields || 'value'} already in use`), host);
    if (error.code === 'P2025') return super.catch(new NotFoundException(), host);
    return super.catch(error, host);
  }
}
