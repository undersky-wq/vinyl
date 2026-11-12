import type { UserProfile } from '../types';
import type { SiteLang } from '../lib/language';

export function RegisteredUsersList({ users, lang }: { users: UserProfile[]; lang: SiteLang }) {
  const ru = lang === 'ru';
  return <div className="profile-users-list">
    <p>{ru ? 'Зарегистрировано' : 'Registered'}: {users.length}</p>
    {users.map(user => <div className="profile-user-row" key={user.id}>
      <div className="profile-user-avatar">{user.avatarStorageUrl ? <img src={user.avatarStorageUrl} alt="" loading="lazy"/> : <span>{(user.displayName || user.email || '?').slice(0,1).toUpperCase()}</span>}</div>
      <div className="profile-user-main"><div className="profile-user-name"><strong>{user.displayName}</strong><span>{user.role}</span></div><p className="muted">{user.email || (ru?'Без email':'No email')}</p><p className="profile-user-date">{new Intl.DateTimeFormat(ru?'ru-RU':'en-US',{dateStyle:'medium'}).format(new Date(user.createdAt))}</p></div>
    </div>)}
    {!users.length && <p>{ru?'Зарегистрированных пользователей пока нет.':'No registered users yet.'}</p>}
  </div>;
}
