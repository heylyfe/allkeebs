# Code signing with SignPath Foundation (free for open source)

Windows Smart App Control blocks apps that aren't signed, and SmartScreen warns about them.
SignPath Foundation signs open-source projects for free, with a certificate issued to
"SignPath Foundation". Once this is set up, `.github/workflows/release.yml` signs every release
automatically, after you approve each signing request in SignPath.

## One-time setup

1. **Apply** at <https://signpath.org/apply> with the repository
   `https://github.com/heylyfe/allkeebs`. allkeebs meets the main conditions: AGPL-3.0 (an
   OSI licence), no proprietary code, built from source in GitHub Actions, and the installers
   uninstall cleanly. The "Code signing policy" section in the main README is the page they ask
   for.
2. Turn on **two-factor authentication** for your GitHub account and your SignPath account. The
   terms require it for everyone on the team.
3. Once approved, in SignPath:
   - Add the **GitHub.com** trusted build system to the organization and link it to the project.
   - Create two **artifact configurations** by pasting in the files from
     `artifact-configurations/`, with the slugs `app-exe` and `installers`. Check them in
     SignPath's editor: it validates the XML and shows the exact syntax if anything differs.
   - Use the **release signing policy** they set up. It must require approval and origin
     verification, with the branch or tag pattern for releases (for example `refs/tags/v*`).
   - Create an **API token** for a user with the Submitter role.
4. In GitHub, go to the repository's **Settings → Secrets and variables → Actions** and add:
   - Secret `SIGNPATH_API_TOKEN`: the API token.
   - Variable `SIGNPATH_ORGANIZATION_ID`: your organization id.
   - Variable `SIGNPATH_PROJECT_SLUG`: the project slug (probably `allkeebs`).
   - Variable `SIGNPATH_SIGNING_POLICY_SLUG`: the release policy slug (probably
     `release-signing`).

## Releasing

1. Bump `version` in `package.json` and `src-tauri/Cargo.toml`, and add the CHANGELOG section.
2. Merge to `main`, then tag it: `git tag v1.2.0 && git push origin v1.2.0`.
3. The Release workflow builds the app and asks SignPath to sign `allkeebs.exe`. Approve the
   request in SignPath. It then builds the installers around the signed exe, and asks again for
   the installers. Approve that one too.
4. The installers appear on <https://github.com/heylyfe/allkeebs/releases>.

Without the secrets, the same workflow publishes unsigned installers and says so in the release
notes.
