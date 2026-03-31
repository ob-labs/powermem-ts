export interface InitOptions {
  /** powermem 家目录，默认 ~/.powermem/ */
  homeDir?: string;
  /** 指定 Python 可执行文件路径，默认 python3 → python */
  pythonPath?: string;
  /** 要安装的 powermem 版本，默认 'powermem'（最新版） */
  powermemVersion?: string;
  /** pip install 额外参数 */
  pipArgs?: string[];
  /** 是否输出日志，默认 true */
  verbose?: boolean;
}

export interface MemoryOptions {
  /** 直连已有 server，跳过自动启动 */
  serverUrl?: string;
  /** API Key */
  apiKey?: string;
  /** .env 文件路径，默认 '.env' */
  envFile?: string;
  /** 内部 server 监听端口，默认 19527 */
  port?: number;
  /** 等待 server 就绪的超时时间(ms)，默认 30000 */
  startupTimeout?: number;
  /** init 相关选项，透传给 Memory.init() */
  init?: InitOptions;
}
