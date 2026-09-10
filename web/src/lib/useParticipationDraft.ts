'use client';
import { useCallback, useEffect, useRef } from 'react';
import { participationDraftKey, readParticipationDraft, writeParticipationDraft } from './participation';

/** 댓글/신청 문구만 계정·대상별로 탭 내에서 30분 보관한다. */
export function useParticipationDraft(key: string | null, value: string, restore: (text: string) => void) {
  const scope = useRef<{ key: string; id: string } | null>(null);
  const previousKey = useRef(key);
  const currentValue = useRef(value);
  useEffect(() => {
    currentValue.current = value;
    if (scope.current?.key === key) writeParticipationDraft(scope.current.id, value);
  }, [key, value]);
  useEffect(() => {
    let alive = true;
    const changed = previousKey.current !== key;
    previousKey.current = key;
    scope.current = null;
    if (!key) return;
    void participationDraftKey(key).then(id => {
      if (!alive || !id) return;
      const saved = readParticipationDraft(id);
      const next = changed ? saved ?? '' : currentValue.current || saved || '';
      scope.current = {key, id};
      currentValue.current = next;
      restore(next);
      writeParticipationDraft(id, next);
    }).catch(() => {});
    return () => { alive = false; scope.current = null; };
  }, [key, restore]);
  return useCallback(() => {
    if (scope.current) writeParticipationDraft(scope.current.id, '');
    currentValue.current = '';
  }, []);
}
