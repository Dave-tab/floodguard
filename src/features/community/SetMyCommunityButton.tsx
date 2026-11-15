import { useState } from 'react';
import { Check, Star } from 'lucide-react';

import { updatePreferredCommunity } from '../../services/reportService';
import { patchCurrentUser, useCurrentUser } from '../auth/useCurrentUser';

/** Lets a signed-in resident save this community as their own (shown on their dashboard). */
export function SetMyCommunityButton({ communityId }: Readonly<{ communityId: string }>) {
  const { signedIn, me } = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!signedIn || !me) return null;

  const isMine = me.preferredCommunityId === communityId;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await updatePreferredCommunity(communityId);
      patchCurrentUser({ preferredCommunityId: saved.preferredCommunityId });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save your community.');
    } finally {
      setSaving(false);
    }
  };

  const label = isMine ? 'My community' : 'Set as my community';
  const Icon = isMine ? Check : Star;

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={() => void save()}
        disabled={isMine || saving}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/25 disabled:cursor-default disabled:opacity-80"
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>{saving ? 'Saving…' : label}</span>
      </button>
      {error && (
        <p className="mt-1 text-xs font-semibold text-red-200" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
