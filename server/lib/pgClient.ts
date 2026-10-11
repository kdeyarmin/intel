// A pooled connection with a statement timeout for the duration of `fn`.
// The timeout is reset before the connection goes back to the pool.
export async function withTimeoutClient<T>(pool: any, timeout: string, fn: (client: any) => Promise<T>): Promise<T> {
  if (!/^\d+(ms|s|min)?$/.test(timeout)) throw new Error(`Bad statement timeout: ${timeout}`);
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = '${timeout}'`);
    return await fn(client);
  } finally {
    await client.query("RESET statement_timeout").catch(() => {});
    client.release();
  }
}

/** Postgres "canceling statement due to statement timeout". */
export const isStatementTimeout = (e: any) => e?.code === "57014";
