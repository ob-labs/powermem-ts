import { Memory } from '../src/index.js';

// 方式 1: 从 .env 环境变量自动创建（需要 EMBEDDING_PROVIDER/API_KEY/MODEL 等配置）
const memory = await Memory.create();

// 方式 2: 显式传入 LangChain 实例
// import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
// const memory = await Memory.create({
//   embeddings: new OpenAIEmbeddings({ model: 'text-embedding-3-small' }),
//   llm: new ChatOpenAI({ model: 'gpt-4o-mini' }),
// });

// 添加记忆（infer=true 默认，LLM 自动提取事实）
const result = await memory.add('用户喜欢咖啡，住在上海，是一名软件工程师', {
  userId: 'user123',
});
console.log('Added:', result.memories);

// 搜索
const hits = await memory.search('用户偏好', { userId: 'user123', limit: 5 });
console.log('Search results:', hits.results);

// 获取单条
if (result.memories[0]) {
  const mem = await memory.get(result.memories[0].memoryId);
  console.log('Get:', mem);
}

// 获取全部
const all = await memory.getAll({ userId: 'user123' });
console.log('Total memories:', all.total);

// 批量添加
await memory.addBatch(
  [{ content: '喜欢喝拿铁' }, { content: '住在浦东' }],
  { userId: 'user123' }
);

// 用完释放
await memory.close();
