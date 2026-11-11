# allkeebs

**Change your keyboard's lighting, keys and macros from your browser. Nothing to install.**

**[Open allkeebs → heylyfe.github.io/allkeebs](https://heylyfe.github.io/allkeebs/)**

allkeebs works with keyboards from almost any brand. Plug yours in, click **Connect keyboard**, and it recognises the model on its own. It checks a built-in list of more than 4,500 keyboards, so you don't need to find or import any files.

## What you can do

- **Lighting.** Choose from over 1,000 lighting profiles across 49 effects and preview each one live before sending it to the keyboard. Tune colour, brightness and speed. Boards that support VIA also show their own extra lighting settings.
- **Keymap.** Change what any key does, on any layer. For example, move Caps Lock, add media keys or set up an Fn layer.
- **Macros.** Record a shortcut or a phrase by typing it, or build one step by step. Then put it on a key.
- **Key test.** Press every key to check it works. allkeebs spots keys that double-type ("chatter"). This works on any keyboard, even ones allkeebs can't configure.
- **Layouts.** allkeebs picks the right layout automatically, or you can choose 40% to 100% yourself.

You can try everything with the **demo board** before plugging anything in.

## What you need

- **Chrome or Edge on a computer** (Windows, macOS, Linux or ChromeOS). Firefox, Safari and phones can't talk to USB keyboards from a web page.
- Your keyboard **plugged in with a cable**. Most boards can't be configured over Bluetooth or a 2.4 GHz dongle.

## Which keyboards work

| Keyboard                                                                                                                            | Lighting | Keymap | Macros | Key test |
| ----------------------------------------------------------------------------------------------------------------------------------- | :------: | :----: | :----: | :------: |
| Any board running **VIA**, **Vial** or **QMK with VIA**, from any brand (Keychron, Akko, Glorious GMMK Pro, Epomaker and many more) |    ✓     |   ✓    |   ✓    |    ✓     |
| **Keychron** Hall-effect boards                                                                                                     |          |   ✓    |        |    ✓     |
| **Razer**, **Logitech**, **SteelSeries** and **Arbiter Studio** (supported models)                                                  |    ✓     |        |        |    ✓     |
| **Wooting**, **Wuque Studio** and **Kochi** (supported models)                                                                      |          |        |        |    ✓     |
| Anything else, such as Corsair, HyperX or ASUS                                                                                      |          |        |        |    ✓     |

Keyboards without a tick are still recognised and drawn with the right layout, but allkeebs can't change those settings yet. The **Supported keyboards** page inside allkeebs lets you search the full list.

**My VIA keyboard shows "guessed" lighting or no keymap.** That board isn't in the built-in list yet. If its maker publishes a VIA `.json` file, open the keyboard's **Overview** tab in allkeebs and click **Load .json**. allkeebs remembers it after that.

## Is it safe?

- **Your changes are reversible.** allkeebs never updates firmware or puts a keyboard into its bootloader. Everything goes through the keyboard's normal settings, and nothing is sent until you press **Apply**.
- **It's private.** There are no accounts, cookies, analytics or ads. Your profiles and settings stay in your browser. The only outside request is to usevia.app, and only for a keyboard that isn't in the built-in list.

## Found a problem?

[Open an issue](https://github.com/heylyfe/allkeebs/issues) with your keyboard's name and what happened. The **Preferences** page in allkeebs has an **Activity** log you can copy in.

## Credits and licence

allkeebs is made by [heylyfe](https://github.com/heylyfe). It's built on open work by others. The keyboard drivers come from [OpenMouse](https://github.com/OpenMouse-Project/keyboard-protocol). The keyboard data comes from [VIA](https://github.com/the-via/keyboards), [Vial](https://github.com/vial-kb/vial-qmk) and [QMK](https://github.com/qmk/qmk_firmware). The full list is on the **About** page in allkeebs and in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

allkeebs is free software under the [GNU Affero General Public License v3.0 or later](LICENSE). Keyboard and brand names belong to their owners. allkeebs isn't affiliated with or endorsed by any of them.

<details>
<summary>Building it yourself</summary>

You need [Node.js](https://nodejs.org) 20 or newer.

```sh
npm install
npm run build   # writes the whole site to docs/index.html
npm test        # checks the drivers against simulated keyboards
```

`npm run data` followed by `npm run build:db` rebuilds the keyboard list from the latest VIA, Vial and QMK data, makers' own QMK firmware, OpenRGB, OpenRazer, ckb-next, the Linux kernel and the USB id list. `tools/models.txt` holds the hand-made list of model names and sizes.

</details>
