#!/usr/bin/env tsx
/**
 * 清空知识库表脚本
 * 使用方法: pnpm tsx scripts/clear-knowledge-tables.ts
 */

import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

// 加载环境变量
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL 未配置');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

async function clearTables() {
  const client = await pool.connect();
  try {
    console.log('🗑️  开始清空知识库表...');

    // 先获取当前记录数
    const beforeChunks = await client.query(
      'SELECT COUNT(*) as count FROM knowledge_chunks'
    );
    const beforeDocuments = await client.query(
      'SELECT COUNT(*) as count FROM knowledge_documents'
    );

    const chunksCount = parseInt(beforeChunks.rows[0].count, 10);
    const documentsCount = parseInt(beforeDocuments.rows[0].count, 10);

    console.log(`📊 当前记录数:`);
    console.log(`   - knowledge_chunks: ${chunksCount}`);
    console.log(`   - knowledge_documents: ${documentsCount}`);

    if (chunksCount === 0 && documentsCount === 0) {
      console.log('✅ 表已经是空的，无需清理');
      return;
    }

    // 开始事务
    await client.query('BEGIN');

    try {
      // 先删除 chunks（虽然 CASCADE 会自动删除，但为了明确性我们先删除）
      await client.query('DELETE FROM knowledge_chunks');
      console.log('✅ 已清空 knowledge_chunks');

      // 再删除 documents
      await client.query('DELETE FROM knowledge_documents');
      console.log('✅ 已清空 knowledge_documents');

      // 提交事务
      await client.query('COMMIT');

      // 验证
      const afterChunks = await client.query(
        'SELECT COUNT(*) as count FROM knowledge_chunks'
      );
      const afterDocuments = await client.query(
        'SELECT COUNT(*) as count FROM knowledge_documents'
      );

      console.log('\n📊 清理后记录数:');
      console.log(
        `   - knowledge_chunks: ${parseInt(afterChunks.rows[0].count, 10)}`
      );
      console.log(
        `   - knowledge_documents: ${parseInt(afterDocuments.rows[0].count, 10)}`
      );

      console.log('\n✅ 知识库表已成功清空！');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ 清空表时出错:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

clearTables()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
