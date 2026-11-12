// App state, the lighting profiles (with the user's tweaks) and preferences.

import { store } from "../devices.js";
import { PRESETS } from "../effects.js";

export const state = {
  devices: [],
  cur: null,
  route: "keyboards",
  tab: "overview",
  prefs: Object.assign({ theme: "dark", reduced: false, demoTyping: true }, store.get("prefs", {})),
  profileId: (() => {
    const v = store.get("profile", "monsoon");
    return typeof v === "number" ? (PRESETS[v] || PRESETS[0]).id : v;
  })(),
  off: false,
  lg: "all",
  lq: "",
  lpage: 0,
  pending: [],
  lightSnap: null,
  viaValues: null,
  keymapEdit: null,
  macroEdit: null,
  keyTest: null,
  keytestLayout: store.get("keytest.layout", "100"),
};

export let profiles = [];

export const PROFILE_FIELDS = ["h", "s", "br", "speed", "fw"];

export function loadProfiles() {
  const stored = store.get("profiles", {});
  const saved = stored && typeof stored === "object" ? stored : {};
  profiles = PRESETS.map((p) => {
    const o = { ...p, fw: null };
    const s = saved[p.id];
    if (s) for (const f of PROFILE_FIELDS) if (s[f] !== undefined) o[f] = s[f];
    return o;
  });
  profilesById = new Map(profiles.map((p) => [p.id, p]));
}

export function saveProfiles() {
  const o = {};
  PRESETS.forEach((d, i) => {
    const p = profiles[i],
      diff = {};
    let any = false;
    for (const f of PROFILE_FIELDS)
      if ((p[f] ?? null) !== (f === "fw" ? null : d[f])) {
        diff[f] = p[f];
        any = true;
      }
    if (any) o[p.id] = diff;
  });
  store.set("profiles", o);
}

export let profilesById = new Map();

loadProfiles();

export const currentProfile = () => profilesById.get(state.profileId) || profiles[0];

export function reloadStoredState() {
  const prefs = store.get("prefs", {});
  state.prefs = Object.assign(
    { theme: "dark", reduced: false, demoTyping: true },
    prefs && typeof prefs === "object" ? prefs : {},
  );
  const profile = store.get("profile", "monsoon");
  state.profileId = typeof profile === "number" ? (PRESETS[profile] || PRESETS[0]).id : profile;
  state.keytestLayout = store.get("keytest.layout", "100");
  loadProfiles();
}

export const savePrefs = () => store.set("prefs", state.prefs);
