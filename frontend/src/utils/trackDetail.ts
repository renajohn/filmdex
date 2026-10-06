import type { RipTrackFile } from '../services/musicService';
import type { TrackPerformer } from './trackCredits';

/** Each person once, with every role MusicBrainz gave them on the track, in credit order. */
export const performersByPerson = (performers: TrackPerformer[]): Array<{ name: string; roles: string[] }> => {
  const people = new Map<string, string[]>();
  for (const performer of performers) {
    const roles = people.get(performer.name) || [];
    for (const role of performer.role.split(', ').filter(Boolean)) if (!roles.includes(role)) roles.push(role);
    people.set(performer.name, roles);
  }
  return [...people.entries()].map(([name, roles]) => ({ name, roles }));
};

/** The rip's file for a track: same disc, same number. */
export const ripFileFor = (files: RipTrackFile[], disc: number, track: number): RipTrackFile | null =>
  files.find(file => file.discNumber === disc && file.track === track) ?? null;

const CHANNELS: Record<number, string> = { 1: 'mono', 2: 'stereo' };

/** "FLAC · 16-bit · 44.1 kHz · stereo", what tells a CD-quality rip at a glance. */
export const ripFormat = (file: RipTrackFile): string => [
  file.suffix.toUpperCase(),
  file.bitDepth ? `${file.bitDepth}-bit` : null,
  file.samplingRate ? `${(file.samplingRate / 1000).toLocaleString('en', { maximumFractionDigits: 1 })} kHz` : null,
  file.channelCount ? CHANNELS[file.channelCount] || `${file.channelCount} channels` : null,
].filter(Boolean).join(' · ');

/** "912 kbps · 38.4 MB" */
export const ripSize = (file: RipTrackFile): string => [
  file.bitRate ? `${file.bitRate} kbps` : null,
  file.size ? `${(file.size / 1_000_000).toFixed(1)} MB` : null,
].filter(Boolean).join(' · ');

/** "Thom Yorke; Jonny Greenwood" in an input, back to a list; names never carry a semicolon. */
export const joinNames = (names: string[] | undefined): string => (names || []).join('; ');
export const splitNames = (text: string): string[] =>
  text.split(';').map(name => name.trim()).filter(Boolean);
