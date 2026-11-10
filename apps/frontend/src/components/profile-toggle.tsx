'use client';

import type { ReactNode } from 'react';
import './profile-toggle.css';

export function ProfileSwitchTrack({ checked }: { checked: boolean }) {
  return <span className="profile-switch-track" data-checked={checked} aria-hidden="true" />;
}

export function ProfileToggle({ checked, label, children, onChange, disabled = false, title }: {
  checked: boolean; label: string; children?: ReactNode; onChange: () => void; disabled?: boolean; title?: string;
}) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label}
    className={children ? 'profile-action-button profile-action-button--switch' : 'profile-toggle'}
    disabled={disabled} title={title} onClick={onChange}>
    {children && <span className="profile-action-button__label">{children}</span>}
    <ProfileSwitchTrack checked={checked} />
  </button>;
}
