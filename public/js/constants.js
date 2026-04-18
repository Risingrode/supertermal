/**
 * Constants for the Super Terminal Frontend
 */

window.WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
window.RENDER_DEBOUNCE = 100;

window.SLASH_COMMANDS = [
  { cmd: '/clear', desc: '清除当前会话' },
  { cmd: '/model', desc: '查看/切换模型' },
  { cmd: '/mode', desc: '查看/切换权限模式' },
  { cmd: '/cost', desc: '查看会话费用' },
  { cmd: '/compact', desc: '压缩上下文' },
  { cmd: '/init', desc: '生成/更新 Agent 指南文件' },
  { cmd: '/github', desc: 'GitHub 操作（读取开发者配置后执行）' },
  { cmd: '/ssh', desc: 'SSH 远程操作（读取开发者配置后执行）' },
  { cmd: '/help', desc: '显示帮助' },
];

window.MODE_LABELS = {
  default: '默认',
  plan: 'Plan',
  yolo: 'YOLO',
};

window.AGENT_LABELS = {
  claude: 'Claude',
  codex: 'Codex',
};

window.DEFAULT_AGENT = 'claude';
window.SESSION_CACHE_LIMIT = 4;
window.SESSION_CACHE_MAX_WEIGHT = 1_500_000;
window.SIDEBAR_SWIPE_TRIGGER = 72;
window.SIDEBAR_SWIPE_MAX_VERTICAL_DRIFT = 42;

window.MODEL_OPTIONS = [
  { value: 'opus', label: 'Opus', desc: '最强大，1M 上下文' },
  { value: 'sonnet', label: 'Sonnet', desc: '平衡性能，1M 上下文' },
  { value: 'haiku', label: 'Haiku', desc: '最快速，适合简单任务' },
];

window.DEFAULT_CODEX_MODEL_OPTIONS = [
  { value: 'gpt-5.4', label: 'GPT-5.4', desc: '当前主力 Codex 模型' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', desc: '偏工程执行场景' },
  { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex', desc: '兼容旧路由与旧配置' },
  { value: 'gpt-5.2', label: 'GPT-5.2', desc: '通用 OpenAI 兼容模型' },
];

window.MODE_PICKER_OPTIONS = [
  { value: 'yolo', label: 'YOLO', desc: '跳过所有权限检查' },
  { value: 'plan', label: 'Plan', desc: '执行前需确认计划' },
  { value: 'default', label: '默认', desc: '标准权限审批' },
];

window.THEME_OPTIONS = [
  {
    value: 'dark',
    label: 'Midnight Core',
    desc: '保留的主黑色主题，偏深夜工程台风格。',
    swatches: ['#1a1b26', '#16161e', '#7aa2f7', '#9ece6a'],
  },
  {
    value: 'okx',
    label: 'Carbon Ledger',
    desc: 'OKX 风格的冷黑高对比工作台，强调纯白与秩序感。',
    swatches: ['#0b0b0c', '#141416', '#ffffff', '#8b8b93'],
  },
  {
    value: 'binance',
    label: 'Signal Market',
    desc: '币安风格的深炭底色与交易黄强调，更偏盘面工具感。',
    swatches: ['#181a20', '#1f2229', '#f0b90b', '#f8d66d'],
  },
  {
    value: 'flomo',
    label: 'Soft Memo',
    desc: 'flomo 风格的轻纸感和高可读暖调，像便签墙一样轻盈。',
    swatches: ['#fbf6e9', '#f5edd6', '#ff6b57', '#2f7f68'],
  },
  {
    value: 'github',
    label: 'Repository Day',
    desc: 'GitHub 白色主题取向，干净、克制、适合长时间查看。',
    swatches: ['#ffffff', '#f6f8fa', '#0969da', '#24292f'],
  },
];
