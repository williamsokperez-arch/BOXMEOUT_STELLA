// Base repository with common CRUD operations
import { PrismaClient } from '@prisma/client';
import { prisma } from '../database/prisma.js';

// ─── Typed Repository Error ───────────────────────────────────────────────────

export type RepositoryErrorCode =
  | 'NOT_FOUND'
  | 'UNIQUE_CONSTRAINT'
  | 'FOREIGN_KEY_CONSTRAINT'
  | 'QUERY_ERROR'
  | 'UNKNOWN';

export class RepositoryError extends Error {
  constructor(
    public readonly code: RepositoryErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

/**
 * Maps a raw Prisma error to a typed RepositoryError.
 * Exported so subclasses can wrap their own domain-specific Prisma calls.
 * Uses duck-typing to avoid importing Prisma error classes directly (Prisma v5 compat).
 */
export function toRepositoryError(modelName: string, err: unknown): RepositoryError {
  // PrismaClientKnownRequestError has a `code` string property
  if (isPrismaKnownError(err)) {
    switch (err.code) {
      case 'P2025': // Record not found
        return new RepositoryError(
          'NOT_FOUND',
          `${modelName} record not found`,
          err
        );
      case 'P2002': // Unique constraint violation
        return new RepositoryError(
          'UNIQUE_CONSTRAINT',
          `${modelName} unique constraint violation`,
          err
        );
      case 'P2003': // Foreign key constraint violation
        return new RepositoryError(
          'FOREIGN_KEY_CONSTRAINT',
          `${modelName} foreign key constraint violation`,
          err
        );
      default:
        return new RepositoryError(
          'QUERY_ERROR',
          `${modelName} query error: ${err.message}`,
          err
        );
    }
  }

  // PrismaClientValidationError / other Prisma errors have a `message` string
  if (err instanceof Error && err.name.startsWith('PrismaClient')) {
    return new RepositoryError(
      'QUERY_ERROR',
      `${modelName} query error: ${err.message}`,
      err
    );
  }

  return new RepositoryError('UNKNOWN', `${modelName} unexpected error`, err);
}

/** Type guard for PrismaClientKnownRequestError (duck-typed). */
function isPrismaKnownError(
  err: unknown
): err is { code: string; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as any).code === 'string' &&
    'message' in err &&
    (err as any).constructor?.name === 'PrismaClientKnownRequestError'
  );
}

// ─── Base Repository ──────────────────────────────────────────────────────────

export abstract class BaseRepository<T> {
  protected prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || prisma;
  }

  /** Return the Prisma model name (e.g. 'user', 'market'). */
  abstract getModelName(): string;

  protected getModel(): any {
    return (this.prisma as any)[this.getModelName()];
  }

  async findById(
    id: string,
    options?: { select?: any; include?: any }
  ): Promise<T | null> {
    try {
      return await this.getModel().findUnique({
        where: { id },
        ...options,
      });
    } catch (error) {
      throw toRepositoryError(this.getModelName(), error);
    }
  }

  async findMany(options?: {
    where?: any;
    select?: any;
    orderBy?: any;
    skip?: number;
    take?: number;
    include?: any;
  }): Promise<T[]> {
    try {
      return await this.getModel().findMany(options);
    } catch (error) {
      throw toRepositoryError(this.getModelName(), error);
    }
  }

  async create(
    data: any,
    options?: { select?: any; include?: any }
  ): Promise<T> {
    try {
      return await this.getModel().create({ data, ...options });
    } catch (error) {
      throw toRepositoryError(this.getModelName(), error);
    }
  }

  async update(
    id: string,
    data: any,
    options?: { select?: any; include?: any }
  ): Promise<T> {
    try {
      return await this.getModel().update({
        where: { id },
        data,
        ...options,
      });
    } catch (error) {
      throw toRepositoryError(this.getModelName(), error);
    }
  }

  async delete(id: string): Promise<T> {
    try {
      return await this.getModel().delete({ where: { id } });
    } catch (error) {
      throw toRepositoryError(this.getModelName(), error);
    }
  }

  async count(where?: any): Promise<number> {
    try {
      return await this.getModel().count({ where });
    } catch (error) {
      throw toRepositoryError(this.getModelName(), error);
    }
  }

  async exists(where: any): Promise<boolean> {
    try {
      const result = await this.getModel().count({ where });
      return result > 0;
    } catch (error) {
      throw toRepositoryError(this.getModelName(), error);
    }
  }
}
