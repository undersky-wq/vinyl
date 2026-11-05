'use client';

import { createContext, type Dispatch, type SetStateAction } from 'react';
import type { ArchivePageHeaderProps } from './archive-page-header';

export type ArchiveHeaderRegistration = { pathname: string; href: string; props: ArchivePageHeaderProps };
export const ArchiveHeaderContext = createContext<Dispatch<SetStateAction<ArchiveHeaderRegistration | null>> | null>(null);
