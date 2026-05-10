import { Pool, type QueryResult, type QueryResultRow } from 'pg'

const QUERY_TIMEOUT_MS = 1800

export class DatabaseError extends Error {
  status: number
  details: unknown

  constructor(message: string, status = 503, details?: unknown) {
    super(message)
    this.name = 'DatabaseError'
    this.status = status
    this.details = details
  }
}

let pool: Pool | null = null

function getConnectionString() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new DatabaseError('PostgreSQL connection string is not configured')
  }

  return connectionString
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getConnectionString(),
      max: Number(process.env.POSTGRES_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      query_timeout: QUERY_TIMEOUT_MS,
      ssl: process.env.POSTGRES_SSL === 'disable'
        ? false
        : { rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED === 'true' },
    })
  }

  return pool
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<QueryResult<T>> {
  try {
    return await getPool().query<T>(text, values)
  } catch (error) {
    throw new DatabaseError(
      'Unable to query PostgreSQL. Check the connection string, firewall rules, and database availability.',
      503,
      error instanceof Error ? { message: error.message, code: 'code' in error ? error.code : undefined } : error
    )
  }
}

export function normalizeLikePattern(value: string) {
  return value.replaceAll('%', '\\%').replaceAll('_', '\\_')
}
