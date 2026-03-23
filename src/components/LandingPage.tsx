'use client';

import Link from 'next/link';
import ConstellationCanvas from './ConstellationCanvas';

export default function LandingPage() {
  return (
    <div className="landing-page relative w-screen h-screen overflow-hidden">
      <div className="relative z-10 flex h-full">
        {/* Left panel */}
        <div className="flex flex-col justify-center px-10 md:px-16 w-full md:w-[45%]">
          <h1 className="landing-title text-6xl md:text-8xl tracking-wide mb-6 animate-fade-in-up [text-wrap:balance]">
            kabo{' '}
            <span className="text-5xl md:text-7xl">花望</span>
          </h1>

          <p className="landing-subtitle text-white/70 text-base md:text-lg leading-relaxed max-w-md mb-12 font-light font-[family-name:var(--font-inter)] animate-fade-in-up [text-wrap:pretty]">
            let your research be calm and intentional by drifting through your
            channels
          </p>

          <Link
            href="/explore"
            className="landing-cta inline-block border border-white/50 px-8 py-3 text-sm tracking-[0.3em] uppercase text-white hover:bg-white/10 active:scale-[0.96] transition-[background-color,transform] duration-300 w-fit animate-fade-in-up"
          >
            Start Exploring
          </Link>
        </div>

        {/* Right panel — constellation canvas */}
        <div className="landing-constellation hidden md:block relative flex-1 animate-fade-in">
          <ConstellationCanvas />
        </div>
      </div>
    </div>
  );
}
