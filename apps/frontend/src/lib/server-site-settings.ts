import { cache } from 'react';
import { getSiteSettings } from './api';

// Layout and page render in one React request, so share the public settings call.
export const getRequestSiteSettings = cache(getSiteSettings);
