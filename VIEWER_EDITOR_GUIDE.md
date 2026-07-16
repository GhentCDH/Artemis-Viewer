# Artemis Viewer — Editor Guide

This guide explains how to update, test, and publish the Artemis Viewer. It is
intended for editors and maintainers who change interface text, branding, or
viewer behaviour. For a technical overview of the application, see
[`readme.md`](readme.md). For adding and publishing map data, use the
[`Artemis-Data` documentation](../Artemis-Data/README.md).

## Overview

The Artemis Viewer is a static SvelteKit website. Its source code lives in the
`Artemis-Viewer` repository, while its map layers, image collections, search
indexes, and most layer metadata are built and published separately by
`Artemis-Data`.

The normal viewer workflow is:

1. Make a branch for the change.
2. Edit the files under `app/`.
3. Preview the viewer locally with the published or draft dataset.
4. Run the type and Svelte checks, then make a production build.
5. Merge the verified change into the repository's release branch.
6. Run the **Deploy to GitHub Pages** workflow.
7. Check the automatic **Release** workflow.
8. Verify the live site and GitHub Release.

Do not edit the `live` branch. It contains generated website output and is
managed by GitHub Actions.

## What belongs in which repository?

Before editing, decide whether the change belongs to the viewer or the data
pipeline.

| Change | Repository |
| --- | --- |
| Interface labels, buttons, help text, or translations | `Artemis-Viewer` |
| Layout, styling, accessibility, or viewer interactions | `Artemis-Viewer` |
| Map rendering or search behaviour | `Artemis-Viewer` |
| Layer names, dates, descriptions, citations, attribution, or downloads | `Artemis-Data` |
| Adding or removing map layers, sublayers, toponyms, parcels, or image collections | `Artemis-Data` |
| About-page data or partner/team content supplied by the dataset | `Artemis-Data` |
| Zenodo records and downloadable datasets | `Artemis-Data` / Zenodo |

The viewer reads its published dataset from:

```text
https://ghentcdh.github.io/Artemis-Data/build
```

It can also read a build from the data repository's `draft` branch during
testing. A viewer deployment and a data deployment are separate operations:
publishing new data does not require rebuilding the viewer unless viewer code
also changed.

## One-time local setup

The viewer requires Node.js and pnpm. The deployment workflow currently uses
Node.js 22 and pnpm 11, so use those major versions locally where possible.

From the repository root:

```bash
cd app
pnpm install
pnpm run dev
```

The development server prints a local URL, normally `http://localhost:5173`.
Open that address in a browser. Stop the server with `Ctrl+C`.

Dependencies only need to be installed again after checking out changes to
`package.json` or `pnpm-lock.yaml`, or when the installation is missing.

## 1. Create a working branch

Start from the repository's current release branch and create a focused branch
for the change. Do not work on `live`.

Use a short descriptive branch name, for example:

```text
content/update-help-text
fix/mobile-layer-menu
feature/new-language-control
```

Keep unrelated changes in separate branches so they can be reviewed and
deployed independently.

## 2. Make the viewer change

Most viewer files are under `app/src/`:

```text
app/src/
├── app.css                         # global design tokens and shared styles
├── routes/                         # SvelteKit page and layout entry points
└── lib/
    ├── app/                        # top-level viewer and map panes
    ├── core/
    │   ├── dataset/                # Artemis-Data URLs and layer registry
    │   ├── map/                    # MapLibre setup and map behaviour
    │   └── renderers/              # IIIF, raster, vector, and remote layers
    ├── features/                   # search, timeline, images, viewer, branding
    └── shared/
        ├── i18n/                   # English and Dutch interface text
        └── primitives/             # reusable UI components
```

### Change interface text or translations

Interface strings live in:

```text
app/src/lib/shared/i18n/en.ts
app/src/lib/shared/i18n/nl.ts
```

The English dictionary defines the required message structure. The Dutch file
is typed against it, so both files must have exactly the same keys.

When editing translations:

- update both English and Dutch;
- preserve placeholders such as `{name}`, `{count}`, or `{startYear}` exactly;
- do not use braces as ordinary punctuation because braces are reserved for
  placeholders;
- keep each dictionary value a string;
- check the text in the actual interface, including narrow screens and long
  labels.

Example:

```ts
// en.ts
search: {
  clear: 'Clear search',
}

// nl.ts
search: {
  clear: 'Wis zoekopdracht',
}
```

If the text describes a specific layer, collection, citation, provider, or
download, it probably belongs in `Artemis-Data` instead of these dictionaries.

### Change layer or collection content

Do not hard-code map-layer content in the viewer. The application loads the
compiled registries and artifacts produced by `Artemis-Data`, including:

- layer labels and timeframes;
- localized sublayer names and descriptions;
- citations, rights, reading lists, and download links;
- IIIF, raster, parcel, and toponym artifacts;
- image-collection metadata and indexes.

Make those changes in the data source, test them through a Zenodo draft, and run
the data pipeline. See the data editor guide for that workflow.

### Change data endpoints

