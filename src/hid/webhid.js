// The browser transport: Chrome and Edge's WebHID. Handles are the browser's own HIDDevice
// objects, passed through untouched.

export const webHidTransport = {
  name: "webhid",
  support() {
    if (typeof navigator === "undefined" || !("hid" in navigator)) return "missing";
    try {
      const fp = document.permissionsPolicy || document.featurePolicy;
      if (fp && fp.allowsFeature && !fp.allowsFeature("hid")) return "blocked";
    } catch {
      /* ignore */
    }
    return "ok";
  },
  request(filters) {
    return navigator.hid.requestDevice({ filters });
  },
  granted() {
    return navigator.hid.getDevices();
  },
  on(type, fn) {
    const listener = (e) => fn(e.device);
    navigator.hid.addEventListener(type, listener);
    return () => navigator.hid.removeEventListener(type, listener);
  },
};
