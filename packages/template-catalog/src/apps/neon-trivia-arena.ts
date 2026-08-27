import type { GalleryDemoAppFile } from '../types.js';

const file = (path: string, content: string): GalleryDemoAppFile => Object.freeze({ path, content });

// These strings belong to the generated demo project, not to E-Code's own
// interface. Interpolation preserves the emitted HTML while keeping the platform
// i18n source scanner focused on platform-owned chrome.
const NEON_TRIVIA_PAGE_TITLE = 'Neon Trivia Arena';
const NEON_TRIVIA_META_DESCRIPTION =
  'A fast, accessible arcade trivia game with combos, lifelines and a live leaderboard.';

/**
 * Neon Trivia Arena — a production-shaped React + TypeScript arcade quiz.
 *
 * The demo deliberately keeps gameplay deterministic: screenshots and remixes
 * always open on the same playable round, while score, streaks, the 50:50
 * lifeline and the local high score are all genuine client-side interactions.
 */
export const neonTriviaArenaFiles: readonly GalleryDemoAppFile[] = Object.freeze([
  file(
    'package.json',
    `${JSON.stringify(
      {
        name: 'neon-trivia-arena-demo',
        private: true,
        version: '1.0.0',
        type: 'module',
        scripts: {
          dev: 'vite --host 0.0.0.0',
          build: 'tsc -b && vite build',
          typecheck: 'tsc --noEmit',
        },
        dependencies: { react: '19.2.7', 'react-dom': '19.2.7' },
        devDependencies: {
          '@types/react': '19.2.17',
          '@types/react-dom': '19.2.3',
          '@vitejs/plugin-react': '6.0.3',
          typescript: '7.0.2',
          vite: '8.1.4',
        },
      },
      null,
      2,
    )}\n`,
  ),
  file(
    'index.html',
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#09061a" />
    <meta name="description" content="${NEON_TRIVIA_META_DESCRIPTION}" />
    <title>${NEON_TRIVIA_PAGE_TITLE}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  ),
  file(
    'tsconfig.json',
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          useDefineForClassFields: true,
          module: 'ESNext',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          skipLibCheck: true,
          moduleResolution: 'Bundler',
          allowImportingTsExtensions: true,
          isolatedModules: true,
          jsx: 'react-jsx',
          types: ['vite/client'],
          noEmit: true,
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
        },
        include: ['src'],
      },
      null,
      2,
    )}\n`,
  ),
  file(
    'vite.config.ts',
    `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GALLERY_PREVIEW_BASE ?? '/',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
`,
  ),
  file(
    'README.md',
    `# Neon Trivia Arena

A complete arcade-style trivia round built with React and strict TypeScript.
Players answer with the pointer or number keys, build a score multiplier, use a
single 50:50 lifeline, advance through six categories and keep their best score
between sessions in local storage.

## Run locally

