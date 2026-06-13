import mysql from 'mysql2/promise';

export function createDatabasePool(config) {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: config.connectionLimit,
    charset: 'utf8mb4'
  });
}
