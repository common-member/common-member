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

// 実行環境のタイムゾーン（GitHub Actions は UTC）に関係なく、日本時間の日付にする
function formatDate(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map(({ type, value }) => [type, value])
  )
  return `${parts.year}-${parts.month}-${parts.day} (${parts.weekday})`
}

// 表示する行。command は打ち込むように表示し、output はその後にそのまま表示する
const lines = [
  { type: 'command', text: 'whoami' },
  { type: 'output', text: 'Web Application Engineer (Ruby on Rails / Angular)' },
  { type: 'command', text: 'date' },
  { type: 'output', text: formatDate(new Date()) },
]

// < や & が含まれてもSVGが壊れないように置き換える
function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// 等幅フォントの1文字分の幅（フォントによって多少ずれるので目安）
const CHAR_WIDTH = FONT_SIZE * 0.6
// コマンドは「❯ 」の2文字分だけ右から始める
const COMMAND_X = PADDING + CHAR_WIDTH * 2

// アニメーションの時間（秒）
const TIMING = {
  start: 0.5, // 表示されてから最初のコマンドを打ち始めるまで
  perChar: 0.08, // 1文字を打つ時間
  afterCommand: 0.3, // コマンドを打ち終えてから結果が出るまで
  afterOutput: 0.4, // 結果が出てから次のコマンドを打ち始めるまで
}

function lineY(index) {
  // y は文字のベースライン（下端）を指すので、1行目は余白と文字の高さだけ下げる
  return PADDING + FONT_SIZE + LINE_HEIGHT * index
}

// 表示が始まってから begin 秒までは中身を隠すグループ
// アニメーションが動かない環境でも全部の行が見えるよう、隠すのはアニメーションの間だけにする
function appearAt(begin, content) {
  return `<g>
    <animate attributeName="visibility" values="hidden;visible" keyTimes="0;1" calcMode="discrete" dur="${begin}s" fill="freeze" />
    ${content}
  </g>`
}

function renderPrompt(y) {
  return `<text x="${PADDING}" y="${y}" fill="${COLORS.prompt}">❯</text>`
}

// コマンドの文字は最初から全部置き、見える範囲（clipPath）を1文字ずつ広げて打ち込んでいるように見せる
function renderCommand(line, index, begin) {
  const y = lineY(index)
  const length = line.text.length
  // 0文字目から1文字ずつ広げ、最後は幅いっぱいにしてフォントの幅のずれで切れないようにする
  const widths = [...Array(length).keys()].map((i) => i * CHAR_WIDTH).concat(WIDTH)

  return appearAt(begin, `<clipPath id="typing-${index}">
      <rect x="${COMMAND_X}" y="${y - FONT_SIZE}" width="${WIDTH}" height="${LINE_HEIGHT}">
        <animate attributeName="width" values="${widths.join(';')}" calcMode="discrete" begin="${begin}s" dur="${widths.length * TIMING.perChar}s" fill="freeze" />
      </rect>
    </clipPath>
    ${renderPrompt(y)}
    <text x="${COMMAND_X}" y="${y}" fill="${COLORS.command}" clip-path="url(#typing-${index})">${escapeXml(line.text)}</text>`)
}

function renderOutput(line, index, begin) {
  return appearAt(begin, `<text x="${PADDING}" y="${lineY(index)}" fill="${COLORS.output}">${escapeXml(line.text)}</text>`)
}

// 最後の行は、入力待ちのプロンプトと点滅するカーソル
function renderLastPrompt(index, begin) {
  const y = lineY(index)
  return appearAt(begin, `${renderPrompt(y)}
    <rect x="${COMMAND_X}" y="${y - FONT_SIZE + 2}" width="${CHAR_WIDTH}" height="${FONT_SIZE + 2}" fill="${COLORS.command}">
      <animate attributeName="opacity" values="1;0" calcMode="discrete" begin="${begin}s" dur="1s" repeatCount="indefinite" />
    </rect>`)
}

// 行ごとに表示を始める時刻を、前の行が終わる時刻から順に決める
function renderLines() {
  let time = TIMING.start
  const rendered = lines.map((line, index) => {
    const begin = time.toFixed(2)
    if (line.type === 'command') {
      time += (line.text.length + 1) * TIMING.perChar + TIMING.afterCommand
      return renderCommand(line, index, begin)
    }
    time += TIMING.afterOutput
    return renderOutput(line, index, begin)
  })
  return [...rendered, renderLastPrompt(lines.length, time.toFixed(2))]
}

function renderSvg() {
  // 最後の入力待ちのプロンプトも1行として数える
  const lineCount = lines.length + 1
  // 上下の余白をそろえるため、最後の行は行の高さではなく文字の高さで数える
  const height = PADDING * 2 + LINE_HEIGHT * (lineCount - 1) + FONT_SIZE

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  <title>ターミナル風の自己紹介</title>
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: ${FONT_SIZE}px; white-space: pre; }
  </style>
  <rect width="${WIDTH}" height="${height}" rx="8" fill="${COLORS.background}" />
  ${renderLines().join('\n  ')}
</svg>
`
}

await mkdir(OUTPUT_DIR, { recursive: true })
await writeFile(OUTPUT_FILE, renderSvg())
console.log(`${OUTPUT_FILE} を生成しました`)
