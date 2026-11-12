// Builds a WebHID-shaped device handle on top of a plain byte backend, so the drivers run
// unchanged over transports that aren't WebHID (the desktop app's Rust hidapi bridge).
//
// info:    { vendorId, productId, productName, collections }
// backend: {
//   connect(onInput)            open the device; call onInput(reportId, Uint8Array) per input report
//   disconnect()                close it
//   send(reportId, bytes)       output report
//   sendFeature(reportId, bytes)
//   receiveFeature(reportId)    Promise<Uint8Array>, the report without its id byte
// }

const toBytes = (data) =>
  data instanceof Uint8Array
    ? data.slice()
    : ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
      : new Uint8Array(data);

const view = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

export function createHidHandle(info, backend) {
  const listeners = new Set();
  const handle = {
    vendorId: info.vendorId,
    productId: info.productId,
    productName: info.productName || "",
    collections: info.collections || [],
    opened: false,
    oninputreport: null,
    async open() {
      if (handle.opened) return;
      await backend.connect((reportId, bytes) => {
        if (!handle.opened) return;
        const event = { type: "inputreport", device: handle, reportId, data: view(toBytes(bytes)) };
        if (typeof handle.oninputreport === "function") handle.oninputreport(event);
        for (const fn of [...listeners]) fn(event);
      });
      handle.opened = true;
    },
    async close() {
      if (!handle.opened) return;
      handle.opened = false;
      await backend.disconnect();
    },
    async forget() {
      await handle.close();
    },
    addEventListener(type, fn) {
      if (type === "inputreport" && typeof fn === "function") listeners.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === "inputreport") listeners.delete(fn);
    },
    async sendReport(reportId, data) {
      if (!handle.opened)
        throw new DOMException("The device must be opened first.", "InvalidStateError");
      await backend.send(reportId, toBytes(data));
    },
    async sendFeatureReport(reportId, data) {
      if (!handle.opened)
        throw new DOMException("The device must be opened first.", "InvalidStateError");
      await backend.sendFeature(reportId, toBytes(data));
    },
    async receiveFeatureReport(reportId) {
      if (!handle.opened)
        throw new DOMException("The device must be opened first.", "InvalidStateError");
      return view(toBytes(await backend.receiveFeature(reportId)));
    },
  };
  return handle;
}
