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

// 実行環境のタイムゾーン（GitHub Actions は UTC）に関係なく、日本時間の年・月・日・曜日を取り出す
function tokyoDateParts(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  return Object.fromEntries(
    formatter.formatToParts(date).map(({ type, value }) => [type, value])
  )
}

function formatDate(date) {
  const parts = tokyoDateParts(date)
  return `${parts.year}-${parts.month}-${parts.day} (${parts.weekday})`
}

// 天気を表示する場所（渋谷区）
const WEATHER_LOCATION = { name: 'Shibuya', latitude: 35.664, longitude: 139.698 }

// Open-Meteo が返す WMO の天気コードを絵文字にする
function weatherEmoji(code) {
  if (code === 0) return '☀️' // 快晴
  if (code === 1) return '🌤️' // 晴れ
  if (code === 2) return '⛅' // 一部曇り
  if (code === 3) return '☁️' // 曇り
  if (code === 45 || code === 48) return '🌫️' // 霧
  if (code >= 51 && code <= 67) return '🌧️' // 霧雨・雨
  if (code >= 71 && code <= 77) return '🌨️' // 雪
  if (code >= 80 && code <= 82) return '🌦️' // にわか雨
  if (code === 85 || code === 86) return '🌨️' // にわか雪
  if (code >= 95) return '⛈️' // 雷雨
  return '🌡️'
}

// 今日の天気と最高気温を取得する
// 取得できなかったときは例外で終了し、壊れた画像を書き出さない
async function fetchWeather() {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: WEATHER_LOCATION.latitude,
    longitude: WEATHER_LOCATION.longitude,
    daily: 'temperature_2m_max,weather_code',
    timezone: 'Asia/Tokyo', // 「今日」を日本時間で決める
    forecast_days: 1,
  })

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`天気を取得できませんでした（HTTP ${response.status}）`)
  }

  const { daily } = await response.json()
  const temperature = daily?.temperature_2m_max?.[0]
  const code = daily?.weather_code?.[0]
  if (typeof temperature !== 'number' || typeof code !== 'number') {
    throw new Error(`天気のデータが想定と違う形です: ${JSON.stringify(daily)}`)
  }

  return `${weatherEmoji(code)} ${Math.round(temperature)}°C`
}

// コントリビューションを数える GitHub のユーザー（Actions ではリポジトリの所有者）
const GITHUB_USER = process.env.GITHUB_REPOSITORY_OWNER ?? 'common-member'

// 今年（日本時間の1月1日から今まで）のコントリビューション数を取得する
// 手元で試すときは GITHUB_TOKEN=$(gh auth token) を付けて実行する
async function fetchContributions(now) {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('環境変数 GITHUB_TOKEN が設定されていません')
  }

  const { year } = tokyoDateParts(now)
  const query = `query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar { totalContributions }
      }
    }
  }`
  const variables = {
    login: GITHUB_USER,
    from: `${year}-01-01T00:00:00+09:00`,
    to: now.toISOString(),
  }

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!response.ok) {
    throw new Error(`コントリビューション数を取得できませんでした（HTTP ${response.status}）`)
  }

  const { data, errors } = await response.json()
  const total = data?.user?.contributionsCollection?.contributionCalendar?.totalContributions
  if (errors || typeof total !== 'number') {
    throw new Error(`コントリビューション数を取得できませんでした: ${JSON.stringify(errors ?? data)}`)
  }

  // 非公開の活動が含まれるかをワークフローのログで確かめられるように出しておく
  console.log(`${GITHUB_USER} の今年のコントリビューション数: ${total}`)
  return `${total.toLocaleString('en-US')} contributions`
}

const now = new Date()

// 表示する行。command は打ち込むように表示し、output はその後にそのまま表示する
const lines = [
  { type: 'command', text: 'whoami' },
  { type: 'output', text: 'Web Application Engineer (Ruby on Rails / Angular)' },
  { type: 'command', text: 'date' },
  { type: 'output', text: formatDate(now) },
  { type: 'command', text: `weather ${WEATHER_LOCATION.name}` },
  { type: 'output', text: await fetchWeather() },
  { type: 'command', text: 'gh contributions --this-year' },
  { type: 'output', text: await fetchContributions(now) },
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
