// プロフィールに表示するターミナル風のSVGを生成する
import { mkdir, writeFile } from 'node:fs/promises'

const OUTPUT_DIR = 'dist'
const OUTPUT_FILE = `${OUTPUT_DIR}/terminal.svg`

// 色は dotfiles の .zshrc のプロンプトに合わせる
const COLORS = {
  background: '#0d1117',
  prompt: '#5fd700', // xterm 76番（成功時の ❯）
  command: '#ffffff',
  output: '#c9d1d9',
}

const WIDTH = 600
const PADDING = 24
const FONT_SIZE = 16
const LINE_HEIGHT = 26

// 表示する行。command はプロンプト付きで、output はそのまま表示する
const lines = [
  { type: 'command', text: 'whoami' },
  { type: 'output', text: 'Web Application Engineer (Ruby on Rails / Angular)' },
]

// < や & が含まれてもSVGが壊れないように置き換える
function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderLine(line, index) {
  // y は文字のベースライン（下端）を指すので、1行目は余白と文字の高さだけ下げる
  const y = PADDING + FONT_SIZE + LINE_HEIGHT * index
  const text = escapeXml(line.text)

  if (line.type === 'command') {
    return `<text x="${PADDING}" y="${y}"><tspan fill="${COLORS.prompt}">❯</tspan> <tspan fill="${COLORS.command}">${text}</tspan></text>`
  }
  return `<text x="${PADDING}" y="${y}" fill="${COLORS.output}">${text}</text>`
}

function renderSvg() {
  // 上下の余白をそろえるため、最後の行は行の高さではなく文字の高さで数える
  const height = PADDING * 2 + LINE_HEIGHT * (lines.length - 1) + FONT_SIZE

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: ${FONT_SIZE}px; }
  </style>
  <rect width="${WIDTH}" height="${height}" rx="8" fill="${COLORS.background}" />
  ${lines.map(renderLine).join('\n  ')}
</svg>
`
}

await mkdir(OUTPUT_DIR, { recursive: true })
await writeFile(OUTPUT_FILE, renderSvg())
console.log(`${OUTPUT_FILE} を生成しました`)
