declare module "better-sqlite3" {
  type BindParameter = string | number | bigint | Buffer | null

  class Statement {
    all(...params: BindParameter[]): unknown[]
    get(...params: BindParameter[]): unknown
    run(...params: BindParameter[]): unknown
  }

  class Database {
    constructor(path: string, options?: { readonly?: boolean })
    pragma(sql: string): unknown
    exec(sql: string): this
    prepare(sql: string): Statement
    transaction<T extends (...args: any[]) => any>(fn: T): T
    close(): void
  }

  export default Database
}
