-- 清空知识库表
-- 注意：由于外键约束，先删除 knowledge_chunks，再删除 knowledge_documents
-- 或者直接删除 knowledge_documents（因为有 ON DELETE CASCADE，会自动删除 chunks）

-- 方案 1：直接删除 documents（推荐，因为有 CASCADE）
DELETE FROM knowledge_documents;

-- 方案 2：如果要分别删除（可选）
-- DELETE FROM knowledge_chunks;
-- DELETE FROM knowledge_documents;

-- 验证表已清空
SELECT 
  (SELECT COUNT(*) FROM knowledge_chunks) as chunks_count,
  (SELECT COUNT(*) FROM knowledge_documents) as documents_count;

