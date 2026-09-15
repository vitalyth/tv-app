import React, { createContext, useContext } from 'react';

interface TvNavContextType {
  isRailExpanded: boolean;
  railWidth: number;
  isFullscreenPlayerActive: boolean;
}

export const TvNavContext = createContext<TvNavContextType>({
  isRailExpanded: false,
  railWidth: 56,
  isFullscreenPlayerActive: false,
});

export const useTvNav = () => useContext(TvNavContext);

export default TvNavContext;

