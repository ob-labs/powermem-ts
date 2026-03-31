import { Memory } from '../src/index.js';

// 首次使用：初始化 Python 环境 + 安装 powermem（幂等，重复调用自动跳过）
await Memory.init();

// 创建实例，自动启动内部 powermem-server
const memory = await Memory.create();

// 添加记忆
const result = await memory.add('用户喜欢咖啡', { userId: 'user123' });
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
  [{ content: '喜欢喝拿铁' }, { content: '住在上海' }],
  { userId: 'user123' }
);

// 用完释放（kill server 子进程）
await memory.close();
