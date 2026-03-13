import sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const dbPath = path.join(process.cwd(), 'agent.db');

const db = new sqlite3.Database(dbPath);

export async function initDb() {
  return new Promise<void>((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        role TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function saveHistory(userId: number, role: string, content: any) {
  return new Promise<void>((resolve, reject) => {
    const stringContent = typeof content === 'string' ? content : JSON.stringify(content);
    db.run(
      'INSERT INTO history (user_id, role, content) VALUES (?, ?, ?)',
      [userId, role, stringContent],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

export async function getHistory(userId: number, limit: number = 20): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT role, content FROM (SELECT * FROM history WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?) ORDER BY timestamp ASC',
      [userId, limit],
      (err, rows: any[]) => {
        if (err) reject(err);
        else {
          const history = rows.map(row => {
            try {
              return { role: row.role, content: JSON.parse(row.content) };
            } catch {
              return { role: row.role, content: row.content };
            }
          });
          resolve(history);
        }
      }
    );
  });
}

export async function clearHistory(userId: number) {
  return new Promise<void>((resolve, reject) => {
    db.run('DELETE FROM history WHERE user_id = ?', [userId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
