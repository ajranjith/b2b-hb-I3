import type { Context } from 'hono';

export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function successResponse<T>(data: T, meta?: Partial<PaginationMeta>): SuccessResponse<T> {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };

  if (meta) {
    response.meta = {
      ...meta,
      totalPages: meta.total && meta.limit ? Math.ceil(meta.total / meta.limit) : undefined,
    };
  }

  return response;
}

export function paginatedResponse<T>(
  c: Context,
  data: T[],
  total: number,
  page: number = 1,
  limit: number = 10
) {
  return c.json(
    successResponse(data, {
      page,
      limit,
      total,
    })
  );
}
