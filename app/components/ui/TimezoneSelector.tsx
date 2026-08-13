import { Globe2, LocateFixed } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { detectedIanaTimeZone, isValidIanaTimeZone, supportedIanaTimeZones } from '~/lib/time-zones';

const TIME_ZONE_LIST_ID = 'account-iana-time-zones';
const TIME_ZONE_HINT_ID = 'account-time-zone-hint';
const TIME_ZONE_ERROR_ID = 'account-time-zone-error';
const INVALID_TIME_ZONE_MESSAGE = 'Choose a valid IANA time zone.';

export function TimezoneSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [initialValue] = useState(value);

  const [timeZones, setTimeZones] = useState<string[]>(() =>
    value && isValidIanaTimeZone(value) && value !== 'UTC' ? ['UTC', value] : ['UTC'],
  );

  const [detectedTimeZone, setDetectedTimeZone] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const trimmedValue = value.trim();
  const invalid = Boolean(trimmedValue) && !isValidIanaTimeZone(trimmedValue);

  useEffect(() => {
    const detected = detectedIanaTimeZone();

    setDetectedTimeZone(detected);
    setTimeZones(supportedIanaTimeZones([initialValue, ...(detected ? [detected] : [])]));
  }, [initialValue]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(invalid ? INVALID_TIME_ZONE_MESSAGE : '');
  }, [invalid]);

  return (
    <div className="grid gap-2">
      <label htmlFor="account-time-zone" className="text-sm font-medium">
        Time zone
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Globe2
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bolt-elements-textTertiary"
            aria-hidden
          />
          <input
            ref={inputRef}
            id="account-time-zone"
            className="h-[44px] w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 pl-10 pr-3 text-sm outline-none focus:border-bolt-elements-focus focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            name="timezone"
            type="text"
            list={TIME_ZONE_LIST_ID}
            placeholder="Search time zones"
            autoComplete="off"
            spellCheck={false}
            value={value}
            disabled={disabled}
            aria-invalid={invalid}
            aria-describedby={`${TIME_ZONE_HINT_ID}${touched && invalid ? ` ${TIME_ZONE_ERROR_ID}` : ''}`}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => setTouched(true)}
            onInvalid={() => setTouched(true)}
          />
          <datalist id={TIME_ZONE_LIST_ID}>
            {timeZones.map((timeZone) => (
              <option key={timeZone} value={timeZone} />
            ))}
          </datalist>
        </div>
        <button
          type="button"
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-md border border-bolt-elements-borderColor px-3 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-wait disabled:opacity-60"
          disabled={disabled || !detectedTimeZone}
          aria-label="Use detected time zone"
          title={detectedTimeZone ? `Use ${detectedTimeZone}` : 'Detecting time zone'}
          onClick={() => {
            if (detectedTimeZone) {
              onChange(detectedTimeZone);
              setTouched(false);
              inputRef.current?.focus();
            }
          }}
        >
          <LocateFixed className="h-4 w-4" aria-hidden />
          Use detected
        </button>
      </div>
      <p id={TIME_ZONE_HINT_ID} className="text-xs text-bolt-elements-textTertiary" aria-live="polite">
        {detectedTimeZone ? `Detected: ${detectedTimeZone}` : 'Detecting time zone…'}
      </p>
      {touched && invalid ? (
        <p id={TIME_ZONE_ERROR_ID} className="text-sm text-bolt-elements-icon-error" role="alert">
          {INVALID_TIME_ZONE_MESSAGE}
        </p>
      ) : null}
    </div>
  );
}
