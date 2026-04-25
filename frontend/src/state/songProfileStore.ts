import { create } from "zustand";
import type { SongProfile } from "../features/profiling/songModels";

type SongProfileStore = {
  profiles: Record<string, SongProfile>;
  upsertProfile: (p: SongProfile) => void;
  listProfiles: () => SongProfile[];
};

export const useSongProfileStore = create<SongProfileStore>((set, get) => ({
  profiles: {},
  upsertProfile: (p) =>
    set((s) => ({
      profiles: { ...s.profiles, [p.trackId]: p },
    })),
  listProfiles: () => Object.values(get().profiles),
}));

