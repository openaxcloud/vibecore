import { useCallback, useEffect, useState } from "react";

function useClock(): string {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function randomReadableColor(): string {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 55 + Math.floor(Math.random() * 25); // 55-80%
  const lightness = 12 + Math.floor(Math.random() * 14); // 12-26% (dark, readable)
  return `hsl(${hue}deg ${saturation}% ${lightness}%)`;
}

export default function App() {
  const time = useClock();
  const [background, setBackground] = useState<string>("#0a0f1c");

  const changeColor = useCallback(() => {
    setBackground(randomReadableColor());
  }, []);

  useEffect(() => {
    document.body.style.background = background;
    return () => {
      document.body.style.background = "";
    };
  }, [background]);

  return (
    <main className="app-shell">
      <section className="hero" aria-label="Live proof card">
        <p className="eyebrow">E-Code project</p>
        <h1>E-Code live proof</h1>

        <p className="clock-label">Current time</p>
        <time className="clock" dateTime={new Date().toISOString()} aria-live="polite">
          {time}
        </time>

        <button type="button" className="color-btn" onClick={changeColor}>
          Change color
        </button>
      </section>
    </main>
  );
}