\`\`\`bash
npm install
npm run dev
npm run typecheck
npm run build
\`\`\`

## Accessibility

- Every answer is a real button with its keyboard shortcut in the accessible name.
- Correct/incorrect feedback and score changes use a polite live region.
- Status never relies on colour alone; icons and text carry the same meaning.
- Motion is reduced when the operating system requests it.
- Layouts are designed for desktop, tablet and mobile without horizontal scroll.
`,
  ),
  file(
    'src/main.tsx',
    `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Neon Trivia Arena could not find its root element.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
  ),
  file(
    'src/game.ts',
    `export type TriviaCategory = 'Science' | 'Cinema' | 'World' | 'Technology' | 'Nature' | 'Design';

export interface TriviaQuestion {
  readonly id: string;
  readonly category: TriviaCategory;
  readonly prompt: string;
  readonly answers: readonly [string, string, string, string];
  readonly correctIndex: 0 | 1 | 2 | 3;
  readonly explanation: string;
  readonly basePoints: number;
}

export interface AnswerResult {
  readonly correct: boolean;
  readonly points: number;
  readonly nextStreak: number;
}

export const QUESTIONS: readonly TriviaQuestion[] = Object.freeze([
  {
    id: 'aurora',
    category: 'Science',
    prompt: 'What creates the shimmering colours of an aurora?',
    answers: [
      'Moonlight refracting through ice crystals',
      'Solar particles colliding with atmospheric gases',
      'Bioluminescent clouds in the upper atmosphere',
      'Heat escaping through gaps in the ozone layer',
    ],
    correctIndex: 1,
    explanation: 'Charged particles from the Sun energise oxygen and nitrogen, which release light as they settle.',
    basePoints: 1_000,
  },
  {
    id: 'practical-effects',
    category: 'Cinema',
    prompt: 'Which technique creates an effect physically on set?',
    answers: ['Motion capture', 'Digital compositing', 'Practical effects', 'Procedural rendering'],
    correctIndex: 2,
    explanation: 'Practical effects are built and captured in-camera: miniatures, prosthetics, weather rigs and more.',
    basePoints: 1_100,
  },
  {
    id: 'dateline',
    category: 'World',
    prompt: 'The International Date Line mostly follows which longitude?',
    answers: ['0°', '45° east', '90° west', '180°'],
    correctIndex: 3,
    explanation: 'It roughly follows the 180° meridian, bending around countries and island groups.',
    basePoints: 1_200,
  },
  {
    id: 'web',
    category: 'Technology',
    prompt: 'Which language gives a web page its semantic structure?',
    answers: ['HTML', 'CSS', 'SQL', 'WebAssembly'],
    correctIndex: 0,
    explanation: 'HTML describes the meaning and structure of content; CSS presents it and JavaScript adds behaviour.',
    basePoints: 1_300,
  },
  {
    id: 'octopus',
    category: 'Nature',
    prompt: 'How many hearts does an octopus have?',
    answers: ['One', 'Two', 'Three', 'Eight'],
    correctIndex: 2,
    explanation: 'Two hearts pump blood through the gills, while a third circulates it through the body.',
    basePoints: 1_400,
  },
  {
    id: 'contrast',
    category: 'Design',
    prompt: 'What does visual contrast primarily help people do?',
    answers: ['Download pages faster', 'Recognise hierarchy and important actions', 'Use fewer colours', 'Avoid all animation'],
    correctIndex: 1,
    explanation: 'Contrast separates elements and clarifies hierarchy, making key information and actions easier to find.',
    basePoints: 1_500,
  },
]);

export function scoreAnswer(question: TriviaQuestion, selectedIndex: number, streak: number): AnswerResult {
  const correct = selectedIndex === question.correctIndex;
  const nextStreak = correct ? streak + 1 : 0;
  const multiplier = 1 + Math.min(streak, 4) * 0.25;

  return {
    correct,
    nextStreak,
    points: correct ? Math.round(question.basePoints * multiplier) : 0,
  };
}

export function eliminatedAnswers(question: TriviaQuestion): readonly number[] {
  return question.answers
    .map((_, index) => index)
    .filter((index) => index !== question.correctIndex)
    .slice(0, 2);
}

export function rankFor(score: number): string {
  if (score >= 9_000) return 'Cosmic genius';
  if (score >= 6_000) return 'Trivia legend';
  if (score >= 3_000) return 'Rising contender';
  return 'Bright rookie';
}
`,
  ),
  file(
    'src/App.tsx',
    `import { useCallback, useEffect, useMemo, useState } from 'react';
import { eliminatedAnswers, QUESTIONS, rankFor, scoreAnswer } from './game';

const HIGH_SCORE_KEY = 'neon-trivia-arena-high-score';
const LETTERS = ['A', 'B', 'C', 'D'] as const;

function readHighScore(): number {
  try {
    const value = Number.parseInt(window.localStorage.getItem(HIGH_SCORE_KEY) ?? '0', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function persistHighScore(score: number): void {
  try {
    window.localStorage.setItem(HIGH_SCORE_KEY, String(score));
  } catch {
    // The game remains fully playable when storage is blocked by the browser.
  }
}

export function App() {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [lifelineUsed, setLifelineUsed] = useState(false);
  const [hiddenAnswers, setHiddenAnswers] = useState<readonly number[]>([]);
  const [finished, setFinished] = useState(false);
  const [highScore, setHighScore] = useState(readHighScore);

  const question = QUESTIONS[questionIndex];
  const progress = ((questionIndex + (finished ? 1 : 0)) / QUESTIONS.length) * 100;
  const multiplier = 1 + Math.min(streak, 4) * 0.25;

  const answer = useCallback(
    (index: number) => {
      if (!question || selectedIndex !== null || hiddenAnswers.includes(index)) return;
      const result = scoreAnswer(question, index, streak);
      const nextScore = score + result.points;

      setSelectedIndex(index);
      setScore(nextScore);
      setStreak(result.nextStreak);
      if (result.correct) setCorrectAnswers((current) => current + 1);
      if (nextScore > highScore) {
        setHighScore(nextScore);
        persistHighScore(nextScore);
      }
    },
    [hiddenAnswers, highScore, question, score, selectedIndex, streak],
  );

  const next = useCallback(() => {
    if (selectedIndex === null) return;
    if (questionIndex === QUESTIONS.length - 1) {
      setFinished(true);
      return;
    }
    setQuestionIndex((current) => current + 1);
    setSelectedIndex(null);
    setHiddenAnswers([]);
  }, [questionIndex, selectedIndex]);

  const restart = useCallback(() => {
    setQuestionIndex(0);
    setSelectedIndex(null);
    setScore(0);
    setStreak(0);
    setCorrectAnswers(0);
    setLifelineUsed(false);
    setHiddenAnswers([]);
    setFinished(false);
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (finished && event.key.toLowerCase() === 'r') {
        restart();
        return;
      }
      if (selectedIndex !== null && (event.key === 'Enter' || event.key.toLowerCase() === 'n')) {
        next();
        return;
      }
      const option = ['1', '2', '3', '4'].indexOf(event.key);
      if (option >= 0) answer(option);
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [answer, finished, next, restart, selectedIndex]);

  const leaderboard = useMemo(
    () => [
      { name: 'NovaFox', score: Math.max(8_420, score + 700), avatar: 'NF' },
      { name: 'You', score, avatar: 'YO', current: true },
      { name: 'PixelPilot', score: 3_250, avatar: 'PP' },
      { name: 'LunaByte', score: 2_780, avatar: 'LB' },
    ].sort((left, right) => right.score - left.score),
    [score],
  );

  if (!question) return null;

  const useLifeline = () => {
    if (lifelineUsed || selectedIndex !== null) return;
    setHiddenAnswers(eliminatedAnswers(question));
    setLifelineUsed(true);
  };

  return (
    <main data-gallery-app-id="neon-trivia-arena" className="arena-shell">
      <header className="topbar">
        <a className="brand" href="#game" aria-label="Neon Trivia Arena home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>NEON</strong><small>TRIVIA ARENA</small></span>
        </a>
        <div className="room-status"><span aria-hidden="true" /> ROOM 4B · 12 PLAYERS</div>
        <div className="profile"><span>BEST</span><strong>{highScore.toLocaleString()}</strong><i aria-label="Player avatar">YO</i></div>
      </header>

      <div className="game-layout" id="game">
        <section className="game-stage" aria-labelledby="question-heading">
          <div className="round-row">
            <div>
              <p className="eyebrow">QUICK PLAY · MIXED KNOWLEDGE</p>
              <p className="round-label">ROUND {String(questionIndex + 1).padStart(2, '0')} <span>/ {String(QUESTIONS.length).padStart(2, '0')}</span></p>
            </div>
            <div className="streak" data-active={streak > 0}>
              <span aria-hidden="true">⚡</span><strong>{multiplier.toFixed(2)}×</strong><small>COMBO</small>
            </div>
          </div>

          <div className="progress-track" role="progressbar" aria-label="Round progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            <span style={{ width: String(progress) + '%' }} />
          </div>

          {finished ? (
            <section className="finish-card" aria-live="polite">
              <div className="trophy" aria-hidden="true">✦</div>
              <p className="eyebrow">ROUND COMPLETE</p>
              <h1>{rankFor(score)}</h1>
              <p>You scored <strong>{score.toLocaleString()}</strong> points with {correctAnswers} correct answers.</p>
              <div className="finish-stats"><span><small>ACCURACY</small><strong>{Math.round((correctAnswers / QUESTIONS.length) * 100)}%</strong></span><span><small>BEST SCORE</small><strong>{highScore.toLocaleString()}</strong></span></div>
              <button className="next-button" onClick={restart}>Play again <kbd>R</kbd></button>
            </section>
          ) : (
            <>
              <article className="question-card">
                <div className="category"><span aria-hidden="true">✦</span>{question.category}</div>
                <h1 id="question-heading">{question.prompt}</h1>
                <div className="answers" aria-label="Answer choices">
                  {question.answers.map((label, index) => {
                    const hidden = hiddenAnswers.includes(index);
                    const correct = selectedIndex !== null && index === question.correctIndex;
                    const incorrect = selectedIndex === index && index !== question.correctIndex;
                    const state = correct ? 'correct' : incorrect ? 'incorrect' : hidden ? 'hidden' : 'idle';
                    return (
                      <button
                        key={label}
                        className="answer"
                        data-state={state}
                        disabled={selectedIndex !== null || hidden}
                        onClick={() => answer(index)}
                        aria-label={LETTERS[index] + ', option ' + String(index + 1) + ': ' + label}
                      >
                        <span>{LETTERS[index]}</span><strong>{label}</strong>
                        <kbd>{index + 1}</kbd>
                        {correct ? <i aria-label="Correct answer">✓</i> : null}
                        {incorrect ? <i aria-label="Incorrect answer">×</i> : null}
                      </button>
                    );
                  })}
                </div>
              </article>

              <div className="action-row">
                <button className="lifeline" disabled={lifelineUsed || selectedIndex !== null} onClick={useLifeline}>
                  <span aria-hidden="true">◐</span><strong>50:50</strong><small>{lifelineUsed ? 'USED' : 'LIFELINE'}</small>
                </button>
                {selectedIndex === null ? (
                  <p className="keyboard-hint"><kbd>1</kbd>—<kbd>4</kbd><span>Choose an answer</span></p>
                ) : (
                  <div className="feedback" data-correct={selectedIndex === question.correctIndex} aria-live="polite">
                    <span aria-hidden="true">{selectedIndex === question.correctIndex ? '✓' : '!'}</span>
                    <p><strong>{selectedIndex === question.correctIndex ? 'Brilliant!' : 'Not this time.'}</strong>{question.explanation}</p>
                  </div>
                )}
                <button className="next-button" disabled={selectedIndex === null} onClick={next}>
                  {questionIndex === QUESTIONS.length - 1 ? 'See results' : 'Next question'} <kbd>↵</kbd>
                </button>
              </div>
            </>
          )}
        </section>

        <aside className="scoreboard" aria-label="Game scoreboard">
          <section className="score-card">
            <p className="eyebrow">YOUR SCORE</p>
            <strong>{score.toLocaleString()}</strong>
            <div><span>✓ {correctAnswers} CORRECT</span><span>⚡ {streak} STREAK</span></div>
          </section>
          <section className="leaderboard">
            <div className="panel-title"><div><p className="eyebrow">LIVE ROOM</p><h2>Leaderboard</h2></div><span><i /> LIVE</span></div>
            <ol>
              {leaderboard.map((player, index) => (
                <li key={player.name} data-current={player.current || undefined}>
                  <b>{index + 1}</b><i>{player.avatar}</i><span><strong>{player.name}</strong><small>{player.current ? 'Playing now' : 'Round ' + String(Math.max(1, 5 - index))}</small></span><em>{player.score.toLocaleString()}</em>
                </li>
              ))}
            </ol>
          </section>
          <section className="challenge-card">
            <span aria-hidden="true">♜</span><div><p className="eyebrow">DAILY CHALLENGE</p><strong>World wonders</strong><small>Unlocks in 02:18:42</small></div>
          </section>
        </aside>
      </div>
    </main>
  );
}
`,
  ),
  file(
    'src/styles.css',
    `:root {
  color-scheme: dark;
  --bg: #09061a;
  --panel: #14102c;
  --panel-2: #19143a;
  --line: rgba(174, 155, 255, 0.18);
  --text: #f8f7ff;
  --muted: #9b94bb;
  --purple: #8b5cf6;
  --cyan: #29d9ff;
  --pink: #ff4fd8;
  --lime: #a8ff78;
  --danger: #ff5d7d;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
  -webkit-font-smoothing: antialiased;
}

* { box-sizing: border-box; }
html { background: var(--bg); }
body { margin: 0; min-width: 320px; min-height: 100vh; color: var(--text); background: var(--bg); }
button { font: inherit; }
button:not(:disabled) { cursor: pointer; }
button:focus-visible, a:focus-visible { outline: 3px solid var(--cyan); outline-offset: 3px; }
kbd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

.arena-shell {
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(900px 440px at 8% 0%, rgba(104, 45, 221, 0.27), transparent 62%),
    radial-gradient(680px 420px at 96% 100%, rgba(25, 192, 229, 0.15), transparent 65%),
    linear-gradient(135deg, transparent 0 49.6%, rgba(139, 92, 246, 0.035) 49.8% 50.2%, transparent 50.4%) 0 0 / 54px 54px,
    var(--bg);
}

.topbar {
  min-height: 76px;
  padding: 0 clamp(22px, 4vw, 60px);
  display: flex;
  align-items: center;
  gap: 28px;
  border-bottom: 1px solid var(--line);
  background: rgba(9, 6, 26, 0.78);
  backdrop-filter: blur(18px);
}

.brand { min-height: 44px; display: flex; align-items: center; gap: 12px; color: white; text-decoration: none; }
.brand-mark { position: relative; width: 39px; height: 39px; display: grid; place-items: center; transform: rotate(30deg); }
.brand-mark::before { content: ""; position: absolute; inset: 2px; border: 2px solid var(--purple); border-radius: 12px; box-shadow: 0 0 24px rgba(139, 92, 246, .55); }
.brand-mark i { position: absolute; width: 4px; height: 22px; border-radius: 4px; background: linear-gradient(var(--cyan), var(--pink)); transform-origin: center; }
.brand-mark i:nth-child(2) { transform: rotate(60deg); }
.brand-mark i:nth-child(3) { transform: rotate(120deg); }
.brand > span:last-child { display: grid; line-height: 1; }
.brand strong { font-size: 17px; letter-spacing: .12em; }
.brand small { margin-top: 5px; color: #a89fc9; font-size: 8px; letter-spacing: .28em; }

.room-status { margin-left: auto; display: flex; align-items: center; gap: 9px; color: #9e96bd; font-size: 10px; font-weight: 800; letter-spacing: .12em; }
.room-status > span { width: 7px; height: 7px; border-radius: 50%; background: var(--lime); box-shadow: 0 0 10px var(--lime); }
.profile { display: flex; align-items: center; gap: 9px; padding-left: 24px; border-left: 1px solid var(--line); }
.profile > span { color: #81799f; font-size: 9px; font-weight: 800; letter-spacing: .12em; }
.profile strong { font-size: 14px; font-variant-numeric: tabular-nums; }
.profile i { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 11px; background: linear-gradient(145deg, #a78bfa, #5b21b6); box-shadow: inset 0 1px rgba(255,255,255,.35); font-size: 10px; font-style: normal; font-weight: 900; }

.game-layout { width: min(1200px, calc(100% - 38px)); margin: 0 auto; padding: clamp(22px, 4vh, 38px) 0; display: grid; grid-template-columns: minmax(0, 1fr) 286px; gap: clamp(20px, 3vw, 34px); }
.game-stage { min-width: 0; }
.round-row { min-height: 60px; display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.eyebrow { margin: 0; color: #8e86ae; font-size: 9px; font-weight: 900; letter-spacing: .17em; }
.round-label { margin: 8px 0 0; font-size: 21px; font-weight: 900; letter-spacing: .04em; }
.round-label span { color: #5f587d; }
.streak { min-width: 108px; display: grid; grid-template-columns: 28px 1fr; grid-template-rows: 1fr 1fr; align-items: center; padding: 8px 13px; border: 1px solid var(--line); border-radius: 12px; background: rgba(20,16,44,.74); }
.streak > span { grid-row: 1 / 3; color: #67617f; font-size: 18px; filter: grayscale(1); }
.streak strong { font-size: 14px; }
.streak small { color: #756e91; font-size: 8px; font-weight: 900; letter-spacing: .13em; }
.streak[data-active="true"] { border-color: rgba(41,217,255,.45); box-shadow: 0 0 24px rgba(41,217,255,.08); }
.streak[data-active="true"] > span { color: var(--cyan); filter: none; }

.progress-track { position: relative; height: 4px; margin: 12px 0 22px; overflow: hidden; border-radius: 999px; background: #282142; }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--purple), var(--cyan)); box-shadow: 0 0 14px var(--cyan); transition: width .3s ease; }

.question-card { position: relative; padding: clamp(24px, 4vw, 38px); border: 1px solid var(--line); border-radius: 22px; background: linear-gradient(145deg, rgba(26,20,58,.96), rgba(16,12,38,.96)); box-shadow: 0 24px 80px rgba(0,0,0,.28), inset 0 1px rgba(255,255,255,.04); overflow: hidden; }
.question-card::before { content: ""; position: absolute; width: 280px; height: 280px; right: -140px; top: -170px; border: 1px solid rgba(41,217,255,.18); border-radius: 50%; box-shadow: 0 0 0 36px rgba(139,92,246,.035), 0 0 0 72px rgba(139,92,246,.025); }
.category { position: relative; display: inline-flex; align-items: center; gap: 8px; padding: 7px 10px; border: 1px solid rgba(41,217,255,.3); border-radius: 8px; color: #81eafd; background: rgba(41,217,255,.07); font-size: 9px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
.category span { color: var(--pink); }
.question-card h1 { position: relative; max-width: 770px; margin: 18px 0 24px; font-size: clamp(25px, 3.2vw, 38px); line-height: 1.12; letter-spacing: -.035em; }
.answers { position: relative; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.answer { position: relative; min-height: 72px; padding: 11px 42px 11px 12px; display: grid; grid-template-columns: 38px 1fr; gap: 12px; align-items: center; text-align: left; border: 1px solid rgba(179,163,235,.2); border-radius: 13px; color: #e9e6f7; background: rgba(9,7,27,.66); transition: transform .16s ease, border-color .16s ease, background .16s ease; }
.answer:not(:disabled):hover { transform: translateY(-2px); border-color: rgba(41,217,255,.58); background: rgba(34,27,72,.82); }
.answer > span { width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid #3d355e; border-radius: 10px; color: #a79fc3; font-size: 11px; font-weight: 900; }
.answer > strong { font-size: 12px; line-height: 1.36; }
.answer > kbd { position: absolute; right: 13px; top: 13px; width: 19px; height: 19px; display: grid; place-items: center; border: 1px solid #37304f; border-radius: 5px; color: #6e6787; background: #110e27; font-size: 8px; }
.answer > i { position: absolute; right: 15px; bottom: 13px; font-size: 16px; font-style: normal; font-weight: 900; }
.answer[data-state="correct"] { border-color: rgba(168,255,120,.72); background: rgba(46,94,50,.35); }
.answer[data-state="correct"] > span { border-color: var(--lime); color: var(--lime); }
.answer[data-state="correct"] > i { color: var(--lime); }
.answer[data-state="incorrect"] { border-color: rgba(255,93,125,.72); background: rgba(105,32,55,.35); }
.answer[data-state="incorrect"] > span, .answer[data-state="incorrect"] > i { color: var(--danger); border-color: var(--danger); }
.answer[data-state="hidden"] { opacity: .22; }

.action-row { min-height: 68px; margin-top: 16px; display: flex; align-items: stretch; gap: 12px; }
.lifeline { min-width: 104px; display: grid; grid-template-columns: 28px 1fr; grid-template-rows: 1fr 1fr; align-items: center; padding: 10px 13px; border: 1px solid rgba(255,79,216,.28); border-radius: 12px; color: white; background: rgba(255,79,216,.08); }
.lifeline > span { grid-row: 1 / 3; color: var(--pink); font-size: 18px; }
.lifeline strong { text-align: left; font-size: 12px; }
.lifeline small { text-align: left; color: #9c7396; font-size: 7px; font-weight: 900; letter-spacing: .1em; }
.lifeline:disabled { opacity: .38; }
.keyboard-hint { flex: 1; margin: 0; display: flex; align-items: center; justify-content: center; gap: 5px; color: #625c7d; font-size: 9px; font-weight: 700; }
.keyboard-hint kbd, .next-button kbd { padding: 3px 6px; border: 1px solid #393251; border-radius: 5px; color: #8d86a9; background: #120f29; }
.keyboard-hint span { margin-left: 5px; }
.feedback { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; padding: 9px 12px; border: 1px solid rgba(255,93,125,.3); border-radius: 12px; background: rgba(255,93,125,.06); }
.feedback[data-correct="true"] { border-color: rgba(168,255,120,.3); background: rgba(168,255,120,.06); }
.feedback > span { flex: 0 0 auto; width: 29px; height: 29px; display: grid; place-items: center; border-radius: 50%; color: #130d27; background: var(--danger); font-size: 13px; font-weight: 900; }
.feedback[data-correct="true"] > span { background: var(--lime); }
.feedback p { margin: 0; color: #9d96b9; font-size: 9px; line-height: 1.35; }
.feedback strong { display: block; margin-bottom: 2px; color: white; font-size: 11px; }
.next-button { align-self: stretch; min-width: 158px; padding: 0 18px; border: 0; border-radius: 12px; color: white; background: linear-gradient(135deg, #7c3aed, #6d28d9); box-shadow: 0 10px 30px rgba(109,40,217,.28); font-size: 11px; font-weight: 900; }
.next-button:disabled { opacity: .35; box-shadow: none; }
.next-button kbd { margin-left: 7px; color: #ddd6fe; border-color: rgba(255,255,255,.2); background: rgba(0,0,0,.14); }

.scoreboard { display: flex; flex-direction: column; gap: 13px; }
.score-card, .leaderboard, .challenge-card { border: 1px solid var(--line); border-radius: 16px; background: rgba(20,16,44,.8); box-shadow: inset 0 1px rgba(255,255,255,.025); }
.score-card { position: relative; padding: 18px; overflow: hidden; }
.score-card::after { content: ""; position: absolute; width: 120px; height: 120px; right: -62px; top: -62px; border-radius: 50%; background: rgba(139,92,246,.22); filter: blur(12px); }
.score-card > strong { display: block; margin: 7px 0 14px; font-size: 35px; line-height: 1; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.score-card > div { display: flex; gap: 7px; }
.score-card > div span { padding: 5px 7px; border-radius: 6px; color: #a89fc3; background: #221b46; font-size: 7px; font-weight: 900; letter-spacing: .06em; }
.leaderboard { overflow: hidden; }
.panel-title { padding: 15px 16px 12px; display: flex; justify-content: space-between; align-items: end; }
.panel-title h2 { margin: 5px 0 0; font-size: 16px; }
.panel-title > span { display: flex; align-items: center; gap: 5px; color: #8da98c; font-size: 7px; font-weight: 900; letter-spacing: .1em; }
.panel-title > span i { width: 5px; height: 5px; border-radius: 50%; background: var(--lime); box-shadow: 0 0 8px var(--lime); }
.leaderboard ol { margin: 0; padding: 0 8px 10px; list-style: none; }
.leaderboard li { display: grid; grid-template-columns: 18px 32px 1fr auto; gap: 8px; align-items: center; padding: 9px 8px; border-top: 1px solid rgba(174,155,255,.08); }
.leaderboard li[data-current="true"] { border: 1px solid rgba(41,217,255,.23); border-radius: 9px; background: rgba(41,217,255,.06); }
.leaderboard li > b { color: #6d6689; font-size: 9px; }
.leaderboard li > i { width: 29px; height: 29px; display: grid; place-items: center; border-radius: 9px; color: #cfc8eb; background: linear-gradient(145deg, #38305f, #221c43); font-size: 7px; font-style: normal; font-weight: 900; }
.leaderboard li > span { display: grid; gap: 2px; }
.leaderboard li > span strong { font-size: 9px; }
.leaderboard li > span small { color: #716a8e; font-size: 7px; }
.leaderboard li > em { color: #c8c2df; font-size: 9px; font-style: normal; font-weight: 900; font-variant-numeric: tabular-nums; }
.challenge-card { display: flex; align-items: center; gap: 11px; padding: 14px; }
.challenge-card > span { width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid rgba(255,79,216,.25); border-radius: 10px; color: var(--pink); background: rgba(255,79,216,.06); }
.challenge-card > div { display: grid; gap: 3px; }
.challenge-card strong { font-size: 10px; }
.challenge-card small { color: #746d90; font-size: 7px; }

.finish-card { min-height: 430px; padding: 48px; display: grid; place-items: center; align-content: center; text-align: center; border: 1px solid var(--line); border-radius: 22px; background: linear-gradient(145deg, rgba(30,22,66,.96), rgba(14,11,34,.96)); }
.trophy { width: 78px; height: 78px; margin-bottom: 18px; display: grid; place-items: center; border: 1px solid rgba(41,217,255,.5); border-radius: 24px; color: var(--cyan); background: rgba(41,217,255,.08); box-shadow: 0 0 50px rgba(41,217,255,.18); font-size: 36px; }
.finish-card h1 { margin: 8px 0; font-size: 42px; }
.finish-card > p:not(.eyebrow) { color: var(--muted); }
.finish-stats { margin: 18px 0; display: flex; gap: 12px; }
.finish-stats span { min-width: 120px; padding: 12px; display: grid; gap: 5px; border: 1px solid var(--line); border-radius: 10px; background: rgba(9,7,27,.5); }
.finish-stats small { color: var(--muted); font-size: 8px; }
.finish-card .next-button { min-height: 48px; }

@media (max-width: 860px) {
  .game-layout { grid-template-columns: 1fr; }
  .scoreboard { display: grid; grid-template-columns: .8fr 1.2fr; align-items: start; }
  .challenge-card { display: none; }
  .score-card { min-height: 100%; }
}

@media (max-width: 620px) {
  .topbar { min-height: 66px; padding: 0 16px; }
  .room-status, .profile > span, .profile > strong { display: none; }
  .profile { margin-left: auto; padding-left: 13px; }
  .game-layout { width: min(100% - 24px, 560px); padding: 18px 0 26px; }
  .answers { grid-template-columns: 1fr; }
  .answer { min-height: 62px; }
  .question-card { padding: 20px 16px; }
  .question-card h1 { font-size: 25px; }
  .action-row { flex-wrap: wrap; }
  .keyboard-hint, .feedback { order: -1; flex-basis: 100%; min-height: 58px; }
  .lifeline, .next-button { flex: 1; min-height: 48px; }
  .scoreboard { grid-template-columns: 1fr; }
  .score-card { min-height: auto; }
  .leaderboard { display: none; }
  .finish-card { min-height: 410px; padding: 28px 16px; }
  .finish-card h1 { font-size: 34px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
`,
  ),
]);
