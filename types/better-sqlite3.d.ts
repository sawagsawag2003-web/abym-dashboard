declare module "better-sqlite3" {
  type BindParameter = string | number | bigint | Buffer | null

  class Statement {
    all(...params: BindParameter[]): unknown[]
    get(...params: BindParameter[]): unknown
    run(...params: BindParameter[]): unknown
  }

  class Database {
    constructor(path: string, options?: { readonly?: boolean })
    prepare(sql: string): Statement
    close(): void
  }

  export default Database
}
