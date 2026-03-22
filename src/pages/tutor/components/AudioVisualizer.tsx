import { Mic, Volume2, Loader2 } from 'lucide-react';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface AudioVisualizerProps {
  state: VoiceState;
}

export function AudioVisualizer({ state }: AudioVisualizerProps) {
  return (
    <div className="relative flex items-center justify-center h-32 w-32">
      {/* Outer ring */}
      <div
        className={`absolute h-32 w-32 rounded-full transition-all duration-700 ${
          state === 'listening'
            ? 'bg-[#8BB7A3]/20 scale-110 animate-pulse'
            : state === 'speaking'
              ? 'bg-primary/20 scale-105 animate-pulse'
              : state === 'thinking'
                ? 'bg-[#C58C6E]/20 scale-100 animate-pulse'
                : 'bg-muted/20 scale-100'
        }`}
      />

      {/* Middle ring */}
      <div
        className={`absolute h-24 w-24 rounded-full transition-all duration-500 ${
          state === 'listening'
            ? 'bg-[#8BB7A3]/30'
            : state === 'speaking'
              ? 'bg-primary/30'
              : state === 'thinking'
                ? 'bg-[#C58C6E]/30'
                : 'bg-muted/30'
        }`}
      />

      {/* Inner circle with icon */}
      <div
        className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300 ${
          state === 'listening'
            ? 'bg-[#8BB7A3]'
            : state === 'speaking'
              ? 'bg-primary'
              : state === 'thinking'
                ? 'bg-[#C58C6E]'
                : 'bg-muted'
        }`}
      >
        {state === 'listening' && <Mic className="h-7 w-7 text-white" />}
        {state === 'speaking' && <Volume2 className="h-7 w-7 text-primary-foreground" />}
        {state === 'thinking' && <Loader2 className="h-7 w-7 text-white animate-spin" />}
        {state === 'idle' && <Mic className="h-7 w-7 text-muted-foreground" />}
      </div>
    </div>
  );
}
