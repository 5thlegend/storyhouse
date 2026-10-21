// The front door. Who is here decides which house they walk into:
//   none    → the lock screen (no family data is ever sent before this)
//   grandma → her iPad home: Today + Family Photos
//   studio  → the Family Studio (plus the Storyhouse rooms and an iPad preview)
//   family  → the read-only Family View

import { useEffect, useState } from 'react';
import { api } from './api';
import { useApp } from './store';
import { LockScreen } from './components/LockScreen';
import { GrandmaHome } from './house/GrandmaHome';
import { StudioShell } from './studio/StudioShell';
import { StoryhouseApp } from './StoryhouseApp';

export default function App() {
  const { session, setSession } = useApp();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .session()
      .then(setSession)
      .catch(() => setFailed(true));
  }, [setSession]);

  if (!session) {
    return (
      <div className="flex h-[100dvh] items-center justify-center p-6 text-center font-serif text-2xl text-umber">
        {failed ? 'Storyhouse is resting. Please try again in a little while.' : ''}
      </div>
    );
  }

  return (
    <div className="relative z-10 flex h-[100dvh] flex-col overflow-hidden">
      {session.role === 'none' && <LockScreen />}
      {session.role === 'grandma' && <GrandmaHome />}
      {session.role === 'studio' && <StudioShell />}
      {session.role === 'family' && <StoryhouseApp />}
    </div>
  );
}
