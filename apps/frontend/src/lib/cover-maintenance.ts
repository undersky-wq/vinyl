export type CoverMaintenanceStatus = {
  id: string | null; mode: 'check' | 'convert'; status: 'idle' | 'running' | 'completed' | 'failed';
  total: number; processed: number; webp: number; other: number; converted: number;
  skipped: number; failed: number; stale: number; withoutStorageKey: number;
  bytesBefore: number; bytesAfter: number; formats: Record<string, number>;
  errors: Array<{ key: string; message: string }>; startedAt?: string; finishedAt?: string;
};

export async function coverMaintenanceRequest(action: 'status' | 'check' | 'convert'): Promise<CoverMaintenanceStatus> {
  const response = await fetch(`/api/releases/covers/maintenance/${action}`, {
    method: action === 'status' ? 'GET' : 'POST', credentials: 'include', cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Cover maintenance failed (${response.status})`);
  return response.json();
}
