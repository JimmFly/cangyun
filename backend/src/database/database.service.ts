import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, PoolConfig } from 'pg';
import type { AppConfig, DatabaseConfig } from '../config/index.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool: Pool | null = null;
  private readonly configService: ConfigService<AppConfig>;

  constructor(configService: ConfigService<AppConfig>) {
    this.configService = configService;
    // 延迟初始化，不在这里创建连接池
  }

  private ensurePool(): Pool {
    if (this.pool) {
      return this.pool;
    }

    const database = this.configService.get<DatabaseConfig>('database');
    if (!database?.url) {
      throw new Error('DATABASE_URL is not configured');
    }

    const config: PoolConfig = {
      connectionString: database.url,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: 20,
    };

    if (database.ssl) {
      config.ssl = {
        rejectUnauthorized: false,
      };
    }

    this.pool = new Pool(config);

    // 添加连接错误处理
    this.pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });

    return this.pool;
  }

  getPool(): Pool {
    return this.ensurePool();
  }

  async getClient(): Promise<PoolClient> {
    const pool = this.ensurePool();
    try {
      return await pool.connect();
    } catch (error) {
      // 如果连接失败，尝试重新创建连接池
      if (this.pool) {
        try {
          await this.pool.end();
        } catch {
          // 忽略关闭错误
        }
        this.pool = null;
      }
      // 重新尝试连接
      return this.ensurePool().connect();
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
