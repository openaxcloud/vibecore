import { Play, Pause, Volume2, VolumeX, Maximize, Captions } from 'lucide-react';
import { useState, useRef } from 'react';
import { Badge } from '~/components/marketing/ecode-exact/EcodeExactUi';

/*
 * Real product screenshot (also used on the Press page as "AI agent and live cloud IDE"),
 * so no black rectangle shows before the demo is played.
 */
const posterImg = '/ecode-static/assets/product/ide.png';

export default function LandingVideo() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <section id="video-demo" className="py-20 bg-[var(--ecode-surface-tertiary)]" data-testid="section-video-demo">
      <div className="container-responsive max-w-7xl">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-[var(--ecode-text)]">
            See E-Code Platform in Action
          </h2>
          <p className="text-xl text-[var(--ecode-text-muted)] max-w-3xl mx-auto">
            Watch a real demo: Build and deploy a full-stack application in under 2 minutes using AI agents
          </p>
        </div>

        <div className="relative max-w-5xl mx-auto animate-scale-in">
          <div className="relative rounded-2xl overflow-hidden shadow-[0_8px_32px_-8px_rgba(242,98,7,0.3)] bg-gray-900 border border-[var(--ecode-border)] transition-all duration-300 hover:shadow-[0_12px_40px_-8px_rgba(242,98,7,0.4)]">
            <div className="relative aspect-video bg-gradient-to-br from-ecode-accent/20 to-ecode-secondary-accent/20">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                poster={posterImg}
                width={1280}
                height={720}
                preload="none"
                controls={false}
                muted={isMuted}
                loop
                playsInline
              >
                <source src="/assets/platform-demo.mp4" type="video/mp4" />
                <track kind="captions" srcLang="en" label="English" src="/captions/landing-demo.en.vtt" />
              </video>

              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

              <button
                className="absolute inset-0 flex items-center justify-center group"
                onClick={() => {
                  if (videoRef.current) {
                    if (isPlaying) {
                      videoRef.current.pause();
                      setIsPlaying(false);
                    } else {
                      videoRef.current
                        .play()
                        ?.then(() => setIsPlaying(true))
                        .catch(() => setIsPlaying(false));
                    }
                  }
                }}
                aria-label={isPlaying ? 'Pause demo video' : 'Play demo video'}
                data-testid="button-video-play-toggle"
              >
                <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  {isPlaying ? <Pause className="h-8 w-8 text-white" /> : <Play className="h-8 w-8 text-white ml-1" />}
                </div>
              </button>

              <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center gap-4">
                <button
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center text-white hover:text-gray-300 transition"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMuted(!isMuted);

                    if (videoRef.current) {
                      videoRef.current.muted = !isMuted;
                    }
                  }}
                  aria-label={isMuted ? 'Unmute demo video' : 'Mute demo video'}
                  aria-pressed={isMuted}
                  data-testid="button-video-mute-toggle"
                >
                  {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
                <button
                  className={`flex min-h-[44px] min-w-[44px] items-center justify-center transition ${
                    captionsOn
                      ? 'text-[var(--ecode-text)]'
                      : 'text-[var(--ecode-text-muted)] hover:text-[var(--ecode-text)]'
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
                  aria-label={captionsOn ? 'Hide captions' : 'Show captions'}
                  aria-pressed={captionsOn}
                  data-testid="button-video-captions-toggle"
                >
                  <Captions className="h-5 w-5" />
                </button>
                <div className="flex-1" />
                <button
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center text-white hover:text-gray-300 transition"
                  onClick={(e) => {
                    e.stopPropagation();
                    videoRef.current?.requestFullscreen();
                  }}
                  aria-label="Enter fullscreen"
                  data-testid="button-video-fullscreen"
                >
                  <Maximize className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <h3 className="text-[15px] font-semibold mb-2">Live Platform Demo</h3>
            <p className="text-[13px] text-gray-600 dark:text-gray-400">
              Watch how E-Code Platform's AI agent builds a complete full-stack application
            </p>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              <Badge variant="secondary">AI Code Generation</Badge>
              <Badge variant="secondary">Real-time Preview</Badge>
              <Badge variant="secondary">Instant Deployment</Badge>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