The published and draft dataset URLs are defined in:

```text
app/src/lib/core/dataset/dataSource.ts
```

Change these only when the data repository or its publication branches move.
An incorrect URL can prevent all layers and search data from loading.

### Change the custom domain

The deployment workflow determines the website base path automatically:

- without `app/static/CNAME`, GitHub Pages serves the site under the repository
  path, such as `/Artemis-Viewer`;
- with `app/static/CNAME`, it builds for the domain root `/`.

Adding or changing a custom domain therefore requires an
`app/static/CNAME` file containing the domain name, plus the corresponding DNS
and GitHub Pages configuration. Treat this as an infrastructure change and
coordinate it with the repository owner.

## 3. Preview with published or draft data

Start the local viewer:

```bash
cd app
pnpm run dev
```

By default, the viewer loads the published dataset. The application also
supports a draft dataset source backed by the `Artemis-Data` `draft` branch.
Use the viewer's developer settings to switch to draft data when testing a
pending data build, then reload if prompted.

The chosen source is stored only in the browser's local storage under:

```text
artemis.dataset-source.v1
```

This setting affects that browser only; it does not publish anything and does
not change the default for other visitors. Switch back to the published source
before final live verification.

If the draft option has no data, first confirm that the data-pipeline workflow
successfully published the Zenodo draft to the `draft` branch.

## 4. Test the change

Test more than the screen you edited. At minimum, check:

- the default single-map view;
- compare mode and both map panes;
- the timeline and sublayer controls;
- map search and result navigation;
- the image browser and IIIF viewer;
- English and Dutch;
- a desktop width and a narrow/mobile width;
- a direct reload of a URL containing viewer state;
- the browser console for errors;
- the published dataset, plus the draft dataset when relevant.

External IIIF, WMS, WMTS, WFS, and tile services can fail independently of the
viewer. When something does not load, check the browser's Network panel to
distinguish a viewer regression from an unavailable or CORS-blocked service.

## 5. Run the required checks

From `Artemis-Viewer/app`:

```bash
pnpm run check
pnpm run build
```

`pnpm run check` runs Svelte and TypeScript validation. `pnpm run build` creates
the static production site in `app/build/`.

Both commands must complete successfully before deployment. Warnings should be
reviewed even when they do not fail the command.

To inspect the production build locally:

```bash
pnpm run preview
```

The normal local build uses an empty base path. GitHub Actions supplies the
correct Pages base path during deployment.

## 6. Review and merge

Before merging:

1. Review the changed files and ensure no generated `app/build/` output,
   credentials, local settings, or unrelated edits are included.
2. Commit the change with a clear message.
3. Push the branch and open a pull request.
4. Describe what changed, how it was tested, and whether it depends on a data
   pipeline release.
5. Have the pull request reviewed and merge it into the branch used for the
   next viewer release.

If viewer code expects a new data format, coordinate the release order. The
viewer must remain compatible with the currently published data until the new
data is live, or the data must remain compatible with the currently deployed
viewer until the viewer is live.

## 7. GitHub Actions workflows

The repository currently has two workflows under `.github/workflows/`:

| Workflow | File | Trigger | Result |
| --- | --- | --- | --- |
| **Deploy to GitHub Pages** | `deploy.yml` | Manually started with **Run workflow** | Builds the selected source branch and replaces the generated `live` branch |
| **Release** | `release.yml` | Automatically after a successful **Deploy to GitHub Pages** run on `main` | Creates the next patch-version tag and GitHub Release |

These workflows form one release chain when `main` is deployed:

```text
Run “Deploy to GitHub Pages” on main
                │
                ▼
Install → build → publish app/build to live
                │
                ▼ successful main deployment
Run “Release” automatically
                │
                ▼
Create the next v<major>.<minor>.<patch> GitHub Release
```

A deployment from another branch can update `live`, but it does **not** trigger
the automatic release because the Release workflow listens only for completed
deployments from `main`. Normal production releases should therefore deploy
`main`. Deploy another branch only for an intentional emergency or test, and
understand that it still replaces the public `live` branch.

### Workflow permissions and secrets

Both workflows use the repository-provided `GITHUB_TOKEN`; editors do not need
to create a personal token for normal deployment.

- **Deploy to GitHub Pages** has `contents: write` permission so it can replace
  the `live` branch.
- **Release** has `contents: write` permission so it can create a tag and GitHub
  Release.

If either workflow reports a permissions error, check **Settings → Actions →
General → Workflow permissions**, repository/organization policy, and branch
protection. Do not work around a permissions problem by committing directly to
`live` or by adding a personal access token to the repository.

### Deploy to GitHub Pages

Deployment is manual in the current workflow:

1. Open the `GhentCDH/Artemis-Viewer` repository on GitHub.
2. Select **Actions**.
3. Open **Deploy to GitHub Pages** in the left sidebar.
4. Select **Run workflow**.
5. Choose `main` for a normal production release and run the workflow.
6. Wait for the install, build, and deploy steps to complete.

The workflow:

