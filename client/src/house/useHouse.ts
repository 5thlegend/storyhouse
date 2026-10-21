// Her album and Today card, kept fresh quietly in the background. If the
// network drops, she keeps seeing what she already had — never an error.

import { useEffect, useState } from 'react';
import { api } from '../api';
import type { AlbumPhoto, TodayNote } from '../types';
import { localDate } from './dates';

const REFRESH_MS = 10 * 60_000;

export function useHouse() {
  const [photos, setPhotos] = useState<AlbumPhoto[] | null>(null);
  const [today, setToday] = useState<TodayNote | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api
        .album()
        .then((r) => alive && setPhotos(r.photos))
        .catch(() => alive && setPhotos((p) => p ?? []));
      api
        .today(localDate())
        .then((t) => alive && setToday(t))
        .catch(() => {});
    };
    load();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(id);
    };
  }, []);

  return { photos, today };
}

/** Re-render once a minute so the date and greeting are always right. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
