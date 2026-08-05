import { Captions, Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { resolveMarketingLanguage } from '~/lib/i18n/catalogs/marketing';
import { getMarketingLandingVideoCopy } from '~/lib/i18n/catalogs/marketing-landing-templates-video';

/*
 * Real product screenshot (also used on the Press page as "AI agent and live cloud IDE"),
 * so no black rectangle shows before the demo is played.
 */
const posterImg = '/ecode-static/assets/product/ide.png';

export default function LandingVideo() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [mediaIssue, setMediaIssue] = useState<'playback' | 'fullscreen' | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingLandingVideoCopy(language);
  const mediaLanguage = resolveMarketingLanguage(language);

  useEffect(() => {
    const track = videoRef.current?.textTracks?.[0];

    if (track) {
      track.mode = captionsOn ? 'showing' : 'hidden';
    }
  }, [captionsOn, mediaLanguage]);

  const togglePlayback = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (isPlaying) {
      video.pause();

      return;
    }

    try {
      setMediaIssue(null);

      const playback = video.play();

      if (playback) {
        void playback.catch(() => {
          setIsPlaying(false);
          setMediaIssue('playback');
        });
      }
    } catch {
      setIsPlaying(false);
      setMediaIssue('playback');
    }
  };

  const enterFullscreen = () => {
    const requestFullscreen = videoRef.current?.requestFullscreen;

    if (!requestFullscreen || !videoRef.current) {
      setMediaIssue('fullscreen');

      return;
    }

    try {
      setMediaIssue(null);
      void Promise.resolve(requestFullscreen.call(videoRef.current)).catch(() => setMediaIssue('fullscreen'));
    } catch {
      setMediaIssue('fullscreen');
    }
  };

  return (
    <section
      id="video-demo"
      className="bg-[var(--ecode-surface-tertiary)] py-14 sm:py-20"
      aria-labelledby="landing-video-heading"
      data-testid="section-video-demo"
    >
      <div className="container-responsive max-w-7xl">
        <div className="mb-10 min-w-0 animate-fade-in text-center motion-reduce:animate-none sm:mb-12">
          <h2
            id="landing-video-heading"
            className="mb-4 break-words text-responsive-2xl font-bold text-[var(--ecode-text)] [overflow-wrap:anywhere]"
          >
            {copy['marketingLandingVideo.title']}
          </h2>
          <p
            id="landing-video-description"
            className="mx-auto max-w-3xl break-words text-responsive-base text-[var(--ecode-text-muted)] [overflow-wrap:anywhere]"
          >
            {copy['marketingLandingVideo.subtitle']}
          </p>
        </div>

        <div className="relative mx-auto min-w-0 max-w-5xl animate-scale-in motion-reduce:animate-none">
          <div className="relative overflow-hidden rounded-2xl border border-[var(--ecode-border)] bg-neutral-950 shadow-[0_8px_32px_-8px_rgba(242,98,7,0.3)] transition-all duration-300 hover:shadow-[0_12px_40px_-8px_rgba(242,98,7,0.4)] motion-reduce:transition-none">
            <div className="relative aspect-video bg-gradient-to-br from-ecode-accent/20 to-ecode-secondary-accent/20">
              <video
                id="landing-video-player"
                ref={videoRef}
                className="h-full w-full object-cover"
                poster={posterImg}
                width={1280}
                height={720}
                preload="none"
                controls={false}
                muted={isMuted}
                loop
                playsInline
                aria-label={copy['marketingLandingVideo.mediaLabel']}
                aria-describedby="landing-video-description landing-video-demo-description"
                onPlay={() => {
                  setIsPlaying(true);
                  setMediaIssue(null);
                }}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onError={() => {
                  setIsPlaying(false);
                  setMediaIssue('playback');
                }}
              >
                <source src="/assets/platform-demo.mp4" type="video/mp4" />
                <track
                  key={mediaLanguage}
                  kind="captions"
                  srcLang={mediaLanguage}
                  label={copy['marketingLandingVideo.trackLabel']}
                  src={`/captions/landing-demo.${mediaLanguage}.vtt`}
                />
                {copy['marketingLandingVideo.mediaFallback']}
              </video>

              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"
                aria-hidden="true"
              />

              <button
                type="button"
                className="group absolute inset-0 flex items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
                onClick={togglePlayback}
                aria-controls="landing-video-player"
                aria-label={isPlaying ? copy['marketingLandingVideo.pause'] : copy['marketingLandingVideo.play']}
                aria-pressed={isPlaying}
                data-testid="button-video-play-toggle"
              >
                <div className="pointer-events-none flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100 sm:h-20 sm:w-20">
                  {isPlaying ? (
                    <Pause className="h-8 w-8 text-white" aria-hidden="true" />
                  ) : (
                    <Play className="ml-1 h-8 w-8 text-white" aria-hidden="true" />
                  )}
                </div>
              </button>

              <div
                className="absolute right-0 bottom-0 left-0 flex items-center gap-1 p-2 sm:gap-3 sm:p-4"
                role="group"
                aria-label={copy['marketingLandingVideo.controlsLabel']}
              >
                <button
                  type="button"
                  className="relative z-10 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-white transition hover:text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
                  onClick={(e) => {
                    e.stopPropagation();

                    const next = !isMuted;

                    setIsMuted(next);

                    if (videoRef.current) {
                      videoRef.current.muted = next;
                    }
                  }}
                  aria-controls="landing-video-player"
                  aria-label={isMuted ? copy['marketingLandingVideo.unmute'] : copy['marketingLandingVideo.mute']}
                  aria-pressed={isMuted}
                  data-testid="button-video-mute-toggle"
                >
                  {isMuted ? (
                    <VolumeX className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Volume2 className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className={`relative z-10 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none ${
                    captionsOn ? 'text-white' : 'text-white/70 hover:text-white'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();

                    const next = !captionsOn;
                    const track = videoRef.current?.textTracks?.[0];

                    if (track) {
                      track.mode = next ? 'showing' : 'hidden';
                    }

                    setCaptionsOn(next);
                  }}
                  aria-controls="landing-video-player"
                  aria-label={
                    captionsOn ? copy['marketingLandingVideo.hideCaptions'] : copy['marketingLandingVideo.showCaptions']
                  }
                  aria-pressed={captionsOn}
                  data-testid="button-video-captions-toggle"
                >
                  <Captions className="h-5 w-5" aria-hidden="true" />
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  className="relative z-10 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-white transition hover:text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
                  onClick={(e) => {
                    e.stopPropagation();
                    enterFullscreen();
                  }}
                  aria-controls="landing-video-player"
                  aria-label={copy['marketingLandingVideo.fullscreen']}
                  data-testid="button-video-fullscreen"
                >
                  <Maximize className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {mediaIssue ? (
            <p
              className="mt-4 break-words text-center text-sm text-[var(--status-error-text)] [overflow-wrap:anywhere]"
              role="alert"
            >
              {
                copy[
                  mediaIssue === 'playback'
                    ? 'marketingLandingVideo.playbackError'
                    : 'marketingLandingVideo.fullscreenError'
                ]
              }
            </p>
          ) : null}

          <div className="mt-8 min-w-0 text-center">
            <h3 className="mb-2 break-words text-[15px] font-semibold text-[var(--ecode-text)] [overflow-wrap:anywhere]">
              {copy['marketingLandingVideo.demoTitle']}
            </h3>
            <p
              id="landing-video-demo-description"
              className="mx-auto max-w-3xl break-words text-[13px] text-[var(--ecode-text-muted)] [overflow-wrap:anywhere]"
            >
              {copy['marketingLandingVideo.demoDescription']}
            </p>
            <div className="mt-4 flex min-w-0 flex-wrap justify-center gap-2 sm:gap-4">
              <Badge
                variant="secondary"
                className="max-w-full whitespace-normal break-words text-center [overflow-wrap:anywhere]"
              >
                {copy['marketingLandingVideo.badge.codeGeneration']}
              </Badge>
              <Badge
                variant="secondary"
                className="max-w-full whitespace-normal break-words text-center [overflow-wrap:anywhere]"
              >
                {copy['marketingLandingVideo.badge.preview']}
              </Badge>
              <Badge
                variant="secondary"
                className="max-w-full whitespace-normal break-words text-center [overflow-wrap:anywhere]"
              >
                {copy['marketingLandingVideo.badge.deployment']}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
