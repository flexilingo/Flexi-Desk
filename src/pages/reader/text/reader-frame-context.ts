import { createContext, useContext } from 'react';

export interface ReaderFrameState {
  fullScreen: boolean;
  toggleFullScreen: () => void;
  /** The toolbar reports itself, so the frame knows whether to draw its own way back. */
  setHasToolbar: (has: boolean) => void;
}

export const ReaderFrameContext = createContext<ReaderFrameState | null>(null);

/** The frame's state, for the toolbar. Null outside a frame. */
export const useReaderFrame = () => useContext(ReaderFrameContext);
