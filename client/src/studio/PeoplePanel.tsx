// The people in her photos. When she taps a face, she hears their name — and,
// if they recorded one, their own "Hi Grandma, it's me" in their own voice.

import { useState } from 'react';
import { api } from '../api';
import type { Person } from '../types';
import { VoiceRecorder } from './VoiceRecorder';

export function PeoplePanel({ people, reload }: { people: Person[]; reload: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) return;
    setError(null);
    try {
      await api.studio.addPerson(name.trim(), relation.trim() || null);
      setName('');
      setRelation('');
      await reload();
    } catch (err: any) {
      setError(err?.message ?? 'Could not add that person.');
    }
  }

  return (
    <div>
      <div className="card mb-6 font-sans">
        <h2 className="mb-1 font-serif text-2xl text-cocoa">People she’ll see</h2>
        <p className="mb-4 text-sm text-umber">
          Use the name <strong>she</strong> calls them, and how they’re related to her (“your grandson”).
          A short hello recorded by that person plays when she taps their face.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Danny)"
            className="min-w-0 flex-1 rounded-xl border border-cocoa/20 bg-linen px-3 py-2"
          />
          <input
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            placeholder="Relation (e.g. your grandson)"
            className="min-w-0 flex-1 rounded-xl border border-cocoa/20 bg-linen px-3 py-2"
          />
          <button className="btn-primary px-5 py-2" disabled={!name.trim()} onClick={add}>
            Add person
          </button>
        </div>
        {error && <p className="mt-2 text-ember">{error}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {people.map((p) => (
          <PersonCard key={p.id} person={p} reload={reload} />
        ))}
        {people.length === 0 && <p className="font-sans text-umber">No one added yet.</p>}
      </div>
    </div>
  );
}

function PersonCard({ person, reload }: { person: Person; reload: () => Promise<void> }) {
  const [name, setName] = useState(person.name);
  const [relation, setRelation] = useState(person.relation ?? '');
  const dirty = name !== person.name || relation !== (person.relation ?? '');

  return (
    <div className="card font-sans">
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-cocoa/20 bg-linen px-3 py-2 font-serif text-xl text-cocoa"
        />
        <input
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          placeholder="Relation"
          className="min-w-0 flex-1 rounded-xl border border-cocoa/20 bg-linen px-3 py-2"
        />
      </div>
      <p className="mb-3 text-sm text-umber">
        In {person.photo_count} photo{person.photo_count === 1 ? '' : 's'}
      </p>
      <div className="mb-3 flex gap-3">
        {dirty && (
          <button
            className="btn-ghost px-4 py-2 text-base"
            onClick={async () => {
              await api.studio.updatePerson(person.id, { name, relation: relation || null });
              await reload();
            }}
          >
            Save
          </button>
        )}
        <button
          className="ml-auto text-sm text-ember underline"
          onClick={async () => {
            if (!window.confirm(`Remove ${person.name}? Their face tags will be removed from photos.`)) return;
            await api.studio.deletePerson(person.id);
            await reload();
          }}
        >
          Remove
        </button>
      </div>
      <VoiceRecorder
        prompt={`Ask ${person.name} to record a short hello in their own voice: “Hi Grandma, it’s ${person.name}!”`}
        existingUrl={person.voice_url}
        existingBy={person.voice_by}
        onSave={async (blob, by) => {
          await api.studio.setPersonVoice(person.id, blob, by);
          await reload();
        }}
        onClear={async () => {
          await api.studio.clearPersonVoice(person.id);
          await reload();
        }}
      />
    </div>
  );
}
