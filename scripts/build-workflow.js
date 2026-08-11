#!/usr/bin/env node
/**
 * build-workflow.js — 重新生成专家介绍页架构/工作流图（archify deliver + 菜单中文化）
 *
 * 用法: node scripts/build-workflow.js [architecture|workflow]
 *   默认按 assets/ 下存在的 spec 推断；传参则显式指定类型。
 * 输入: assets/expert-workflow.workflow.json 或 assets/expert-architecture.architecture.json
 * 输出: renderer/expert-workflow.html（渲染 + 中文化后）
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'renderer', 'expert-workflow.html');
const ARCHIFY = process.env.ARCHIFY_HOME || path.join(process.env.USERPROFILE || '', '.workbuddy', 'skills', 'archify');

// 推断类型：显式参数 > assets/ 里存在的 spec
const WF_SPEC = path.join(ROOT, 'assets', 'expert-workflow.workflow.json');
const AR_SPEC = path.join(ROOT, 'assets', 'expert-architecture.architecture.json');
let type = process.argv[2];
if (!type) {
  type = fs.existsSync(AR_SPEC) ? 'architecture' : 'workflow';
}
const SPEC = type === 'architecture' ? AR_SPEC : WF_SPEC;
console.log(`渲染${type}图...`);
execSync(
  `node "${path.join(ARCHIFY, 'bin', 'archify.mjs')}" deliver ${type} "${SPEC}" "${OUT}" --quality showcase --json`,
  { stdio: ['ignore', 'inherit', 'inherit'] }
);

// ===== 2. 菜单中文化 =====
// 可见文本（按钮/菜单项/图例）
const TEXT_MAP = [
  // 工具栏
  ['id="theme-label">Dark<', 'id="theme-label">深色<'],
  ["theme === 'dark' ? 'Dark' : 'Light'", "theme === 'dark' ? '深色' : '浅色'"],
  ['id="preset-label">Style<', 'id="preset-label">风格<'],
  ['id="present-label">Present<', 'id="present-label">演示<'],
  // 视图模式
  ['>PATH</button>', '>路径</button>'],
  ['>MAP</button>', '>全景</button>'],
  ['>LENS</button>', '>聚焦</button>'],
  // 导出菜单
  ['>Share Card <', '>分享卡片 <'],
  ['>Route Share Card <', '>路径分享卡 <'],
  ['>Reach Share Card <', '>可达分享卡 <'],
  ['>Download PNG<', '>下载 PNG<'],
  ['>Download JPEG<', '>下载 JPEG<'],
  ['>Download WebP<', '>下载 WebP<'],
  ['>Download SVG<', '>下载 SVG<'],
  ['>Download WebM<', '>下载 WebM<'],
  // 图例
  ['data-legend-label="User UI"', 'data-legend-label="界面"'],
  ['data-legend-label="Agent logic"', 'data-legend-label="服务逻辑"'],
  ['data-legend-label="External system"', 'data-legend-label="外部输入"'],
  ['>Legend<', '>图例<'],
  // 其他按钮
  ['>Show all<', '>显示全部<'],
  ['>Copy link<', '>复制链接<'],
  ['>Relations<', '>关系<'],
  ['>Find start<', '>找起点<'],
  ['>Clear<', '>清除<'],
  ['>Overview<', '>总览<'],
];

// hover 提示 / aria 属性
const ATTR_MAP = [
  ['Toggle theme (T)', '切换主题 (T)'],
  ['Toggle color theme', '切换颜色主题'],
  ['Choose visual style (S cycles)', '选择视觉风格（S 键循环）'],
  ['Choose visual style', '选择视觉风格'],
  ['Visual style', '视觉风格'],
  ['Presentation stage (F)', '演示模式 (F)'],
  ['Enter presentation stage', '进入演示模式'],
  ['Pause motion', '暂停动效'],
  ['Export diagram (E)', '导出图片 (E)'],
  ['Export diagram', '导出图片'],
  ['"Export"', '"导出图片"'],
  ['Guided diagram views', '导览视图'],
  ['Previous guided view ([)', '上一个视图 ([)'],
  ['Previous guided view', '上一个视图'],
  ['Next guided view (])', '下一个视图 (])'],
  ['Next guided view', '下一个视图'],
  ['Play guided story (P)', '播放导览 (P)'],
  ['Play guided story', '播放导览'],
  ['Story trail', '导览轨迹'],
  ['Story chapters', '导览章节'],
  ['Select a Story Beat to copy its exact link', '选择章节复制链接'],
  ['Show entire diagram', '显示全图'],
  ['Diagram actions', '图表操作'],
  ['Diagram exploration actions', '图表探索操作'],
  ['Close diagram guide', '关闭指南'],
  ['Find any node', '查找节点'],
  ['Trace a directed route', '追踪路径'],
  ['See the whole system', '查看全局'],
  ['Compare semantic kinds', '对比类型'],
  ['Play the guided story', '播放导览'],
  ['Additional keyboard shortcuts', '更多快捷键'],
  ['Close node finder', '关闭查找'],
  ['Focus ', '定位 '],
];

let html = fs.readFileSync(OUT, 'utf8');
let count = 0;
for (const [from, to] of [...TEXT_MAP, ...ATTR_MAP]) {
  if (html.includes(from)) {
    html = html.split(from).join(to);
    count++;
  }
}
fs.writeFileSync(OUT, html, 'utf8');
console.log(`中文化完成：替换 ${count} 处 → ${OUT}`);
