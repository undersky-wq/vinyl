'use client';

import { createContext, ReactNode, useContext, useEffect } from 'react';
import { SiteDesign } from '../types';

type DesignVariantContextValue = {
  variant: SiteDesign;
};

const shelfDesign: DesignVariantContextValue = { variant: 'shelf' };
const DesignVariantContext = createContext(shelfDesign);

export function DesignVariantProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.visualVariant = 'shelf';
  }, []);
  return <DesignVariantContext.Provider value={shelfDesign}>{children}</DesignVariantContext.Provider>;
}

export function useDesignVariant() {
  return useContext(DesignVariantContext);
}