1. checks out the selected branch;
2. installs pnpm 11 and Node.js 22;
3. installs dependencies in `app/`;
4. derives the correct GitHub Pages base path;
5. builds the static viewer; and
6. publishes `app/build/` to the `live` branch.

A red workflow means the viewer was not deployed. Open the failed step, fix the
problem on the source branch, rerun the local checks, push the correction, and
start the deployment again.

The main failure points are:

- **Install dependencies:** `package.json` and `pnpm-lock.yaml` disagree, or a
  dependency cannot be downloaded. The workflow intentionally uses pnpm 11
  because the current patched-dependency lockfile is incompatible with pnpm 10.
- **Determine base path:** an invalid or unexpectedly placed `CNAME` changes the
  deployment path.
- **Build:** TypeScript, Svelte, or bundling fails. Reproduce it locally with
  `pnpm run check` and `pnpm run build`.
- **Deploy to live branch:** GitHub permissions or branch rules prevent the
  action from writing `live`.

The deployment job does not run `pnpm run check` separately. Editors must run it
before merging; a successful production build does not replace the full Svelte
and TypeScript check.

### Release

After a successful deployment from `main`, the **Release** workflow starts
automatically. No manual input is required.

It performs these steps:

1. Checks out the repository with full Git history and tags.
2. Reads the latest `v<major>.<minor>.<patch>` Git tag. If none exists, it starts
   from `v0.0.0`.
3. Increments the patch number. For example, `v1.4.2` becomes `v1.4.3`.
4. Reads commits since the previous tag and groups conventional `feat:` and
   `fix:` commits, plus commits containing `BREAKING CHANGE`, into release
   notes.
5. Creates the new tag and GitHub Release with the generated notes.

The version in `app/package.json` is not used to determine the release number.
Git tags are the release workflow's source of truth.

Use conventional commit subjects so changes appear in the generated notes:

```text
feat(search): add collection filter
fix(timeline): keep selection after language change
fix: correct Dutch map-service label
```

Other commit types can be valid but are omitted from the automatically grouped
release notes. A breaking change must include `BREAKING CHANGE` in the commit
message if it should appear in that section.

Check the Release workflow after deployment:

- **Skipped:** expected when the deployment failed or when a branch other than
  `main` was deployed.
- **Failed while determining the version:** inspect malformed or non-semantic
  tags and do not create an arbitrary replacement tag without repository-owner
  agreement.
- **Failed while creating the release:** check `contents: write` permission and
  whether the calculated tag already exists.
- **Successful with empty notes:** the release is valid, but no commits since
  the previous tag matched the supported conventional-commit categories.

Do not manually rerun **Release** after an unrelated deployment without first
checking the latest tag: every successful run increments the patch version and
creates another release.

## 8. Verify the live viewer and release

After the workflow succeeds, open:

```text
https://ghentcdh.github.io/Artemis-Viewer
```

Verify at least:

- the page loads without a blank screen or missing assets;
- map layers and the basemap load;
- timeline selection and compare mode work;
- search returns results;
- one IIIF document opens;
- language switching works;
- direct/reloaded URLs still restore viewer state;
- the browser console has no new errors.

Then open the repository's **Releases** page and confirm that:

- a new release was created for a normal `main` deployment;
- its tag is the expected next patch version;
- its changelog reflects the viewer changes being published; and
- the release timestamp corresponds to the deployment you just verified.

If an older build appears, wait briefly for GitHub Pages to update, then perform
a cache-bypassing refresh. Confirm that the deployment workflow used the
intended branch and that its final deploy step succeeded.

## Rollback

Do not edit or repair generated files directly on `live`. To roll back:

1. revert the problematic source change on the release branch, or redeploy a
   known-good source commit;
2. run `pnpm run check` and `pnpm run build`;
3. run **Deploy to GitHub Pages** again; and
4. verify the live viewer.

If the problem comes only from newly published map data, roll back or correct
the data through the `Artemis-Data` publication workflow rather than changing
viewer code.

## Release checklist

Before deployment:

- [ ] The change belongs in `Artemis-Viewer`, not `Artemis-Data`.
- [ ] English and Dutch interface text were updated together.
- [ ] Published and, where relevant, draft datasets were tested.
- [ ] Desktop, narrow-screen, and compare-mode behaviour were checked.
- [ ] `pnpm run check` succeeds.
- [ ] `pnpm run build` succeeds.
- [ ] No secrets, generated build output, or unrelated changes are included.
- [ ] Data-format dependencies and release order are documented.
- [ ] Commit subjects use `feat:` or `fix:` where they should appear in the
      generated release notes.

After deployment:

- [ ] The GitHub Actions deployment completed successfully.
- [ ] The automatic Release workflow completed successfully for a `main`
      deployment.
- [ ] The new tag, patch version, and generated release notes are correct.
- [ ] The live viewer loads its JavaScript, styles, and data.
- [ ] Layers, search, images, and IIIF viewing were smoke-tested.
- [ ] Both languages were checked.
- [ ] Direct URL reload and browser-console checks passed.
