export function HomeLoading() {
  return (
    <div role="status" aria-label="Загрузка коллекции" style={{ position: 'fixed', inset: 0, zIndex: 2147483000, display: 'grid', placeItems: 'center', background: '#fff' }}>
      <img src="/icon.png" alt="" width={1024} height={1024} loading="eager" fetchPriority="high" style={{ width: 'clamp(180px,18vw,280px)', height: 'clamp(180px,18vw,280px)', objectFit: 'cover' }} />
    </div>
  );
}
