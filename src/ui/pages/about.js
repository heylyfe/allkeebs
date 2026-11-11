// About and credits.

import { AUTHOR, SOURCE_URL, VERSION, esc, icons } from "../dom.js";

const CREDITS = [
  [
    "OpenMouse keyboard-protocol",
    "The keyboard drivers: VIA, Keychron, Wooting, Razer, Logitech, SteelSeries, Arbiter, Wuque and Kochi",
    "AGPL-3.0-or-later",
    "https://github.com/OpenMouse-Project/keyboard-protocol",
  ],
  [
    "OpenMouse",
    "The approach this site follows: WebHID in the browser, one interface for many brands, and its design guide",
    "AGPL-3.0",
    "https://github.com/OpenMouse-Project/openmouse",
  ],
  [
    "VIA keyboards",
    "Keyboard definitions in the built-in database, and the VIA protocol",
    "GPL-3.0",
    "https://github.com/the-via/keyboards",
  ],
  [
    "Vial",
    "Keyboard definitions, and the Vial protocol for reading a layout from the keyboard",
    "GPL-2.0-or-later",
    "https://github.com/vial-kb/vial-qmk",
  ],
  [
    "QMK Firmware",
    "Keyboard names, makers, layouts and legends in the built-in database",
    "GPL-2.0-or-later",
    "https://github.com/qmk/qmk_firmware",
  ],
  [
    "ViaMia keyboards",
    "Extra vendor VIA definitions",
    "See its repository",
    "https://github.com/ViaMia/ViaMia-Keyboards",
  ],
  [
    "usevia.app",
    "Definitions for boards that aren’t in the built-in database, fetched only when needed",
    "",
    "https://usevia.app",
  ],
  ["Lucide", "Icons", "ISC", "https://lucide.dev"],
  [
    "DM Sans",
    "Interface type, by the DM Sans Project Authors",
    "OFL-1.1",
    "https://github.com/googlefonts/dm-fonts",
  ],
  [
    "JetBrains Mono",
    "Figures and codes, by JetBrains",
    "OFL-1.1",
    "https://github.com/JetBrains/JetBrainsMono",
  ],
  [
    "xz-decompress",
    "Unpacks Vial definitions, by HTTP Toolkit, built on XZ Embedded",
    "MIT",
    "https://github.com/httptoolkit/xz-decompress",
  ],
  [
    "OpenRGB",
    "USB ids and names of keyboards from dozens of brands",
    "GPL-2.0-or-later",
    "https://gitlab.com/CalcProgrammer1/OpenRGB",
  ],
  [
    "OpenRazer",
    "USB ids and names of Razer keyboards",
    "GPL-2.0-or-later",
    "https://github.com/openrazer/openrazer",
  ],
  ["ckb-next", "USB ids of Corsair keyboards", "GPL-2.0", "https://github.com/ckb-next/ckb-next"],
  [
    "The USB ID list",
    "Names of keyboards by USB id, maintained by Stephen J. Gowdy",
    "GPL-2.0-or-later",
    "http://www.linux-usb.org/usb.ids",
  ],
  [
    "Linux",
    "Keyboard USB ids the kernel handles specially",
    "GPL-2.0",
    "https://github.com/torvalds/linux",
  ],
  [
    "sinowealth-kb-tool",
    "USB ids of budget boards on Sinowealth chips",
    "MIT",
    "https://github.com/carlossless/sinowealth-kb-tool",
  ],
  [
    "Makers' QMK firmware",
    "Layouts from Keychron, NuPhy, Epomaker, MonsGeek, Cipulot and ZSA",
    "GPL-2.0-or-later",
    "https://github.com/Keychron/qmk_firmware",
  ],
  ["esbuild", "Builds the site into one file", "MIT", "https://esbuild.github.io"],
];

function externalLink(href, text) {
  const attrs = `class="linkish" href="${esc(href)}" target="_blank" rel="noopener noreferrer"`;
  return `<a ${attrs}>${esc(text)}${icons.ext}</a>`;
}

function creditRow([name, what, licence, url]) {
  return `
    <div class="credit">
      <div><b>${externalLink(url, name)}</b><small>${esc(what)}</small></div>
      ${licence ? `<span class="mono">${esc(licence)}</span>` : ""}
    </div>`;
}

export function pageAbout(page) {
  const madeBy = AUTHOR ? `, made by ${esc(AUTHOR)}` : "";
  const sourceButton = SOURCE_URL
    ? `<a class="btn sm" href="${esc(SOURCE_URL)}" target="_blank" rel="noopener noreferrer">
        ${icons.github}Source on GitHub
      </a>`
    : `<span class="sub" style="margin:0">The full source is published alongside this site</span>`;
  const reportLink = SOURCE_URL ? ` · ${externalLink(SOURCE_URL, "Report a problem")}` : "";

  page.innerHTML = `
    <h1>About allkeebs</h1>
    <p class="lede">
      allkeebs changes the lighting, keymap and macros of keyboards from almost any brand, right
      in the browser, and tests every key. It’s free and open source${madeBy}.
    </p>
    <div class="grid2" style="margin-top:24px">
      <div class="col">
        <div class="panel">
          <h2>Credits</h2>
          <p class="sub">allkeebs is built on other people’s open work. Thank you to all of them</p>
          <div class="rows">${CREDITS.map(creditRow).join("")}</div>
        </div>
      </div>
      <div class="col">
        <div class="panel">
          <h2>Source code</h2>
          <p class="sub">
            allkeebs is free software under the GNU Affero General Public License, version 3 or
            later. You can read it, change it and share it under the same licence
          </p>
          <div class="btns">
            ${sourceButton}
            <a class="btn ghost sm" href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank"
              rel="noopener noreferrer">Read the licence</a>
          </div>
        </div>
        <div class="panel">
          <h2>Privacy</h2>
          <p class="sub" style="margin:0">
            No accounts, cookies, analytics or ads. Your profiles, layout choices and macro names
            stay in this browser’s storage. Keyboards talk to this tab directly over WebHID and
            nothing about them is sent anywhere. The one request allkeebs makes is to usevia.app,
            and only for a keyboard that isn’t in the built-in database.
          </p>
        </div>
        <div class="panel">
          <h2>Use at your own risk</h2>
          <p class="sub" style="margin:0">
            allkeebs never updates firmware, resets a keyboard or switches it to its bootloader.
            Changes to lighting, keys and macros go through each keyboard’s own configuration
            protocol and can be changed back. It comes with no warranty, as the licence says.
          </p>
        </div>
        <div class="panel">
          <h2>Trademarks</h2>
          <p class="sub" style="margin:0">
            Keyboard and brand names belong to their owners and are used only to say which
            keyboards work. allkeebs isn’t affiliated with or endorsed by any keyboard maker, or by
            VIA, Vial, QMK or OpenMouse.
          </p>
        </div>
      </div>
    </div>
    <p class="sub" style="margin-top:24px">Version ${VERSION}${reportLink}</p>`;
}
